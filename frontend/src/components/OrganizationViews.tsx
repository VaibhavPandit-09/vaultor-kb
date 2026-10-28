import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import LibraryOrientation from './LibraryOrientation';
import { useBrowsePagination } from '../lib/useBrowsePagination';
import { Plus, Search, ArrowLeft, ChevronRight } from 'lucide-react';
import { collectionPath, useOrganizationPage, type OrganizationItem } from '../lib/organization';
import { usePins } from '../lib/organizationControls';
import ResourceTypeFilter from './ResourceTypeFilter';
import type { Resource } from '../types';
import { resourceDescription, collectionKind, resourcePresentation } from '../lib/resourceKinds';
import PinButton from './PinButton';
import { SidebarShortcut } from './SidebarItem';
import { CollectionPicker } from './ResourceCollections';
import { BrowseHeading, BrowseGroup, BrowsePagination, BrowseResourceRow } from './BrowseLayout';
import CollectionManagement from './CollectionManagement';
import LibraryPopover from './LibraryPopover';

/** Native button focus remains available; arrows navigate the currently loaded rows. */
function collectionKeys(event:KeyboardEvent<HTMLElement>) {
 const target=(event.target as HTMLElement).closest<HTMLElement>('[data-collection-open]');
 if(!target)return;
 const row=target.closest<HTMLElement>('[data-collection-row]')!;
 const rows=[...event.currentTarget.querySelectorAll<HTMLElement>('[data-collection-open]')];
 const index=rows.indexOf(target);let next:HTMLElement|undefined;
 if(event.key==='ArrowDown')next=rows[Math.min(rows.length-1,index+1)];
 else if(event.key==='ArrowUp')next=rows[Math.max(0,index-1)];
 else if(event.key==='Home')next=rows[0];
 else if(event.key==='End')next=rows.at(-1);
 else if(event.key==='ArrowRight'){
   const toggle=row.querySelector<HTMLButtonElement>(':scope > .library-row [data-collection-toggle]');
   if(toggle?.getAttribute('aria-expanded')==='false')toggle.click();
   else next=row.querySelector<HTMLElement>(':scope > .collection-branch [data-collection-open]')??undefined;
 }else if(event.key==='ArrowLeft'){
   const toggle=row.querySelector<HTMLButtonElement>(':scope > .library-row [data-collection-toggle]');
   if(toggle?.getAttribute('aria-expanded')==='true')toggle.click();
   else next=row.parentElement?.closest('[data-collection-row]')?.querySelector<HTMLElement>('[data-collection-open]')??undefined;
 }else return;
 event.preventDefault();event.stopPropagation();next?.focus();
}
export function CollectionRow({item,onOpen,depth=0,hierarchy=false}:{item:OrganizationItem;onOpen:(item:OrganizationItem)=>void;depth?:number;hierarchy?:boolean}) {
 const [expanded,setExpanded]=useState(false),[managing,setManaging]=useState(false),[creating,setCreating]=useState(false);
 const focus=useRestoreFocusOnClose();const Icon=collectionKind.icon;
 const parent=item.ancestors?.map(a=>a.name).join(' / ');
 return <div role="listitem" data-collection-row={item.id}><div className="library-row">
   {hierarchy&&(item.childCount?<button type="button" className="library-button" data-collection-toggle aria-label={`${expanded?'Collapse':'Expand'} ${item.name}`} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}><ChevronRight size={15} style={{transform:expanded?'rotate(90deg)':undefined}}/></button>:<span className="collection-tree-spacer"/>)}
   <button type="button" className="library-resource" data-collection-open aria-label={'Open '+collectionPath(item)} title={collectionPath(item)} onClick={()=>onOpen(item)}><Icon size={19}/><span><strong>{item.name}</strong><small>{parent?parent+' · ':''}{item.count} direct {item.count===1?'resource':'resources'}{item.childCount?` · ${item.childCount} ${item.childCount===1?'collection':'collections'}`:''}</small></span></button>
   <div className="browse-row-actions"><PinButton id={item.id} name={item.name} favorite={item.favorite} entity="collection"/><LibraryPopover label={'Manage '+collectionPath(item)} trigger="⋯">{close=><><button className="library-button" onClick={()=>{close();focus.captureFocus();setCreating(true);}}>New subcollection</button><button className="library-button" onClick={()=>{close();focus.captureFocus();setManaging(true);}}>Rename / move / delete…</button></>}</LibraryPopover></div>
 </div>{hierarchy&&expanded&&<div className="collection-branch" style={{paddingLeft:depth<4?16:0}}><CollectionChildren parent={item.id} onOpen={onOpen} depth={depth+1}/></div>}
 {managing&&<CollectionManagement collection={item} onChanged={()=>{}} onClose={()=>{setManaging(false);focus.restoreFocus();}}/>}
 {creating&&<CollectionPicker resourceIds={[]} parentId={item.id} onClose={()=>{setCreating(false);focus.restoreFocus();}} onCreated={created=>{setCreating(false);onOpen(created);}}/>}
 </div>;
}
export function CollectionChildren({parent,onOpen,depth=0,count}:{parent:string;onOpen:(item:OrganizationItem)=>void;depth?:number;count?:number}) {
 const [page,setPage]=useState(0);const result=useOrganizationPage('collection','',page,true,false,30,parent);
 const rows=<div className="collection-directory" role="list" aria-label="Child collections" onKeyDown={collectionKeys}>{result.data?.items.map(item=><CollectionRow key={item.id} item={item} onOpen={onOpen} depth={depth} hierarchy/>)}</div>;
 return <section className={count===undefined?'collection-branch-page':'browse-group collection-children-group'} aria-label={count===undefined?undefined:'Child collections'}>
 {count!==undefined&&<header className="browse-group-heading"><h2>Child collections <span>{count}</span></h2></header>}
 {result.loading&&!result.data&&<p role="status" className="browse-feedback">Loading child collections…</p>}
 {result.error&&<p role="alert">{result.error}<button onClick={result.retry}>Retry</button></p>}{rows}<BrowsePagination page={page} totalPages={result.data?.totalPages??0} loading={result.loading} onPage={setPage}/></section>;
}
export function PinnedList({compact=false,visible=true,filterType='all',activeId,onResource,onCollection,onReturn,hasNotes=false}:{compact?:boolean;visible?:boolean;filterType?:string;activeId?:string;onResource:(id:string)=>void;onCollection:(item:OrganizationItem)=>void;onViewAll?:()=>void;onReturn?:()=>void;hasNotes?:boolean}) {
 const focus=useRestoreFocusOnClose();
 const viewport=useRef<HTMLDivElement>(null);
 const [pickerIds,setPickerIds]=useState<string[]|null>(null);
 const [wasVisible,setWasVisible]=useState(visible);
 if(wasVisible!==visible){setWasVisible(visible);if(!visible&&!compact)setPickerIds(null);}
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0),[kind,setKind]=useState('all');
 useEffect(()=>{if(query===search)return;const timer=setTimeout(()=>{setSearch(query);setPage(0);},180);return()=>clearTimeout(timer);},[query,search]);
 const type=compact?filterType:kind;
 const result=usePins(search,compact?0:page,compact?12:100,visible,type);
 const count=result.data?.totalItems??0;
 const totalPages=useBrowsePagination(viewport,JSON.stringify([search,type]),page,result.data?.totalPages,!compact,visible);
 const choose=(value:string)=>{setKind(value);setPage(0);};
 const rows=result.data?.items.map(item=>{
  const isCollection=item.entityKind==='collection';
  const collection=item.collection??{id:item.id,name:item.name,count:item.count,favorite:true};
  const resource:Resource=item.resource??{id:item.id,type:item.entityKind==='resource'?item.resourceType:'',title:item.name,favorite:true,tags:[],createdAt:'',updatedAt:''};
  const Icon=isCollection?collectionKind.icon:resourcePresentation(resource).icon;
  if(compact)return <SidebarShortcut resource={isCollection?undefined:resource} key={item.entityKind+'-'+item.id} title={isCollection?collectionPath(collection):item.name} description={isCollection?collectionKind.label:resourceDescription(resource)} icon={Icon} isActive={!isCollection&&activeId===item.id} onClick={()=>isCollection?onCollection(collection):onResource(item.id)}/>;
  return isCollection?<CollectionRow key={'collection-'+item.id} item={collection} onOpen={onCollection}/>:<BrowseResourceRow key={'resource-'+item.id} resource={resource} onOpen={onResource} onCollections={id=>{focus.captureFocus();setPickerIds([id]);}}/>;
 });
 return <div ref={viewport} hidden={!compact&&!visible} aria-label={compact?undefined:"Pinned"} className={compact?undefined:"library-view library-transform pinned-transform"} data-motion-surface={compact?undefined:"page"} data-motion-key={compact?undefined:"pinned"} data-motion-list={!query&&page===0} data-motion-ready={Boolean(result.data)&&!result.loading}>{!compact&&<LibraryOrientation enabled active={visible} viewport={viewport} context={null}><BrowseHeading title="Pinned" actions={<>{hasNotes&&<button className="library-button" title="Return to notes" aria-label="Return to notes" onClick={onReturn}><ArrowLeft size={16}/>Return to notes</button>}<LibraryPopover label="More">{close=><button className="library-button" onClick={()=>{result.retry();close();}}>Refresh</button>}</LibraryPopover></>}/><div className="library-filters"><label className="library-search"><Search size={17}/><input aria-label="Search pinned shortcuts" placeholder="Search pinned titles…" value={query} onChange={e=>setQuery(e.target.value)}/></label><ResourceTypeFilter collections value={kind} onChange={choose} label="Filter pinned type"/></div><div className="library-summary"><span>{count} pinned · Titles only</span><BrowsePagination compact page={page} totalPages={totalPages} loading={result.loading} onPage={setPage}/></div></LibraryOrientation>}
 {compact?<>{result.loading&&<p className="browse-feedback">Loading…</p>}{result.error&&<p role="alert" className="browse-feedback">{result.error}<button onClick={result.retry}>Retry</button></p>}{rows}</>:<BrowseGroup label="Shortcuts" count={count} loading={result.loading} error={result.error} retry={result.retry}>{rows}</BrowseGroup>}
 {!result.loading&&!count&&!result.error&&<p className={compact?'browse-feedback':'browse-empty'}>{search||type!=='all'?'No pinned shortcuts match these filters.':'Pin resources or collections to keep them here.'}{!compact&&type!=='all'&&<button className="library-button" onClick={()=>choose('all')}>Clear type filter</button>}</p>}
 {pickerIds&&<CollectionPicker resourceIds={pickerIds} onClose={()=>{setPickerIds(null);focus.restoreFocus();}}/>}
 </div>;
}
export function CollectionsView({onOpen,visible=true,onReturn,hasNotes=false,mode,onModeChange}:{visible?:boolean;onOpen:(item:OrganizationItem)=>void;onReturn?:()=>void;hasNotes?:boolean;mode?:'all'|'hierarchy';onModeChange?:(value:'all'|'hierarchy')=>void}) {
 const focus=useRestoreFocusOnClose();
 const viewport=useRef<HTMLElement>(null);
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0),[creating,setCreating]=useState(false);
 const [wasVisible,setWasVisible]=useState(visible);
 if(wasVisible!==visible){setWasVisible(visible);if(!visible)setCreating(false);}
 const [localMode,setLocalMode]=useState<'all'|'hierarchy'>('all');const presentation=mode??localMode;
 const result=useOrganizationPage('collection',search,page,visible,false,100,presentation==='hierarchy'&&!search?'':null);
 const totalPages=useBrowsePagination(viewport,JSON.stringify([search,presentation]),page,result.data?.totalPages,true,visible);
 useEffect(()=>{if(query===search)return;const timer=setTimeout(()=>{setSearch(query);setPage(0);},180);return()=>clearTimeout(timer);},[query,search]);
 return <section ref={viewport} hidden={!visible} aria-label="Collections" data-motion-surface="page" data-motion-key="collections" data-motion-list={!query&&page===0} data-motion-ready={Boolean(result.data)&&!result.loading} className="library-view library-transform collections-transform"><LibraryOrientation enabled active={visible} viewport={viewport} context={null}><BrowseHeading title="Collections" actions={<><button className="library-button" title="New collection" aria-label="New collection" onClick={()=>{focus.captureFocus();setCreating(true);}}><Plus size={16}/>New collection</button>{hasNotes&&<button className="library-button" title="Return to notes" aria-label="Return to notes" onClick={onReturn}><ArrowLeft size={16}/>Return to notes</button>}<LibraryPopover label="More">{close=><button className="library-button" onClick={()=>{result.retry();close();}}>Refresh</button>}</LibraryPopover></>}/><div className="library-filters"><label className="library-search"><Search size={17}/><input aria-label="Search collections" placeholder="Find a collection…" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="collection-directory-switch" role="group" aria-label="Collection presentation">{(['all','hierarchy'] as const).map(value=><button type="button" key={value} className="library-button" aria-pressed={presentation===value} onClick={()=>{setLocalMode(value);onModeChange?.(value);setPage(0);}}>{value==='all'?'All':'Hierarchy'}</button>)}</div></div><div className="library-summary"><span>{result.data?.totalItems??0} {presentation==='hierarchy'&&!search?'root ':''}{result.data?.totalItems===1?'collection':'collections'}{search&&presentation==='hierarchy'?' · Matches across all paths':''}</span><BrowsePagination compact page={page} totalPages={totalPages} loading={result.loading} onPage={setPage}/></div></LibraryOrientation>
 <BrowseGroup label="Collections" count={result.data?.totalItems??0} loading={result.loading} error={result.error} retry={result.retry}><div className="collection-directory" role="list" aria-label="Collection directory" onKeyDown={collectionKeys}>{result.data?.items.map(item=><CollectionRow key={item.id} item={item} onOpen={onOpen} hierarchy={presentation==='hierarchy'&&!search}/>)}</div></BrowseGroup>
 {!result.loading&&!result.error&&!result.data?.items.length&&<div className="browse-empty">{search?'No collections match this search.':<>Create a collection for a topic or project.<button className="library-button" onClick={()=>{focus.captureFocus();setCreating(true);}}><Plus size={16}/>New collection</button></>}</div>}
 {creating&&<CollectionPicker resourceIds={[]} onClose={()=>{setCreating(false);focus.restoreFocus();}} onCreated={item=>{setCreating(false);onOpen(item);}}/>}</section>;
}
