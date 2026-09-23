import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';
import { useEffect, useState } from 'react';
import { Folder, FileText, Paperclip } from 'lucide-react';
import { usePins } from '../lib/organizationControls';
import { useOrganizationPage, type OrganizationItem } from '../lib/organization';
import api from '../lib/api';
import PinButton from './PinButton';
import { CollectionPicker } from './ResourceCollections';
export function PinnedList({compact=false,visible=true,onResource,onCollection,onViewAll}:{compact?:boolean;visible?:boolean;onResource:(id:string)=>void;onCollection:(item:OrganizationItem)=>void;onViewAll?:()=>void}) {
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0),[error,setError]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(query);setPage(0);},180);return()=>clearTimeout(timer);},[query]);
 const result=usePins(search,page,compact?12:50,visible);
 async function open(id:string){try{setError('');const {data}=await api.get<OrganizationItem>('/collections/'+id,{backgroundDiagnostic:true});onCollection(data);}catch{setError('Could not open collection. Try its shortcut again.');}}
 return <>{compact?<p className="sidebar-section-label">Pinned <button onClick={onViewAll}>View all</button></p>:<><header className="library-heading"><div><p>YOUR WORKSPACE</p><h1>Pinned shortcuts</h1></div></header><input className="organization-input" aria-label="Search pinned shortcuts" placeholder="Search pinned shortcuts…" value={query} onChange={e=>setQuery(e.target.value)}/></>}
 {result.loading&&<p className="px-4 text-xs opacity-60">Loading pins…</p>}{!result.loading&&!result.data?.items.length&&<p className="p-4 text-sm text-[var(--text-tertiary)]">Pin notes, files, or collections to keep them here.</p>}
 {result.data?.items.map(item=>{const Icon=item.kind==='collection'?Folder:item.kind==='note'?FileText:Paperclip;return <div key={item.kind+item.id} className="flex items-center"><button className={compact?'sidebar-nav min-w-0':'library-resource py-3 min-w-0'} title={item.name} onClick={()=>item.kind==='collection'?void open(item.id):onResource(item.id)}><Icon size={16}/><span className="truncate">{item.name}</span>{!compact&&<small>{item.kind==='collection'?`${item.count} resources`:item.kind}</small>}</button>{!compact&&<PinButton id={item.id} name={item.name} favorite entity={item.kind==='collection'?'collection':'resource'}/>}</div>;})}
 {(result.error||error)&&<p role="alert" className="text-sm px-3">{error||result.error}<button onClick={result.retry}>Retry</button></p>}
 {!compact&&<footer className="library-pagination"><span>{result.data?.totalItems??0} pinned</span><button className="library-button" disabled={page===0} onClick={()=>setPage(page-1)}>Previous</button><button className="library-button" disabled={!result.data||page+1>=result.data.totalPages} onClick={()=>setPage(page+1)}>Next</button></footer>}</>;
}
export function CollectionsView({onOpen,visible=true}:{visible?:boolean;onOpen:(item:OrganizationItem)=>void}) {
 const focus=useRestoreFocusOnClose();
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0),[creating,setCreating]=useState(false);const result=useOrganizationPage('collection',search,page,visible);
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(query);setPage(0);},180);return()=>clearTimeout(timer);},[query]);
 return <section className="library-view"><header className="library-heading"><div><p>YOUR WORKSPACE</p><h1>Collections</h1></div><button className="library-button" onClick={()=>{focus.captureFocus();setCreating(true);}}>New collection</button></header><input className="organization-input" aria-label="Search collections" placeholder="Find a topic…" value={query} onChange={e=>setQuery(e.target.value)}/>
 <div className="library-list">{result.loading&&<p>Loading collections…</p>}{result.data?.items.map(item=><div key={item.id} className="flex items-center border-b border-border py-3"><button className="library-resource" onClick={()=>onOpen(item)}><Folder size={18}/><span><strong>{item.name}</strong><small>{item.count} resources</small></span></button><PinButton id={item.id} name={item.name} favorite={item.favorite} entity="collection"/></div>)}{!result.loading&&!result.data?.items.length&&<p className="library-message">Create a collection for a topic or project. Resources can belong to several collections.</p>}{result.error&&<p role="alert">{result.error}<button onClick={result.retry}>Retry</button></p>}</div>
 <footer className="library-pagination"><span>{result.data?.totalItems??0} collections</span><button className="library-button" disabled={page===0} onClick={()=>setPage(page-1)}>Previous</button><button className="library-button" disabled={!result.data||page+1>=result.data.totalPages} onClick={()=>setPage(page+1)}>Next</button></footer>{creating&&<CollectionPicker resourceIds={[]} onClose={()=>{setCreating(false);focus.restoreFocus();}} onCreated={item=>{setCreating(false);onOpen(item);}}/>}</section>;
}
