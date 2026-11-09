import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MenuAction, MenuSeparator } from '../components/MenuAction';
import { useEscapeLayer, ESCAPE_PRIORITIES } from '../lib/escape/escape';
import { useDialogPortal } from '../lib/dialogFocus';
import type { LucideIcon } from 'lucide-react';
export type ContextAction = { label: string; run: () => void; disabled?: boolean; icon?: LucideIcon; separator?: boolean; hint?: string };
export type ContextRequest = { x: number; y: number; source: HTMLElement; scope: string; label: string; actions: ContextAction[] };
export default function ContextMenu({ request, dismiss }: { request: ContextRequest; dismiss: () => void }) {
  const panel=useRef<HTMLDivElement>(null),source=useRef<HTMLElement|null>(request.source);
  useDialogPortal(panel,true,source);
  const close=(restore=true)=>{dismiss();if(restore){const target=request.source.isConnected?request.source:document.querySelector<HTMLElement>('[data-list-focus]');target?.focus({preventScroll:true});}};
  useEscapeLayer({active:true,priority:ESCAPE_PRIORITIES.popover,close:()=>close(),restoreFocusOnEscape:false});
  useLayoutEffect(()=>{
    const node=panel.current;if(!node)return;
    const place=()=>{node.style.left=Math.max(8,Math.min(request.x,innerWidth-node.offsetWidth-8))+'px';node.style.top=Math.max(8,Math.min(request.y,innerHeight-node.offsetHeight-8))+'px';};
    place();node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
    const observer=new ResizeObserver(place);observer.observe(node);window.addEventListener('resize',place);
    return()=>{observer.disconnect();window.removeEventListener('resize',place);};
  },[request]);
  useEffect(()=>{
    const outside=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node))dismiss();};
    const scroll=(e:Event)=>{if(!panel.current?.contains(e.target as Node))dismiss();};
    const blur=()=>dismiss();
    document.addEventListener('pointerdown',outside);document.addEventListener('scroll',scroll,true);window.addEventListener('blur',blur);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('scroll',scroll,true);window.removeEventListener('blur',blur);};
  },[dismiss]);
  return createPortal(<div ref={panel} role="menu" aria-label={request.label} className="library-popover application-menu next-context-menu" style={{position:'fixed',left:request.x,top:request.y,zIndex:85,width:280,maxHeight:'calc(100vh - 16px)'}} onKeyDown={event=>{
    if(event.key==='Tab'){close();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();
  }}>{request.actions.map((action,index)=><div key={action.label}>{action.separator&&index>0&&<MenuSeparator/>}<MenuAction role="menuitem" disabled={action.disabled} icon={action.icon} hint={action.hint} onClick={()=>{close();action.run();}}>{action.label}</MenuAction></div>)}</div>,document.body);
}
