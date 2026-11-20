import {useId,useRef,type ReactNode} from 'react';
import {GripVertical} from 'lucide-react';
import {usePointerDrag} from '../components/usePointerDrag';
import type {DragPoint} from '../lib/pointerDrag';
import type {Shortcut} from './QuickAccess';

export type ArrangePin=(source:Shortcut,target:Shortcut,after:boolean)=>void;
export type PinArrangement={attributes:{'data-pin-scope':string;'data-pin-key':string};grip:ReactNode};
const key=(item:Shortcut)=>(item.kind==='collection'?'collection:':'resource:')+item.id;

export function usePinArrangement(rows:Shortcut[],arrange?:ArrangePin){
  const scope=useId();
  const indicator=useRef<HTMLElement>(null);
  const clear=()=>{
    if(indicator.current)delete indicator.current.dataset.pinInsertion;
    indicator.current=null;
  };
  const at=(point:DragPoint)=>{
    const node=document.elementFromPoint(point.x,point.y)?.closest<HTMLElement>('[data-pin-key]');
    if(!node||node.dataset.pinScope!==scope)return;
    const row=rows.find(item=>key(item)===node.dataset.pinKey);
    const rect=node.getBoundingClientRect();
    return row?{node,row,after:point.y>rect.top+rect.height/2}:undefined;
  };
  const drag=usePointerDrag<Shortcut>({
    label:item=>item.title,
    move:(from,point)=>{
      const hit=at(point);
      clear();
      const valid=hit&&key(hit.row)!==key(from);
      drag.feedback(valid?'Reorder pinned shortcut':'Choose another pinned shortcut',!valid);
      if(valid){indicator.current=hit.node;hit.node.dataset.pinInsertion=hit.after?'after':'before';}
    },
    drop:(from,point)=>{
      const hit=at(point);
      if(hit&&key(hit.row)!==key(from))arrange?.(from,hit.row,hit.after);
    },
    end:clear,
  },JSON.stringify(rows.map(key)));
  return (item:Shortcut):PinArrangement|undefined=>{
    if(!arrange||rows.length<2)return;
    return {
      attributes:{'data-pin-scope':scope,'data-pin-key':key(item)},
      grip:<button type="button" className="browse-icon-button next-pin-grip" aria-label={'Arrange pinned '+item.title}
        title="Drag to reorder, or press Up or Down"
        onPointerDown={event=>drag.begin(event,item)}
        onKeyDown={event=>{
          if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return;
          event.preventDefault();
          event.stopPropagation();
          const next=event.key==='ArrowDown';
          const target=rows[rows.findIndex(row=>key(row)===key(item))+(next?1:-1)];
          if(target)arrange(item,target,next);
        }}><GripVertical size={14}/></button>,
    };
  };
}
