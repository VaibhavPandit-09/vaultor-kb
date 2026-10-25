import api from '../api';
import {requestLinked} from '../desktop';
import {getConnection,getPlatform} from '../platform';
import {MarkdownSession} from '../markdown/session';
import {browserPort} from '../markdown/browserPort';
import {LinkedDocument} from './document';
import type {Identity} from '../sessionStore';
import type {Resource} from '../../types';
import type {Entry,LinkedRequest,Opened,Source,Combination} from './types';
import {linkedError} from './errors';
export class LinkedWorkspace{
  readonly documents=new Map<string,LinkedDocument>();
  readonly previews=new Map<string,Opened>();
  readonly previewStatus=new Map<string,string>();
  readonly metadata=new Map<string,Resource>();
  readonly unavailable=new Map<string,string>();
  private previewMounts=new Set<string>();
  previewMounted(id:string){this.previewMounts.add(id);return()=>{this.previewMounts.delete(id);};}
  private admission:Promise<unknown>=Promise.resolve();
  private opening=new Map<string,Promise<void>>();
  private identity:()=>Identity|null;
  private listeners=new Set<()=>void>();
  private revision=0;
  private lifetime=0;
  private contextVersion=0;
  private sourcesVersion=0;
  private refreshing=new Set<string>();
  private directories=new Map<string,()=>Promise<void>>();
  private directoryCursor=0;
  observeDirectory(id:string,refresh:()=>Promise<void>){this.directories.set(id,refresh);return()=>{if(this.directories.get(id)===refresh)this.directories.delete(id);};}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  getSnapshot=()=>this.revision;
  getContextVersion=()=>this.contextVersion;
  getSourcesVersion=()=>this.sourcesVersion;
  private emit(){this.revision++;this.listeners.forEach(listener=>listener());}
  constructor(identity:()=>Identity|null){this.identity=identity;}
  supported(){return getPlatform().kind==='desktop'&&getConnection().profileId==='this-computer'&&typeof window!=='undefined'&&typeof window.vaultorDesktop?.linked==='function';}
  request:LinkedRequest=async(operation,payload={})=>{const identity=this.identity();if(!identity)throw Error('Wait for workspace restoration.');return requestLinked(identity,operation,payload);};
  sources(){return this.request<{sources:Source[]}>('state');}
  async describe(id:string){
    if(!this.supported())return null;
    const known=this.metadata.get(id);if(!known)return null;if(known.revision)return known;
    const connectionEpoch=getConnection().epoch;const value=await this.request<Resource|null>('metadata',{document:id});if(!value)return null;const {data}=await api.put<Resource>('/resources/linked/'+id,{title:value.title,reference:value.content},{backgroundDiagnostic:true,connectionEpoch});this.metadata.set(id,data);return data;
  }
  remember(entry:Entry){const resource:Resource={id:entry.id,type:'linked',title:entry.name,tags:[],content:null,size:entry.size,createdAt:'',updatedAt:''};if(!this.metadata.get(entry.id)?.revision)this.metadata.set(entry.id,resource);return this.metadata.get(entry.id)!;}
  async open(id:string){
    if(this.documents.has(id)||this.previews.has(id))return;
    const pending=this.opening.get(id);if(pending)return pending;
    const lifetime=this.lifetime;
    const task=this.admission.catch(()=>{}).then(async()=>{
      if(this.documents.size+this.previews.size>=7){
        const inactive=[...this.documents.values()].find(document=>!document.editors.size&&!this.refreshing.has(document.opened.id)&&!document.getSnapshot().saving);
        if(inactive){await inactive.flush();await this.request('close',{document:inactive.opened.id,binding:inactive.opened.binding});inactive.dispose();this.documents.delete(inactive.opened.id);}
        else{const preview=[...this.previews.values()].find(value=>!this.previewMounts.has(value.id));if(!preview)throw Error('Close a document pane before opening another linked file.');await this.request('close',{document:preview.id,binding:preview.binding});this.previews.delete(preview.id);}
      }
      const opened=await this.request<Opened>('open',{document:id});
      if(lifetime!==this.lifetime){await this.request('close',{document:id,binding:opened.binding}).catch(()=>{});return;}
      this.unavailable.delete(id);
      if(opened.readonlyReason){this.previews.set(id,opened);return;}
      const session=new MarkdownSession(browserPort(new Worker(new URL('../markdown/markdown.worker.ts',import.meta.url),{type:'module'})),opened.seed??opened.bytes);
      try{await session.ready;}catch(error){session.dispose();await this.request('close',{document:id,binding:opened.binding});throw error;}
      if(lifetime!==this.lifetime){session.dispose();await this.request('close',{document:id,binding:opened.binding}).catch(()=>{});return;}
      const document=new LinkedDocument(opened,session,this.request);this.documents.set(id,document);if(opened.visual)session.submit(opened.visual.document);
    }).catch(error=>{if(lifetime===this.lifetime)this.unavailable.set(id,linkedError(error));});this.admission=task;this.opening.set(id,task);try{await task;}finally{this.opening.delete(id);this.emit();}
  }
  async flush(){await Promise.all(this.opening.values());for(const document of this.documents.values())await document.flush();}
  async reconnectReference(id:string){
    const previous=this.documents.get(id);for(const editor of previous?.editors??[])editor.setEditable(false,false);
    try{
      await previous?.flush();const result=await this.request<{outcome:string}>('reconnect-reference',{document:id});if(result.outcome!=='authorized')return;
      previous?.dispose();this.documents.delete(id);this.previews.delete(id);this.unavailable.delete(id);this.sourcesVersion++;this.emit();await this.open(id);
    }finally{for(const editor of previous?.editors??[])if(!editor.isDestroyed)editor.setEditable(!previous?.sourceDraft,false);}
  }
  async reopen(source?:string){
    await this.flush();const documents=[...this.documents.values()].filter(d=>source===undefined||d.opened.source===source),previews=[...this.previews.values()].filter(d=>source===undefined||d.source===source);
    await this.request('close-documents',{source});
    for(const document of documents){document.dispose();this.documents.delete(document.opened.id);}for(const preview of previews)this.previews.delete(preview.id);this.emit();
    for(const id of [...documents.map(d=>d.opened.id),...previews.map(d=>d.id)])await this.open(id);
  }
  search=async(query:string,mode:'title'|'content')=>{
    if(!this.supported())return {items:[],indexing:false,limited:false,indexed:0};const connectionEpoch=getConnection().epoch;
    const result=await this.request<{items:Resource[];indexing:boolean;limited:boolean;indexed:number}>('search',{query,mode});
    if(result.items.length){const {data}=await api.put<Resource[]>('/resources/linked',result.items.map(item=>({id:item.id,title:item.title,reference:item.content})),{backgroundDiagnostic:true,connectionEpoch});const metadata=new Map(data.map(item=>[item.id,item]));result.items=result.items.map(item=>({...item,...metadata.get(item.id)})).filter(item=>!item.trashedAt);for(const item of result.items)this.metadata.set(item.id,item);}
    return result;
  };
  async reconcile(){
    for(const document of [...this.documents.values()]){
      if(this.refreshing.has(document.opened.id))continue;
      const changed=await this.request<{state:string}>('check',{document:document.opened.id,binding:document.opened.binding});
      if(['EXTERNAL_CHANGED','DISK_TOO_LARGE_READ_ONLY'].includes(changed.state)&&!document.getSnapshot().dirty)await this.refresh(document);else document.external(changed.state);
    }
    for(const preview of [...this.previews.values()]){
      const changed=await this.request<{state:string}>('check',{document:preview.id,binding:preview.binding});
      if(['EXTERNAL_CHANGED','DISK_TOO_LARGE_READ_ONLY'].includes(changed.state))await this.refreshPreview(preview);
      else if(changed.state!=='BUSY_RETRY'&&this.previewStatus.get(preview.id)!==changed.state){this.previewStatus.set(preview.id,changed.state);this.emit();}
    }
    await this.request('index').catch(()=>{});
    const directories=[...this.directories.values()];
    for(let i=0;i<Math.min(4,directories.length);i++){const index=this.directoryCursor++%directories.length;await directories[index]().catch(()=>{});}
  }
  async refreshPreview(previous:Opened){
    const id=previous.id;if(this.refreshing.has(id))return;this.refreshing.add(id);let ticket:string|undefined,next:MarkdownSession|undefined;
    try{
      const opened=await this.request<Opened&{ticket:string}>('prepare-refresh',{document:id,binding:previous.binding});ticket=opened.ticket;
      if(!opened.readonlyReason){next=new MarkdownSession(browserPort(new Worker(new URL('../markdown/markdown.worker.ts',import.meta.url),{type:'module'})),opened.bytes);await next.ready;}
      if(this.previews.get(id)!==previous)throw Error('LINKED_REFRESH_SUPERSEDED');
      await this.request('commit-refresh',{ticket});ticket=undefined;if(this.previews.get(id)!==previous)throw Error('LINKED_REFRESH_SUPERSEDED');
      this.previews.delete(id);this.previewStatus.delete(id);if(next){this.documents.set(id,new LinkedDocument(opened,next,this.request));next=undefined;}else this.previews.set(id,opened);this.emit();
    }catch{if(this.previews.get(id)===previous&&this.previewStatus.get(id)!=='REVIEW_REQUIRED'){this.previewStatus.set(id,'REVIEW_REQUIRED');this.emit();}}
    finally{if(ticket)await this.request('abort-refresh',{ticket}).catch(()=>{});next?.dispose();this.refreshing.delete(id);}
  }
  async refresh(previous:LinkedDocument,reviewedRevision?:string){
    const id=previous.opened.id;if(this.refreshing.has(id))return;this.refreshing.add(id);let ticket:string|undefined,next:MarkdownSession|undefined;
    const version=previous.session.status.version;const restore=()=>{for(const editor of previous.editors)if(!editor.isDestroyed)editor.setEditable(!previous.sourceDraft,false);};
    try{
      await previous.flush();
      const opened=await this.request<Opened&{ticket:string}>('prepare-refresh',{document:id,binding:previous.opened.binding});ticket=opened.ticket;
      if(reviewedRevision!==undefined&&opened.revision!==reviewedRevision)throw Error('The file changed again. Compare the current version before reloading.');
      if(!opened.readonlyReason){next=new MarkdownSession(browserPort(new Worker(new URL('../markdown/markdown.worker.ts',import.meta.url),{type:'module'})),opened.bytes);await next.ready;}
      for(const editor of previous.editors)editor.setEditable(false,false);await Promise.resolve();
      if(this.documents.get(id)!==previous||previous.session.status.version!==version||previous.session.status.reason==='COMPOSITION_IN_PROGRESS'||reviewedRevision===undefined&&(previous.sourceDraft||previous.getSnapshot().dirty))throw Error('Newer draft retained; refresh cancelled.');
      await this.request('commit-refresh',{ticket});ticket=undefined;
      this.documents.delete(id);previous.dispose();if(next){this.documents.set(id,new LinkedDocument(opened,next,this.request));next=undefined;}else this.previews.set(id,opened);this.emit();
    }catch(error){previous.external('EXTERNAL_CHANGED');if(reviewedRevision!==undefined)throw error;}
    finally{if(ticket)await this.request('abort-refresh',{ticket}).catch(()=>{});next?.dispose();restore();this.refreshing.delete(id);}
  }
  async acceptCombination(previous:LinkedDocument,prepared:Combination){
    const id=previous.opened.id;if(this.refreshing.has(id))throw Error('Another document review is pending.');this.refreshing.add(id);let next:MarkdownSession|undefined;
    try{
      if(!prepared.seed||prepared.readonlyReason)throw Error('The combined source is unavailable.');
      next=new MarkdownSession(browserPort(new Worker(new URL('../markdown/markdown.worker.ts',import.meta.url),{type:'module'})),prepared.seed);await next.ready;
      for(const editor of previous.editors)editor.setEditable(false,false);await Promise.resolve();
      if(this.documents.get(id)!==previous||previous.session.status.version!==prepared.editorVersion||previous.session.status.state!=='ready'||previous.sourceDraft)throw Error('Newer edits are retained. Review the combination again.');
      const committed=await this.request<Opened>('commit-refresh',{ticket:prepared.ticket});
      previous.dispose();this.documents.set(id,new LinkedDocument(committed,next,this.request));next=undefined;this.emit();
    }finally{next?.dispose();for(const editor of previous.editors)if(!editor.isDestroyed)editor.setEditable(!previous.sourceDraft,false);this.refreshing.delete(id);}
  }
  closedEditors(){this.lifetime++;for(const document of this.documents.values()){this.unavailable.set(document.opened.id,'Recovery review closed this editor safely. Reopen to continue.');document.dispose();}for(const preview of this.previews.values())this.unavailable.set(preview.id,'Reopen this linked document to continue.');this.documents.clear();this.previews.clear();this.previewStatus.clear();this.previewMounts.clear();this.emit();}
  dispose(){this.lifetime++;this.contextVersion++;for(const document of this.documents.values())document.dispose();this.documents.clear();this.previews.clear();this.previewStatus.clear();this.metadata.clear();this.unavailable.clear();this.directories.clear();this.previewMounts.clear();this.emit();}
  async closeNativeDocuments(){if(!this.documents.size&&!this.previews.size)return;await this.request('close-documents').catch(error=>{if(!/WORKSPACE_CHANGED|OWNER_CHANGED/.test(String(error)))throw error;});}
  async close(){await this.flush();await this.closeNativeDocuments();this.dispose();}
}
