import type {HTMLAttributes,ReactNode,DragEventHandler} from 'react';
import type {LucideIcon} from 'lucide-react';

/** Original SidebarItem row, without resource/API/drag-controller ownership. */
export default function SidebarShortcutSurface({title,description,icon:Icon,isActive,onClick,draggable=false,onDragStart,onDragEnd,actions,...props}:{title:string;description:string;icon:LucideIcon;isActive?:boolean;onClick:()=>void;actions?:ReactNode;onDragStart?:DragEventHandler<HTMLButtonElement>;onDragEnd?:DragEventHandler<HTMLButtonElement>} & Omit<HTMLAttributes<HTMLDivElement>,'onClick'|'onDragStart'|'onDragEnd'>){
 return <div {...props} className={'sidebar-shortcut group '+(isActive?'sidebar-shortcut-active':'')}><button draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick} title={title+' · '+description} aria-current={isActive?'page':undefined} className="sidebar-shortcut-open"><Icon size={16} aria-hidden="true"/><span>{title}</span></button>{actions}</div>;
}
