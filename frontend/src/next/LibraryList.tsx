import { memo, type MouseEvent } from 'react';
import { MoreHorizontal, PanelRight, FileText } from 'lucide-react';
import type { Summary } from './client';
import type { PickModifiers } from './selection';
export const ResourceRow = memo(function ResourceRow({ item, selected, opened, focused, activate, pick, focus, open, menu }: { item: Summary; selected: boolean; opened:boolean; focused:boolean; activate:(id:string,event:PickModifiers)=>void; pick:(id:string,event:PickModifiers,checkbox?:boolean)=>void; focus:(id:string)=>void; open:(id:string,beside?:boolean)=>void; menu:(id:string,event:MouseEvent<HTMLElement>)=>void }) {
  return <div role="row" aria-selected={selected} className="next-resource" data-selected={selected} data-open={opened} data-focused={focused} data-resource-id={item.id} onContextMenu={event => { event.preventDefault();event.stopPropagation(); menu(item.id,event); }}>
    <span role="gridcell" className="next-checkbox-cell"><input data-select-resource={item.id} type="checkbox" tabIndex={-1} aria-label={`Select ${item.title}`} checked={selected} onChange={event=>pick(item.id,event.nativeEvent as globalThis.MouseEvent,true)}/></span>
    <span role="gridcell" className="next-resource-title"><button data-row-open={item.id} tabIndex={focused?0:-1} onFocus={()=>focus(item.id)} onClick={event=>activate(item.id,event)}><FileText size={17}/><span>{item.title}</span></button></span>
    <span role="gridcell" className="next-resource-meta">{item.updatedAt.slice(0,10)} · {item.kind==='file'?'File':'Note'}</span>
    <span role="gridcell" className="next-row-actions"><button tabIndex={-1} aria-label={`Open ${item.title} beside`} title="Open beside" onClick={() => open(item.id,true)}><PanelRight size={15}/></button><button tabIndex={-1} aria-label={`Actions for ${item.title}`} onClick={event=>menu(item.id,event)}><MoreHorizontal size={15}/></button></span>
  </div>;
});
