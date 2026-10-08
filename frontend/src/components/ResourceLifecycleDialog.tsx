import { useEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import type { Resource } from '../types';
import api from '../lib/api';
import { getConnection } from '../lib/platform';
import { resourcesChanged } from '../lib/resourceBrowse';
import { requestResourceAction } from '../lib/resourceActions';
import AppModal from './modals/AppModal';
export type LifecycleItem={operationId:string;resourceId:string;action:'trash'|'restore'|'purge';revision:string};
export type LifecycleResult={resourceId:string;status:string;detail:string;warnings:string[]};
export default function ResourceLifecycleDialog({resources,action,onClose,onCompleted,onBusy}:{resources:Resource[];action:LifecycleItem['action'];onClose:()=>void;onCompleted?:(ids:string[])=>void;onBusy?:(busy:boolean)=>void}) {
 const [remaining,setRemaining]=useState(resources),[errors,setErrors]=useState<Record<string,string>>({}),[draftFailures,setDraftFailures]=useState<string[]>([]),[usage,setUsage]=useState<Record<string,number>>({}),[usageError,setUsageError]=useState(''),[usageRetry,setUsageRetry]=useState(0),[busy,setBusy]=useState(false),[warnings,setWarnings]=useState<string[]>([]);
 const running=useRef(false),requests=useRef(new Map<string,LifecycleItem>()),epoch=useRef(getConnection().epoch);
 useEffect(()=>{const controller=new AbortController();setUsageError('');void Promise.all(resources.map(async r=>{const {data}=await api.get<{sources:number}>('/resources/'+r.id+'/usage',{signal:controller.signal,backgroundDiagnostic:true});return [r.id,data.sources] as const;})).then(rows=>setUsage(Object.fromEntries(rows))).catch(()=>{if(!controller.signal.aborted)setUsageError('Usage could not be checked. Retry before continuing.');});return()=>controller.abort();},[resources,usageRetry]);
 const noun=action==='trash'?'Move to Trash':action==='restore'?'Restore':'Delete permanently';
 async function perform(keepDraft=false) {
  if(running.current||usageError||remaining.some(r=>usage[r.id]===undefined))return;running.current=true;setBusy(true);onBusy?.(true);setDraftFailures([]);
  const failures:Record<string,string>={},completed:string[]=[],retained:string[]=[];
  try {
   for(const resource of remaining) {
    try {
     if(epoch.current!==getConnection().epoch)throw new Error('Connection changed. Reopen this action in the intended workspace.');
     if(action==='trash')try {await requestResourceAction(keepDraft?'retain-draft':'prepare-trash',[resource]);}catch(e){retained.push(resource.id);throw e;}
     let item=requests.current.get(resource.id);
     if(!item) {
      if(resource.cleanupPending)item=(await api.get<LifecycleItem>('/resources/'+resource.id+'/lifecycle-pending',{backgroundDiagnostic:true})).data;
      else {const fresh=action==='trash'?(await api.get<Resource>('/resources/'+resource.id+'/summary',{backgroundDiagnostic:true})).data:resource;if(!fresh.revision)throw new Error('Reload this resource before continuing.');item={operationId:crypto.randomUUID(),resourceId:resource.id,action,revision:fresh.revision};}
      requests.current.set(resource.id,item);
     }
     const {data}=await api.put<LifecycleResult[]>('/resources/lifecycle',[item],{backgroundDiagnostic:true});const result=data[0];
     if(!result||!['trashed','restored','purged'].includes(result.status))throw new Error(result?.detail||'Operation did not finish. Retry uses the same identity.');
     if(epoch.current!==getConnection().epoch)throw new Error('Connection changed. Check the previous workspace when reconnecting.');
     setWarnings(previous=>[...previous,...result.warnings]);completed.push(resource.id);
     await requestResourceAction(action==='restore'?'restored':'removed',[resource]);
    }catch(e){failures[resource.id]=(e as {response?:{data?:{detail?:string}}})?.response?.data?.detail??(e instanceof Error?e.message:'Action failed. Retry.');}
   }
   resourcesChanged(completed,true);onCompleted?.(completed);setErrors(failures);setDraftFailures(retained);setRemaining(items=>items.filter(r=>!completed.includes(r.id)));
   if(completed.length===remaining.length&&action!=='restore')onClose();
  }finally{running.current=false;setBusy(false);onBusy?.(false);}
 }
 return createPortal(<AppModal open title={noun} onClose={()=>{if(!running.current)onClose();}} description={action==='trash'?'Originals, tags, memberships and pins are retained. Links become unavailable until restored.':action==='purge'?'This cannot be undone. Referring notes and image placements keep their labels and become broken references.':'Restore the same resource IDs and surviving organization. Deleted tags and collections are not recreated.'}>
 <div className="space-y-3">{remaining.map(r=><div key={r.id} className="border-b border-border pb-2"><strong>{r.title}</strong><p className="text-xs text-[var(--text-secondary)]">{usage[r.id]===undefined?'Checking saved usage…':`Used in ${usage[r.id]} saved notes`}</p><button className="browse-text-action" onClick={()=>void requestResourceAction('references',[r])}>View usage</button>{errors[r.id]&&<p role="alert" className="text-sm text-red-500">{errors[r.id]}</p>}</div>)}{usageError&&<p role="alert">{usageError}<button className="library-button" onClick={()=>setUsageRetry(v=>v+1)}>Retry usage</button></p>}{warnings.map((w,i)=><p role="status" key={i}>{w}</p>)}
 {remaining.length?<><button autoFocus className="library-button" disabled={busy||Boolean(usageError)||remaining.some(r=>usage[r.id]===undefined)} onClick={()=>void perform()}>{busy?'Working…':Object.keys(errors).length?'Retry '+noun.toLowerCase():noun+(remaining.length>1?` ${remaining.length} resources`:'')}</button>{draftFailures.length>0&&<button className="library-button" disabled={busy} onClick={()=>void perform(true)}>Keep recoverable drafts and trash saved versions</button>}</>:<p role="status">Restored. {warnings.length===0?'Organization retained.':''}<button className="library-button" onClick={onClose}>Done</button></p>}
 <button className="library-button" disabled={busy} onClick={onClose}>Cancel</button></div>
 </AppModal>,document.body);
}
