import {command} from './client';
import type {JSONContent} from '@tiptap/core';
import type {LinkedDocument,LinkedRequest} from './linkedTypes';
export const linkedCommand=<T,>(request:LinkedRequest)=>command<T>({kind:'linked',request});
type Entry={doc:LinkedDocument;token:string;sequence:number;committed:number;protected:number;capture?:()=>JSONContent;timer?:ReturnType<typeof setTimeout>;deadline?:ReturnType<typeof setTimeout>;protecting?:Promise<void>;saving?:Promise<LinkedDocument>;error?:string;blocked?:boolean};
export class LinkedEditingSession{
 private entries=new Map<string,Entry>();
 private changed:(persisted?:boolean)=>void;
 constructor(changed:(persisted?:boolean)=>void){this.changed=changed;}
 get(id:string){return this.entries.get(id)?.doc;}
 ids(){return this.entries.keys();}
 dirty(id:string){const e=this.entries.get(id);return !!e&&e.sequence!==e.committed;}
 status(id:string){const e=this.entries.get(id);return !e?'unavailable':e.saving?'Saving source…':e.error?e.error.includes('conflict')?'external conflict':e.blocked?'review publication':'Save refused':!this.dirty(id)?'source unchanged':e.protected===e.sequence?'draft protected · explicit Save':'pending · source unchanged';}
 error(id:string){return this.entries.get(id)?.error;}
 locked(id:string){const e=this.entries.get(id);return !!e?.saving||!!e?.blocked;}
 adopt(doc:LinkedDocument){const old=this.entries.get(doc.id);if(old){clearTimeout(old.timer);clearTimeout(old.deadline);}this.entries.set(doc.id,{doc,token:doc.draft?.token??crypto.randomUUID(),sequence:doc.draft?.sequence??0,committed:doc.draft?-1:0,protected:doc.draft?.sequence??0,blocked:!!doc.current?.publication,error:doc.current?.publication?'Interrupted publication needs review':doc.draft?.error??(doc.draft?.state==='saving'?'Save was interrupted; inspect the source':undefined)??doc.current?.current.error??(doc.current?.current.revision&&doc.current.current.revision!==doc.revision?'External revision conflict; protected draft retained':undefined)});this.changed();}
 edit(id:string,capture:()=>JSONContent){const e=this.entries.get(id)!;const before=this.status(id);e.capture=capture;e.sequence++;e.error=undefined;clearTimeout(e.timer);e.timer=setTimeout(()=>void this.protect(id).catch(()=>{}),250);e.deadline??=setTimeout(()=>void this.protect(id).catch(()=>{}),1000);if(before!==this.status(id))this.changed();}
 async protect(id:string,fromSave=false):Promise<void>{const e=this.entries.get(id);if(!e)return;if(e.saving&&!fromSave){await e.saving.catch(()=>{});return this.protect(id);}clearTimeout(e.timer);clearTimeout(e.deadline);e.deadline=undefined;if(e.protecting){await e.protecting;if(e.protected!==e.sequence)return this.protect(id,fromSave);return;}if(!this.dirty(id)||e.protected===e.sequence)return;const sequence=e.sequence,content=e.capture?.()??e.doc.content;
  e.protecting=linkedCommand({op:'protect',id:e.doc.documentId,revision:e.doc.revision,base:e.doc.base,content,token:e.token,sequence}).then(()=>{e.doc.content=content;e.protected=sequence;e.error=undefined;}).catch(error=>{e.error=String(error);throw error;}).finally(()=>{e.protecting=undefined;this.changed(true);});await e.protecting;if(e.sequence!==sequence)return this.protect(id,fromSave);
 }
 async protectAll(){await Promise.all([...this.entries.keys()].map(id=>this.protect(id)));}
 async save(id:string):Promise<LinkedDocument>{const e=this.entries.get(id);if(!e)throw Error('Linked document closed');if(e.saving)return e.saving;if(!this.dirty(id))return e.doc;const saving:Promise<LinkedDocument>=(async()=>{await this.protect(id,true);const sequence=e.sequence;const saved=await linkedCommand<LinkedDocument>({op:'save',id:e.doc.documentId,token:e.token,sequence});e.doc={...saved};e.committed=sequence;e.protected=sequence;e.error=undefined;e.blocked=false;if(e.sequence===sequence)e.capture=undefined;if(e.sequence!==sequence){e.protected=-1;clearTimeout(e.timer);e.timer=setTimeout(()=>void this.protect(id).catch(()=>{}),0);}return saved;})().catch(error=>{e.error=String(error);e.blocked=e.error.includes('outcome uncertain')||e.error.includes('publication needs review');throw error;}).finally(()=>{if(e.saving===saving)e.saving=undefined;this.changed(true);});e.saving=saving;this.changed();return saving;}
 async discard(id:string){const e=this.entries.get(id);if(!e)return;await this.protect(id);await linkedCommand({op:'discard',id:e.doc.documentId,token:e.token,sequence:e.sequence});this.forget(id,true);}
 forget(id:string,discarded=false){const e=this.entries.get(id);if(!e)return;if(!discarded&&this.dirty(id)&&e.protected!==e.sequence)throw Error('Linked changes must reach the journal before closing');clearTimeout(e.timer);clearTimeout(e.deadline);this.entries.delete(id);}
 snapshot(id:string){const e=this.entries.get(id);return e?.capture?.()??e?.doc.content;}
}
