import SidebarShortcutSurface from './SidebarShortcutSurface';
import type { OrganizationItem } from '../lib/organization';
import { canDragResource, useDesktopInteraction, useDropTarget } from '../lib/desktopInteraction';
import type React from 'react';
import { Trash2, type LucideIcon } from 'lucide-react';
import type { Resource } from '../types';
import { resourceDescription, resourcePresentation } from '../lib/resourceKinds';
import ResourceActions from './ResourceActions';

export function SidebarShortcut({title,description,icon:Icon,isActive=false,onClick,onDelete,resource,actions,collection}:{title:string;description:string;icon:LucideIcon;isActive?:boolean;onClick:()=>void;onDelete?:(event:React.MouseEvent)=>void;resource?:Resource;actions?:React.ReactNode;collection?:OrganizationItem}) {
 const drag=useDesktopInteraction(),drop=useDropTarget(collection?{kind:'collection',collection}:resource?{kind:'resource',resource}:null);
 return <SidebarShortcutSurface {...drop} title={title} description={description} icon={Icon} isActive={isActive} onClick={onClick} draggable={Boolean(resource?canDragResource(resource):collection)} onDragStart={event=>{if(resource)drag?.start(event,{kind:'resources',resources:[resource]});else if(collection)drag?.start(event,{kind:'collection',collection});}} onDragEnd={()=>drag?.cancel()} actions={<>{actions}{resource?<div className="browse-row-actions"><ResourceActions resource={resource}/></div>:onDelete&&<button aria-label={'Move '+title+' to Trash'} onClick={onDelete} className="sidebar-shortcut-delete"><Trash2 size={12}/></button>}</>}/>;
}
export default function SidebarItem({ resource, isActive, onClick, onDelete }: { resource: Resource; isActive: boolean; onClick: () => void; onDelete: (event: React.MouseEvent) => void }) {
 return <SidebarShortcut resource={resource} title={resource.title} description={resourceDescription(resource)} icon={resourcePresentation(resource).icon} isActive={isActive} onClick={onClick} onDelete={onDelete}/>;
}
