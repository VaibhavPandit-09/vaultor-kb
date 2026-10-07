import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import type { Resource } from '../types';
import { resourceKind } from '../lib/resourceKinds';
import PinButton from './PinButton';
import LibraryPopover from './LibraryPopover';
import SearchExcerpt from './SearchExcerpt';

export function BrowseHeading({ title, kicker = 'YOUR WORKSPACE', actions }: { title: string; kicker?: string; actions?: ReactNode }) {
  return <header className="library-heading"><div className="library-heading-title"><p>{kicker}</p><h1>{title}</h1></div><div className="library-heading-actions">{actions}</div></header>;
}
export function BrowseGroup({ label, count, loading, error, retry, onViewAll, children }: { label: string; count: number; loading?: boolean; error?: string; retry?: () => void; onViewAll?: () => void; children: ReactNode }) {
  if (!count && !loading && !error) return null;
  return <section className="browse-group" aria-label={label} aria-busy={loading}>
    <header className="browse-group-heading"><h2>{label}<span>{count}</span></h2>{onViewAll && <button className="browse-text-action" onClick={onViewAll}>View all {label.toLowerCase()}</button>}</header>
    {error && <p role="alert" className="browse-feedback">{error}<button onClick={retry}>Retry</button></p>}
    {loading ? <p role="status" className="browse-feedback">Loading {label.toLowerCase()}…</p> : <div role="list" className="browse-rows">{children}</div>}
  </section>;
}
export function BrowsePagination({ page, totalPages, loading, onPage }: { page: number; totalPages: number; loading: boolean; onPage: (page: number) => void }) {
  if (totalPages <= 1 && page === 0) return null;
  return <nav aria-label="Result pages" className="library-pagination"><span>Page {page + 1} of {Math.max(totalPages, page + 1)}</span><button className="library-button" disabled={loading || page === 0} onClick={() => onPage(page - 1)}><ChevronLeft size={15}/>Previous</button><button className="library-button" disabled={loading || page + 1 >= totalPages} onClick={() => onPage(page + 1)}>Next<ChevronRight size={15}/></button></nav>;
}
export function BrowseResourceRow({ resource, onOpen, onCollections, selected, onSelect, contentMode = false, recent = false }: { resource: Resource; onOpen: (id: string) => void; onCollections?: (id: string) => void; selected?: boolean; onSelect?: (checked: boolean) => void; contentMode?: boolean; recent?: boolean }) {
  const kind = resourceKind(resource.type), Icon = kind.icon;
  return <div role="listitem" className="library-row">
    {onSelect && <input type="checkbox" aria-label={'Select ' + resource.title} checked={selected} onChange={event => onSelect(event.target.checked)}/>}
    <button className="library-resource" title={resource.title} onClick={() => onOpen(resource.id)}><Icon size={19}/><span><strong>{resource.title}</strong><small>{contentMode && resource.searchSnippet?.text ? <SearchExcerpt snippet={resource.searchSnippet}/> : <>{resource.collections?.map(item => item.name).join(' · ') || kind.label}{resource.tags.length > 0 && ' · ' + resource.tags.map(tag => tag.name).join(', ')}</>}</small></span></button>
    <time className="library-date">{(recent ? resource.lastOpenedAt : resource.updatedAt)?.slice(0, 10)}</time>
    <div className="browse-row-actions"><PinButton id={resource.id} name={resource.title} favorite={resource.favorite}/>{onCollections && <LibraryPopover label={'Actions for ' + resource.title} trigger={<MoreHorizontal size={17}/>} className="browse-icon-button">{close => <button className="library-button" onClick={() => { close(); onCollections(resource.id); }}>Add to collection</button>}</LibraryPopover>}</div>
  </div>;
}
