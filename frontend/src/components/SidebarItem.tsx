import type React from 'react';
import { Trash2, type LucideIcon } from 'lucide-react';
import type { Resource } from '../types';
import { resourceKind, resourceDescription } from '../lib/resourceKinds';

export function SidebarShortcut({title,description,icon:Icon,isActive=false,onClick,onDelete}:{title:string;description:string;icon:LucideIcon;isActive?:boolean;onClick:()=>void;onDelete?:(event:React.MouseEvent)=>void}) {
 return <div className={'sidebar-shortcut group '+(isActive?'sidebar-shortcut-active':'')}>
  <button onClick={onClick} title={title+' · '+description} aria-current={isActive?'page':undefined} className="sidebar-shortcut-open"><Icon size={16} aria-hidden="true"/><span>{title}</span></button>
  {onDelete&&<button aria-label={'Delete '+title} onClick={onDelete} className="sidebar-shortcut-delete"><Trash2 size={12}/></button>}
 </div>;
}
export default function SidebarItem({ resource, isActive, onClick, onDelete }: { resource: Resource; isActive: boolean; onClick: () => void; onDelete: (event: React.MouseEvent) => void }) {
 return <SidebarShortcut title={resource.title} description={resourceDescription(resource)} icon={resourceKind(resource.type).icon} isActive={isActive} onClick={onClick} onDelete={onDelete}/>;
}
