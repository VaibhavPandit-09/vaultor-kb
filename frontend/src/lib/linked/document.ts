import type {Editor} from '@tiptap/core';
import {MarkdownSession} from '../markdown/session';
import {SharedNoteDocuments} from '../sharedNoteDocuments';
import type {LinkedRequest,Opened,Protected,Receipt,SourceDraft} from './types';

type State={dirty:boolean;protecting:boolean;saving:boolean;protectedVersion:number;notice:string;error:string;conflict:boolean;recovery:boolean};
/** One document lifetime, independent of visible pane mounts. Acknowledging an
 * earlier Save never marks a newer visual draft clean. No external autosave. */
export class LinkedDocument{
  readonly shared=new SharedNoteDocuments();
  readonly editors=new Set<Editor>();
  sourceDraft?:SourceDraft;
  private listeners=new Set<()=>void>();
  private state:State={dirty:false,protecting:false,saving:false,protectedVersion:-1,notice:'',error:'',conflict:false,recovery:false};
  private chain:Promise<unknown>=Promise.resolve();
  private timer?:ReturnType<typeof setTimeout>;
  private metadataVersion=0;
  private journaledMetadata=-1;
  private journaledEditor=-1;
  private protectedVersion=0;
  private savedVersion=0;
  private detached:()=>void;
  private closed=false;
  private validated=false;
  readonly opened:Opened;
  readonly session:MarkdownSession;
  private request:LinkedRequest;
  constructor(opened:Opened,session:MarkdownSession,request:LinkedRequest){
    this.opened=opened;this.session=session;this.request=request;
    this.detached=session.subscribe(()=>{this.update({dirty:session.status.version!==this.savedVersion||!!this.sourceDraft});this.schedule();});
  }
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  getSnapshot=()=>this.state;
  private update(value:Partial<State>){this.state={...this.state,...value};this.listeners.forEach(listener=>listener());}
  private serial<T>(task:()=>Promise<T>):Promise<T>{const next=this.chain.catch(()=>{}).then(()=>{if(this.closed)throw Error('LINKED_DOCUMENT_CLOSED');return task();});this.chain=next;return next;}
  private payload(){return {document:this.opened.id,binding:this.opened.binding};}
  private schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.protect().catch(error=>this.update({error:String(error)}));},1000);}
  setSourceDraft(value?:SourceDraft){this.sourceDraft=value;this.metadataVersion++;this.update({dirty:this.session.status.version!==this.savedVersion||!!value});this.schedule();}
  private async protectNow(){
    const editorVersion=this.session.status.version,metadataVersion=this.metadataVersion;
    if(editorVersion===this.journaledEditor&&metadataVersion===this.journaledMetadata&&(this.validated||this.session.status.state!=='ready'||this.sourceDraft))return;
    const checkpoint=this.session.checkpoint(),version=++this.protectedVersion;
    this.update({protecting:true});
    try{
      const result=await this.request<Protected>('protect',{...this.payload(),version,editorVersion,draft:checkpoint.draft,source:checkpoint.status.state==='ready'?checkpoint.source:undefined,sourceDraft:this.sourceDraft});
      if(result.version!==version||!result.protected)throw Error('Draft protection was not acknowledged.');
      this.journaledEditor=editorVersion;this.journaledMetadata=metadataVersion;this.validated=result.validated;
      this.update({protectedVersion:editorVersion,notice:result.validated?'Draft protected':'Draft protected; this edit needs source review',error:''});
    }finally{this.update({protecting:false});}
  }
  protect(){clearTimeout(this.timer);return this.serial(()=>this.protectNow());}
  save(){return this.serial(async()=>{
    if(this.state.recovery)throw Error('Review the previous Save before saving again.');
    if(this.sourceDraft||this.session.status.state!=='ready')throw Error('Your draft is retained. Finish source editing or Undo the unsupported change before saving.');
    await this.protectNow();if(!this.validated)throw Error('Independent source validation is required before Save.');
    const version=this.protectedVersion,editorVersion=this.journaledEditor;
    this.update({saving:true,error:''});
    try{
      const receipt=await this.request<Receipt>('save',{...this.payload(),version});this.validated=false;
      if(receipt.version!==version)throw Error('Save receipt version differs. Recovery review is required.');
      if(receipt.state==='COMMITTED'){
        this.savedVersion=editorVersion;this.update({dirty:this.session.status.version!==editorVersion||!!this.sourceDraft,notice:this.session.status.version===editorVersion?'Saved to original file':'Saved; newer edits remain unsaved',conflict:false});
      }else this.update({conflict:receipt.state==='CONFLICT',recovery:receipt.state!=='CONFLICT',notice:receipt.state==='CONFLICT'?'The file changed outside Vaultor. Your draft is protected.':'Save needs recovery review. Your versions remain protected.'});
      return receipt;
    }catch(error){this.update({recovery:true,error:String(error)});throw error;}finally{this.update({saving:false});}
  });}
  async applySource(editor:Editor,value:SourceDraft){
    return this.serial(async()=>{
      await this.protectNow();
      await this.request('source',{...this.payload(),version:this.protectedVersion,...value});
      await this.session.applySource(editor,value.block,value.text);
      this.setSourceDraft(undefined);
    });
  }
  async flush(){if(this.session.status.reason==='COMPOSITION_IN_PROGRESS')throw Error('Finish text composition before leaving this document.');await this.protect();}
  /** Called only after the departure barrier has durably protected this draft. */
  dispose(){clearTimeout(this.timer);this.closed=true;this.detached();this.session.dispose();this.listeners.clear();this.editors.clear();}
}
