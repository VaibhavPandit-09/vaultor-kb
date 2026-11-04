import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useDialogPortal } from '../lib/dialogFocus';
import { SidebarVisibility } from '../lib/sidebarVisibility';
import { createPortal } from 'react-dom';
import { useAnchoredPortalPosition } from '../lib/useAnchoredPortalPosition';
import { PopoverPriorityContext, useEscapeLayer } from '../lib/escape/escape';
import { Ellipsis, SlidersHorizontal } from 'lucide-react';

/** Context invocation and the visible trigger share exactly the same action content. */
export default function LibraryPopover({ label, children, trigger, className, priority, zIndex, contextTarget, contextOnly = false }: {
 label: string; trigger?: ReactNode; className?: string; priority?: number; zIndex?: number;
 contextTarget?: string; contextOnly?: boolean; children: (close: () => void) => ReactNode;
}) {
 const available = useContext(SidebarVisibility), inheritedPriority = useContext(PopoverPriorityContext);
 const [requested, setOpen] = useState(false), [point, setPoint] = useState<{x:number;y:number}|null>(null);
 const open = requested && available;
 const anchor = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), source = useRef<HTMLElement|null>(null);
 const dialogDepth = useDialogPortal(panel, open, source);
 const { position } = useAnchoredPortalPosition(open, anchor, { width: 280, align: 'end' });
 const close = () => { setOpen(false); const target=source.current?.isConnected?source.current:anchor.current; target?.focus({preventScroll:true}); };
 useEffect(() => { if (!available) setOpen(false); }, [available]);
 useEscapeLayer({ active: open, priority: priority ?? inheritedPriority, close, restoreFocusOnEscape: false });
 useEffect(() => {
  if (!contextTarget) return;
  const owner=anchor.current?.closest<HTMLElement>(contextTarget); if (!owner) return;
  const invoke=(event:MouseEvent|KeyboardEvent) => {
   if(event.defaultPrevented || (event instanceof KeyboardEvent && !(event.key==='ContextMenu'||(event.key==='F10'&&event.shiftKey)))) return;
   const target=event.target instanceof Element?event.target:null;
   // Text selection/editing keeps platform behavior. Nested rows own their own menus.
   if(!target || target.closest(contextTarget)!==owner || target.closest('input,textarea,select,[contenteditable="true"],a[href]')) return;
   event.preventDefault();event.stopPropagation();
   source.current=target.closest<HTMLElement>('button,[tabindex]')??owner.querySelector<HTMLElement>('button:not(:disabled):not([hidden])')??anchor.current;
   const rect=(source.current??owner).getBoundingClientRect();
   setPoint(event instanceof MouseEvent && (event.clientX||event.clientY)?{x:event.clientX,y:event.clientY}:{x:rect.left,y:rect.bottom});setOpen(true);
  };
  owner.addEventListener('contextmenu',invoke);owner.addEventListener('keydown',invoke);
  return()=>{owner.removeEventListener('contextmenu',invoke);owner.removeEventListener('keydown',invoke);};
 },[contextTarget]);
 useEffect(() => {
  if(!open)return;
  if(contextTarget)panel.current?.querySelectorAll('button').forEach(button=>button.setAttribute('role','menuitem'));
  const frame=requestAnimationFrame(()=>panel.current?.querySelector<HTMLElement>('button:not(:disabled),select,input')?.focus({preventScroll:true}));
  const dismiss=(event:PointerEvent)=>{if(!panel.current?.contains(event.target as Node)&&!anchor.current?.contains(event.target as Node))setOpen(false);};
  const abandon=(event:FocusEvent)=>{if(event.target===window)setOpen(false);};
  document.addEventListener('pointerdown',dismiss);window.addEventListener('blur',abandon);
  return()=>{cancelAnimationFrame(frame);document.removeEventListener('pointerdown',dismiss);window.removeEventListener('blur',abandon);};
 },[open,contextTarget,position]);
 // Context menus use the measured panel height and clamp both axes at viewport edges.
 useEffect(()=>{
  if(!open||!point)return;
  const place=()=>{const node=panel.current;if(!node)return;node.style.left=Math.max(8,Math.min(point.x,window.innerWidth-node.offsetWidth-8))+'px';node.style.top=Math.max(8,Math.min(point.y,window.innerHeight-node.offsetHeight-8))+'px';};
  place();const observer=new ResizeObserver(place);if(panel.current)observer.observe(panel.current);window.addEventListener('resize',place);
  return()=>{observer.disconnect();window.removeEventListener('resize',place);};
 },[open,point,position]);
 // eslint-disable-next-line react-hooks/refs -- close is only called by event handlers in the render prop.
 const content=children(close);
 return <><button ref={anchor} hidden={contextOnly} style={contextOnly?{display:'none'}:undefined} title={label} className={className??'library-button'} aria-label={label} aria-expanded={open} aria-haspopup={contextTarget?'menu':'dialog'} onClick={()=>{source.current=anchor.current;setPoint(null);setOpen(value=>!value);}}>{trigger??<>{label==='More'?<Ellipsis size={16}/>:<SlidersHorizontal size={16}/>}<span className="library-action-label">{label}</span></>}</button>{open&&position&&createPortal(<div ref={panel} onClick={event=>event.stopPropagation()} role={contextTarget?'menu':'dialog'} aria-label={label} className={'library-popover'+(contextTarget?' application-menu':'')} style={{position:'fixed',zIndex:zIndex??(dialogDepth===undefined?85:95+dialogDepth*10),top:point?8:position.top,left:point?8:position.left,width:position.width,maxHeight:point?'calc(100vh - 16px)':position.maxHeight,transform:!point&&position.placement==='top'?'translateY(-100%)':undefined}} onKeyDown={event=>{
  if(!contextTarget)return;
  if(event.key==='Tab'){close();return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];if(!buttons.length)return;
  event.preventDefault();event.stopPropagation();const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();
 }}>{content}</div>,document.body)}</>;
}
