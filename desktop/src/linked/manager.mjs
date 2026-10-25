import {RecoveryCatalog} from './recovery-catalog.mjs';
import {LinkedSearch} from './search.mjs';
import {exportLinked} from './exports.mjs';
import {LinkedRegistry} from './registry.mjs';
import {LinkedDocuments} from './documents.mjs';

const fields={'reconnect-reference':['document'],'retain-current':['document','binding','version'],'release-recovery':[],'previous-scopes':[],'discard-evidence':['ticket','recoveryScope'],'index':[],search:['query','mode'],'resolve-link':['document','binding','href'],'close-documents':['source'],export:['operation','document','binding','kind','recoveryScope'],recovery:['recoveryScope'],inspect:['operation','recoveryScope'],review:['operation','source'],restore:['ticket'],'metadata-repair':['ticket'],resolve:['ticket'],state:[],add:[],metadata:['document'],'prepare-combination':['document','binding'],'prepare-refresh':['document','binding'],'commit-refresh':['ticket'],'abort-refresh':['ticket'],list:['source','directory','offset','limit'],open:['document'],protect:['document','binding','version','draft','source','session','sourceDraft','editorVersion'],save:['document','binding','version'],source:['document','binding','version','block','expected','text'],check:['document','binding'],chunk:['document','binding','offset'],close:['document','binding'],disconnect:['source'],remove:['source']};
/** One owner-local workspace lifetime. The outer Electron handler authenticates
 * the exact window/main frame; owner() independently verifies the host identity. */
export class LinkedManager {
  constructor(options){this.options=options;this.active=0;this.mutations=0;}
  async ensure(request){
    if(this.closing)throw Error('LINKED_CONTEXT_CLOSING');const owner=await this.options.owner(request);
    if(!owner||owner.kind!=='owned-local'||owner.mainFrame!==true||owner.token!==request.token||owner.workspace!==request.workspace||owner.generation!==request.generation)throw Error('LINKED_LOCAL_OWNER_REQUIRED');
    if(this.context?.epoch===owner.epoch)return;
    if(this.opening){await this.opening;if(this.context?.epoch===owner.epoch)return;throw Error('LINKED_CONTEXT_CHANGED');}
    if(this.active)throw Error('LINKED_CONTEXT_BUSY');
    this.opening=(async()=>{await this.recoveryCatalog?.close();await this.documents?.dispose();await this.registry?.close();this.context={...owner};this.registry=new LinkedRegistry({...this.options,current:()=>this.options.current?.(this.context)??(this.options.current?null:this.context)});await this.registry.load(owner);this.documents=new LinkedDocuments(this.registry,{worker:this.options.worker,owner:this.options.owner});this.search=new LinkedSearch(this.registry);this.recoveryCatalog=new RecoveryCatalog(this.registry);})().finally(()=>{this.opening=undefined;});await this.opening;
  }
  async reference(request,id,{reconnect=false}={}){
    if(!reconnect&&this.registry.entries.has(id))return this.registry.entries.get(id);
    const reference=await this.options.readReference?.(request,id);this.registry.check(request);if(!reference)throw Error('LINKED_REFERENCE_UNAVAILABLE');
    let rootId=this.registry.sourceAliases.get(reference.sourceId)??reference.sourceId;
    if(reconnect){
      const selected=await this.registry.add(request,{title:'Locate '+reference.sourceName+' · '+reference.relativePath});if(selected.outcome!=='authorized')return null;
      rootId=selected.root;if(this.registry.sourceAliases.size>=8&&!this.registry.sourceAliases.has(reference.sourceId))throw Error('LINKED_SOURCE_LIMIT');
      const previous=this.documents.documents.get(id);if(previous)await this.documents.close(request,{document:id,binding:previous.binding});
      this.registry.sourceAliases.set(reference.sourceId,rootId);await this.registry.persist();
    }
    if(!this.registry.roots.has(rootId))throw Error('LINKED_REFERENCE_NEEDS_AUTHORIZATION');
    return this.registry.adoptReference(request,id,reference,rootId,{replace:reconnect});
  }
  async dispatch(value){
    if(!value||Array.isArray(value)||Object.keys(value).some(key=>!['token','workspace','generation','operation','payload'].includes(key)))throw Error('INVALID_LINKED_REQUEST');
    const allowed=fields[value.operation],p=value.payload??{};
    if(!allowed||!p||Array.isArray(p)||typeof p!=='object'||Object.keys(p).some(key=>!allowed.includes(key)))throw Error('INVALID_LINKED_FIELDS');
    if(this.active>=8)throw Error('LINKED_BUSY');
    if(['retain-current','protect','inspect','recovery','previous-scopes','release-recovery','export','discard-evidence'].includes(value.operation)&&this.documents&&this.options.privateOwner?.(value,this.context))this.registry.check(value);
    else await this.ensure(value);
    if(this.closing||this.active>=8)throw Error('LINKED_BUSY');this.active++;
    const mutation=['retain-current','add','protect','source','save','close','disconnect','remove','close-documents','export','restore','metadata-repair','resolve','discard-evidence','commit-refresh','reconnect-reference'].includes(value.operation);if(mutation)this.mutations++;
    try{
      if(!['state','metadata','close-documents','index','search'].includes(value.operation))await this.registry.ensureNative();
      switch(value.operation){
        case 'index':await this.search.tick(value);return {indexed:this.search.bodies.size};
        case 'search':return this.search.search(value,p);
        case 'close-documents':return await this.documents.closeDocuments(value,p);
        case 'export':return await exportLinked(this,value,p);
        case 'release-recovery':await this.recoveryCatalog.close();return {closed:true};
        case 'previous-scopes':return await this.recoveryCatalog.list();
        case 'recovery':{const target=await this.recoveryCatalog.target(p.recoveryScope);try{const rows=await target.native.call('recovery'),items=[];for(let at=0;at<rows.length;at+=4)items.push({operation:rows[at],state:rows[at+1],name:rows[at+2],version:Number(rows[at+3])});return items;}finally{target.release?.();}}
        case 'inspect':{
          const target=await this.recoveryCatalog.target(p.recoveryScope);try{const evidence=await target.native.call('evidence',p.operation);let r;
          try{r=await target.native.call('inspect',p.operation);}catch{r=['','','','DAMAGED_EXPORT_ONLY'];}
          return {base:r[0]?new Uint8Array(Buffer.from(r[0],'base64')):null,local:r[1]?new Uint8Array(Buffer.from(r[1],'base64')):null,visual:r[2],state:r[3],evidenceTicket:evidence[0],artifacts:evidence.slice(1)};}finally{target.release?.();}
        }
        case 'discard-evidence':{
          if(this.discarding)throw Error('LINKED_BUSY');this.discarding=true;let closed=false,target;
          try{target=await this.recoveryCatalog.target(p.recoveryScope);
            const approved=await this.options.confirmDiscard?.({archived:!!p.recoveryScope});this.registry.check(value);if(!approved)return {removed:false,closed:false};
            if(!p.recoveryScope){closed=true;await this.documents.closeDocuments(value,{});}await target.native.call('discard-evidence',p.ticket);return {removed:true,closed};
          }catch(error){return {removed:false,closed,error:error.message};}finally{target?.release?.();this.discarding=false;}
        }
        case 'review':{const publicationState=(await this.registry.native.call('inspect',p.operation))[3];const root=this.registry.roots.get(p.source);if(!root)throw Error('LINKED_SOURCE_NOT_FOUND');const cap=await this.registry.grant(root),r=await this.registry.native.call('review',p.operation,cap);this.registry.check(value);return {ticket:r[0],state:r[1],publicationState,base:new Uint8Array(Buffer.from(r[2],'base64')),local:r[3]?new Uint8Array(Buffer.from(r[3],'base64')):null,visual:r[4],disk:r[5]?{identity:r[5],revision:r[6],bytes:new Uint8Array(Buffer.from(r[8],'base64')),size:Number(r[9])}:null};}
        case 'restore':return {state:(await this.registry.native.call('restore',p.ticket))[0]};
        case 'metadata-repair':return {state:(await this.registry.native.call('metadata',p.ticket))[0]};
        case 'resolve':await this.registry.native.call('resolve',p.ticket);return {resolved:true};
        case 'state':return {supported:true,sources:this.registry.snapshot()};
        case 'add':return await this.registry.add(value);
        case 'reconnect-reference':return {outcome:await this.reference(value,p.document,{reconnect:true})?'authorized':'cancelled'};
        case 'metadata':{let e=this.registry.entries.get(p.document);if(!e)e=await this.reference(value,p.document);return e&&!e.directory&&e.markdown?{id:e.id,type:'linked',title:e.name,tags:[],content:e.reference??{type:'linkedDocument',version:1,sourceId:e.root,sourceName:this.registry.roots.get(e.root)?.name??'Unavailable source',relativePath:e.relative},createdAt:'',updatedAt:'',size:null}:null;}
        case 'list':return await this.registry.list(value,p);
        case 'open':await this.reference(value,p.document);return await this.documents.open(value,p.document);
        case 'protect':return await this.documents.protect(value,p);
        case 'save':return await this.documents.save(value,p);
        case 'retain-current':return await this.documents.retainCurrent(value,p);
        case 'source':return await this.documents.source(value,p);
        case 'prepare-combination':return await this.documents.prepareCombination(value,p);
        case 'prepare-refresh':return await this.documents.prepareRefresh(value,p);
        case 'commit-refresh':return await this.documents.commitRefresh(value,p);
        case 'abort-refresh':return await this.documents.abortRefresh(value,p);
        case 'resolve-link':return await this.documents.resolveLink(value,p);
        case 'check':return await this.documents.check(value,p);
        case 'chunk':return await this.documents.chunk(value,p);
        case 'close':return await this.documents.close(value,p);
        case 'remove':return await this.registry.remove(value,p.source);
        case 'disconnect':return await this.registry.disconnect(value,p.source);
        default:throw Error('INVALID_LINKED_OPERATION');
      }
    }finally{this.active--;if(mutation)this.mutations--;}
  }
  async close(){if(this.active)throw Error('LINKED_OPERATION_PENDING');this.closing=true;try{await this.opening;await this.recoveryCatalog?.close();await this.documents?.dispose();await this.registry?.close();this.context=null;this.documents=undefined;this.registry=undefined;this.search=undefined;this.recoveryCatalog=undefined;}finally{this.closing=false;}}
}
