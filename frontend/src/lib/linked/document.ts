import type {Editor} from '@tiptap/core';
import {MarkdownSession} from '../markdown/session';
import {SharedNoteDocuments} from '../sharedNoteDocuments';
import type {LinkedRequest,Opened,Protected,Receipt,SourceDraft} from './types';

type State={dirty:boolean;protecting:boolean;saving:boolean;protectedVersion:number;notice:string;error:string;conflict:boolean;recovery:boolean;available:boolean};
/** One document lifetime, independent of visible pane mounts. Acknowledging an
 * earlier Save never marks a newer visual draft clean. No external autosave. */
export class LinkedDocument{
  readonly shared=new SharedNoteDocuments({retainClosed:true});
  readonly editors=new Set<Editor>();
  sourceDraft?:SourceDraft;
  private listeners=new Set<()=>void>();
  private state:State={dirty:false,protecting:false,saving:false,protectedVersion:-1,notice:'',error:'',conflict:false,recovery:false,available:true};
  private chain:Promise<unknown>=Promise.resolve();
  private timer?:ReturnType<typeof setTimeout>;
  private metadataVersion=0;
  private journaledMetadata=-1;
  private journaledEditor=-1;
  private protectedVersion=0;
  private savedSource:Uint8Array;
  private savedText:string;
  private savedIdentity:string;
  private detached:()=>void;
  private closed=false;
  private validated=false;
  private saveWork?:Promise<Receipt>;
  private cancelSaveWait?:()=>void;
  private protectedSource='';
  readonly opened:Opened;
  readonly session:MarkdownSession;
  private request:LinkedRequest;
  constructor(opened:Opened,session:MarkdownSession,request:LinkedRequest){
    this.opened=opened;this.session=session;this.request=request;
    this.savedSource=opened.bytes.slice();
    this.savedText=new TextDecoder('utf-8',{ignoreBOM:true}).decode(this.savedSource);
    this.savedIdentity=opened.identity;
    this.protectedVersion=Math.max(0,opened.nativeVersion??0);
    this.sourceDraft=opened.visual?.session?.sourceDraft;
    this.state={...this.state,dirty:this.isDirty(),recovery:opened.recoveryOnly===true,notice:opened.visual?'Protected draft restored':opened.recoveryOperation?'An earlier draft is available in Linked sources → Recovery.':''};
    this.detached=session.subscribe(()=>{this.update({dirty:this.isDirty()});this.schedule();});
  }
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  getSnapshot=()=>this.state;
  external(state:string){if(state==='UNCHANGED'||state==='BUSY_RETRY')return;this.update({available:state==='CONFLICT'||state==='EXTERNAL_CHANGED',conflict:state==='CONFLICT'||state==='EXTERNAL_CHANGED',notice:state==='CONFLICT'||state==='EXTERNAL_CHANGED'?'The original file changed. Your draft is retained; compare before resolving.':state==='DOCUMENT_REPLACED'?'The file was replaced outside Vaultor. Reopen it from the folder to review the new file.':'The source is unavailable or requires review. Your draft is retained.'});}
  private update(value:Partial<State>){this.state={...this.state,...value};this.listeners.forEach(listener=>listener());}
  private isDirty(){return this.session.status.state!=='ready'||this.session.source!==this.savedText||!!this.sourceDraft;}
  private serial<T>(task:()=>Promise<T>):Promise<T>{const next=this.chain.catch(()=>{}).then(()=>{if(this.closed)throw Error('LINKED_DOCUMENT_CLOSED');return task();});this.chain=next;return next;}
  private payload(){return {document:this.opened.id,binding:this.opened.binding};}
  // A fixed deadline, rather than trailing debounce, protects continuous typing
  // as well as pauses. Requests serialize and snapshot the latest queued draft.
  private schedule(){if(this.timer!==undefined)return;this.timer=setTimeout(()=>{this.timer=undefined;void this.protect().catch(error=>this.update({error:String(error)}));},1000);}
  setSourceDraft(value?:SourceDraft){this.sourceDraft=value;this.metadataVersion++;this.update({dirty:this.isDirty()});this.schedule();}
  private async protectNow(){
    const editorVersion=this.session.status.version,metadataVersion=this.metadataVersion;
    if(editorVersion===this.journaledEditor&&metadataVersion===this.journaledMetadata&&(this.validated||this.session.status.state!=='ready'||this.sourceDraft))return;
    const checkpoint=this.session.checkpoint(),version=++this.protectedVersion;
    this.update({protecting:true});
    try{
      const result=await this.request<Protected>('protect',{...this.payload(),version,editorVersion,draft:checkpoint.draft,source:checkpoint.status.state==='ready'?checkpoint.source:undefined,sourceDraft:this.sourceDraft});
      if(result.version!==version||!result.protected)throw Error('Draft protection was not acknowledged.');
      this.journaledEditor=editorVersion;this.journaledMetadata=metadataVersion;this.validated=result.validated;if(result.validated)this.protectedSource=checkpoint.source;
      this.update({protectedVersion:editorVersion,notice:result.validated?'Draft protected':'Draft protected; this edit needs source review',error:''});
    }finally{this.update({protecting:false});}
  }
  protect(){clearTimeout(this.timer);this.timer=undefined;return this.serial(()=>this.protectNow());}
  private waitForValidation(deadline:number):Promise<void>{
    if(this.closed)return Promise.reject(Error('LINKED_DOCUMENT_CLOSED'));
    if(this.session.status.state==='ready')return Promise.resolve();
    if(this.session.status.reason==='COMPOSITION_IN_PROGRESS')return Promise.reject(Error('Finish text composition before saving.'));
    if(!['opening','validating'].includes(this.session.status.state))return Promise.reject(Error('Your draft is retained. Finish source editing or Undo the unsupported change before saving.'));
    return new Promise((resolve,reject)=>{
      let remove=()=>{};
      const finish=(error?:Error)=>{clearTimeout(timer);remove();this.cancelSaveWait=undefined;if(error)reject(error);else resolve();};
      const timer=setTimeout(()=>finish(Error('Source validation is still pending. Your draft is retained; try Save again.')),Math.max(0,deadline-Date.now()));
      this.cancelSaveWait=()=>finish(Error('LINKED_DOCUMENT_CLOSED'));
      remove=this.session.subscribe(()=>{if(this.session.status.state==='ready')finish();else if(!['opening','validating'].includes(this.session.status.state))finish(Error('Your draft is retained. Undo the unsupported change before saving.'));});
    });
  }
  save():Promise<Receipt>{
    if(this.saveWork)return this.saveWork;
    const work=this.saveAfterValidation();this.saveWork=work;
    void work.then(()=>{if(this.saveWork===work)this.saveWork=undefined;},()=>{if(this.saveWork===work)this.saveWork=undefined;});
    return work;
  }
  private async saveAfterValidation():Promise<Receipt>{
    this.update({saving:true,error:''});const deadline=Date.now()+15000;
    // Waiting stays outside the native queue so draft journals remain usable.
    try{for(;;){
    if(this.state.recovery)throw Error('Review the previous Save before saving again.');
    if(!this.state.available)throw Error('The original source is unavailable. Your protected draft remains accessible.');
    if(this.sourceDraft)throw Error('Your draft is retained. Finish source editing or Undo the unsupported change before saving.');
    await this.waitForValidation(deadline);
    const result=await this.serial(async()=>{
    if(this.session.status.state!=='ready')return null;
    if(this.state.recovery||!this.state.available||this.sourceDraft)throw Error('The source changed while Save was waiting. Your draft is retained.');
    await this.protectNow();if(!this.validated)throw Error('Independent source validation is required before Save.');
    const version=this.protectedVersion,editorVersion=this.journaledEditor,savedText=this.protectedSource,savedSource=new TextEncoder().encode(savedText);
    try{
      const receipt=await this.request<Receipt>('save',{...this.payload(),version});this.validated=false;
      if(receipt.version!==version)throw Error('Save receipt version differs. Recovery review is required.');
      if(receipt.state==='COMMITTED'){
        this.savedSource=savedSource;this.savedText=savedText;this.savedIdentity=receipt.identity??this.savedIdentity;this.update({dirty:this.isDirty(),notice:this.session.status.version===editorVersion?'Saved to original file':'Saved; newer edits remain unsaved',conflict:false});
      }else this.update({conflict:receipt.state==='CONFLICT',recovery:receipt.state!=='CONFLICT',notice:receipt.state==='CONFLICT'?'The file changed outside Vaultor. Your draft is protected.':'Save needs recovery review. Your versions remain protected.'});
      return receipt;
    }catch(error){
      const refused=error instanceof Error&&'sourceNotAdmitted' in error&&error.sourceNotAdmitted===true;
      if(!refused){this.validated=false;this.update({recovery:true});}
      throw error;
    }});
    if(result)return result;
    if(Date.now()>=deadline)throw Error('Source validation is still pending. Your draft is retained; try Save again.');
    }}catch(error){this.update({error:String(error)});throw error;}finally{this.update({saving:false});}
  }
  async applySource(editor:Editor,value:SourceDraft){
    return this.serial(async()=>{
      await this.protectNow();
      await this.session.readRegion(value.block,value.expected);
      await this.request('source',{...this.payload(),version:this.protectedVersion,...value});
      await this.session.applySource(editor,value.block,value.text);
      this.setSourceDraft(undefined);
    });
  }
  async flush(){if(this.session.status.reason==='COMPOSITION_IN_PROGRESS')throw Error('Finish text composition before leaving this document.');await this.protect();}
  async compare(){await this.flush();const result=await this.request<{state:string;disk:{identity:string;revision:string;bytes:Uint8Array;size:number}|null}>('check',this.payload());return {...result,baseIdentity:this.savedIdentity,base:this.savedSource.slice(),local:this.session.source,visual:JSON.stringify(this.session.checkpoint().draft)};}
  async export(kind:'base'|'local'|'visual'){await this.flush();return this.request<{outcome:string}>('export',{...this.payload(),kind});}
  /** Called only after the departure barrier has durably protected this draft. */
  dispose(){clearTimeout(this.timer);this.closed=true;this.cancelSaveWait?.();this.detached();this.session.dispose();this.shared.clear();this.listeners.clear();this.editors.clear();}
}
