import {randomUUID} from 'node:crypto';
export const RESOURCE_CLIPBOARD='web application/x-vaultor-resources';
const id=value=>typeof value==='string'&&/^[\w-]{1,100}$/.test(value);
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
/** OS clipboard contains an opaque receipt and safe labels, never API credentials, paths or source grants. */
export class ResourceClipboard {
 constructor({owner,request,clipboard,now=Date.now}){Object.assign(this,{owner,request,clipboard,now});}
 async scope(token){const current=this.owner();if(!current||token!==current.token)throw Error('Workspace changed. Copy the selection again.');const identity=await this.request(token,'/workspace/identity');if(this.owner()!==current)throw Error('Workspace changed. Copy the selection again.');if(!identity||typeof identity.id!=='string'||!identity.id||identity.id.length>100||typeof identity.generation!=='string'||!identity.generation||identity.generation.length>100)throw Error('Invalid workspace identity');return {token,profile:current.profile.id,id:identity.id,generation:identity.generation};}
 async check(scope){const current=await this.scope(scope.token);if(current.profile!==scope.profile||current.id!==scope.id||current.generation!==scope.generation)throw Error('Clipboard belongs to another workspace or an older source generation.');}
 async resources(token,ids){const out=[];for(let at=0;at<ids.length;at+=4){out.push(...await Promise.all(ids.slice(at,at+4).map(id=>this.request(token,'/resources/'+id+'/summary'))));}if(out.some((resource,index)=>!resource||resource.id!==ids[index]||typeof resource.title!=='string'||resource.title.length>500||resource.trashedAt||!['note','file','linked'].includes(resource.type)))throw Error('A clipboard resource is unavailable. Copy the selection again.');return out.map(({id,title,type})=>({id,title,type,tags:[],createdAt:'',updatedAt:''}));}
 async copy({token,ids,mode='copy',collection,generation}){
  if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(value=>!id(value))||new Set(ids).size!==ids.length||!['copy','cut','links'].includes(mode)||mode==='cut'&&!id(collection))throw Error('Choose 1–100 resources; cut requires a source collection.');
  if(this.copying)throw Error('Wait for the current resource copy.');this.copying=true;try{
  const scope=await this.scope(token);if(generation!==scope.generation)throw Error('Workspace changed. Reselect and copy the resources again.');const resources=await this.resources(token,ids);await this.check(scope);
  const receipt=randomUUID();this.value={scope,resources,mode,collection:mode==='cut'?collection:undefined,receipt,expires:this.now()+600000};
  await this.clipboard.write({receipt:JSON.stringify({v:1,receipt}),text:resources.map(resource=>resource.title).join('\n'),html:'<div data-vaultor-clipboard="'+receipt+'">'+resources.map(resource=>'<span>'+escape(resource.title)+'</span>').join(' ')+'</div>'});
  await this.check(scope);return resources.length;}finally{this.copying=false;}
 }
 async read({token}){
  const bytes=await this.clipboard.read();if(!bytes?.length)return null;if(bytes.length>256)throw Error('Invalid resource clipboard.');let payload;try{payload=JSON.parse(bytes.toString());}catch{throw Error('Invalid resource clipboard.');}
  const value=this.value;if(!value||payload.v!==1||payload.receipt!==value.receipt||this.now()>value.expires)throw Error('Resource clipboard expired. Copy the selection again.');
  if(token!==value.scope.token)throw Error('Clipboard belongs to another source.');await this.check(value.scope);const resources=await this.resources(token,value.resources.map(resource=>resource.id));await this.check(value.scope);return {resources,generation:value.scope.generation,mode:value.mode,collection:value.collection,receipt:value.receipt};
 }
 consume({token,receipt}){if(this.value?.scope.token===token&&this.value.receipt===receipt&&this.value.mode==='cut')this.value=undefined;}
 reset(){this.value=undefined;}
}
