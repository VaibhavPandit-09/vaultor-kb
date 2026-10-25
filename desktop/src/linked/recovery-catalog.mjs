import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {NativeChannel} from './native-channel.mjs';

/** Archived namespaces grant private evidence access only. No source registry
 * is loaded and no native root/document capability is exposed for this host. */
export class RecoveryCatalog{
  constructor(registry){this.registry=registry;this.scopes=new Map();}
  async list(){
    await this.registry.ensureNative();const rows=await this.registry.native.call('previous-stores'),result=[];
    for(let at=0;at<rows.length;at+=5){const directory=rows[at];let scope=[...this.scopes.values()].find(value=>value.directory===directory);if(!scope){scope={id:randomUUID(),directory,workspace:rows[at+1],generation:rows[at+2]};this.scopes.set(scope.id,scope);}result.push({id:scope.id,modified:Number(rows[at+4]),operations:Number(rows[at+3])});}
    return result;
  }
  async target(id){
    if(!id)return {native:this.registry.native,scope:this.registry.scope};
    const scope=this.scopes.get(id);if(!scope)throw Error('RECOVERY_SCOPE_UNKNOWN');
    const previous=this.opening;let unlock;this.opening=new Promise(resolve=>{unlock=resolve;});await previous;
    try{
      if(this.current?.id!==id){
        if(this.current?.leases)throw Error('RECOVERY_SCOPE_BUSY');await this.current?.native.close();this.current=undefined;
        const rows=await this.registry.native.call('previous-stores');if(!rows.includes(scope.directory))throw Error('RECOVERY_SCOPE_UNAVAILABLE');
        const native=new NativeChannel({...this.registry.options,workspace:scope.workspace,generation:scope.generation,privateRoot:join(this.registry.options.directory,scope.directory,'journal'),production:true});
        try{await native.ready;}catch(error){await native.close().catch(()=>{});throw error;}this.current={id,native,leases:0};
      }
      const current=this.current;current.leases++;let released=false;
      return {native:current.native,scope,release:()=>{if(!released){released=true;current.leases--;}}};
    }finally{unlock();}
  }
  async close(){await this.opening;if(this.current?.leases)throw Error('RECOVERY_SCOPE_BUSY');await this.current?.native.close();this.current=undefined;this.scopes.clear();}
}
