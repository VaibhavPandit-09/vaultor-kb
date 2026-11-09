import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, MoreHorizontal } from 'lucide-react';
import type { Collection } from './client';
export default function CollectionTree({collections,selected,select,manage}:{collections:Collection[];selected:string|null;select:(id:string|null)=>void;manage:(c:Collection)=>void}){
  const [collapsed,setCollapsed]=useState(new Set<string>());
  const children=useMemo(()=>{const map=new Map<string|null,Collection[]>();for(const c of collections)map.set(c.parentId,[...(map.get(c.parentId)??[]),c]);return map;},[collections]);
  const render=(parent:string|null,depth:number):React.ReactNode=>(children.get(parent)??[]).map(c=><div key={c.id}>
    <div className="next-collection-row" style={{paddingLeft:Math.min(depth,8)*12}} onContextMenu={e=>{e.preventDefault();manage(c);}}>
      {children.has(c.id)?<button aria-label={`${collapsed.has(c.id)?'Expand':'Collapse'} ${c.name}`} aria-expanded={!collapsed.has(c.id)} onClick={()=>setCollapsed(old=>{const next=new Set(old);if(next.has(c.id))next.delete(c.id);else next.add(c.id);return next;})}>{collapsed.has(c.id)?<ChevronRight size={13}/>:<ChevronDown size={13}/>}</button>:<span className="next-tree-spacer"/>}
      <button title={c.name} aria-current={selected===c.id?'page':undefined} onClick={()=>select(c.id)}><FolderOpen size={15}/><span>{c.name}</span></button>
      <button aria-label={`Manage ${c.name}`} onClick={()=>manage(c)}><MoreHorizontal size={13}/></button>
    </div>{!collapsed.has(c.id)&&render(c.id,depth+1)}
  </div>);
  return <div className="next-collections">{render(null,0)}</div>;
}
