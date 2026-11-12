import SidebarSectionSurface from './SidebarSectionSurface';
import { useDesktopInteraction,useDragItems,useDropTarget } from '../lib/desktopInteraction';
import { MotionIndicator } from './MotionFeedback';
import { useEffect, useMemo, useState, type ReactNode, type MouseEvent } from 'react';
import { Settings2 } from 'lucide-react';
import { normalizeSidebarSections, sidebarSectionNames, type SidebarSections as Preferences, type SidebarSectionName } from '../lib/sidebarPreferences';
import { useResourcePage } from '../lib/useResourcePage';
import type { Resource } from '../types';
import SidebarItem from './SidebarItem';
import LibraryPopover from './LibraryPopover';
import ResourceTypeFilter from './ResourceTypeFilter';

export function SidebarSection({ name, preferences, onChange, onViewAll, children, types }: { name: SidebarSectionName; preferences: Preferences; onChange: (value: Preferences) => void; onViewAll?: () => void; children: ReactNode;types?:string[] }) {
  const drag=useDesktopInteraction(),[revealed,setRevealed]=useState<string|null>(null);
  const title = name[0].toUpperCase() + name.slice(1), expanded = !preferences[name].collapsed||Boolean(drag?.payload&&revealed===drag.payload.ticket);
  const canExplore=drag?.payload?.kind==='resources'||drag?.payload?.kind==='tag';
  const drop=useDropTarget(name==='pinned'&&drag?.payload?.kind==='resources'?{kind:'pinned'}:!expanded&&canExplore?{kind:'discovery',id:'section-'+name,label:'Expand '+title}:null,!expanded?()=>{if(drag?.payload)setRevealed(drag.payload.ticket);}:undefined);
  return <SidebarSectionSurface {...drop} title={title} expanded={expanded} hidden={!preferences[name].visible} toggle={()=>onChange({...preferences,[name]:{...preferences[name],collapsed:expanded}})} tools={<>{name!=='tags'&&expanded&&<ResourceTypeFilter types={types} compact label={'Filter '+title.toLowerCase()+' type'} collections={name==='pinned'} value={preferences[name].type} onChange={type=>onChange({...preferences,[name]:{...preferences[name],type}})}/>} {onViewAll&&<button onClick={onViewAll}>View all</button>}</>}><MotionIndicator/>{children}</SidebarSectionSurface>;
}
export function SidebarCustomization({ preferences, onChange, status='saved', onRetry }: { preferences: Preferences; onChange: (value: Preferences) => void; status?: 'saved'|'saving'|'failed'; onRetry?:()=>void }) {
  return <LibraryPopover label="Sidebar options" trigger={<Settings2 size={15}/>} className="browse-icon-button">{()=> <><h2 className="text-sm font-medium">Quick access options</h2>{sidebarSectionNames.filter(name=>name!=='tags').map(name=><label key={name} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={preferences[name].visible} onChange={event=>onChange({...preferences,[name]:{...preferences[name],visible:event.target.checked}})}/>{name[0].toUpperCase()+name.slice(1)}</label>)}<button className="library-button" onClick={()=>onChange(normalizeSidebarSections(undefined))}>Restore defaults</button>{status==='saving'&&<p role="status" className="browse-feedback">Saving settings…</p>}{status==='failed'&&<p role="alert" className="browse-feedback">Settings could not be saved.<button onClick={onRetry}>Retry</button></p>}</>}</LibraryPopover>;
}
export function SidebarRecent({ enabled, limit=12, type='all', activeId, onOpen, onDelete, onResources }: { enabled: boolean; limit?:number; type?:string; activeId?: string; onOpen: (id: string) => void; onDelete: (id: string, event: MouseEvent) => void; onResources: (items: Resource[]) => void }) {
  const result = useResourcePage({type,sort:'recent',size:limit},enabled);
  const resources = useDragItems(useMemo(()=>result.data?.items??[],[result.data]));
  useEffect(()=>{if(enabled)onResources(resources);},[resources,enabled,onResources]);
  return <div data-motion-list="true" data-motion-ready={Boolean(result.data)&&!result.loading}>{result.loading&&<p className="browse-feedback">Loading…</p>}{result.error&&<p role="alert" className="browse-feedback">{result.error}<button onClick={result.retry}>Retry</button></p>}{resources.map(resource=><SidebarItem key={resource.id} resource={resource} isActive={activeId===resource.id} onClick={()=>onOpen(resource.id)} onDelete={event=>onDelete(resource.id,event)}/>)}{!result.loading&&!resources.length&&!result.error&&<p className="browse-feedback">{type==='all'?'Opened resources appear here.':'No recently opened resources of this type.'}</p>}</div>;
}
