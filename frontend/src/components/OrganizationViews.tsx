import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';
import { useEffect, useState } from 'react';
import { Plus, Search, ArrowLeft } from 'lucide-react';
import { useOrganizationPage, type OrganizationItem } from '../lib/organization';
import { usePins } from '../lib/organizationControls';
import ResourceTypeFilter from './ResourceTypeFilter';
import type { Resource } from '../types';
import { resourceDescription, collectionKind, resourcePresentation } from '../lib/resourceKinds';
import PinButton from './PinButton';
import { SidebarShortcut } from './SidebarItem';
import { CollectionPicker } from './ResourceCollections';
import { BrowseHeading, BrowseGroup, BrowsePagination, BrowseResourceRow } from './BrowseLayout';
import LibraryPopover from './LibraryPopover';

function CollectionRow({item,onOpen}:{item:OrganizationItem;onOpen:(item:OrganizationItem)=>void}) {
 const Icon=collectionKind.icon;
 return <div role="listitem" className="library-row"><button className="library-resource" title={item.name} onClick={()=>onOpen(item)}><Icon size={19}/><span><strong>{item.name}</strong><small>Collection · {item.count} {item.count===1?'resource':'resources'}</small></span></button><div className="browse-row-actions"><PinButton id={item.id} name={item.name} favorite={item.favorite} entity="collection"/></div></div>;
}
export function PinnedList({compact=false,visible=true,filterType='all',activeId,onResource,onCollection,onReturn,hasNotes=false}:{compact?:boolean;visible?:boolean;filterType?:string;activeId?:string;onResource:(id:string)=>void;onCollection:(item:OrganizationItem)=>void;onViewAll?:()=>void;onReturn?:()=>void;hasNotes?:boolean}) {
 const focus=useRestoreFocusOnClose();
 const [pickerIds,setPickerIds]=useState<string[]|null>(null);
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0),[kind,setKind]=useState('all');
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(query);setPage(0);},180);return()=>clearTimeout(timer);},[query]);
 const type=compact?filterType:kind;
 const result=usePins(search,compact?0:page,compact?12:100,visible,type);
 const count=result.data?.totalItems??0;
 const choose=(value:string)=>{setKind(value);setPage(0);};
 const rows=result.data?.items.map(item=>{
  const isCollection=item.entityKind==='collection';
  const collection={id:item.id,name:item.name,count:item.count,favorite:true};
  const resource:Resource=item.resource??{id:item.id,type:item.entityKind==='resource'?item.resourceType:'',title:item.name,favorite:true,tags:[],createdAt:'',updatedAt:''};
  const Icon=isCollection?collectionKind.icon:resourcePresentation(resource).icon;
  if(compact)return <SidebarShortcut resource={isCollection?undefined:resource} key={item.entityKind+'-'+item.id} title={item.name} description={isCollection?collectionKind.label:resourceDescription(resource)} icon={Icon} isActive={!isCollection&&activeId===item.id} onClick={()=>isCollection?onCollection(collection):onResource(item.id)}/>;
  return isCollection?<CollectionRow key={'collection-'+item.id} item={collection} onOpen={onCollection}/>:<BrowseResourceRow key={'resource-'+item.id} resource={resource} onOpen={onResource} onCollections={id=>{focus.captureFocus();setPickerIds([id]);}}/>;
 });
 return <div data-motion-surface={compact?undefined:"page"} data-motion-key={compact?undefined:"pinned"} data-motion-list={!query&&page===0} data-motion-ready={Boolean(result.data)&&!result.loading}>{!compact&&<><BrowseHeading title="Pinned" actions={<>{hasNotes&&<button className="library-button" onClick={onReturn}><ArrowLeft size={16}/>Return to notes</button>}<LibraryPopover label="More">{close=><button className="library-button" onClick={()=>{result.retry();close();}}>Refresh</button>}</LibraryPopover></>}/><div className="library-filters"><label className="library-search"><Search size={17}/><input aria-label="Search pinned shortcuts" placeholder="Search pinned titles…" value={query} onChange={e=>setQuery(e.target.value)}/></label><ResourceTypeFilter collections value={kind} onChange={choose} label="Filter pinned type"/></div><div className="library-summary">{count} pinned · Titles only</div></>}
 {compact?<>{result.loading&&<p className="browse-feedback">Loading…</p>}{result.error&&<p role="alert" className="browse-feedback">{result.error}<button onClick={result.retry}>Retry</button></p>}{rows}</>:<BrowseGroup label="Shortcuts" count={count} loading={result.loading} error={result.error} retry={result.retry}>{rows}</BrowseGroup>}
 {!result.loading&&!count&&!result.error&&<p className={compact?'browse-feedback':'browse-empty'}>{search||type!=='all'?'No pinned shortcuts match these filters.':'Pin resources or collections to keep them here.'}{!compact&&type!=='all'&&<button className="library-button" onClick={()=>choose('all')}>Clear type filter</button>}</p>}
 {!compact&&<BrowsePagination page={page} totalPages={result.data?.totalPages??0} loading={result.loading} onPage={setPage}/>}
 {pickerIds&&<CollectionPicker resourceIds={pickerIds} onClose={()=>{setPickerIds(null);focus.restoreFocus();}}/>}
 </div>;
}
export function CollectionsView({onOpen,visible=true,onReturn,hasNotes=false}:{visible?:boolean;onOpen:(item:OrganizationItem)=>void;onReturn?:()=>void;hasNotes?:boolean}) {
 const focus=useRestoreFocusOnClose();
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0),[creating,setCreating]=useState(false);
 const result=useOrganizationPage('collection',search,page,visible,false,100);
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(query);setPage(0);},180);return()=>clearTimeout(timer);},[query]);
 return <section data-motion-surface="page" data-motion-key="collections" data-motion-list={!query&&page===0} data-motion-ready={Boolean(result.data)&&!result.loading} className="library-view"><BrowseHeading title="Collections" actions={<><button className="library-button" onClick={()=>{focus.captureFocus();setCreating(true);}}><Plus size={16}/>New collection</button>{hasNotes&&<button className="library-button" onClick={onReturn}><ArrowLeft size={16}/>Return to notes</button>}<LibraryPopover label="More">{close=><button className="library-button" onClick={()=>{result.retry();close();}}>Refresh</button>}</LibraryPopover></>}/><label className="library-search"><Search size={17}/><input aria-label="Search collections" placeholder="Find a topic…" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="library-summary">{result.data?.totalItems??0} collections</div>
 <BrowseGroup label="Collections" count={result.data?.totalItems??0} loading={result.loading} error={result.error} retry={result.retry}>{result.data?.items.map(item=><CollectionRow key={item.id} item={item} onOpen={onOpen}/>)}</BrowseGroup>
 {!result.loading&&!result.error&&!result.data?.items.length&&<div className="browse-empty">{search?'No collections match this search.':<>Create a collection for a topic or project.<button className="library-button" onClick={()=>{focus.captureFocus();setCreating(true);}}><Plus size={16}/>New collection</button></>}</div>}
 <BrowsePagination page={page} totalPages={result.data?.totalPages??0} loading={result.loading} onPage={setPage}/>{creating&&<CollectionPicker resourceIds={[]} onClose={()=>{setCreating(false);focus.restoreFocus();}} onCreated={item=>{setCreating(false);onOpen(item);}}/>}</section>;
}
