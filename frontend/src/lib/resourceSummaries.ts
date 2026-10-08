import {useEffect,useState} from 'react';
import api from './api';
import type {ResourceSummary} from '../types';
import {getConnection} from './platform';
import {subscribeResourceChanges} from './resourceEvents';
type Entry={promise:Promise<ResourceSummary>;controller:AbortController;users:number;done:boolean;time:number};
const cache=new Map<string,Entry>();
subscribeResourceChanges(change=>{if(change.kind==='workspace'||change.kind==='metadata'){for(const [key,item] of cache)if(change.kind==='workspace'||!change.ids||change.ids.some(id=>key.endsWith('|'+id))){item.controller.abort();cache.delete(key);}}});
/** Shared bounded metadata cache for inline links; never load note content to choose an icon. */
export function useResourceSummary(id:string) {
 const identity=JSON.stringify(getConnection()),key=identity+'|'+id;
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>subscribeResourceChanges(change=>{if(change.kind==='workspace'||(change.kind==='metadata'&&(!change.ids||change.ids.includes(id))))setRefresh(n=>n+1);}),[id]);
 const [state,setState]=useState<{key:string;value:ResourceSummary}|null>(null);
 useEffect(()=>{
  for(const [old,item] of cache)if(!old.startsWith(identity+'|')){item.controller.abort();cache.delete(old);}
  let entry=cache.get(key);
  if(entry?.done&&Date.now()-entry.time>30000){cache.delete(key);entry=undefined;}
  if(!entry){
   for(const [old,item] of cache){if(cache.size<200)break;if(!item.users){item.controller.abort();cache.delete(old);}}
   if(cache.size>=200)return;
   const controller=new AbortController();entry={controller,users:0,done:false,time:Date.now(),promise:api.get<ResourceSummary>('/resources/'+id+'/summary',{signal:controller.signal,backgroundDiagnostic:true}).then(r=>r.data)};const current=entry;
   void entry.promise.then(()=>{current.done=true;current.time=Date.now();}).catch(()=>{if(cache.get(key)===current)cache.delete(key);});cache.set(key,entry);
  }
  entry.users++;const current=entry;let active=true;
  void entry.promise.then(value=>{if(active&&!current.controller.signal.aborted&&JSON.stringify(getConnection())===identity)setState({key:key+'|'+refresh,value});}).catch(()=>{});
  return()=>{active=false;current.users--;if(!current.users&&!current.done){current.controller.abort();if(cache.get(key)===current)cache.delete(key);}};
 },[id,identity,key,refresh]);
 return state?.key===key+'|'+refresh?state.value:undefined;
}
