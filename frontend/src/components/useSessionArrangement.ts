import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent} from 'react';
import {useEscapeLayer} from '../lib/escape/escape';
const clear=()=>document.querySelectorAll<HTMLElement>('[data-next-session-drop]').forEach(e=>delete e.dataset.nextSessionDrop);
/** WebView2 native file drops consume HTML drag events. Session movement uses pointer identity. */
export function useSessionArrangement({onReorder,onArrange}:{onReorder?:(id:string,before:string|null)=>void;onArrange?:(id:string,target:string)=>void}){
 const latest=useRef({onReorder,onArrange});useLayoutEffect(()=>{latest.current={onReorder,onArrange};},[onReorder,onArrange]);
 const drag=useRef<{id:string;x:number;y:number;started:boolean}|undefined>(undefined),[active,setActive]=useState(false);
 const cancel=()=>{drag.current=undefined;clear();setActive(false);};
 useEscapeLayer({active,priority:450,close:cancel,restoreFocusOnEscape:false});
 useEffect(()=>{if(!active)return;
  const target=(event:globalThis.PointerEvent)=>document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-session-id],[data-session-pane],[data-session-end]');
  const move=(event:globalThis.PointerEvent)=>{const current=drag.current;if(!current)return;if(!current.started&&Math.hypot(event.clientX-current.x,event.clientY-current.y)<5)return;current.started=true;event.preventDefault();clear();const hit=target(event);if(hit)hit.dataset.nextSessionDrop=hit.dataset.sessionPane?'swap':'before';};
  const up=(event:globalThis.PointerEvent)=>{const current=drag.current,hit=target(event);cancel();if(!current?.started||!hit)return;event.preventDefault();if(hit.dataset.sessionPane)latest.current.onArrange?.(current.id,hit.dataset.sessionPane);else latest.current.onReorder?.(current.id,hit.dataset.sessionId??null);};
  document.addEventListener('pointermove',move,{capture:true,passive:false});document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',cancel,true);window.addEventListener('blur',cancel);
  return()=>{clear();document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',cancel,true);window.removeEventListener('blur',cancel);};
 },[active]);
 return (id:string,event:PointerEvent<HTMLElement>)=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();drag.current={id,x:event.clientX,y:event.clientY,started:false};setActive(true);event.currentTarget.setPointerCapture?.(event.pointerId);};
}
