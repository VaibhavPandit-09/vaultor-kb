import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { FilePlus2, Upload, Check, Plus } from 'lucide-react';
import AppModal from './modals/AppModal';
import { browseResources, resourcesChanged } from '../lib/resourceBrowse';
import { useRetainedQuery } from '../lib/useRetainedQuery';
import { resourceKind } from '../lib/resourceKinds';
import api from '../lib/api';
import { organizationChanged, type OrganizationItem } from '../lib/organization';
import { organizationError } from '../lib/organizationControls';
import type { Resource } from '../types';

async function matches(key:string,signal:AbortSignal) {
 const {q,page}=JSON.parse(key);const result=await browseResources({q,page,size:30,sort:'title'},signal);
 // Check all matching note pages, not just the visible mixed page. Never load bodies.
 let exact=false;
 if(q){for(let p=0;;p++){const notes=await browseResources({q,page:p,size:200,type:'note',sort:'title'},signal);exact=notes.items.some(n=>n.title.trim().toLowerCase()===q.toLowerCase());if(exact||p+1>=notes.totalPages)break;}}
 return {...result,exact};
}
export default function AddExistingResources({collection,onClose,onOpen,onImport}:{collection:OrganizationItem;onClose:(restoreFocus?:boolean)=>void;onOpen:(id:string)=>void|Promise<void>;onImport:()=>void}) {
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0),[highlight,setHighlight]=useState('');
 const [states,setStates]=useState<Record<string,'pending'|'added'>>({}),[errors,setErrors]=useState<Record<string,string>>({}),[creating,setCreating]=useState(false);
 const running=useRef(new Set<string>()),creation=useRef({title:'',id:''});
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(query.trim());setPage(0);setHighlight('');},180);return()=>clearTimeout(timer);},[query]);
 const result=useRetainedQuery(JSON.stringify({q:search,page}),true,'resources',matches);
 const items=query.trim()===search?result.data?.items??[]:[];
 const selected=items.find(i=>i.id===highlight)??items[0];
 async function add(item:Resource){if(running.current.has('create')||running.current.has(item.id)||states[item.id]==='added'||item.collections?.some(c=>c.id===collection.id))return;
 running.current.add(item.id);setStates(v=>({...v,[item.id]:'pending'}));setErrors(v=>({...v,[item.id]:''}));
 try{await api.post('/organization/memberships',{resourceIds:[item.id],kind:'collection',targetId:collection.id,action:'add'},{backgroundDiagnostic:true});setStates(v=>({...v,[item.id]:'added'}));organizationChanged('collection',[item.id]);}
 catch(e){setStates(v=>{const next={...v};delete next[item.id];return next;});setErrors(v=>({...v,[item.id]:organizationError(e)}));}finally{running.current.delete(item.id);}}
 async function create(){const title=query.trim()||'Untitled Note';if(running.current.size)return;running.current.add('create');setCreating(true);setErrors(v=>({...v,create:''}));
 if(creation.current.title!==title)creation.current={title,id:crypto.randomUUID()};
 try{const body=new FormData();body.append('title',title);body.append('content',JSON.stringify({type:'doc',content:[]}));body.append('collectionId',collection.id);
 const {data}=await api.put<Resource>('/resources/imports/'+creation.current.id,body,{backgroundDiagnostic:true});resourcesChanged([data.id],true);await onOpen(data.id);onClose(false);}
 catch(e){setErrors(v=>({...v,create:organizationError(e)}));}finally{running.current.delete('create');setCreating(false);}}
 const ready=query.trim()===search&&!result.loading&&!result.error&&Boolean(result.data);
 return createPortal(<AppModal open title={'Add resource to '+collection.name} description="Find a note or file, or create a note here." onClose={()=>{if(!running.current.size)onClose();}}><div className="space-y-3">
 <input autoFocus role="combobox" aria-expanded="true" aria-controls="collection-add-results" aria-activedescendant={selected?'add-option-'+selected.id:undefined} aria-label="Find resource by title" className="organization-input w-full" placeholder="Search resource titles…" maxLength={500} readOnly={creating} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.nativeEvent.isComposing||e.keyCode===229)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const i=items.findIndex(r=>r.id===selected?.id);setHighlight(items[Math.max(0,Math.min(items.length-1,i+(e.key==='ArrowDown'?1:-1)))]?.id??'');}else if(e.key==='Enter'){e.preventDefault();if(selected)void add(selected);else if(ready&&query.trim()&&!result.data?.exact)void create();}}}/>
 <div role="listbox" id="collection-add-results" aria-label="Resources to add" className="max-h-64 overflow-auto space-y-1">{items.map(item=>{const Icon=resourceKind(item.type).icon,added=states[item.id]==='added'||item.collections?.some(c=>c.id===collection.id),pending=states[item.id]==='pending';return <div key={item.id}><button role="option" aria-selected={selected?.id===item.id} aria-disabled={added||pending||creating} id={'add-option-'+item.id} className="collection-add-option" onMouseEnter={()=>setHighlight(item.id)} onClick={()=>void add(item)}><Icon size={17}/><span className="truncate flex-1 text-left">{item.title}</span><small>{pending?'Adding…':added?'Added':item.type}</small>{added?<Check size={15}/>:<Plus size={15}/>}</button>{errors[item.id]&&<p role="alert" className="text-sm text-red-500">{errors[item.id]} <button className="library-button" onClick={()=>void add(item)}>Retry</button></p>}</div>;})}</div>
 {(result.loading||query.trim()!==search)&&<p role="status">Searching…</p>}{result.error&&<p role="alert">{result.error} <button className="library-button" onClick={result.retry}>Retry search</button></p>}
 {ready&&!items.length&&<p className="text-sm text-[var(--text-secondary)]">No matching resources.</p>}
 {ready&&query.trim()&&!result.data?.exact&&<button className="library-button w-full" disabled={creating||Object.values(states).includes('pending')} onClick={()=>void create()}><FilePlus2 size={16}/>{creating?'Creating…':'Create note “'+query.trim()+'”'}</button>}
 {errors.create&&<p role="alert" className="text-sm text-red-500">{errors.create} <button className="library-button" disabled={creating} onClick={()=>void create()}>Retry create/open</button></p>}
 {(result.data?.totalPages??0)>1&&<div className="flex justify-between"><button className="library-button" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><button className="library-button" disabled={page+1>=(result.data?.totalPages??0)} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
 <div className="flex flex-wrap gap-2 border-t border-border pt-3"><button className="library-button" disabled={creating||Object.values(states).includes('pending')} onClick={()=>{flushSync(()=>onClose(false));onImport();}}><Upload size={16}/>Import files</button><details><summary className="library-button cursor-pointer">More</summary><button className="library-button mt-2" disabled={creating||Object.values(states).includes('pending')} onClick={()=>void create()}><FilePlus2 size={16}/>Create new note{query.trim()?' with this title':''}</button></details></div>
 </div></AppModal>,document.body);
}
