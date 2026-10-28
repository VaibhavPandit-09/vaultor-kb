import {useLinkedSearch,type LinkedSearchProvider} from '../lib/linked/search';
import CollectionBreadcrumb from './CollectionBreadcrumb';
import { CollectionChildren } from './OrganizationViews';
import { defaultLibrary, type LibraryContext } from '../lib/sessionStore';
import SearchCoverage from './SearchCoverage';
import LibraryOrientation from './LibraryOrientation';
import { useBrowsePagination } from '../lib/useBrowsePagination';
import ResourceSearchOptions from './ResourceSearchOptions';
import type {SearchMode} from '../lib/resourceSearch';
import LibraryPopover from './LibraryPopover';
import { BrowseHeading, BrowseGroup, BrowsePagination, BrowseResourceRow } from './BrowseLayout';
import type { Resource } from '../types';
import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';
import CollectionManagement from './CollectionManagement';
import PinButton from './PinButton';
import { CollectionPicker } from './ResourceCollections';
import AddExistingResources from './AddExistingResources';
import api from '../lib/api';
import ExportSelectionDialog from './ExportSelectionDialog';
import { useRetainedQuery } from '../lib/useRetainedQuery';
import OrganizationManager from './OrganizationManager';
import type { OrganizationItem } from '../lib/organization';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search, RefreshCw, Route, Plus } from 'lucide-react';
import ResourceTypeFilter from './ResourceTypeFilter';
import { requestResourceAction } from '../lib/resourceActions';
import { filterLabel } from '../lib/resourceKinds';
import { useResourcePage } from '../lib/useResourcePage';

export type LibrarySection = 'library' | 'recent' | 'favorites' | 'collections' | 'trash';
async function collectionDetails(id:string,signal:AbortSignal) {return (await api.get<OrganizationItem>('/collections/'+id,{signal,backgroundDiagnostic:true})).data;}

export default function LibraryView({ searchLinked,section, visible, tags, onOpen, onReturn, hasNotes, collection = null, onCollection = () => {}, onTagsChange = () => {}, onImport, onOpenCreated, onSelectionChange, hasUnsavedChanges=false, initialContext=defaultLibrary, onContextChange }: { searchLinked?:LinkedSearchProvider;initialContext?: LibraryContext; onContextChange?: (value: LibraryContext) => void; onSelectionChange?:(items:Resource[])=>void; hasUnsavedChanges?:boolean; onImport?:()=>void; onOpenCreated?:(id:string)=>Promise<void>; collection?: OrganizationItem | null; onCollection?: (item: OrganizationItem | null) => void; onTagsChange?: (tags: string[]) => void; section: LibrarySection; visible: boolean; tags: string[]; onOpen: (id: string) => void | Promise<void>; onReturn: () => void; hasNotes: boolean }) {
  const organizationFocus=useRestoreFocusOnClose();
  const viewport = useRef<HTMLElement>(null);
  const transformLibrary = section === 'library' || section === 'recent';
  const [managingCollection,setManagingCollection]=useState(false),[creatingChild,setCreatingChild]=useState(false);
  const [pickerIds,setPickerIds]=useState<string[]|null>(null),[adding,setAdding]=useState(false);
  const detail=useRetainedQuery(collection?.id??'',visible&&Boolean(collection),'collections',collectionDetails);
  const currentCollection=detail.data??collection;
  const [manager, setManager] = useState<'manage' | 'bulk' | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [exporting,setExporting]=useState(false);
  const [searchMode,setSearchMode]=useState<SearchMode>(initialContext.searchMode);
  const [query, setQuery] = useState(initialContext.query), [search, setSearch] = useState(initialContext.query);
  const [type, setType] = useState(initialContext.type), [sort, setSort] = useState<'title' | 'updated' | 'recent'>(initialContext.sort);
  const [page, setPage] = useState(0);
  useEffect(() => { onContextChange?.({query,searchMode,type,sort}); }, [query,searchMode,type,sort,onContextChange]);
  const tagKey = JSON.stringify(tags);
  useEffect(() => { if (query === search) return; const timer = setTimeout(() => { setSearch(query); setPage(0); }, 200); return () => clearTimeout(timer); }, [query,search]);
  const scopeKey=JSON.stringify([section,tagKey,collection?.id]);
  const [previousScope,setPreviousScope]=useState(scopeKey);
  if(previousScope!==scopeKey){setPreviousScope(scopeKey);setPage(0);}
  const criteria = { collection: collection?.id, q: search, searchMode, sort: section === 'recent' ? 'recent' as const : sort, tags, favorites: section === 'favorites' };
  const result = useResourcePage({ ...criteria, type, page, size: 100 }, visible);
  const totalPages = useBrowsePagination(viewport, JSON.stringify({...criteria,type}), page, result.data?.totalPages, transformLibrary, visible);
  const items = useMemo(() => result.data?.items ?? [], [result.data]);
  const linked=useLinkedSearch(searchLinked,search,searchMode,visible&&section==='library'&&!collection&&!tags.length&&(type==='all'||type==='linked')&&page===0);
  const linkedItems=linked.data.items.filter(item=>!items.some(existing=>existing.id===item.id));
  const totalItems = result.data?.totalItems ?? 0, loading = result.loading;
  const retry = result.retry;
  const viewKey=JSON.stringify([page,search,searchMode,type,sort,scopeKey]);
  const [previousView,setPreviousView]=useState(viewKey);
  if(previousView!==viewKey){setPreviousView(viewKey);setSelected([]);}
  useEffect(()=>{onSelectionChange?.(items.filter(item=>selected.includes(item.id)));},[items,selected,onSelectionChange]);
  const [selectionRows,setSelectionRows]=useState(items);
  if(selectionRows!==items){setSelectionRows(items);setSelected(previous=>previous.filter(id=>items.some(item=>item.id===id)));}
  const title = section === 'favorites' ? 'Pinned' : section === 'recent' ? 'Recently opened' : 'Library';
  return <section ref={viewport} data-motion-surface="page" data-motion-key={section+':'+(collection?.id??'')} data-motion-list={!query && page===0} data-motion-ready={Boolean(result.data)&&!loading} className={transformLibrary ? "library-view library-transform" + (collection ? " collection-transform" : section==='recent' ? " recent-transform" : "") : "library-view"} aria-label={title}>
    <LibraryOrientation selectionActive={selected.length>0} enabled={transformLibrary} active={visible} viewport={viewport} filterSummary={query||tags.length||type!=='all'?'Search and filters applied: '+[query,...tags,type!=='all'?filterLabel(type):''].filter(Boolean).join(', '):undefined} context={<>
    {detail.error&&<p role="alert">{detail.error}<button className="library-button" onClick={detail.retry}>Retry collection</button></p>}
    {searchMode==='content'&&Boolean(search)&&<SearchCoverage coverage={result.data?.fileCoverage} onRefresh={retry}/>}
    {(tags.length>0||type!=='all'||(sort!=='updated'&&section!=='recent'))&&<div className="flex gap-2 flex-wrap">{type!=='all'&&<button className="collection-chip" onClick={()=>setType('all')}>{filterLabel(type)} ×</button>}{tags.map(tag=><button className="collection-chip" key={tag} onClick={()=>onTagsChange(tags.filter(t=>t!==tag))}>{tag} ×</button>)}{sort!=='updated'&&section!=='recent'&&<button className="collection-chip" onClick={()=>setSort('updated')}>{sort==='title'?'Title A–Z':'Recently opened'} ×</button>}</div>}
    {selected.length>0&&<div className="flex flex-wrap items-center gap-2 text-sm"><span>{selected.length} selected</span><button className="library-button" onClick={()=>setExporting(true)}>Export selection…</button><button className="library-button" onClick={()=>setSelected(items.map(item=>item.id))}>Select page</button><button className="library-button" onClick={()=>{organizationFocus.captureFocus();setManager('bulk');}}>Tags / manage</button><button className="library-button" onClick={()=>{organizationFocus.captureFocus();setPickerIds(selected);}}>Add to collection</button><button className="library-button text-red-500" onClick={()=>void requestResourceAction('trash',items.filter(item=>selected.includes(item.id)))}>Move to Trash…</button><button className="library-button" onClick={()=>setSelected([])}>Clear selection</button></div>}
    </>}>
    {currentCollection&&<CollectionBreadcrumb collection={currentCollection} onCollection={onCollection}/>}
    <BrowseHeading title={currentCollection?.name??title} kicker={currentCollection?'COLLECTION':'YOUR WORKSPACE'} actions={<>{currentCollection&&<><LibraryPopover label="Collection path" trigger={<Route size={16}/>}>
      {close=><nav className="collection-path-list" aria-label="Full collection path"><button className="library-button" onClick={()=>{close();onCollection(null);}}>Library</button>{currentCollection.ancestors?.map(ancestor=><button className="library-button" key={ancestor.id} onClick={()=>{close();onCollection({...ancestor,count:0});}}>{ancestor.name}</button>)}<span aria-current="page">{currentCollection.name}</span></nav>}
    </LibraryPopover><PinButton id={currentCollection.id} name={currentCollection.name} favorite={currentCollection.favorite} entity="collection"/><button className="library-button" aria-label="Add item" title="Add item" onClick={()=>{organizationFocus.captureFocus();setAdding(true);}}><Plus size={16}/><span className="library-action-label">Add item</span></button></>}{hasNotes&&<button className="library-button" aria-label="Return to notes" title="Return to notes" onClick={onReturn}><ArrowLeft size={16}/><span className="library-action-label">Return to notes</span></button>}
    <LibraryPopover label="More">{close=><><button className="library-button" onClick={()=>{close();organizationFocus.captureFocus();setManager('manage');}}>Manage collections and tags</button>{currentCollection&&<button className="library-button" onClick={()=>{close();organizationFocus.captureFocus();setCreatingChild(true);}}>New subcollection</button>}{currentCollection&&<button className="library-button" onClick={()=>{close();organizationFocus.captureFocus();setManagingCollection(true);}}>Manage collection…</button>}<button className="library-button" onClick={()=>{retry();detail.retry();close();}}><RefreshCw size={16}/>Refresh</button></>}</LibraryPopover></>}/>
    <div className="library-filters">
      <label className="library-search"><Search size={17}/><input aria-label="Search items" placeholder={searchMode==='title'?'Search titles…':'Search titles and saved content…'} value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <ResourceTypeFilter value={type} onChange={value=>{setType(value);setPage(0);}}/><LibraryPopover label="Search options">{()=> <><ResourceSearchOptions mode={searchMode} onMode={mode=>{setSearchMode(mode);setPage(0);}} collection={currentCollection} onCollection={onCollection}/><label className="text-sm">Sort<select className="organization-input w-full mt-1" aria-label="Sort resources" value={section==='recent'?'recent':sort} disabled={section==='recent'||(searchMode==='content'&&Boolean(search))} onChange={e=>{setSort(e.target.value as typeof sort);setPage(0);}}><option value="updated">Recently updated</option><option value="recent">Recently opened</option><option value="title">Title A–Z</option></select></label></>}</LibraryPopover>
    </div>

    <div className="library-summary"><span>{loading?'Loading resources…':totalItems+(currentCollection?' direct resources · '+(currentCollection.childCount??0)+' child collections':' resources')}</span><span className="text-xs text-[var(--text-secondary)]">{searchMode==='title'?'Titles only':hasUnsavedChanges?'Saved content · unsaved edits excluded':'Titles + saved content'}</span>{transformLibrary&&<BrowsePagination compact page={page} totalPages={totalPages} loading={loading} onPage={setPage}/>}</div>
    </LibraryOrientation>
    {currentCollection&&(currentCollection.childCount??0)>0&&<CollectionChildren key={currentCollection.id} parent={currentCollection.id} count={currentCollection.childCount} onOpen={onCollection}/>}
    <BrowseGroup label={currentCollection?"Direct resources":"Resources"} count={totalItems} loading={loading} error={result.error} retry={retry}>
      {items.map(resource=><BrowseResourceRow key={resource.id} resource={resource} onOpen={onOpen} recent={section==='recent'} contentMode={searchMode==='content'} selected={selected.includes(resource.id)} onSelect={checked=>setSelected(previous=>checked?[...previous,resource.id]:previous.filter(id=>id!==resource.id))} onCollections={id=>{organizationFocus.captureFocus();setPickerIds([id]);}}/>)}
    </BrowseGroup>{!transformLibrary&&<BrowsePagination page={page} totalPages={totalPages} loading={loading} onPage={setPage}/>}
    {!!linkedItems.length&&<BrowseGroup label="Linked folders" count={linkedItems.length} loading={false} error={linked.error}><p role="status" className="browse-feedback">{linked.data.indexing?'Indexing linked folders…':linked.data.limited?'Showing up to50 matching linked files; narrow the search.':'Original files remain in their linked folders.'}</p>{linkedItems.map(resource=><BrowseResourceRow key={resource.id} resource={resource} onOpen={onOpen} contentMode={searchMode==='content'}/>)}</BrowseGroup>}
    {!loading && !linkedItems.length && totalItems===0 && !result.error && <div className="browse-empty">{currentCollection?.count===0&&!search&&type==='all'&&!tags.length ? (currentCollection.childCount?'Choose a child collection above, or use Add item to assign resources here.':'This collection is empty. Add an item or create a subcollection from More.') : !search&&type==='all'&&!tags.length&&!currentCollection ? section === 'favorites' ? 'Pin resources to keep them here.' : section === 'recent' ? 'Recently opened resources will appear here.' : 'Your Library is empty. Create a note or import files from the sidebar.' : 'No resources match these filters.'}{type!=='all'&&<button className="library-button" onClick={()=>{setType('all');setPage(0);}}>Clear type filter</button>}{page>0&&<button className="library-button" onClick={()=>setPage(0)}>Back to first page</button>}</div>}
    {exporting&&<ExportSelectionDialog resources={items.filter(item=>selected.includes(item.id))} onClose={()=>setExporting(false)}/>}
    {creatingChild&&currentCollection&&<CollectionPicker resourceIds={[]} parentId={currentCollection.id} onClose={()=>{setCreatingChild(false);organizationFocus.restoreFocus();}} onCreated={item=>{setCreatingChild(false);onCollection(item);}}/>}
    {managingCollection&&currentCollection&&<CollectionManagement collection={currentCollection} onClose={()=>{setManagingCollection(false);organizationFocus.restoreFocus();}} onChanged={onCollection}/>}
    {pickerIds&&<CollectionPicker resourceIds={pickerIds} onClose={()=>{setPickerIds(null);organizationFocus.restoreFocus();}}/>}
    {adding&&currentCollection&&<AddExistingResources collection={currentCollection} onOpen={onOpenCreated??onOpen} onImport={onImport??(()=>{})} onClose={restore=>{setAdding(false);if(restore!==false)organizationFocus.restoreFocus();}}/>}
    {manager && <OrganizationManager onClose={() => {setManager(null);organizationFocus.restoreFocus();}} tags={tags} onTag={name => onTagsChange(tags.includes(name) ? tags.filter(tag => tag !== name) : [...tags,name])} onTagRenamed={(oldName,newName) => onTagsChange(tags.flatMap(tag => tag === oldName ? newName ? [newName] : [] : [tag]))} onCollection={onCollection} selectedCollection={collection} resourceIds={manager === 'bulk' ? selected : []} onApplied={() => { setSelected([]);setManager(null);organizationFocus.restoreFocus(); }} />}
  </section>;
}
