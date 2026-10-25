import {randomUUID} from 'node:crypto';
import {Validator} from './validator.mjs';

const readBase=fields=>({identity:fields[2],sha256:fields[3],metadata:fields[4],bytes:Buffer.from(fields[5],'base64'),size:Number(fields[6])});
export class LinkedDocuments {
  constructor(registry,options){this.registry=registry;this.options=options;this.documents=new Map();this.refreshes=new Map();}
  state(request,id,binding){this.registry.check(request);const d=this.documents.get(id);if(!d||d.binding!==binding)throw Error('LINKED_DOCUMENT_CHANGED');return d;}
  async open(request,id){
    this.registry.check(request);const entry=this.registry.entries.get(id);if(!entry||entry.directory||!entry.markdown||entry.unsupported)throw Error('LINKED_DOCUMENT_UNAVAILABLE');
    const existing=this.documents.get(id);if(existing){if(existing.base.identity!==entry.identity)throw Error('LINKED_DOCUMENT_REPLACED');return this.public(existing);}
    if(this.documents.size>=8)throw Error('LINKED_OPEN_LIMIT');const root=this.registry.roots.get(entry.root),capability=await this.registry.grant(root);
    const fields=await this.registry.native.call('open-linked',capability,entry.relative);this.registry.check(request);const base=readBase(fields);
    if(base.identity!==entry.identity){await this.registry.native.call('close',fields[0]);throw Error('LINKED_DOCUMENT_REPLACED_REFRESH');}
    const d={id,source:entry.root,entry,document:fields[0],epoch:fields[1],base,readonlyReason:fields[7],binding:randomUUID(),version:-1,busy:false};
    if(!d.readonlyReason){d.validator=new Validator(this.options.worker,base.bytes);try{await d.validator.ready;}catch(error){await d.validator.close();d.validator=undefined;d.readonlyReason='DOCUMENT_SHAPE_LIMIT';}}
    try{this.registry.check(request);}catch(error){await d.validator?.close();await this.registry.native.call('close',d.document).catch(()=>{});throw error;}
    await this.registry.native.call('bind-view',d.document,id);this.documents.set(id,d);return this.public(d);
  }
  public(d){return {id:d.id,source:d.source,binding:d.binding,name:d.entry.name,relative:d.entry.relative,identity:d.base.identity,revision:d.base.sha256,bytes:new Uint8Array(d.base.bytes),size:d.base.size,readonlyReason:d.readonlyReason};}
  async protect(request,p){
    const d=this.state(request,p.document,p.binding);if(d.readonlyReason||d.busy||!Number.isSafeInteger(p.version)||p.version<=d.version)throw Error('LINKED_VERSION_OR_BUSY');
    d.version=p.version;d.candidate=undefined;d.busy=true;
    try{
      if(p.session!==undefined&&Buffer.byteLength(JSON.stringify(p.session))>65536)throw Error('LINKED_SESSION_LIMIT');
      const sessionMetadata={id:d.id,name:d.entry.name,reading:p.session,sourceDraft:p.sourceDraft,editorVersion:p.editorVersion};let accepted;
      try{accepted=await d.validator.validate({document:d.document,epoch:d.epoch,base:d.base,version:p.version,draft:p.draft,claimedSource:p.source,sessionMetadata},this.registry.native.validation);}
      catch{accepted={visual:JSON.stringify({schema:'G3_VISUAL_1',document:p.draft,session:sessionMetadata}),reason:'VALIDATION_FAILED_DRAFT_RETAINED'};}
      this.registry.check(request);const [candidate]=await this.registry.native.call('draft',d.document,d.epoch,p.version,accepted.visual,accepted.source?.toString('base64')??'-',accepted.proof??'-');
      this.registry.check(request);d.candidate=candidate;d.validatedSource=accepted.source;d.reviewableSource=accepted.sourceForReview??accepted.source?.toString('utf8');
      return {version:p.version,protected:true,validated:!!candidate,reason:accepted.reason};
    }finally{d.busy=false;}
  }
  async save(request,p){
    const d=this.state(request,p.document,p.binding);if(d.readonlyReason||d.busy||d.pendingOperation||!d.candidate||p.version!==d.version)throw Error('LINKED_SOURCE_NOT_VALIDATED');
    d.busy=true;const candidate=d.candidate;d.candidate=undefined;
    try{
      d.pendingOperation=randomUUID();
      const receipt=await this.registry.native.call('save',d.document,d.epoch,candidate,d.pendingOperation);this.registry.check(request);
      if(receipt[0]==='COMMITTED'){
        this.registry.entryIndex.delete(this.registry.entryKey(d.entry.root,d.entry.relative,d.entry.identity));
        d.base={identity:receipt[2],sha256:receipt[3],metadata:receipt[4],bytes:Buffer.from(d.validatedSource),size:d.validatedSource.length};d.entry.identity=d.base.identity;d.entry.size=d.base.size;d.entry.modified=String(Date.now());
        this.registry.entryIndex.set(this.registry.entryKey(d.entry.root,d.entry.relative,d.entry.identity),d.id);
        try{await this.registry.persist();}catch{return {state:'RECOVERY_REQUIRED',version:Number(receipt[1]),operation:receipt[5],reason:'SOURCE_SAVED_REGISTRY_RECOVERY'};}
        // An uncertain/lost receipt is never automatically expired. A journal
        // retention failure does not undo a completed content Save.
        await this.registry.native.call('ack-save',receipt[5]).catch(()=>{});
      }
      d.pendingOperation=undefined;return {state:receipt[0],version:Number(receipt[1]),operation:receipt[5],identity:receipt[2],revision:receipt[3]};
    }catch(error){return {state:'RECOVERY_REQUIRED',version:p.version,operation:d.pendingOperation,reason:error.message};}finally{d.busy=false;}
  }
  async source(request,p){const d=this.state(request,p.document,p.binding);if(d.busy||d.version!==p.version||typeof d.reviewableSource!=='string')throw Error('SOURCE_REQUIRES_VALIDATED_REGION');d.candidate=undefined;d.busy=true;try{const region=await d.validator.request({type:'region',version:p.version,block:p.block,expected:p.expected});const reply=await d.validator.request({type:'source',version:p.version+1,token:region.token,text:p.text});this.registry.check(request);if(!reply.result?.accepted)throw Error('SOURCE_REGION_REFUSED');return {source:reply.result.source};}finally{d.busy=false;}}
  async check(request,p){const d=this.state(request,p.document,p.binding);const reply=await this.registry.native.call('check',d.document);this.registry.check(request);return {state:reply[0],dirty:reply[1]==='true',disk:reply[2]?{identity:reply[2],revision:reply[3],bytes:new Uint8Array(Buffer.from(reply[5],'base64')),size:Number(reply[6])}:null};}
  async prepareRefresh(request,p){
    const d=this.state(request,p.document,p.binding);if(d.busy||d.pendingOperation||this.refreshes.size>=8)throw Error('LINKED_REFRESH_BUSY');
    for(const pending of this.refreshes.values())if(pending.previous===d)throw Error('LINKED_REFRESH_PENDING');
    d.busy=true;let next;
    try{
      const root=this.registry.roots.get(d.source),capability=await this.registry.grant(root),fields=await this.registry.native.call('open-linked',capability,d.entry.relative),base=readBase(fields);
      next={...d,document:fields[0],epoch:fields[1],base,binding:randomUUID(),version:-1,busy:false,candidate:undefined,validatedSource:undefined,reviewableSource:undefined,validator:undefined,readonlyReason:fields[7]};
      // Path reuse is independent. A fresh navigation/explicit review owns it.
      if(base.identity!==d.base.identity)throw Error('LINKED_DOCUMENT_REPLACED');
      if(!next.readonlyReason){next.validator=new Validator(this.options.worker,base.bytes);await next.validator.ready;}
      this.registry.check(request);await this.registry.native.call('bind-view',next.document,d.id);
      const ticket=randomUUID(),timer=setTimeout(()=>{void this.abortRefresh(request,{ticket}).catch(()=>{});},30000);timer.unref();
      this.refreshes.set(ticket,{previous:d,next,version:d.version,timer});return {...this.public(next),ticket};
    }catch(error){await next?.validator?.close();if(next)await this.registry.native.call('close',next.document).catch(()=>{});throw error;}finally{d.busy=false;}
  }
  async abortRefresh(request,{ticket}){this.registry.check(request);const pending=this.refreshes.get(ticket);if(!pending)return;this.refreshes.delete(ticket);clearTimeout(pending.timer);await pending.next.validator?.close();await this.registry.native.call('close',pending.next.document).catch(()=>{});}
  async commitRefresh(request,{ticket}){
    this.registry.check(request);const pending=this.refreshes.get(ticket);if(!pending)throw Error('LINKED_REFRESH_EXPIRED');const {previous:d,next}=pending;
    if(this.documents.get(d.id)!==d||d.busy||d.version!==pending.version||d.pendingOperation)throw Error('LINKED_REFRESH_SUPERSEDED');
    d.busy=true;try{const disk=await this.registry.native.call('check',next.document);this.registry.check(request);if(disk[0]!=='UNCHANGED')throw Error('LINKED_REFRESH_DISK_CHANGED');await this.registry.native.call('close',d.document);await d.validator?.close();this.refreshes.delete(ticket);clearTimeout(pending.timer);this.documents.set(d.id,next);return this.public(next);}finally{d.busy=false;}
  }
  async chunk(request,p){const d=this.state(request,p.document,p.binding);if(!Number.isSafeInteger(p.offset)||p.offset<0)throw Error('LINKED_CHUNK_OFFSET');const [bytes]=await this.registry.native.call('chunk',d.document,d.epoch,p.offset,65536);this.registry.check(request);return new Uint8Array(Buffer.from(bytes,'base64'));}
  async close(request,p){const d=this.state(request,p.document,p.binding);if(d.busy)throw Error('LINKED_OPERATION_PENDING');await d.validator?.close();await this.registry.native.call('close',d.document);this.documents.delete(d.id);}
  async dispose(){for(const p of this.refreshes.values()){clearTimeout(p.timer);await p.next.validator?.close();}this.refreshes.clear();for(const d of this.documents.values())await d.validator?.close();this.documents.clear();}
}
