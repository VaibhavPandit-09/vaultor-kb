import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useDialogPortal } from '../lib/dialogFocus';
import { SidebarVisibility } from '../lib/sidebarVisibility';
import { createPortal } from 'react-dom';
import { useAnchoredPortalPosition } from '../lib/useAnchoredPortalPosition';
import { PopoverPriorityContext, useEscapeLayer } from '../lib/escape/escape';
import { Ellipsis,SlidersHorizontal } from 'lucide-react';
export default function LibraryPopover({label,children,trigger,className,priority,zIndex}:{label:string;trigger?:ReactNode;className?:string;priority?:number;zIndex?:number;children:(close:()=>void)=>ReactNode}) {
 const available=useContext(SidebarVisibility), inheritedPriority=useContext(PopoverPriorityContext);
 const [requested,setOpen]=useState(false);const open=requested&&available;
 useEffect(()=>{if(!available)setOpen(false);},[available]);
 const anchor=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const dialogDepth=useDialogPortal(panel,open,anchor);
 const {position}=useAnchoredPortalPosition(open,anchor,{width:280,align:'end'});
 const close=()=>{setOpen(false);anchor.current?.focus();};
 useEscapeLayer({active:open,priority:priority??inheritedPriority,close,restoreFocusOnEscape:false});
 useEffect(()=>{if(!open)return;const frame=requestAnimationFrame(()=>panel.current?.querySelector<HTMLElement>('button,select,input')?.focus());const dismiss=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node)&&!anchor.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',dismiss);return()=>{cancelAnimationFrame(frame);document.removeEventListener('pointerdown',dismiss);};},[open]);
 // eslint-disable-next-line react-hooks/refs -- render prop receives the close event handler; it never calls it during rendering.
 return <><button ref={anchor} title={label} className={className??"library-button"} aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={()=>setOpen(v=>!v)}>{trigger??<>{label==='More'?<Ellipsis size={16}/>:<SlidersHorizontal size={16}/>}<span className="library-action-label">{label}</span></>}</button>{open&&position&&createPortal(<div ref={panel} onClick={e=>e.stopPropagation()} role="dialog" aria-label={label} className="library-popover" style={{position:'fixed',zIndex:zIndex??(dialogDepth===undefined?85:95+dialogDepth*10),top:position.top,left:position.left,width:position.width,maxHeight:position.maxHeight,transform:position.placement==='top'?'translateY(-100%)':undefined}}>{children(close)}</div>,document.body)}</>;
}

