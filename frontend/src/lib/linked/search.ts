import {useEffect,useState} from 'react';
import type {Resource} from '../../types';
export type LinkedSearchResult={items:Resource[];indexing:boolean;limited:boolean;indexed:number};
export type LinkedSearchProvider=(query:string,mode:'title'|'content')=>Promise<LinkedSearchResult>;
const empty:LinkedSearchResult={items:[],indexing:false,limited:false,indexed:0};
export function useLinkedSearch(provider:LinkedSearchProvider|undefined,query:string,mode:'title'|'content',enabled:boolean){
  const [value,setValue]=useState<{query:string;mode:string;data:LinkedSearchResult;error:string}>();
  useEffect(()=>{
    if(!enabled||!provider||!query.trim())return;let active=true,running=false;
    const load=async()=>{if(running)return;running=true;try{const data=await provider(query,mode);if(active)setValue({query,mode,data,error:''});}catch{if(active)setValue({query,mode,data:empty,error:'Linked search is unavailable. Your files are unchanged.'});}finally{running=false;}};
    void load();const timer=setInterval(()=>void load(),2000);return()=>{active=false;clearInterval(timer);};
  },[provider,query,mode,enabled]);
  return enabled&&value?.query===query&&value.mode===mode?value:{data:empty,error:''};
}
