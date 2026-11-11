import {useEffect,useState} from 'react';
import {media} from './media';
export type ResourcePresentation={id:string;pinned:boolean;tags:{id:string;name:string;color:string}[];collections:{id:string;name:string}[]};
/** One bounded read per visible page/open-session change. Stale workspace responses never publish. */
export function useResourcePresentation(ids:string[],workspace:string|undefined,revision:number){
 const key=JSON.stringify(ids.slice(0,100));
 const [value,setValue]=useState<{workspace:string|undefined;items:Map<string,ResourcePresentation>}>({workspace:undefined,items:new Map()});
 useEffect(()=>{let active=true;const chosen=JSON.parse(key) as string[];
  if(!workspace||!chosen.length)return;
  void media<ResourcePresentation[]>({op:'presentation',ids:chosen}).then(rows=>{if(active)setValue({workspace,items:new Map(rows.map(row=>[row.id,row]))});}).catch(()=>{if(active)setValue({workspace,items:new Map()});});
  return()=>{active=false;};
 },[key,workspace,revision]);
 return value.workspace===workspace?value.items:new Map<string,ResourcePresentation>();
}
