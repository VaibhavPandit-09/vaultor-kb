import {requestLinked} from '../desktop';
import {getConnection,getPlatform} from '../platform';
import {MarkdownSession} from '../markdown/session';
import {browserPort} from '../markdown/browserPort';
import {LinkedDocument} from './document';
import type {Identity} from '../sessionStore';
import type {Resource} from '../../types';
import type {Entry,LinkedRequest,Opened,Source} from './types';
export class LinkedWorkspace{
  readonly documents=new Map<string,LinkedDocument>();
  readonly previews=new Map<string,Opened>();
  readonly metadata=new Map<string,Resource>();
  private opening=new Map<string,Promise<void>>();
  private identity:()=>Identity|null;
  private listeners=new Set<()=>void>();
  private revision=0;
  private refreshing=new Set<string>();
  private directories=new Map<string,()=>Promise<void>>();
  private directoryCursor=0;
  observeDirectory(id:string,refresh:()=>Promise<void>){this.directories.set(id,refresh);return()=>{if(this.directories.get(id)===refresh)this.directories.delete(id);};}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  getSnapshot=()=>this.revision;
  private emit(){this.revision++;this.listeners.forEach(listener=>listener());}
  constructor(identity:()=>Identity|null){this.identity=identity;}
  supported(){return getPlatform().kind==='desktop'&&getConnection().profileId==='this-computer';}
  request:LinkedRequest=async(operation,payload={})=>{const identity=this.identity();if(!identity)throw Error('Wait for workspace restoration.');return requestLinked(identity,operation,payload);};
  sources(){return this.request<{sources:Source[]}>('state');}
  async describe(id:string){
    if(!this.supported())return null;
    const known=this.metadata.get(id);if(known)return known;
    const value=await this.request<Resource|null>('metadata',{document:id});if(value)this.metadata.set(id,value);return value;
  }
  remember(entry:Entry){const resource:Resource={id:entry.id,type:'linked',title:entry.name,tags:[],content:null,size:entry.size,createdAt:'',updatedAt:''};this.metadata.set(entry.id,resource);return resource;}
  async open(id:string){
    if(this.documents.has(id)||this.previews.has(id))return;
    const pending=this.opening.get(id);if(pending)return pending;
    const task=(async()=>{
      const opened=await this.request<Opened>('open',{document:id});
      if(opened.readonlyReason){this.previews.set(id,opened);return;}
      const session=new MarkdownSession(browserPort(new Worker(new URL('../markdown/markdown.worker.ts',import.meta.url),{type:'module'})),opened.bytes);
      try{await session.ready;}catch(error){session.dispose();await this.request('close',{document:id,binding:opened.binding});throw error;}
      this.documents.set(id,new LinkedDocument(opened,session,this.request));
    })();this.opening.set(id,task);try{await task;}finally{this.opening.delete(id);}
  }
  async flush(){await Promise.all(this.opening.values());for(const document of this.documents.values())await document.flush();}
  async reconcile(){
    for(const document of [...this.documents.values()]){
      if(this.refreshing.has(document.opened.id))continue;
      const changed=await this.request<{state:string}>('check',{document:document.opened.id,binding:document.opened.binding});
      if(changed.state==='EXTERNAL_CHANGED'&&!document.getSnapshot().dirty)await this.refresh(document);else document.external(changed.state);
    }
    const directories=[...this.directories.values()];
    for(let i=0;i<Math.min(4,directories.length);i++){const index=this.directoryCursor++%directories.length;await directories[index]().catch(()=>{});}
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
  async close(){await this.flush();for(const document of this.documents.values())document.dispose();this.documents.clear();this.previews.clear();this.metadata.clear();}
}
