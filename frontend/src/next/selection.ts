import { useCallback, useMemo, useState } from 'react';
export type PageSelection = { ids: string[]; anchor: string | null; focus: string | null };
export type PickModifiers = { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
export const emptyPageSelection = (): PageSelection => ({ ids: [], anchor: null, focus: null });
export function retainSelection(state: PageSelection, order: string[]): PageSelection {
  return { ids: state.ids.filter(id => order.includes(id)), anchor: state.anchor && order.includes(state.anchor) ? state.anchor : null, focus: state.focus && order.includes(state.focus) ? state.focus : order[0] ?? null };
}
export function pickResource(state: PageSelection, order: string[], id: string, modifiers: PickModifiers, checkbox = false): PageSelection {
  state = retainSelection(state,order);
  if (!order.includes(id)) return state;
  const additive = !!(modifiers.ctrlKey || modifiers.metaKey || checkbox);
  if (modifiers.shiftKey) {
    const anchor = state.anchor ?? state.focus ?? id;
    const a = order.indexOf(anchor), b = order.indexOf(id);
    const span = order.slice(Math.min(a,b),Math.max(a,b)+1);
    return { ids: additive ? [...new Set([...state.ids,...span])] : span, anchor, focus: id };
  }
  return { ids: additive ? state.ids.includes(id) ? state.ids.filter(value=>value!==id) : [...state.ids,id] : [], anchor: id, focus: id };
}
export function moveFocus(state: PageSelection, order: string[], direction: number, modifiers: PickModifiers): PageSelection {
  state = retainSelection(state,order); if (!order.length) return state;
  const index = Math.max(0,order.indexOf(state.focus ?? order[0]));
  const target = order[Math.max(0,Math.min(order.length-1,index+direction))];
  return modifiers.shiftKey ? pickResource({...state,anchor:state.anchor??state.focus},order,target,modifiers) : {...state,focus:target};
}
export function contextSelection(state: PageSelection, order: string[], id: string): PageSelection {
  state = retainSelection(state,order);
  return state.ids.includes(id) ? {...state,focus:id} : {ids:order.includes(id)?[id]:[],anchor:id,focus:id};
}
export function listShortcutTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !target.closest('textarea,select,input:not([type=checkbox]),[contenteditable=true],[role=dialog],[role=menu]') && !!target.closest('[data-row-open],[data-select-resource],[data-list-focus]');
}
export function usePageSelection(scope: string, ids: string[]) {
  const order=useMemo(()=>ids,[ids]);
  const [stored,setStored]=useState({scope,state:emptyPageSelection()});
  const state=useMemo(()=>retainSelection(stored.scope===scope?stored.state:emptyPageSelection(),order),[stored,scope,order]);
  if(stored.scope!==scope || JSON.stringify(state)!==JSON.stringify(stored.state))setStored({scope,state});
  const apply=useCallback((action:(state:PageSelection)=>PageSelection)=>setStored(old=>({scope,state:action(retainSelection(old.scope===scope?old.state:emptyPageSelection(),order))})),[scope,order]);
  const clear=useCallback(()=>apply(s=>({...s,ids:[],anchor:null})),[apply]);
  const pick=useCallback((id:string,modifiers:PickModifiers,checkbox=false)=>apply(s=>pickResource(s,order,id,modifiers,checkbox)),[apply,order]);
  const focus=useCallback((id:string)=>apply(s=>({...s,focus:id})),[apply]);
  const move=useCallback((direction:number,modifiers:PickModifiers)=>apply(s=>moveFocus(s,order,direction,modifiers)),[apply,order]);
  const all=useCallback(()=>apply(s=>({...s,ids:order,anchor:order[0]??null})),[apply,order]);
  const context=useCallback((id:string)=>apply(s=>contextSelection(s,order,id)),[apply,order]);
  return useMemo(()=>({state,clear,pick,focus,move,all,context}),[state,clear,pick,focus,move,all,context]);
}
