import {BrowseRowSurface} from './BrowsePresentation';
import { useSelection } from '../lib/resourceSelection';
import { canDragResource, useDropTarget, useDesktopInteraction } from '../lib/desktopInteraction';
import type { ReactNode } from 'react';
export {BrowseHeading,BrowsePagination} from './BrowsePresentation';
import type { Resource } from '../types';
import { resourceDescription } from '../lib/resourceKinds';
import PinButton from './PinButton';
import ResourceActions from './ResourceActions';
import ResourceThumbnail from './ResourceThumbnail';
import SearchExcerpt from './SearchExcerpt';

export function BrowseGroup({ label, count, loading, error, retry, onViewAll, children }: { label: string; count: number; loading?: boolean; error?: string; retry?: () => void; onViewAll?: () => void; children: ReactNode }) {
  if (!count && !loading && !error) return null;
  return <section className="browse-group" aria-label={label} aria-busy={loading}>
    <header className="browse-group-heading"><h2>{label}<span>{count}</span></h2>{onViewAll && <button className="browse-text-action" onClick={onViewAll}>View all {label.toLowerCase()}</button>}</header>
    {error && <p role="alert" className="browse-feedback">{error}<button onClick={retry}>Retry</button></p>}
    {loading ? <p role="status" className="browse-feedback">Loading {label.toLowerCase()}…</p> : <div role="list" className="browse-rows">{children}</div>}
  </section>;
}
export function BrowseResourceRow({ resource, onOpen, onCollections, selected, onSelect, contentMode = false, recent = false }: { resource: Resource; onOpen: (id: string) => void; onCollections?: (id: string) => void; selected?: boolean; onSelect?: (checked: boolean) => void; contentMode?: boolean; recent?: boolean }) {

  void onCollections;
  const selection=useSelection(),drag=useDesktopInteraction(),drop=useDropTarget({kind:'resource',resource});
  const selectable=selection?.order.includes(resource.id)?selection:null;
  const checked=selectable?selectable.ids.includes(resource.id):selected;
  return <BrowseRowSurface {...drop} role="listitem" data-resource-row={resource.id} data-opened={drag?.openedIds.has(resource.id)||undefined} data-selected={checked||undefined} selection={(onSelect||selectable) && <input type="checkbox" aria-label={'Select ' + resource.title} checked={Boolean(checked)} onClick={event=>{if(selectable){selectable.pick(resource.id,event,true);}}} onChange={event => {if(!selectable)onSelect?.(event.target.checked);}}/>} resource={<><ResourceThumbnail resource={resource}/><button draggable={canDragResource(resource)} onDragStart={event=>drag?.start(event,{kind:'resources',resources:selectable?.ids.includes(resource.id)?selectable.resources:[resource]})} onDragEnd={()=>drag?.cancel()} className="min-w-0 flex-1 text-left" title={resource.title} onClick={event => {if(!selectable?.pick(resource.id,event))onOpen(resource.id);}}><span><strong>{resource.title}{drag?.openedIds.has(resource.id)&&<span className="resource-open-dot" role="img" aria-label="Open in workspace" title="Open in workspace"/>}</strong><small>{contentMode && resource.searchSnippet?.text ? <>{resourceDescription(resource)} · <SearchExcerpt snippet={resource.searchSnippet}/></> : <>{resourceDescription(resource)}{resource.collections?.length ? ' · ' + resource.collections.map(item => item.name).join(' · ') : ''}{resource.tags.length > 0 && ' · ' + resource.tags.map(tag => tag.name).join(', ')}</>}</small></span></button></>} date={<time className="library-date">{(recent ? resource.lastOpenedAt : resource.updatedAt)?.slice(0, 10)}</time>} actions={<><PinButton id={resource.id} name={resource.title} favorite={resource.favorite}/><ResourceActions resource={resource}/></>}/>;
}
