import { defaultLibrary, type LibraryContext } from '../lib/sessionStore';
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
import { useRetainedQuery } from '../lib/useRetainedQuery';
import OrganizationManager from './OrganizationManager';
import type { OrganizationItem } from '../lib/organization';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, RefreshCw } from 'lucide-react';
import { resourceKinds, resourceKind } from '../lib/resourceKinds';
import { useResourcePage } from '../lib/useResourcePage';

export type LibrarySection = 'library' | 'recent' | 'favorites' | 'collections';
async function collectionDetails(id:string,signal:AbortSignal) {return (await api.get<OrganizationItem>('/collections/'+id,{signal,backgroundDiagnostic:true})).data;}

export default function LibraryView({ section, visible, tags, onOpen, onReturn, hasNotes, collection = null, onCollection = () => {}, onTagsChange = () => {}, onImport, onOpenCreated, onSelectionChange, hasUnsavedChanges=false, initialContext=defaultLibrary, onContextChange }: { initialContext?: LibraryContext; onContextChange?: (value: LibraryContext) => void; onSelectionChange?:(items:Resource[])=>void; hasUnsavedChanges?:boolean; onImport?:()=>void; onOpenCreated?:(id:string)=>Promise<void>; collection?: OrganizationItem | null; onCollection?: (item: OrganizationItem | null) => void; onTagsChange?: (tags: string[]) => void; section: LibrarySection; visible: boolean; tags: string[]; onOpen: (id: string) => void | Promise<void>; onReturn: () => void; hasNotes: boolean }) {
  const organizationFocus=useRestoreFocusOnClose();
  const [managingCollection,setManagingCollection]=useState(false);
  const [pickerIds,setPickerIds]=useState<string[]|null>(null),[adding,setAdding]=useState(false);
  const detail=useRetainedQuery(collection?.id??'',visible&&Boolean(collection),'collections',collectionDetails);
  const currentCollection=detail.data??collection;
  const [manager, setManager] = useState<'manage' | 'bulk' | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [searchMode,setSearchMode]=useState<SearchMode>(initialContext.searchMode);
  const [query, setQuery] = useState(initialContext.query), [search, setSearch] = useState(initialContext.query);
  const [type, setType] = useState(initialContext.type), [sort, setSort] = useState<'title' | 'updated' | 'recent'>(initialContext.sort);
  const [page, setPage] = useState(0);
  useEffect(() => { onContextChange?.({query,searchMode,type,sort}); }, [query,searchMode,type,sort,onContextChange]);
  const tagKey = JSON.stringify(tags);
  useEffect(() => { const timer = setTimeout(() => { setSearch(query); setPage(0); }, 200); return () => clearTimeout(timer); }, [query]);
  const scopeKey=JSON.stringify([section,tagKey,collection?.id]);
  const [previousScope,setPreviousScope]=useState(scopeKey);
  if(previousScope!==scopeKey){setPreviousScope(scopeKey);setPage(0);}
  const criteria = { collection: collection?.id, q: search, searchMode, sort: section === 'recent' ? 'recent' as const : sort, tags, favorites: section === 'favorites' };
  const notes = useResourcePage({ ...criteria, type: 'note', page: 0, size: 12 }, visible && type === 'all');
  const files = useResourcePage({ ...criteria, type: 'file', page: 0, size: 12 }, visible && type === 'all');
  const single = useResourcePage({ ...criteria, type, page, size: 100 }, visible && type !== 'all');
  const items = useMemo(() => type === 'all' ? [...notes.data?.items??[], ...files.data?.items??[]] : single.data?.items??[], [type,notes.data,files.data,single.data]);
  const totalItems = type === 'all' ? (notes.data?.totalItems??0) + (files.data?.totalItems??0) : single.data?.totalItems??0;
  const loading = type === 'all' ? notes.loading || files.loading : single.loading;
  const retry = () => { notes.retry(); files.retry(); single.retry(); };
  const viewKey=JSON.stringify([page,search,searchMode,type,sort,scopeKey]);
  const [previousView,setPreviousView]=useState(viewKey);
  if(previousView!==viewKey){setPreviousView(viewKey);setSelected([]);}
  useEffect(()=>{onSelectionChange?.(items.filter(item=>selected.includes(item.id)));},[items,selected,onSelectionChange]);
  const title = section === 'favorites' ? 'Pinned' : section === 'recent' ? 'Recently opened' : 'Library';
  return <section className="library-view" aria-label={title}>
    {collection&&<nav aria-label="Breadcrumb"><button className="text-sm text-[var(--text-secondary)] hover:underline" onClick={()=>onCollection(null)}>Library</button><span className="text-sm text-[var(--text-tertiary)]"> / {currentCollection?.name}</span></nav>}
    <BrowseHeading title={currentCollection?.name??title} kicker={currentCollection?'COLLECTION':'YOUR WORKSPACE'} actions={<>{currentCollection&&<><PinButton id={currentCollection.id} name={currentCollection.name} favorite={currentCollection.favorite} entity="collection"/><button className="library-button" onClick={()=>{organizationFocus.captureFocus();setAdding(true);}}>+ Add resource</button></>}{hasNotes&&<button className="library-button" onClick={onReturn}><ArrowLeft size={16}/>Return to notes</button>}
    <LibraryPopover label="More">{close=><><button className="library-button" onClick={()=>{close();organizationFocus.captureFocus();setManager('manage');}}>Collections &amp; tags</button>{currentCollection&&<button className="library-button" onClick={()=>{close();organizationFocus.captureFocus();setManagingCollection(true);}}>Rename / delete collection…</button>}<button className="library-button" onClick={()=>{retry();detail.retry();close();}}><RefreshCw size={16}/>Refresh</button></>}</LibraryPopover></>}/>
    {detail.error&&<p role="alert">{detail.error}<button className="library-button" onClick={detail.retry}>Retry collection</button></p>}
    <div className="library-filters">
      <label className="library-search"><Search size={17}/><input aria-label="Search resources" placeholder={searchMode==='title'?'Search resource titles…':'Search titles and saved note text…'} value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <LibraryPopover label="Search options">{()=> <><ResourceSearchOptions mode={searchMode} onMode={mode=>{setSearchMode(mode);setPage(0);}} collection={currentCollection} onCollection={onCollection}/><label className="text-sm">Resource type<select className="organization-input w-full mt-1" aria-label="Resource type" value={type} onChange={e=>{setType(e.target.value);setPage(0);}}><option value="all">All types</option>{resourceKinds.map(kind=><option key={kind.type} value={kind.type}>{kind.plural}</option>)}</select></label><label className="text-sm">Sort<select className="organization-input w-full mt-1" aria-label="Sort resources" value={section==='recent'?'recent':sort} disabled={section==='recent'||(searchMode==='content'&&Boolean(search))} onChange={e=>{setSort(e.target.value as typeof sort);setPage(0);}}><option value="updated">Recently updated</option><option value="recent">Recently opened</option><option value="title">Title A–Z</option></select></label></>}</LibraryPopover>
    </div>
    <nav className="browse-type-tabs" aria-label="Resource types">{[{type:'all',plural:'All'},...resourceKinds].map(kind=><button key={kind.type} aria-pressed={type===kind.type} onClick={()=>{setType(kind.type);setPage(0);}}>{kind.plural}</button>)}</nav>
    <div className="library-summary"><span>{loading?'Loading resources…':totalItems+' resources'}</span><span className="text-xs text-[var(--text-secondary)]">{searchMode==='title'?'Titles only':hasUnsavedChanges?'Saved content · unsaved edits excluded':'Titles + saved note text'}</span></div>
    {(tags.length>0||type!=='all'||(sort!=='updated'&&section!=='recent'))&&<div className="flex gap-2 flex-wrap">{type!=='all'&&<button className="collection-chip" onClick={()=>setType('all')}>{resourceKind(type).label} ×</button>}{tags.map(tag=><button className="collection-chip" key={tag} onClick={()=>onTagsChange(tags.filter(t=>t!==tag))}>{tag} ×</button>)}{sort!=='updated'&&section!=='recent'&&<button className="collection-chip" onClick={()=>setSort('updated')}>{sort==='title'?'Title A–Z':'Recently opened'} ×</button>}</div>}
    {items.length>0&&<label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><input type="checkbox" aria-label="Select visible resources" checked={items.every(item=>selected.includes(item.id))} onChange={e=>setSelected(e.target.checked?items.map(i=>i.id):[])}/>Select visible resources</label>}
    {selected.length>0&&<div className="flex flex-wrap items-center gap-2 text-sm"><span>{selected.length} selected</span><button className="library-button" onClick={()=>{organizationFocus.captureFocus();setManager('bulk');}}>Tags / manage</button><button className="library-button" onClick={()=>{organizationFocus.captureFocus();setPickerIds(selected);}}>Add to collection</button><button className="library-button" onClick={()=>setSelected([])}>Clear selection</button></div>}
    {type === 'all' ? ([{kind:'note',result:notes},{kind:'file',result:files}]).map(({kind,result}) => <BrowseGroup key={kind} label={resourceKind(kind).plural} count={result.data?.totalItems??0} loading={result.loading} error={result.error} retry={result.retry} onViewAll={(result.data?.totalItems??0)>12?()=>{setType(kind);setPage(0);}:undefined}>
      {result.data?.items.map(resource => <BrowseResourceRow key={resource.id} resource={resource} onOpen={onOpen} recent={section==='recent'} contentMode={searchMode==='content'} selected={selected.includes(resource.id)} onSelect={checked=>setSelected(previous=>checked?[...previous,resource.id]:previous.filter(id=>id!==resource.id))} onCollections={id=>{organizationFocus.captureFocus();setPickerIds([id]);}}/>)}
    </BrowseGroup>) : <><BrowseGroup label={resourceKind(type).plural} count={single.data?.totalItems??0} loading={single.loading} error={single.error} retry={single.retry}>
      {items.map(resource=><BrowseResourceRow key={resource.id} resource={resource} onOpen={onOpen} recent={section==='recent'} contentMode={searchMode==='content'} selected={selected.includes(resource.id)} onSelect={checked=>setSelected(previous=>checked?[...previous,resource.id]:previous.filter(id=>id!==resource.id))} onCollections={id=>{organizationFocus.captureFocus();setPickerIds([id]);}}/>)}
    </BrowseGroup><BrowsePagination page={page} totalPages={single.data?.totalPages??0} loading={single.loading} onPage={setPage}/></>}
    {!loading && totalItems===0 && !(type==='all'?notes.error||files.error:single.error) && <div className="browse-empty">{currentCollection?.count===0&&!search&&type==='all'&&!tags.length ? 'This collection is empty. Add a resource to get started.' : !search&&type==='all'&&!tags.length&&!currentCollection ? section === 'favorites' ? 'Pin resources to keep them here.' : section === 'recent' ? 'Recently opened resources will appear here.' : 'Your Library is empty. Create a note or import files from the sidebar.' : 'No resources match these filters.'}{page>0&&<button className="library-button" onClick={()=>setPage(0)}>Back to first page</button>}</div>}
    {managingCollection&&currentCollection&&<CollectionManagement collection={currentCollection} onClose={()=>{setManagingCollection(false);organizationFocus.restoreFocus();}} onChanged={onCollection}/>}
    {pickerIds&&<CollectionPicker resourceIds={pickerIds} onClose={()=>{setPickerIds(null);organizationFocus.restoreFocus();}}/>}
    {adding&&currentCollection&&<AddExistingResources collection={currentCollection} onOpen={onOpenCreated??onOpen} onImport={onImport??(()=>{})} onClose={restore=>{setAdding(false);if(restore!==false)organizationFocus.restoreFocus();}}/>}
    {manager && <OrganizationManager onClose={() => {setManager(null);organizationFocus.restoreFocus();}} tags={tags} onTag={name => onTagsChange(tags.includes(name) ? tags.filter(tag => tag !== name) : [...tags,name])} onTagRenamed={(oldName,newName) => onTagsChange(tags.flatMap(tag => tag === oldName ? newName ? [newName] : [] : [tag]))} onCollection={onCollection} selectedCollection={collection} resourceIds={manager === 'bulk' ? selected : []} onApplied={() => { setSelected([]);setManager(null);organizationFocus.restoreFocus(); }} />}
  </section>;
}
