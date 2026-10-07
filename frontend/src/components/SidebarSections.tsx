import { useEffect, useMemo, type ReactNode, type MouseEvent } from 'react';
import { ChevronDown, Settings2 } from 'lucide-react';
import { normalizeSidebarSections, sidebarSectionNames, type SidebarSections as Preferences, type SidebarSectionName } from '../lib/sidebarPreferences';
import { useResourcePage } from '../lib/useResourcePage';
import type { Resource } from '../types';
import SidebarItem from './SidebarItem';
import LibraryPopover from './LibraryPopover';

export function SidebarSection({ name, preferences, onChange, onViewAll, children }: { name: SidebarSectionName; preferences: Preferences; onChange: (value: Preferences) => void; onViewAll?: () => void; children: ReactNode }) {
  const title = name[0].toUpperCase() + name.slice(1), expanded = !preferences[name].collapsed;
  return <section className="sidebar-section" aria-label={title} hidden={!preferences[name].visible}>
    <header className="sidebar-section-heading"><button aria-expanded={expanded} aria-controls={'sidebar-'+name} onClick={()=>onChange({...preferences,[name]:{...preferences[name],collapsed:expanded}})}><ChevronDown size={13} className={expanded?'':'sidebar-disclosure-closed'}/>{title}</button>{onViewAll&&<button onClick={onViewAll}>View all</button>}</header>
    <div id={'sidebar-'+name} hidden={!expanded}>{children}</div>
  </section>;
}
export function SidebarCustomization({ preferences, onChange, status='saved', onRetry }: { preferences: Preferences; onChange: (value: Preferences) => void; status?: 'saved'|'saving'|'failed'; onRetry?:()=>void }) {
  return <LibraryPopover label="Sidebar options" trigger={<Settings2 size={15}/>} className="browse-icon-button">{()=> <><h2 className="text-sm font-medium">Customize sidebar</h2>{sidebarSectionNames.map(name=><label key={name} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={preferences[name].visible} onChange={event=>onChange({...preferences,[name]:{...preferences[name],visible:event.target.checked}})}/>{name[0].toUpperCase()+name.slice(1)}</label>)}<button className="library-button" onClick={()=>onChange(normalizeSidebarSections(undefined))}>Restore defaults</button>{status==='saving'&&<p role="status" className="browse-feedback">Saving settings…</p>}{status==='failed'&&<p role="alert" className="browse-feedback">Settings could not be saved.<button onClick={onRetry}>Retry</button></p>}</>}</LibraryPopover>;
}
export function SidebarRecent({ enabled, activeId, onOpen, onDelete, onResources }: { enabled: boolean; activeId?: string; onOpen: (id: string) => void; onDelete: (id: string, event: MouseEvent) => void; onResources: (items: Resource[]) => void }) {
  const notes = useResourcePage({type:'note',sort:'recent',size:6},enabled);
  const files = useResourcePage({type:'file',sort:'recent',size:6},enabled);
  const resources = useMemo(()=>[...notes.data?.items??[],...files.data?.items??[]],[notes.data,files.data]);
  useEffect(()=>{if(enabled)onResources(resources);},[resources,enabled,onResources]);
  return <>{[{label:'Notes',result:notes},{label:'Files',result:files}].map(({label,result})=><section className="sidebar-resource-group" key={label} aria-label={'Recent '+label}><h3>{label}</h3>{result.loading&&<p className="browse-feedback">Loading…</p>}{result.error&&<p role="alert" className="browse-feedback">{result.error}<button onClick={result.retry}>Retry</button></p>}{result.data?.items.map(resource=><SidebarItem key={resource.id} resource={resource} isActive={activeId===resource.id} onClick={()=>onOpen(resource.id)} onDelete={event=>onDelete(resource.id,event)}/>)}</section>)}{!notes.loading&&!files.loading&&!resources.length&&!notes.error&&!files.error&&<p className="browse-feedback">Opened notes and files appear here.</p>}</>;
}
