import {useState,useRef,useEffect,useCallback} from 'react';
import type {Resource} from '../types';
import api from '../lib/api';
import {useRetainedQuery} from '../lib/useRetainedQuery';
import {resourceDescription,resourcePresentation} from '../lib/resourceKinds';
import {requestResourceAction} from '../lib/resourceActions';
import {useRestoreFocusOnClose} from '../lib/useRestoreFocusOnClose';
import AppModal from './modals/AppModal';
import {BrowsePagination} from './BrowseLayout';
import {localReferences,type LocalReference,type ReferenceEntry,type ReferencePage,type ReferenceOccurrence} from '../lib/resourceReferences';
async function fetchReferences(key:string,signal:AbortSignal){const [id,direction,page]=JSON.parse(key);return (await api.get<ReferencePage>('/resources/'+id+'/references',{params:{direction,page,size:30},signal,backgroundDiagnostic:true})).data;}
export default function ResourceReferences({resource,localNotes=[],linkedReferences,onClose}:{resource:Pick<Resource,'id'|'title'>&{type?:string};linkedReferences?:(id:string,direction:string,page:number,signal?:AbortSignal)=>Promise<ReferencePage>;localNotes?:LocalReference[];onClose:()=>void}) {
 const [direction,setDirection]=useState('incoming'),[page,setPage]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const focus=useRestoreFocusOnClose(),captured=useRef(false);if(!captured.current){focus.captureFocus();captured.current=true;}
 const fetch=useCallback(async(key:string,signal:AbortSignal)=>{
   const saved=await fetchReferences(key,signal);signal.throwIfAborted();if(!linkedReferences)return saved;
   const [id,direction,page]=JSON.parse(key),offset=Math.max(0,page*30-saved.totalItems),nativePage=Math.floor(offset/30),native=await linkedReferences(id,direction,nativePage,signal);
   const slots=30-saved.items.length,local=native.items.slice(offset%30,offset%30+slots);
   if(local.length<slots&&nativePage+1<native.totalPages){const next=await linkedReferences(id,direction,nativePage+1,signal);local.push(...next.items.slice(0,slots-local.length));}
   const totalItems=saved.totalItems+native.totalItems;
   return {...saved,items:[...saved.items,...local],totalItems,totalOccurrences:saved.totalOccurrences+native.totalOccurrences,totalPages:Math.ceil(totalItems/30),limited:native.limited,indexing:native.indexing};
 },[linkedReferences]);
 const result=useRetainedQuery(JSON.stringify([resource.id,direction,page]),true,'resources',fetch);
 const {loading:referenceLoading,refreshing:referenceRefreshing,retry:retryReferences}=result;
 useEffect(()=>{if(!linkedReferences||referenceLoading||referenceRefreshing||busy)return;const refresh=()=>{if(document.visibilityState!=='hidden')retryReferences();};const timer=setTimeout(refresh,5000);document.addEventListener('visibilitychange',refresh);return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',refresh);};},[linkedReferences,referenceLoading,referenceRefreshing,retryReferences,busy]);
 const local=direction==='incoming'?localReferences(localNotes,resource.id):localNotes.filter(n=>n.id===resource.id);
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{root.current?.querySelector<HTMLButtonElement>('button')?.focus();},[]);
 const opening=useRef(false);
 const close=()=>{if(opening.current)return;onClose();focus.restoreFocus();};
 async function open(entry:ReferenceEntry,occurrence?:ReferenceOccurrence){if(opening.current)return;opening.current=true;setBusy(true);setError('');try{
  const source=direction==='incoming'?entry:{id:resource.id,title:resource.title,type:resource.type??'note',revision:result.data?.sourceRevision};
  const target=occurrence?source:entry;
  const locate=!!occurrence&&source.type!=='linked';
  await requestResourceAction(locate?'reference-open':'open',[{...target,tags:[],createdAt:'',updatedAt:''}],locate?JSON.stringify({path:occurrence.path,targetId:direction==='incoming'?resource.id:entry.id,revision:source.revision}):undefined);onClose();
 }catch(e){setError(e instanceof Error?e.message:'Could not open. Retry.');}finally{opening.current=false;setBusy(false);}}
 return <AppModal open restoreFocusOnEscape={false} widthClassName="max-w-2xl" title={'Links and mentions · '+resource.title} onClose={close}><div ref={root} className="reference-view" onKeyDown={event=>{if(event.key!=='Tab')return;const dialog=root.current?.closest('[role="dialog"]'),controls=[...dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),summary,input')??[]].filter(element=>element.tagName==='SUMMARY'||!element.closest('details')||element.closest('details')?.open);const current=controls.indexOf(document.activeElement as HTMLElement);if(event.shiftKey&&current<=0){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&current===controls.length-1){event.preventDefault();controls[0]?.focus();}}}>
 <div role="group" aria-label="Link direction" className="flex gap-2">{['incoming','outgoing'].map(value=><button key={value} className="library-button" aria-pressed={direction===value} onClick={()=>{setDirection(value);setPage(0);}}>{value==='incoming'?'Linked from':'Links to'}</button>)}</div>
 <p className="browse-feedback">Saved content · {result.data?.totalItems??0} {direction==='incoming'?(result.data?.totalItems===1?'note':'notes'):(result.data?.totalItems===1?'destination':'destinations')} · {result.data?.totalOccurrences??0} {result.data?.totalOccurrences===1?'occurrence':'occurrences'}</p>
 {linkedReferences&&<p role="status" className="browse-feedback">Links from external folders reflect saved files on this computer. {result.data?.indexing?'Indexing continues in the background. ':''}{result.data?.limited?'Coverage is partial: some files exceed index limits or await verification.':''}</p>}
 {local.length>0&&<p role="status" className="browse-feedback">Local unsaved changes: {local.map(n=>n.title).join(', ')}. Saved counts may differ; other devices’ drafts are not visible.</p>}
 {(result.error||error)&&<p role="alert">{result.error||error}<button className="library-button" onClick={()=>{result.retry();setError('');}}>Retry</button></p>}
 {result.loading?<p role="status">Loading references…</p>:!result.data?.items.length?<p className="browse-empty">{direction==='incoming'?'No active saved notes refer to this resource.':'No saved outgoing links or image placements.'}</p>:result.data.items.map(entry=>{const Icon=resourcePresentation(entry).icon,total=entry.noteLinks+entry.fileLinks+entry.images+entry.otherLinks;return <section className="reference-row" key={entry.id}>
 <button className="library-resource" disabled={!entry.available||busy} onClick={()=>void open(entry)}><Icon size={18}/><span><strong>{entry.title}</strong><small>{entry.trashed?'In Trash':!entry.available?'Unavailable':resourceDescription({...entry,title:entry.title})} · {total} {total===1?'occurrence':'occurrences'}{localNotes.some(n=>n.id===entry.id)&&' · Local unsaved changes'}</small></span></button>
 <small>{[[entry.noteLinks,'note link'],[entry.fileLinks,'file link'],[entry.images,'image placement'],[entry.otherLinks,'other link']].filter(([count])=>Number(count)>0).map(([count,label])=>`${count} ${label}${count===1?'':'s'}`).join(' · ')}</small>
 <details><summary>Occurrences{total>20?' (first 20)':''}</summary>{entry.occurrences.map(occurrence=><button disabled={busy||(direction==='incoming'&&!entry.available)} key={occurrence.path} className="reference-occurrence" onClick={()=>void open(entry,occurrence)}>{occurrence.kind==='image'?'Image placement':'Link'} · {occurrence.label||'Unlabelled'} <span>Open in source note</span></button>)}</details>
 </section>;})}
 <BrowsePagination page={page} totalPages={result.data?.totalPages??0} loading={result.loading} onPage={setPage}/>
 </div></AppModal>;
}
