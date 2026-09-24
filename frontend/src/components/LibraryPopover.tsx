import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPortalPosition } from '../lib/useAnchoredPortalPosition';
import { ESCAPE_PRIORITIES, useEscapeLayer } from '../lib/escape/escape';
export default function LibraryPopover({label,children}:{label:string;children:(close:()=>void)=>ReactNode}) {
 const [open,setOpen]=useState(false);const anchor=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const {position}=useAnchoredPortalPosition(open,anchor,{width:280,align:'end'});
 const close=()=>{setOpen(false);anchor.current?.focus();};
 useEscapeLayer({active:open,priority:ESCAPE_PRIORITIES.popover,close,restoreFocusOnEscape:false});
 useEffect(()=>{if(!open)return;const frame=requestAnimationFrame(()=>panel.current?.querySelector<HTMLElement>('button,select,input')?.focus());const dismiss=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node)&&!anchor.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',dismiss);return()=>{cancelAnimationFrame(frame);document.removeEventListener('pointerdown',dismiss);};},[open]);
 // eslint-disable-next-line react-hooks/refs -- render prop receives the close event handler; it never calls it during rendering.
 return <><button ref={anchor} className="library-button" aria-expanded={open} aria-haspopup="dialog" onClick={()=>setOpen(v=>!v)}>{label}</button>{open&&position&&createPortal(<div ref={panel} role="dialog" aria-label={label} className="library-popover" style={{position:'fixed',zIndex:85,top:position.top,left:position.left,width:position.width,maxHeight:position.maxHeight,transform:position.placement==='top'?'translateY(-100%)':undefined}}>{children(close)}</div>,document.body)}</>;
}

