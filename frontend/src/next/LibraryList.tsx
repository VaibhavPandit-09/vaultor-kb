import { memo } from 'react';
import { MoreHorizontal, PanelRight } from 'lucide-react';
import type { Summary } from './client';
export const ResourceRow = memo(function ResourceRow({ item, selected, open, organize }: { item: Summary; selected: boolean; open: (id: string, beside?: boolean) => void; organize: (id: string) => void }) {
  return <div className="next-resource" data-selected={selected} data-resource-id={item.id} onContextMenu={event => { event.preventDefault(); organize(item.id); }}>
    <button onClick={() => open(item.id)}>{item.title}</button>
    <button aria-label={`Open ${item.title} beside`} title="Open beside" onClick={() => open(item.id,true)}><PanelRight size={15}/></button>
    <button aria-label={`Organize ${item.title}`} onClick={() => organize(item.id)}><MoreHorizontal size={15}/></button>
  </div>;
});
