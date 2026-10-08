import api from './api';
import {getConnection} from './platform';
import {subscribeResourceChanges} from './resourceEvents';

type Cached={url:string;bytes:number;users:number;time:number};
const cache=new Map<string,Cached>();
const MAX_BYTES=8*1024*1024,MAX_ENTRIES=48;
let owner='';
let generation=0;
const versions=new Map<string,number>();
function clear(){generation++;versions.clear();for(const item of cache.values())URL.revokeObjectURL(item.url);cache.clear();}
subscribeResourceChanges(change=>{if(change.kind==='workspace'){clear();owner='';}else if(change.kind==='metadata') {if(change.ids)for(const id of change.ids)versions.set(id,(versions.get(id)??0)+1);else generation++;if(versions.size>256){versions.clear();generation++;}for(const [key,item] of cache)if(!change.ids||change.ids.some(id=>key.includes('|'+id+'|'))){URL.revokeObjectURL(item.url);cache.delete(key);}}});
/** Small static blobs only; no raw files, credentials or URLs in persisted settings. */
export async function thumbnail(id:string,revision:string|undefined,signal:AbortSignal) {
 const connection=getConnection(),identity=JSON.stringify(connection);if(owner!==identity){clear();owner=identity;}
 const requestGeneration=generation,version=versions.get(id);
 const key=identity+'|'+id+'|'+(revision??'');let item=cache.get(key);
 if(!item){
  const {data}=await api.get<Blob>('/resources/'+id+'/thumbnail',{responseType:'blob',signal,backgroundDiagnostic:true});
  if(requestGeneration!==generation||version!==versions.get(id)||signal.aborted||JSON.stringify(getConnection())!==identity||owner!==identity)throw new Error('Thumbnail request superseded');
  if(data.size>384*1024||data.type!=='image/png')throw new Error('Thumbnail exceeds its supported bounds');
  item=cache.get(key);
  if(!item){
   let total=[...cache.values()].reduce((n,c)=>n+c.bytes,0);
   for(const [old,cached] of [...cache].sort((a,b)=>a[1].time-b[1].time)){if(cache.size<MAX_ENTRIES&&total+data.size<=MAX_BYTES)break;if(!cached.users){URL.revokeObjectURL(cached.url);cache.delete(old);total-=cached.bytes;}}
   if(cache.size>=MAX_ENTRIES||total+data.size>MAX_BYTES)throw new Error('Thumbnail cache is full. Preview the original instead.');
   item={url:URL.createObjectURL(data),bytes:data.size,users:0,time:Date.now()};cache.set(key,item);
  }
 }
 item.users++;item.time=Date.now();const acquired=item;let released=false;
 return {url:item.url,release:()=>{if(!released){released=true;acquired.users--;acquired.time=Date.now();}}};
}
export const resetThumbnails=clear;
