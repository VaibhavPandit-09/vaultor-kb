import type {LucideIcon} from 'lucide-react';
/** Original inline resource control without metadata or navigation authority. */
export default function ResourceLinkChip({label,description,action,icon:Icon,onOpen}:{label:string;description:string;action:string;icon:LucideIcon;onOpen:(beside:boolean)=>void}){
 return <button type="button" aria-label={`Open ${description} · ${label||'resource'}`} className="resource-link-chip" title={action} onClick={event=>{event.preventDefault();event.stopPropagation();onOpen(event.ctrlKey||event.metaKey);}}><Icon size={14} aria-hidden="true"/><span>{label||'Resource'}</span></button>;
}
