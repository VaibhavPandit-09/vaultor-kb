import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ESCAPE_PRIORITIES, PopoverPriorityContext } from '../lib/escape/escape';
import { getGlassPanelStyle, getOverlayStyle } from '../lib/transparency';

/** The viewer keeps this ancestor chain when its bounds change. Never scale media. */
export default function PreviewShell({mode,transparency,label,resourceId,onClose,children,loading=false}:{
 mode:'side'|'modal';transparency:number;label:string;resourceId?:string;onClose:()=>void;children:ReactNode;loading?:boolean;
}) {
 const shell=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const root=shell.current;
  if(mode==='modal'&&root&&!root.contains(document.activeElement)) root.querySelector<HTMLElement>('button')?.focus({preventScroll:true});
 },[mode]);
 useEffect(()=>{
  const root=shell.current;if(!root)return;
  let pointer=false,held=false,frame=0;
  const resume=()=>{
   pointer=false;cancelAnimationFrame(frame);
   frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
    if(pointer||root.querySelector('[aria-haspopup][aria-expanded="true"]'))return;
    for(const property of ['left','top','width','height','border-radius','transition'])root.style.removeProperty(property);
    held=false;
   });});
  };
  const hold=()=>{
   pointer=true;cancelAnimationFrame(frame);if(held)return;
   const bounds=root.getBoundingClientRect(),radius=getComputedStyle(root).borderRadius;
   Object.assign(root.style,{left:`${bounds.left}px`,top:`${bounds.top}px`,width:`${bounds.width}px`,height:`${bounds.height}px`,borderRadius:radius,transition:'none'});held=true;
  };
  const observer=new MutationObserver(()=>{if(held&&!pointer)resume();});
  observer.observe(root,{subtree:true,attributes:true,attributeFilter:['aria-expanded']});
  root.addEventListener('pointerdown',hold,true);document.addEventListener('pointerup',resume,true);document.addEventListener('pointercancel',resume,true);window.addEventListener('blur',resume);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();root.removeEventListener('pointerdown',hold,true);document.removeEventListener('pointerup',resume,true);document.removeEventListener('pointercancel',resume,true);window.removeEventListener('blur',resume);};
 },[]);
 return <div className="preview-geometry" data-mode={mode} data-loading={loading}>
  <div className="preview-backdrop" aria-hidden="true" style={getOverlayStyle(transparency,.28)} onClick={()=>{if(mode==='modal')onClose();}}/>
  <div ref={shell} data-preview-resource={resourceId} data-motion-surface="geometry" data-motion-key="file-preview"
   role={mode==='modal'?'dialog':'region'} aria-modal={mode==='modal'?true:undefined} aria-label={label} className="preview-shell" style={getGlassPanelStyle(transparency,18)}
   onKeyDown={event=>{
    if(mode!=='modal'||event.key!=='Tab'||!shell.current?.contains(event.target as Node))return;
    const controls=[...shell.current.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,iframe,[tabindex="0"]')].filter(node=>!node.closest('[inert],[hidden]')&&node.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }}><PopoverPriorityContext value={ESCAPE_PRIORITIES.preview+1}>{children}</PopoverPriorityContext></div>
 </div>;
}
