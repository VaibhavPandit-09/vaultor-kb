import { memo, type MouseEvent } from 'react';
import { MoreHorizontal, PanelRight } from 'lucide-react';
import type { Summary } from './client';
import type { PickModifiers } from './selection';
export const ResourceRow = memo(function ResourceRow({ item, selected, opened, focused, busy, activate, pick, focus, open, menu }: { item: Summary; selected: boolean; opened:boolean; focused:boolean; busy:boolean; activate:(id:string,event:PickModifiers)=>void; pick:(id:string,event:PickModifiers,checkbox?:boolean)=>void; focus:(id:string)=>void; open:(id:string,beside?:boolean)=>void; menu:(id:string,event:MouseEvent<HTMLElement>)=>void }) {
  return <div role="row" aria-selected={selected} className="next-resource" data-selected={selected} data-open={opened} data-focused={focused} data-resource-id={item.id} onContextMenu={event => { event.preventDefault();event.stopPropagation(); menu(item.id,event); }}>
    <span role="gridcell" className="next-checkbox-cell"><input data-select-resource={item.id} type="checkbox" tabIndex={-1} aria-label={`Select ${item.title}`} checked={selected} disabled={busy} onChange={event=>pick(item.id,event.nativeEvent as globalThis.MouseEvent,true)}/></span>
    <span role="gridcell" className="next-resource-title"><button data-row-open={item.id} tabIndex={focused?0:-1} onFocus={()=>focus(item.id)} aria-disabled={busy} onClick={event=>activate(item.id,event)}>{item.title}</button></span>
    <span role="gridcell" className="next-row-actions"><button tabIndex={-1} aria-label={`Open ${item.title} beside`} title="Open beside" disabled={busy} onClick={() => open(item.id,true)}><PanelRight size={15}/></button><button tabIndex={-1} aria-label={`Actions for ${item.title}`} disabled={busy} onClick={event=>menu(item.id,event)}><MoreHorizontal size={15}/></button></span>
  </div>;
});
