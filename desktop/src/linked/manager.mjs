import {LinkedSearch} from './search.mjs';
import {exportLinked} from './exports.mjs';
import {LinkedRegistry} from './registry.mjs';
import {LinkedDocuments} from './documents.mjs';

const fields={'index':[],search:['query','mode'],'resolve-link':['document','binding','href'],'close-documents':['source'],export:['operation','document','binding','kind'],recovery:[],inspect:['operation'],review:['operation','source'],restore:['ticket'],'metadata-repair':['ticket'],resolve:['ticket'],state:[],add:[],metadata:['document'],'prepare-refresh':['document','binding'],'commit-refresh':['ticket'],'abort-refresh':['ticket'],list:['source','directory','offset','limit'],open:['document'],protect:['document','binding','version','draft','source','session','sourceDraft','editorVersion'],save:['document','binding','version'],source:['document','binding','version','block','expected','text'],check:['document','binding'],chunk:['document','binding','offset'],close:['document','binding'],disconnect:['source'],remove:['source']};
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
    this.opening=(async()=>{await this.documents?.dispose();await this.registry?.close();this.context={...owner};this.registry=new LinkedRegistry({...this.options,current:()=>this.options.current?.(this.context)??(this.options.current?null:this.context)});await this.registry.load(owner);this.documents=new LinkedDocuments(this.registry,{worker:this.options.worker,owner:this.options.owner});this.search=new LinkedSearch(this.registry);})().finally(()=>{this.opening=undefined;});await this.opening;
  }
  async dispatch(value){
    if(!value||Array.isArray(value)||Object.keys(value).some(key=>!['token','workspace','generation','operation','payload'].includes(key)))throw Error('INVALID_LINKED_REQUEST');
    const allowed=fields[value.operation],p=value.payload??{};
    if(!allowed||!p||Array.isArray(p)||typeof p!=='object'||Object.keys(p).some(key=>!allowed.includes(key)))throw Error('INVALID_LINKED_FIELDS');
    if(this.active>=8)throw Error('LINKED_BUSY');
    if(['protect','inspect','recovery','export'].includes(value.operation)&&this.documents&&this.options.privateOwner?.(value,this.context))this.registry.check(value);
    else await this.ensure(value);
    if(this.closing||this.active>=8)throw Error('LINKED_BUSY');this.active++;
    const mutation=['add','protect','source','save','close','disconnect','remove','close-documents','export','restore','metadata-repair','resolve','commit-refresh'].includes(value.operation);if(mutation)this.mutations++;
    try{
      if(!['state','metadata','close-documents','index','search'].includes(value.operation))await this.registry.ensureNative();
      switch(value.operation){
        case 'index':await this.search.tick(value);return {indexed:this.search.bodies.size};
        case 'search':return this.search.search(value,p);
        case 'close-documents':return await this.documents.closeDocuments(value,p);
        case 'export':return await exportLinked(this,value,p);
        case 'recovery':{const rows=await this.registry.native.call('recovery'),items=[];for(let at=0;at<rows.length;at+=4)items.push({operation:rows[at],state:rows[at+1],name:rows[at+2],version:Number(rows[at+3])});return items;}
        case 'inspect':{const r=await this.registry.native.call('inspect',p.operation);return {base:new Uint8Array(Buffer.from(r[0],'base64')),local:r[1]?new Uint8Array(Buffer.from(r[1],'base64')):null,visual:r[2],state:r[3]};}
        case 'review':{const root=this.registry.roots.get(p.source);if(!root)throw Error('LINKED_SOURCE_NOT_FOUND');const cap=await this.registry.grant(root),r=await this.registry.native.call('review',p.operation,cap);this.registry.check(value);return {ticket:r[0],state:r[1],base:new Uint8Array(Buffer.from(r[2],'base64')),local:r[3]?new Uint8Array(Buffer.from(r[3],'base64')):null,visual:r[4],disk:r[5]?{identity:r[5],revision:r[6],bytes:new Uint8Array(Buffer.from(r[8],'base64')),size:Number(r[9])}:null};}
        case 'restore':return {state:(await this.registry.native.call('restore',p.ticket))[0]};
        case 'metadata-repair':return {state:(await this.registry.native.call('metadata',p.ticket))[0]};
        case 'resolve':await this.registry.native.call('resolve',p.ticket);return {resolved:true};
        case 'state':return {supported:true,sources:this.registry.snapshot()};
        case 'add':return await this.registry.add(value);
        case 'metadata':{const e=this.registry.entries.get(p.document);return e&&!e.directory&&e.markdown?{id:e.id,type:'linked',title:e.name,tags:[],content:{type:'linkedDocument',version:1,sourceId:e.root,sourceName:this.registry.roots.get(e.root)?.name??'Unavailable source',relativePath:e.relative},createdAt:'',updatedAt:'',size:null}:null;}
        case 'list':return await this.registry.list(value,p);
        case 'open':return await this.documents.open(value,p.document);
        case 'protect':return await this.documents.protect(value,p);
        case 'save':return await this.documents.save(value,p);
        case 'source':return await this.documents.source(value,p);
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
  async close(){if(this.active)throw Error('LINKED_OPERATION_PENDING');this.closing=true;try{await this.opening;await this.documents?.dispose();await this.registry?.close();this.context=null;this.documents=undefined;this.registry=undefined;this.search=undefined;}finally{this.closing=false;}}
}
