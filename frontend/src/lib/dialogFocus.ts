import { createContext, useContext, useLayoutEffect, useMemo, useState,useSyncExternalStore, type KeyboardEvent, type RefObject } from 'react';
import { focusWithoutScroll } from './escape/escape';

type Scope={root:RefObject<HTMLElement|null>;portals:Set<HTMLElement>;depth:number};
export const DialogFocusContext=createContext<Scope|null>(null);
const activeScopes:Scope[]=[];
const scopeListeners=new Set<()=>void>();
const changed=()=>scopeListeners.forEach(listener=>listener());
const portalSources=new WeakMap<HTMLElement,HTMLElement>();
function sourceFor(node:Element|null){
 if(!(node instanceof HTMLElement))return null;
 for(let ancestor:HTMLElement|null=node;ancestor;ancestor=ancestor.parentElement){const source=portalSources.get(ancestor);if(source?.isConnected)return source;}
 return node;
}
const top=()=>activeScopes.filter(scope=>scope.root.current?.isConnected).sort((a,b)=>a.depth-b.depth).at(-1);
/** The single global Activity control explicitly joins the deepest dialog,
 * including its anchored portal, without weakening other modal focus bounds. */
export function useTopDialogScope(){return useSyncExternalStore(listener=>{scopeListeners.add(listener);return()=>scopeListeners.delete(listener);},()=>top()??null);}
const contains=(scope:Scope,node:Node|null)=>Boolean(node&&(scope.root.current?.contains(node)||[...scope.portals].some(portal=>portal.contains(node))));
function controls(root:HTMLElement|null){
 return root?[...root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')].filter(node=>node.tabIndex>=0&&!node.matches(':disabled')&&!node.closest('[hidden],[inert],[aria-hidden="true"],details:not([open]) > :not(summary)')&&node.getClientRects().length):[];
}

function cycleDialogFocus(scope:Scope,event:Pick<KeyboardEvent<HTMLElement>,'key'|'shiftKey'|'defaultPrevented'|'preventDefault'>){
  if(event.key!=='Tab'||event.defaultPrevented||top()!==scope)return;
  const own=controls(scope.root.current),portaled=[...scope.portals].filter(node=>node.isConnected).flatMap(controls);
  const all=[...own,...portaled],current=document.activeElement;
  if(!all.length){event.preventDefault();scope.root.current?.focus();return;}
  let destination:HTMLElement|undefined;
  if(event.shiftKey&&current===all[0])destination=all.at(-1);
  else if(!event.shiftKey&&current===all.at(-1))destination=all[0];
  else if(portaled.length&&!event.shiftKey&&current===own.at(-1))destination=portaled[0];
  else if(portaled.length&&event.shiftKey&&current===portaled[0])destination=own.at(-1);
  if(destination){event.preventDefault();destination.focus({preventScroll:true});}
 };

/** Dialog ownership includes registered portals; only the deepest active scope contains focus. */
export function useDialogFocus(root:RefObject<HTMLElement|null>,restore=true,active=true){
 const parent=useContext(DialogFocusContext);
 // Capture before descendant autoFocus runs during commit, including under Strict Mode.
 const [source]=useState(()=>sourceFor(document.activeElement));
 const scope=useMemo<Scope>(()=>({root,portals:new Set(),depth:(parent?.depth??-1)+1}),[root,parent]);
 useLayoutEffect(()=>{
  const element=root.current;if(!active||!element)return;
  activeScopes.push(scope);
  changed();
  const first=()=>controls(element)[0]??element;
  if(top()===scope&&!contains(scope,document.activeElement))first().focus({preventScroll:true});
  const contain=(event:FocusEvent)=>{if(top()===scope&&event.target instanceof Node&&!contains(scope,event.target))first().focus({preventScroll:true});};
  document.addEventListener('focusin',contain);
  const portalKeys=(event:globalThis.KeyboardEvent)=>{if(event.target instanceof Node&&!element.contains(event.target)&&contains(scope,event.target))cycleDialogFocus(scope,event);};
  document.addEventListener('keydown',portalKeys);
  return()=>{
   document.removeEventListener('keydown',portalKeys);document.removeEventListener('focusin',contain);const index=activeScopes.indexOf(scope);if(index>=0)activeScopes.splice(index,1);changed();
   queueMicrotask(()=>{
    if(!restore||element.isConnected||!source?.isConnected)return;
    // A caller may already have handed focus to another dialog or source view.
    if(document.activeElement!==document.body&&!contains(scope,document.activeElement))return;
    focusWithoutScroll(source);
   });
  };
 },[root,scope,source,restore,active]);
 const onKeyDown=(event:KeyboardEvent<HTMLElement>)=>cycleDialogFocus(scope,event);
 return {scope,onKeyDown};
}

export function useDialogPortal(root:RefObject<HTMLElement|null>,active:boolean,returnFocus?:RefObject<HTMLElement|null>){
 const scope=useContext(DialogFocusContext);
 useLayoutEffect(()=>{const node=root.current,source=returnFocus?.current;if(!active||!node)return;if(source)portalSources.set(node,source);scope?.portals.add(node);return()=>{scope?.portals.delete(node);portalSources.delete(node);};});
 return scope?.depth;
}
