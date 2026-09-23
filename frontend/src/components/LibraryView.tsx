import OrganizationManager from './OrganizationManager';
import type { OrganizationItem } from '../lib/organization';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Star, RefreshCw } from 'lucide-react';
import type { ResourceSummary } from '../types';
import { resourceKinds, resourceKind } from '../lib/resourceKinds';
import { useResourcePage } from '../lib/useResourcePage';
import { setResourceFavorite } from '../lib/resourceBrowse';
export type LibrarySection = 'library' | 'recent' | 'favorites';

export default function LibraryView({ section, visible, tags, onOpen, onReturn, hasNotes, collection = null, onCollection = () => {}, onTagsChange = () => {} }: { collection?: OrganizationItem | null; onCollection?: (item: OrganizationItem | null) => void; onTagsChange?: (tags: string[]) => void; section: LibrarySection; visible: boolean; tags: string[]; onOpen: (id: string) => void; onReturn: () => void; hasNotes: boolean }) {
  const [manager, setManager] = useState<'manage' | 'bulk' | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [type, setType] = useState('all'), [sort, setSort] = useState<'title' | 'updated' | 'recent'>('updated');
  const [page, setPage] = useState(0), [scrollTop, setScrollTop] = useState(0), [height, setHeight] = useState(600);
  const [pending, setPending] = useState<string | null>(null), [actionError, setActionError] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const tagKey = JSON.stringify(tags);
  useEffect(() => { const timer = setTimeout(() => { setSearch(query); setPage(0); }, 200); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { setPage(0); }, [section, tagKey, collection?.id]);
  const { data, loading, error, retry } = useResourcePage({ collection: collection?.id, page, size: 100, q: search, type, sort: section === 'recent' ? 'recent' : sort, tags, favorites: section === 'favorites' }, visible);
  useEffect(() => {
    if (!scroller.current) return;
    const observer = new ResizeObserver(entries => setHeight(entries[0].contentRect.height));
    observer.observe(scroller.current); return () => observer.disconnect();
  }, []);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; setScrollTop(0); }, [page, search, type, sort, section, tagKey, collection?.id]);
  useEffect(() => { setSelected([]); }, [page, search, type, sort, section, tagKey, collection?.id]);
  const items = data?.items ?? [], rowHeight = 64;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 4), end = Math.min(items.length, start + Math.ceil(height / rowHeight) + 8);
  const title = section === 'favorites' ? 'Favorites' : section === 'recent' ? 'Recently opened' : 'Library';
  async function favorite(resource: ResourceSummary) {
    setPending(resource.id); setActionError('');
    try { await setResourceFavorite(resource.id, !resource.favorite); }
    catch { setActionError('Could not update favorite. Try the star again.'); }
    finally { setPending(null); }
  }
  return <section className="library-view" aria-label={title}>
    <header className="library-heading"><div><p>YOUR WORKSPACE</p><h1>{collection ? collection.name : title}</h1></div>{hasNotes && <button className="library-button" onClick={onReturn}><ArrowLeft size={16} />Return to notes</button>}</header>
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
    <div className="flex items-center gap-2 text-sm"><button className="library-button" disabled={loading || !items.length} onClick={() => setSelected(items.map(item => item.id))}>Select page</button><span>{selected.length} selected</span>{selected.length > 0 && <><button className="library-button" onClick={() => setManager('bulk')}>Organize selected</button><button className="library-button" onClick={() => setSelected([])}>Clear selection</button></>}</div>
    {error && data && <p role="alert" className="library-message">{error}<button className="library-button" onClick={retry}>Retry</button></p>}
    {actionError && <p role="alert" className="library-message">{actionError}</p>}
    <div ref={scroller} className="library-list" onScroll={event => setScrollTop(event.currentTarget.scrollTop)} aria-busy={loading}>
      {error && !data ? <div role="alert" className="library-message">{error}<button className="library-button" onClick={retry}>Retry</button></div> : loading ? <div className="library-message" role="status">Loading {page > 0 ? 'page' : 'Library'}…</div> : !items.length ? <div className="library-message">{section === 'favorites' && !search ? 'Star resources to keep them here.' : 'No resources match these filters.'}{page > 0 && <button className="library-button" onClick={() => setPage(0)}>Back to first page</button>}</div> : <div role="list" aria-label="Resources" style={{ height: items.length * rowHeight, position: 'relative' }}>
        {items.slice(start, end).map((resource, offset) => {
          const kind = resourceKind(resource.type), Icon = kind.icon;
          return <div role="listitem" className="library-row" key={resource.id} style={{ position: 'absolute', top: (start + offset) * rowHeight, height: rowHeight, left: 0, right: 0 }}>
            <input type="checkbox" aria-label={'Select ' + resource.title} checked={selected.includes(resource.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous,resource.id] : previous.filter(id => id !== resource.id))}/>
            <button className="library-resource" title={resource.title} onClick={() => onOpen(resource.id)}><Icon size={20} /><span><strong>{resource.title}</strong><small>{kind.label}{resource.tags.length ? ' · ' + resource.tags.map(tag => tag.name).join(', ') : ''}</small></span></button>
            <time className="library-date">{(section === 'recent' ? resource.lastOpenedAt : resource.updatedAt)?.slice(0,10)}</time>
            <button className="library-button" aria-label={`${resource.favorite ? 'Unfavorite' : 'Favorite'} ${resource.title}`} aria-pressed={Boolean(resource.favorite)} disabled={pending === resource.id} onClick={() => void favorite(resource)}><Star size={17} fill={resource.favorite ? 'currentColor' : 'none'} /></button>
          </div>;
        })}
      </div>}
    </div>
    <footer className="library-pagination"><span>{data?.totalItems ? `Page ${page + 1} of ${data.totalPages}` : 'No pages'}</span><button className="library-button" disabled={loading || page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={16} />Previous</button><button className="library-button" disabled={loading || !data || page + 1 >= data.totalPages} onClick={() => setPage(page + 1)}>Next<ChevronRight size={16} /></button></footer>
    {manager && <OrganizationManager onClose={() => setManager(null)} tags={tags} onTag={name => onTagsChange(tags.includes(name) ? tags.filter(tag => tag !== name) : [...tags,name])} onTagRenamed={(oldName,newName) => onTagsChange(tags.flatMap(tag => tag === oldName ? newName ? [newName] : [] : [tag]))} onCollection={onCollection} selectedCollection={collection} resourceIds={manager === 'bulk' ? selected : []} onApplied={() => { setSelected([]);setManager(null); }} />}
  </section>;
}
