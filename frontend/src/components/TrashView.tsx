import { useState } from 'react';
import { Search,ArrowLeft } from 'lucide-react';
import api from '../lib/api';
import type { Resource } from '../types';
import type { ResourcePage } from '../lib/resourceBrowse';
import { useRetainedQuery } from '../lib/useRetainedQuery';
import { resourceDescription, resourcePresentation } from '../lib/resourceKinds';
import { BrowseHeading,BrowseGroup,BrowsePagination } from './BrowseLayout';
import LibraryPopover from './LibraryPopover';
import ResourceLifecycleDialog from './ResourceLifecycleDialog';
async function fetchTrash(key:string,signal:AbortSignal) {const [q,page]=JSON.parse(key);return (await api.get<ResourcePage>('/resources/trash',{params:{q,page,size:100},signal,backgroundDiagnostic:true})).data;}
export default function TrashView({onReturn,hasNotes,onBusy}:{onReturn:()=>void;hasNotes:boolean;onBusy?:(busy:boolean)=>void}) {
 const [query,setQuery]=useState(''),[page,setPage]=useState(0),[selected,setSelected]=useState<string[]>([]),[dialog,setDialog]=useState<{resources:Resource[];action:'restore'|'purge'}|null>(null);
 const result=useRetainedQuery(JSON.stringify([query,page]),true,'resources',fetchTrash),items=result.data?.items??[];
 function completed(ids:string[]) {setSelected(previous=>previous.filter(id=>!ids.includes(id)));result.retry();}
 return <section className="library-view" aria-label="Trash"><BrowseHeading title="Trash" actions={hasNotes?<button className="library-button" onClick={onReturn}><ArrowLeft size={16}/>Return to notes</button>:undefined}/><p className="text-sm text-[var(--text-secondary)]">Nothing is deleted automatically. Restore originals here or permanently delete them.</p><label className="library-search"><Search size={17}/><input aria-label="Search Trash" placeholder="Search trashed titles…" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);setSelected([]);}}/></label>
 {items.length>0&&<label className="flex gap-2"><input type="checkbox" checked={items.every(r=>selected.includes(r.id))} onChange={e=>setSelected(e.target.checked?items.map(r=>r.id):[])}/>Select visible resources</label>}
 {selected.length>0&&<div className="flex flex-wrap gap-2"><span>{selected.length} selected</span><button className="library-button" onClick={()=>setDialog({resources:items.filter(r=>selected.includes(r.id)&&!r.cleanupPending),action:'restore'})} disabled={!items.some(r=>selected.includes(r.id)&&!r.cleanupPending)}>Restore</button><button className="library-button text-red-500" onClick={()=>setDialog({resources:items.filter(r=>selected.includes(r.id)),action:'purge'})}>Delete permanently…</button></div>}
 <BrowseGroup label="Trashed resources" count={result.data?.totalItems??0} loading={result.loading} error={result.error} retry={result.retry}>{items.map(r=>{const Icon=resourcePresentation(r).icon;return <div role="listitem" className="library-row" key={r.id}><input aria-label={'Select '+r.title} type="checkbox" checked={selected.includes(r.id)} onChange={e=>setSelected(previous=>e.target.checked?[...previous,r.id]:previous.filter(id=>id!==r.id))}/><div className="library-resource"><Icon size={19}/><span><strong>{r.title}</strong><small>{resourceDescription(r)} · {r.cleanupPending?'Permanent-deletion cleanup pending':'Trashed '+r.trashedAt?.slice(0,10)}</small></span></div><LibraryPopover label={'Actions for '+r.title}>{close=><>{!r.cleanupPending&&<button className="library-button" onClick={()=>{close();setDialog({resources:[r],action:'restore'});}}>Restore</button>}<button className="library-button text-red-500" onClick={()=>{close();setDialog({resources:[r],action:'purge'});}}>{r.cleanupPending?'Retry permanent deletion…':'Delete permanently…'}</button></>}</LibraryPopover></div>;})}</BrowseGroup>
 {!result.loading&&!result.error&&!items.length&&<div className="browse-empty">{query?'No trashed resources match this title.':'Trash is empty.'}</div>}<BrowsePagination page={page} totalPages={result.data?.totalPages??0} loading={result.loading} onPage={value=>{setPage(value);setSelected([]);}}/>
 {dialog&&<ResourceLifecycleDialog {...dialog} onBusy={onBusy} onCompleted={completed} onClose={()=>setDialog(null)}/>}</section>;
}
