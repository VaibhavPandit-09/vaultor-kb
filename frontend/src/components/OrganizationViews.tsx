import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';
import { useEffect, useRef, useState } from 'react';
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
import LibraryPopover from './LibraryPopover';

export function CollectionRow({item,onOpen,depth=0}:{item:OrganizationItem;onOpen:(item:OrganizationItem)=>void;depth?:number}) {
 const [expanded,setExpanded]=useState(false);
 const Icon=collectionKind.icon;
 return <div role="listitem"><div className="library-row"><button className="library-button" aria-label={`${expanded?'Collapse':'Expand'} ${item.name}`} aria-expanded={expanded} disabled={!item.childCount} onClick={()=>setExpanded(!expanded)}><ChevronRight size={15} style={{transform:expanded?'rotate(90deg)':undefined}}/></button><button className="library-resource" title={collectionPath(item)} onClick={()=>onOpen(item)}><Icon size={19}/><span><strong>{item.name}</strong><small>{item.ancestors?.length?collectionPath(item)+' · ':''}{item.count} direct resources{item.childCount?` · ${item.childCount} collections`:''}</small></span></button><div className="browse-row-actions"><PinButton id={item.id} name={item.name} favorite={item.favorite} entity="collection"/></div></div>{expanded&&<div style={{paddingLeft:depth<4?16:0}}><CollectionChildren parent={item.id} onOpen={onOpen} depth={depth+1}/></div>}</div>;
}
export function CollectionChildren({parent,onOpen,depth=0}:{parent:string;onOpen:(item:OrganizationItem)=>void;depth?:number}) {
 const [page,setPage]=useState(0);const result=useOrganizationPage('collection','',page,true,false,30,parent);
 return <>{result.error&&<p role="alert">{result.error}<button onClick={result.retry}>Retry</button></p>}{result.data?.items.map(item=><CollectionRow key={item.id} item={item} onOpen={onOpen} depth={depth}/>)}<BrowsePagination page={page} totalPages={result.data?.totalPages??0} loading={result.loading} onPage={setPage}/></>;
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
 return <div ref={viewport} hidden={!compact&&!visible} aria-label={compact?undefined:"Pinned"} className={compact?undefined:"library-view library-transform pinned-transform"} data-motion-surface={compact?undefined:"page"} data-motion-key={compact?undefined:"pinned"} data-motion-list={!query&&page===0} data-motion-ready={Boolean(result.data)&&!result.loading}>{!compact&&<LibraryOrientation enabled active={visible} viewport={viewport} context={null}><BrowseHeading title="Pinned" actions={<>{hasNotes&&<button className="library-button" onClick={onReturn}><ArrowLeft size={16}/>Return to notes</button>}<LibraryPopover label="More">{close=><button className="library-button" onClick={()=>{result.retry();close();}}>Refresh</button>}</LibraryPopover></>}/><div className="library-filters"><label className="library-search"><Search size={17}/><input aria-label="Search pinned shortcuts" placeholder="Search pinned titles…" value={query} onChange={e=>setQuery(e.target.value)}/></label><ResourceTypeFilter collections value={kind} onChange={choose} label="Filter pinned type"/></div><div className="library-summary"><span>{count} pinned · Titles only</span><BrowsePagination compact page={page} totalPages={totalPages} loading={result.loading} onPage={setPage}/></div></LibraryOrientation>}
 {compact?<>{result.loading&&<p className="browse-feedback">Loading…</p>}{result.error&&<p role="alert" className="browse-feedback">{result.error}<button onClick={result.retry}>Retry</button></p>}{rows}</>:<BrowseGroup label="Shortcuts" count={count} loading={result.loading} error={result.error} retry={result.retry}>{rows}</BrowseGroup>}
 {!result.loading&&!count&&!result.error&&<p className={compact?'browse-feedback':'browse-empty'}>{search||type!=='all'?'No pinned shortcuts match these filters.':'Pin resources or collections to keep them here.'}{!compact&&type!=='all'&&<button className="library-button" onClick={()=>choose('all')}>Clear type filter</button>}</p>}
 {pickerIds&&<CollectionPicker resourceIds={pickerIds} onClose={()=>{setPickerIds(null);focus.restoreFocus();}}/>}
 </div>;
}
export function CollectionsView({onOpen,visible=true,onReturn,hasNotes=false}:{visible?:boolean;onOpen:(item:OrganizationItem)=>void;onReturn?:()=>void;hasNotes?:boolean}) {
 const focus=useRestoreFocusOnClose();
 const viewport=useRef<HTMLElement>(null);
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0),[creating,setCreating]=useState(false);
 const [wasVisible,setWasVisible]=useState(visible);
 if(wasVisible!==visible){setWasVisible(visible);if(!visible)setCreating(false);}
 const result=useOrganizationPage('collection',search,page,visible,false,100,search?null:'');
 const totalPages=useBrowsePagination(viewport,search,page,result.data?.totalPages,true,visible);
 useEffect(()=>{if(query===search)return;const timer=setTimeout(()=>{setSearch(query);setPage(0);},180);return()=>clearTimeout(timer);},[query,search]);
 return <section ref={viewport} hidden={!visible} aria-label="Collections" data-motion-surface="page" data-motion-key="collections" data-motion-list={!query&&page===0} data-motion-ready={Boolean(result.data)&&!result.loading} className="library-view library-transform collections-transform"><LibraryOrientation enabled active={visible} viewport={viewport} context={null}><BrowseHeading title="Collections" actions={<><button className="library-button" onClick={()=>{focus.captureFocus();setCreating(true);}}><Plus size={16}/>New collection</button>{hasNotes&&<button className="library-button" onClick={onReturn}><ArrowLeft size={16}/>Return to notes</button>}<LibraryPopover label="More">{close=><button className="library-button" onClick={()=>{result.retry();close();}}>Refresh</button>}</LibraryPopover></>}/><div className="library-filters"><label className="library-search"><Search size={17}/><input aria-label="Search collections" placeholder="Find a topic…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div><div className="library-summary"><span>{result.data?.totalItems??0} collections</span><BrowsePagination compact page={page} totalPages={totalPages} loading={result.loading} onPage={setPage}/></div></LibraryOrientation>
 <BrowseGroup label="Collections" count={result.data?.totalItems??0} loading={result.loading} error={result.error} retry={result.retry}>{result.data?.items.map(item=><CollectionRow key={item.id} item={item} onOpen={onOpen}/>)}</BrowseGroup>
 {!result.loading&&!result.error&&!result.data?.items.length&&<div className="browse-empty">{search?'No collections match this search.':<>Create a collection for a topic or project.<button className="library-button" onClick={()=>{focus.captureFocus();setCreating(true);}}><Plus size={16}/>New collection</button></>}</div>}
 {creating&&<CollectionPicker resourceIds={[]} onClose={()=>{setCreating(false);focus.restoreFocus();}} onCreated={item=>{setCreating(false);onOpen(item);}}/>}</section>;
}
