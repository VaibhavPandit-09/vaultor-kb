import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';
import { useEffect, useState } from 'react';
import { Folder, Plus, Search, ArrowLeft } from 'lucide-react';
import { useOrganizationPage, type OrganizationItem } from '../lib/organization';
import { useResourcePage } from '../lib/useResourcePage';
import { resourceKind } from '../lib/resourceKinds';
import PinButton from './PinButton';
import { CollectionPicker } from './ResourceCollections';
import { BrowseHeading, BrowseGroup, BrowsePagination, BrowseResourceRow } from './BrowseLayout';
import LibraryPopover from './LibraryPopover';

function CollectionRow({item,onOpen}:{item:OrganizationItem;onOpen:(item:OrganizationItem)=>void}) {
 return <div role="listitem" className="library-row"><button className="library-resource" title={item.name} onClick={()=>onOpen(item)}><Folder size={19}/><span><strong>{item.name}</strong><small>{item.count} {item.count===1?'resource':'resources'}</small></span></button><div className="browse-row-actions"><PinButton id={item.id} name={item.name} favorite={item.favorite} entity="collection"/></div></div>;
}
export function PinnedList({compact=false,visible=true,onResource,onCollection,onReturn,hasNotes=false}:{compact?:boolean;visible?:boolean;onResource:(id:string)=>void;onCollection:(item:OrganizationItem)=>void;onViewAll?:()=>void;onReturn?:()=>void;hasNotes?:boolean}) {
 const focus=useRestoreFocusOnClose();
 const [pickerIds,setPickerIds]=useState<string[]|null>(null);
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0),[kind,setKind]=useState('all');
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(query);setPage(0);},180);return()=>clearTimeout(timer);},[query]);
 const size=compact?4:kind==='all'?12:100;
 const collections=useOrganizationPage('collection',search,page,visible&&(kind==='all'||kind==='collection'),true,size);
 const notes=useResourcePage({q:search,page,size,type:'note',sort:'title',favorites:true},visible&&(kind==='all'||kind==='note'));
 const files=useResourcePage({q:search,page,size,type:'file',sort:'title',favorites:true},visible&&(kind==='all'||kind==='file'));
 const groups=[{kind:'collection',label:'Collections',result:collections},{kind:'note',label:'Notes',result:notes},{kind:'file',label:'Files',result:files}].filter(group=>kind==='all'||kind===group.kind);
 const count=groups.reduce((total,group)=>total+(group.result.data?.totalItems??0),0);
 const loading=groups.some(group=>group.result.loading);
 const choose=(value:string)=>{setKind(value);setPage(0);};
 return <>{!compact&&<><BrowseHeading title="Pinned" actions={<>{hasNotes&&<button className="library-button" onClick={onReturn}><ArrowLeft size={16}/>Return to notes</button>}<LibraryPopover label="More">{close=><button className="library-button" onClick={()=>{groups.forEach(group=>group.result.retry());close();}}>Refresh</button>}</LibraryPopover></>}/><label className="library-search"><Search size={17}/><input aria-label="Search pinned shortcuts" placeholder="Search pinned titles…" value={query} onChange={e=>setQuery(e.target.value)}/></label><nav className="browse-type-tabs" aria-label="Pinned types">{[{kind:'all',label:'All'},{kind:'collection',label:'Collections'},{kind:'note',label:'Notes'},{kind:'file',label:'Files'}].map(item=><button key={item.kind} aria-pressed={kind===item.kind} onClick={()=>choose(item.kind)}>{item.label}</button>)}</nav><div className="library-summary">{count} pinned · Titles only</div></>}
 {groups.map(group=>compact&&!group.result.loading&&!group.result.error&&!group.result.data?.items.length?null:compact?<section className="sidebar-resource-group" key={group.kind} aria-label={'Pinned '+group.label}><h3>{group.label}</h3>{group.result.loading&&<p className="browse-feedback">Loading…</p>}{group.result.error&&<p role="alert" className="browse-feedback">{group.result.error}<button onClick={group.result.retry}>Retry</button></p>}{group.kind==='collection'?collections.data?.items.map(item=><button key={item.id} className="sidebar-nav" title={item.name} onClick={()=>onCollection(item)}><Folder size={16}/><span>{item.name}</span></button>):(group.kind==='note'?notes:files).data?.items.map(item=>{const Icon=resourceKind(item.type).icon;return <button key={item.id} className="sidebar-nav" title={item.title} onClick={()=>onResource(item.id)}><Icon size={16}/><span>{item.title}</span></button>;})}</section>:<BrowseGroup key={group.kind} label={group.label} count={group.result.data?.totalItems??0} loading={group.result.loading} error={group.result.error} retry={group.result.retry} onViewAll={kind==='all'&&(group.result.data?.totalItems??0)>size?()=>choose(group.kind):undefined}>{group.kind==='collection'?collections.data?.items.map(item=><CollectionRow key={item.id} item={item} onOpen={onCollection}/>):(group.kind==='note'?notes:files).data?.items.map(item=><BrowseResourceRow key={item.id} resource={item} onOpen={onResource} onCollections={id=>{focus.captureFocus();setPickerIds([id]);}}/>)}</BrowseGroup>)}
 {!loading&&!count&&!groups.some(group=>group.result.error)&&<p className={compact?'browse-feedback':'browse-empty'}>{search?'No pinned items match this search.':'Pin notes, files or collections to keep them here.'}</p>}
 {!compact&&kind!=='all'&&<BrowsePagination page={page} totalPages={groups[0]?.result.data?.totalPages??0} loading={loading} onPage={setPage}/>}
 {pickerIds&&<CollectionPicker resourceIds={pickerIds} onClose={()=>{setPickerIds(null);focus.restoreFocus();}}/>}
 </>;
}
export function CollectionsView({onOpen,visible=true,onReturn,hasNotes=false}:{visible?:boolean;onOpen:(item:OrganizationItem)=>void;onReturn?:()=>void;hasNotes?:boolean}) {
 const focus=useRestoreFocusOnClose();
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0),[creating,setCreating]=useState(false);
 const result=useOrganizationPage('collection',search,page,visible,false,100);
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(query);setPage(0);},180);return()=>clearTimeout(timer);},[query]);
 return <section className="library-view"><BrowseHeading title="Collections" actions={<><button className="library-button" onClick={()=>{focus.captureFocus();setCreating(true);}}><Plus size={16}/>New collection</button>{hasNotes&&<button className="library-button" onClick={onReturn}><ArrowLeft size={16}/>Return to notes</button>}<LibraryPopover label="More">{close=><button className="library-button" onClick={()=>{result.retry();close();}}>Refresh</button>}</LibraryPopover></>}/><label className="library-search"><Search size={17}/><input aria-label="Search collections" placeholder="Find a topic…" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="library-summary">{result.data?.totalItems??0} collections</div>
 <BrowseGroup label="Collections" count={result.data?.totalItems??0} loading={result.loading} error={result.error} retry={result.retry}>{result.data?.items.map(item=><CollectionRow key={item.id} item={item} onOpen={onOpen}/>)}</BrowseGroup>
 {!result.loading&&!result.error&&!result.data?.items.length&&<div className="browse-empty">{search?'No collections match this search.':<>Create a collection for a topic or project.<button className="library-button" onClick={()=>{focus.captureFocus();setCreating(true);}}><Plus size={16}/>New collection</button></>}</div>}
 <BrowsePagination page={page} totalPages={result.data?.totalPages??0} loading={result.loading} onPage={setPage}/>{creating&&<CollectionPicker resourceIds={[]} onClose={()=>{setCreating(false);focus.restoreFocus();}} onCreated={item=>{setCreating(false);onOpen(item);}}/>}</section>;
}
