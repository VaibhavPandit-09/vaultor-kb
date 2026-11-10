import { useMemo, useState, type DragEvent,type MouseEvent, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, MoreHorizontal } from 'lucide-react';
import type { Collection } from './client';
export default function CollectionTree({collections,selected,select,menu,drop}:{drop?:(id:string,event:DragEvent<HTMLElement>)=>void;collections:Collection[];selected:string|null;select:(id:string|null)=>void;menu:(c:Collection,e:MouseEvent<HTMLElement>|KeyboardEvent<HTMLElement>)=>void}){
  const [collapsed,setCollapsed]=useState(new Set<string>());
  const children=useMemo(()=>{const map=new Map<string|null,Collection[]>();for(const c of collections)map.set(c.parentId,[...(map.get(c.parentId)??[]),c]);return map;},[collections]);
  const render=(parent:string|null,depth:number):React.ReactNode=>(children.get(parent)??[]).map(c=><div key={c.id}>
    <div className="next-collection-row" data-collection-id={c.id} onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-vaultor-resources')){event.preventDefault();event.dataTransfer.dropEffect=event.shiftKey?'move':'copy';event.currentTarget.dataset.drop='true';}}} onDragLeave={event=>{delete event.currentTarget.dataset.drop;}} onDrop={event=>{delete event.currentTarget.dataset.drop;drop?.(c.id,event);}} style={{paddingLeft:Math.min(depth,8)*12}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();menu(c,e);}} onKeyDown={e=>{
      if(e.key==='ContextMenu'||(e.key==='F10'&&e.shiftKey)){e.preventDefault();e.stopPropagation();menu(c,e);return;}
      if(e.target instanceof HTMLButtonElement&&e.target.dataset.collectionOpen&&['ArrowDown','ArrowUp','Home','End','ArrowLeft','ArrowRight'].includes(e.key)){
        e.preventDefault();const rows=[...e.currentTarget.closest('.next-collections')!.querySelectorAll<HTMLButtonElement>('[data-collection-open]')].filter(row=>!row.closest('[inert]')),index=rows.indexOf(e.target);
        if(e.key==='ArrowLeft'||e.key==='ArrowRight'){if(children.has(c.id))setCollapsed(old=>{const next=new Set(old);if(e.key==='ArrowLeft')next.add(c.id);else next.delete(c.id);return next;});return;}
        const next=e.key==='Home'?0:e.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,index+(e.key==='ArrowDown'?1:-1)));rows[next]?.focus();
      }
    }}>
      {children.has(c.id)?<button aria-label={`${collapsed.has(c.id)?'Expand':'Collapse'} ${c.name}`} aria-expanded={!collapsed.has(c.id)} onClick={()=>setCollapsed(old=>{const next=new Set(old);if(next.has(c.id))next.delete(c.id);else next.add(c.id);return next;})}>{collapsed.has(c.id)?<ChevronRight size={13}/>:<ChevronDown size={13}/>}</button>:<span className="next-tree-spacer"/>}
      <button data-collection-open={c.id} title={c.name} aria-current={selected===c.id?'page':undefined} onClick={()=>select(c.id)}><FolderOpen size={15}/><span>{c.name}</span></button>
      <button aria-label={`Actions for collection ${c.name}`} onClick={e=>menu(c,e)}><MoreHorizontal size={13}/></button>
    </div><div className="next-tree-branch" data-collapsed={collapsed.has(c.id)} inert={collapsed.has(c.id)}><div>{render(c.id,depth+1)}</div></div>
  </div>);
  return <div className="next-collections">{render(null,0)}</div>;
}
