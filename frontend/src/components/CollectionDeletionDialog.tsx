import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import AppModal from './modals/AppModal';
import api from '../lib/api';
import {getConnection} from '../lib/platform';
import {type OrganizationItem} from '../lib/organization';
import {organizationError} from '../lib/organizationControls';
import {notifyResourceChange} from '../lib/resourceEvents';
import {resourcesChanged} from '../lib/resourceBrowse';
import {requestResourceAction} from '../lib/resourceActions';
import type {Resource} from '../types';
export type DeletionPlan={fingerprint:string;collections:{id:string;parentId:string|null;name:string}[];managedResources:number;sharedResources:number;linkedReferences:number;referringNotes:number;exclusiveResources:Pick<Resource,'id'|'title'|'type'>[]};
export type DeletionResult={deletedCollectionIds:string[];parentId:string|null;trashedResourceIds:string[]};
type Submission={id:string;input:{fingerprint:string;mode:string;revisions:Record<string,string>}};
export default function CollectionDeletionDialog({collection:initialCollection,onClose,onDeleted}:{collection:OrganizationItem;onClose:()=>void;onDeleted:()=>void}) {
 const [collection]=useState(initialCollection);
 const committed=useRef(false);
 const [plan,setPlan]=useState<DeletionPlan>(),[mode,setMode]=useState('keep'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[draftFailed,setDraftFailed]=useState(false),[retry,setRetry]=useState(0),[submitted,setSubmitted]=useState(false),[canReview,setCanReview]=useState(true);
 const running=useRef(false),submission=useRef<Submission|undefined>(undefined),epoch=useRef(getConnection().epoch);
 useEffect(()=>{const abort=new AbortController();void api.get<DeletionPlan>('/collections/'+collection.id+'/deletion-plan',{signal:abort.signal,backgroundDiagnostic:true}).then(({data})=>{setPlan(data);setError('');}).catch(e=>{if(!abort.signal.aborted)setError(organizationError(e));});return()=>abort.abort();},[collection.id,retry]);
 async function perform(retain=false){
  if(running.current||!plan)return;running.current=true;setBusy(true);setError('');setDraftFailed(false);setCanReview(false);
  try {
   if(epoch.current!==getConnection().epoch)throw new Error('Connection changed. Reopen deletion in the intended workspace.');
   if(!submission.current){
    const revisions:Record<string,string>={};
    if(mode==='trash-exclusive')for(const target of plan.exclusiveResources){
     try{await requestResourceAction(retain?'retain-draft':'prepare-trash',[target as Resource]);}catch(e){setDraftFailed(true);throw e;}
     const {data}=await api.get<Resource>('/resources/'+target.id+'/summary',{backgroundDiagnostic:true});
     if(!data.revision)throw new Error('Resource revision unavailable. Reopen deletion.');revisions[target.id]=data.revision;
    }
    if(epoch.current!==getConnection().epoch)throw new Error('Connection changed. Reopen deletion in the intended workspace.');
    submission.current={id:crypto.randomUUID(),input:{fingerprint:plan.fingerprint,mode,revisions}};setSubmitted(true);
   }
   const request=submission.current;
   const {data}=await api.put<DeletionResult>('/collections/'+collection.id+'/deletions/'+request.id,request.input,{backgroundDiagnostic:true});
   if(epoch.current!==getConnection().epoch)throw new Error('Connection changed. Check the previous workspace when reconnecting.');
   committed.current=true;
   const removed=data.trashedResourceIds.map(id=>plan.exclusiveResources.find(r=>r.id===id)).filter((r):r is Pick<Resource,'id'|'title'|'type'>=>Boolean(r));
   if(removed.length)await requestResourceAction('removed',removed as Resource[]);
   // Reconcile navigation after fallback sessions settle, then close in the same React batch.
   notifyResourceChange({kind:'organization',entity:'collection',deletedCollectionIds:data.deletedCollectionIds,survivingParentId:data.parentId});
   resourcesChanged(data.trashedResourceIds,true);
   onDeleted();
  }catch(e){const status=(e as {response?:{status?:number}}).response?.status;setCanReview(!committed.current&&(!submission.current||Boolean(status&&[400,404,409,412,422,428].includes(status))));const detail=(e as {response?:{data?:{detail?:string}}}).response?.data?.detail;setError((committed.current?'Hierarchy deleted. Local view reconciliation failed; retry to finish. ':'')+(detail??(e instanceof Error?e.message:organizationError(e))));}
  finally{running.current=false;setBusy(false);}
 }
 return createPortal(<AppModal open title={'Delete “'+collection.name+'”?'} onClose={()=>{if(!running.current)onClose();}} description="Deleted collections are not restored through resource Trash." footer={<>
  <button className="library-button text-red-500" disabled={busy||!plan} onClick={()=>void perform()}>{busy?'Working…':submitted?'Retry deletion':'Delete hierarchy'}</button>
  {draftFailed&&<button className="library-button" disabled={busy} onClick={()=>void perform(true)}>Keep recoverable drafts and trash saved versions</button>}
  <button className="library-button" disabled={busy} onClick={onClose}>Cancel</button>
 </>}>
  {plan?<div className="space-y-3 text-sm">
   <p>{plan.collections.length} collections, including this root · {plan.managedResources} unique managed resources · {plan.sharedResources} shared outside this hierarchy.</p>
   <label className="flex gap-2"><input autoFocus type="radio" name="collection-deletion-mode" checked={mode==='keep'} disabled={busy||submitted} onChange={()=>setMode('keep')}/><span><strong>Delete collections only</strong><br/>All {plan.managedResources} managed resources remain available in Library or their existing Trash state.</span></label>
   <label className="flex gap-2"><input type="radio" name="collection-deletion-mode" checked={mode==='trash-exclusive'} disabled={busy||submitted} onChange={()=>setMode('trash-exclusive')}/><span><strong>Delete collections and move exclusive resources to Trash</strong><br/>{plan.exclusiveResources.length} active exclusive resources move to Trash. {plan.sharedResources} shared resources stay available.</span></label>
   {plan.linkedReferences>0&&<p>{plan.linkedReferences} linked-document references lose memberships only. External files, linked sources and private recovery evidence remain untouched.</p>}
   {mode==='trash-exclusive'&&plan.referringNotes>0&&<p>{plan.referringNotes} saved notes outside this hierarchy link to the Trash targets. Those links become unavailable until Restore.</p>}
  </div>:<p role="status">Checking hierarchy…</p>}
  {error&&<p role="alert">{error}{submitted?' Retry uses the same operation identity.':''}{canReview&&<button className="library-button" disabled={busy} onClick={()=>{submission.current=undefined;setSubmitted(false);setPlan(undefined);setMode('keep');setRetry(n=>n+1);}}>Review current hierarchy</button>}</p>}
 </AppModal>,document.body);
}
