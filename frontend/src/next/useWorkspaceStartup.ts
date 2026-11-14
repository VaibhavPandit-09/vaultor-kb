import {useEffect} from 'react';
import {useStableEvent} from './useStableEvent';

/** Restoration owns a workspace visit, not the renders caused by restoring it. */
export function useWorkspaceStartup(path:string|undefined,ready:boolean,restore:(path:string,isCurrent:()=>boolean)=>Promise<void>,failed:(error:unknown)=>void){
 const restoreLatest=useStableEvent(restore),failLatest=useStableEvent(failed);
 useEffect(()=>{
  if(!path||!ready)return;
  let current=true;
  void restoreLatest(path,()=>current).catch(error=>{if(current)failLatest(error);});
  return()=>{current=false;};
 },[path,ready,restoreLatest,failLatest]);
}
