import type { OrganizationItem } from './organization';
import { createContext, useContext, useState, useMemo, type MouseEvent, type KeyboardEvent } from 'react';
import type { Resource } from '../types';
import { useEscapeLayer } from './escape/escape';
import { getConnection } from './platform';

export type SelectionState = { ids:string[]; anchor:string|null };
export const emptySelection = ():SelectionState=>({ids:[],anchor:null});
/** Ranges follow current displayed order; the selection never crosses a loaded page. */
export function selectResource(state:SelectionState, order:string[], id:string, toggle=false, range=false):SelectionState {
 if(!order.includes(id))return state;
 const start=state.anchor?order.indexOf(state.anchor):-1,end=order.indexOf(id);
 if(range&&start>=0){const span=order.slice(Math.min(start,end),Math.max(start,end)+1);return {ids:[...new Set(toggle?[...state.ids,...span]:span)].slice(0,100),anchor:state.anchor};}
 return {ids:toggle?(state.ids.includes(id)?state.ids.filter(value=>value!==id):[...state.ids,id].slice(0,100)):[id],anchor:id};
}
export function useResourceSelection(items:Resource[], viewKey:string, enabled=true) {
 const key=JSON.stringify([getConnection().epoch,viewKey,enabled]), order=items.map(item=>item.id);
 const [stored,setStored]=useState(()=>({key,...emptySelection()}));
 const retained=stored.key===key?stored.ids.filter(id=>order.includes(id)):[];
 const ids=stored.key===key&&retained.length===stored.ids.length?stored.ids:retained;
 const anchor=stored.key===key&&stored.anchor&&order.includes(stored.anchor)?stored.anchor:null;
 if(stored.key!==key||ids.length!==stored.ids.length||anchor!==stored.anchor)setStored({key,ids,anchor});
 const set=(value:SelectionState)=>setStored({key,...value});
 const clear=()=>set(emptySelection());
 useEscapeLayer({active:enabled&&ids.length>0,priority:150,close:clear,restoreFocusOnEscape:false});
 const pick=(id:string,event:Pick<MouseEvent,'ctrlKey'|'metaKey'|'shiftKey'>,checkbox=false)=>{
  if(!checkbox&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey)return false;
  set(selectResource({ids,anchor},order,id,checkbox||event.ctrlKey||event.metaKey,event.shiftKey));return true;
 };
 const onKeyDown=(event:KeyboardEvent<HTMLElement>)=>{
  if(event.defaultPrevented||event.nativeEvent.isComposing||event.repeat||!event.currentTarget.contains(event.target as Node)||event.target instanceof Element&&event.target.closest('input:not([type="checkbox"]),textarea,select,[contenteditable="true"]'))return;
  if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==='a'){event.preventDefault();event.stopPropagation();set({ids:order.slice(0,100),anchor:order[0]??null});}
 };
 const resources=useMemo(()=>items.filter(item=>ids.includes(item.id)),[items,ids]);
 return {ids,anchor,resources,order,clear,pick,onKeyDown,selectAll:()=>set({ids:order.slice(0,100),anchor:order[0]??null}),remove:(done:string[])=>setStored(previous=>previous.key===key?{...previous,ids:previous.ids.filter(id=>!done.includes(id)),anchor:previous.anchor&&done.includes(previous.anchor)?null:previous.anchor}:previous)};
}
export type ResourceSelection = ReturnType<typeof useResourceSelection>&{collection?:OrganizationItem|null};
export const ResourceSelectionContext=createContext<ResourceSelection|null>(null);
export const useSelection=()=>useContext(ResourceSelectionContext);
