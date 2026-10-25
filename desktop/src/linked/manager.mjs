import {LinkedRegistry} from './registry.mjs';
import {LinkedDocuments} from './documents.mjs';

const fields={state:[],add:[],list:['source','directory','offset','limit'],open:['document'],protect:['document','binding','version','draft','source','session','sourceDraft','editorVersion'],save:['document','binding','version'],source:['document','binding','version','block','expected','text'],check:['document','binding'],chunk:['document','binding','offset'],close:['document','binding'],disconnect:['source']};
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
    this.opening=(async()=>{await this.documents?.dispose();await this.registry?.close();this.context={...owner};this.registry=new LinkedRegistry({...this.options,current:()=>this.options.current?.(this.context)??(this.options.current?null:this.context)});await this.registry.load(owner);this.documents=new LinkedDocuments(this.registry,{worker:this.options.worker});})().finally(()=>{this.opening=undefined;});await this.opening;
  }
  async dispatch(value){
    if(!value||Array.isArray(value)||Object.keys(value).some(key=>!['token','workspace','generation','operation','payload'].includes(key)))throw Error('INVALID_LINKED_REQUEST');
    const allowed=fields[value.operation],p=value.payload??{};
    if(!allowed||!p||Array.isArray(p)||typeof p!=='object'||Object.keys(p).some(key=>!allowed.includes(key)))throw Error('INVALID_LINKED_FIELDS');
    if(this.active>=8)throw Error('LINKED_BUSY');await this.ensure(value);if(this.closing||this.active>=8)throw Error('LINKED_BUSY');this.active++;
    const mutation=['add','protect','source','save','close','disconnect'].includes(value.operation);if(mutation)this.mutations++;
    try{
      switch(value.operation){
        case 'state':return {supported:true,sources:this.registry.snapshot()};
        case 'add':return await this.registry.add(value);
        case 'list':return await this.registry.list(value,p);
        case 'open':return await this.documents.open(value,p.document);
        case 'protect':return await this.documents.protect(value,p);
        case 'save':return await this.documents.save(value,p);
        case 'source':return await this.documents.source(value,p);
        case 'check':return await this.documents.check(value,p);
        case 'chunk':return await this.documents.chunk(value,p);
        case 'close':return await this.documents.close(value,p);
        case 'disconnect':return await this.registry.disconnect(value,p.source);
        default:throw Error('INVALID_LINKED_OPERATION');
      }
    }finally{this.active--;if(mutation)this.mutations--;}
  }
  async close(){if(this.active)throw Error('LINKED_OPERATION_PENDING');this.closing=true;try{await this.opening;await this.documents?.dispose();await this.registry?.close();this.context=null;this.documents=undefined;this.registry=undefined;}finally{this.closing=false;}}
}
