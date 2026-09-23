import { Folder } from 'lucide-react';
import { useOrganizationPage, type OrganizationItem } from '../lib/organization';
export default function CollectionShortcuts({onOpen}:{onOpen:(item:OrganizationItem)=>void}) {
 const result=useOrganizationPage('collection','',0,true,true,12);
 return <><p className="sidebar-section-label">Collections</p>{result.loading?<p className="px-4 text-xs opacity-60">Loading…</p>:!result.data?.items.length?<p className="px-4 py-2 text-xs text-[var(--text-tertiary)]">Create and star collections in Library.</p>:result.data.items.map(item=><button key={item.id} className="sidebar-nav" onClick={()=>onOpen(item)} title={item.name}><Folder size={15}/><span className="truncate">{item.name}</span><small className="ml-auto">{item.count}</small></button>)}{result.error && <button className="sidebar-nav text-xs" onClick={result.retry}>Could not refresh collections · Retry</button>}</>;
}
