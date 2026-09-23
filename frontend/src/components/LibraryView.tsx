import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';
import CollectionManagement from './CollectionManagement';
import PinButton from './PinButton';
import { CollectionPicker } from './ResourceCollections';
import AddExistingResources from './AddExistingResources';
import api from '../lib/api';
import { useRetainedQuery } from '../lib/useRetainedQuery';
import OrganizationManager from './OrganizationManager';
import type { OrganizationItem } from '../lib/organization';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, RefreshCw, FolderPlus } from 'lucide-react';
import { resourceKinds, resourceKind } from '../lib/resourceKinds';
import { useResourcePage } from '../lib/useResourcePage';

export type LibrarySection = 'library' | 'recent' | 'favorites' | 'collections';
async function collectionDetails(id:string,signal:AbortSignal) {return (await api.get<OrganizationItem>('/collections/'+id,{signal,backgroundDiagnostic:true})).data;}

export default function LibraryView({ section, visible, tags, onOpen, onReturn, hasNotes, collection = null, onCollection = () => {}, onTagsChange = () => {}, onNewNote, onImport }: { onNewNote?:()=>void; onImport?:()=>void; collection?: OrganizationItem | null; onCollection?: (item: OrganizationItem | null) => void; onTagsChange?: (tags: string[]) => void; section: LibrarySection; visible: boolean; tags: string[]; onOpen: (id: string) => void; onReturn: () => void; hasNotes: boolean }) {
  const organizationFocus=useRestoreFocusOnClose();
  const [managingCollection,setManagingCollection]=useState(false);
  const [pickerIds,setPickerIds]=useState<string[]|null>(null),[adding,setAdding]=useState(false);
  const detail=useRetainedQuery(collection?.id??'',visible&&Boolean(collection),'collections',collectionDetails);
  const currentCollection=detail.data??collection;
  const [manager, setManager] = useState<'manage' | 'bulk' | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [type, setType] = useState('all'), [sort, setSort] = useState<'title' | 'updated' | 'recent'>('updated');
  const [page, setPage] = useState(0), [scrollTop, setScrollTop] = useState(0), [height, setHeight] = useState(600);
  const scroller = useRef<HTMLDivElement>(null);
  const tagKey = JSON.stringify(tags);
  useEffect(() => { const timer = setTimeout(() => { setSearch(query); setPage(0); }, 200); return () => clearTimeout(timer); }, [query]);
  const scopeKey=JSON.stringify([section,tagKey,collection?.id]);
  const [previousScope,setPreviousScope]=useState(scopeKey);
  if(previousScope!==scopeKey){setPreviousScope(scopeKey);setPage(0);}
  const { data, loading, error, retry } = useResourcePage({ collection: collection?.id, page, size: 100, q: search, type, sort: section === 'recent' ? 'recent' : sort, tags, favorites: section === 'favorites' }, visible);
  useEffect(() => {
    if (!scroller.current) return;
    const observer = new ResizeObserver(entries => setHeight(entries[0].contentRect.height));
    observer.observe(scroller.current); return () => observer.disconnect();
  }, []);
  const viewKey=JSON.stringify([page,search,type,sort,scopeKey]);
  const [previousView,setPreviousView]=useState(viewKey);
  if(previousView!==viewKey){setPreviousView(viewKey);setSelected([]);setScrollTop(0);}
  useEffect(() => { if(scroller.current) scroller.current.scrollTop=0; },[viewKey]);
  const items = data?.items ?? [], rowHeight = 64;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 4), end = Math.min(items.length, start + Math.ceil(height / rowHeight) + 8);
  const title = section === 'favorites' ? 'Pinned' : section === 'recent' ? 'Recently opened' : 'Library';
  return <section className="library-view" aria-label={title}>
    <header className="library-heading"><div><p>YOUR WORKSPACE</p><h1>{currentCollection ? currentCollection.name : title}</h1></div>{hasNotes && <button className="library-button" onClick={onReturn}><ArrowLeft size={16} />Return to notes</button>}</header>
    {currentCollection && <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-[var(--text-secondary)]">{currentCollection.count} resources</span><PinButton id={currentCollection.id} name={currentCollection.name} favorite={currentCollection.favorite} entity="collection"/><button className="library-button" onClick={onNewNote}>New note</button><button className="library-button" onClick={()=>{organizationFocus.captureFocus();setAdding(true);}}>Add existing</button><button className="library-button" onClick={onImport}>Import files</button><button className="library-button" onClick={()=>{organizationFocus.captureFocus();setManagingCollection(true);}}>Manage collection…</button>{detail.error&&<button onClick={detail.retry}>Retry collection</button>}</div>}
    <div className="library-filters">
      <button className="library-button" onClick={() => setManager('manage')}>Collections & tags</button>
      {collection && <button className="library-button" onClick={() => onCollection(null)}>Clear collection</button>}
      <label className="library-search"><Search size={17} /><input aria-label="Search resource titles" placeholder="Search titles…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <select aria-label="Resource type" value={type} onChange={event => { setType(event.target.value); setPage(0); }}><option value="all">All types</option>{resourceKinds.map(kind => <option key={kind.type} value={kind.type}>{kind.plural}</option>)}</select>
      <select aria-label="Sort resources" value={section === 'recent' ? 'recent' : sort} disabled={section === 'recent'} onChange={event => { setSort(event.target.value as typeof sort); setPage(0); }}><option value="updated">Recently updated</option><option value="recent">Recently opened</option><option value="title">Title A–Z</option></select>
      <button className="library-button" aria-label="Refresh Library" title="Refresh" onClick={retry}><RefreshCw size={16} /></button>
    </div>
    <div className="library-summary">{loading ? 'Loading resources…' : `${data?.totalItems ?? 0} resources`}{tags.length > 0 && <span> · Matching tags: {tags.join(', ')}</span>}<span className="ml-auto">Title search · content search coming later</span></div>
    {tags.length > 0 && <div className="flex gap-2 flex-wrap">{tags.map(tag => <button className="library-button" key={tag} onClick={() => onTagsChange(tags.filter(name => name !== tag))}>{tag} ×</button>)}<button className="library-button" onClick={() => onTagsChange([])}>Clear tags</button></div>}
    <div className="flex items-center gap-2 text-sm"><button className="library-button" disabled={loading || !items.length} onClick={() => setSelected(items.map(item => item.id))}>Select page</button><span>{selected.length} selected</span>{selected.length > 0 && <><button className="library-button" onClick={() => setManager('bulk')}>Tags / manage</button><button className="library-button" onClick={()=>{organizationFocus.captureFocus();setPickerIds(selected);}}>Add to collection</button><button className="library-button" onClick={() => setSelected([])}>Clear selection</button></>}</div>
    {error && data && <p role="alert" className="library-message">{error}<button className="library-button" onClick={retry}>Retry</button></p>}
    <div ref={scroller} className="library-list" onScroll={event => setScrollTop(event.currentTarget.scrollTop)} aria-busy={loading}>
      {error && !data ? <div role="alert" className="library-message">{error}<button className="library-button" onClick={retry}>Retry</button></div> : loading ? <div className="library-message" role="status">Loading {page > 0 ? 'page' : 'Library'}…</div> : !items.length ? <div className="library-message">{section === 'favorites' && !search ? 'Pin resources to keep them here.' : 'No resources match these filters.'}{page > 0 && <button className="library-button" onClick={() => setPage(0)}>Back to first page</button>}</div> : <div role="list" aria-label="Resources" style={{ height: items.length * rowHeight, position: 'relative' }}>
        {items.slice(start, end).map((resource, offset) => {
          const kind = resourceKind(resource.type), Icon = kind.icon;
          return <div role="listitem" className="library-row" key={resource.id} style={{ position: 'absolute', top: (start + offset) * rowHeight, height: rowHeight, left: 0, right: 0 }}>
            <input type="checkbox" aria-label={'Select ' + resource.title} checked={selected.includes(resource.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous,resource.id] : previous.filter(id => id !== resource.id))}/>
            <button className="library-resource" title={resource.title} onClick={() => onOpen(resource.id)}><Icon size={20} /><span><strong>{resource.title}</strong><small>{kind.label}{resource.collections?.length?' · '+resource.collections.map(c=>c.name).join(', '):''}{resource.tags.length ? ' · ' + resource.tags.map(tag => tag.name).join(', ') : ''}</small></span></button>
            <time className="library-date">{(section === 'recent' ? resource.lastOpenedAt : resource.updatedAt)?.slice(0,10)}</time>
<button className="library-button" aria-label={`Collections for ${resource.title}`} title="Add to collection" onClick={()=>{organizationFocus.captureFocus();setPickerIds([resource.id]);}}><FolderPlus size={17}/></button>
            <PinButton id={resource.id} name={resource.title} favorite={resource.favorite}/>
          </div>;
        })}
      </div>}
    </div>
    <footer className="library-pagination"><span>{data?.totalItems ? `Page ${page + 1} of ${data.totalPages}` : 'No pages'}</span><button className="library-button" disabled={loading || page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={16} />Previous</button><button className="library-button" disabled={loading || !data || page + 1 >= data.totalPages} onClick={() => setPage(page + 1)}>Next<ChevronRight size={16} /></button></footer>
    {managingCollection&&currentCollection&&<CollectionManagement collection={currentCollection} onClose={()=>{setManagingCollection(false);organizationFocus.restoreFocus();}} onChanged={onCollection}/>}
    {pickerIds&&<CollectionPicker resourceIds={pickerIds} onClose={()=>{setPickerIds(null);organizationFocus.restoreFocus();}}/>}
    {adding&&currentCollection&&<AddExistingResources collection={currentCollection} onClose={()=>{setAdding(false);organizationFocus.restoreFocus();}}/>}
    {manager && <OrganizationManager onClose={() => setManager(null)} tags={tags} onTag={name => onTagsChange(tags.includes(name) ? tags.filter(tag => tag !== name) : [...tags,name])} onTagRenamed={(oldName,newName) => onTagsChange(tags.flatMap(tag => tag === oldName ? newName ? [newName] : [] : [tag]))} onCollection={onCollection} selectedCollection={collection} resourceIds={manager === 'bulk' ? selected : []} onApplied={() => { setSelected([]);setManager(null); }} />}
  </section>;
}
