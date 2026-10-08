import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { enterSurface } from '../lib/motion';
/** Geometry-only marker: controls keep their own native focus and selection semantics. */
export function MotionIndicator({ value = '', axis = 'vertical', selector = '[aria-current], [aria-checked="true"], [aria-selected="true"]' }: { value?: string; axis?: 'vertical' | 'horizontal'; selector?: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = marker.current, parent = element?.parentElement; if (!element || !parent) return;
    const measure = () => { const selected=parent.querySelector<HTMLElement>(selector); if(!selected){element.style.opacity='0';return;}const root=parent.getBoundingClientRect(),bounds=selected.getBoundingClientRect();Object.assign(element.style,{opacity:'1',transform:`translate(${axis==='horizontal'?bounds.left-root.left+parent.scrollLeft:0}px,${axis==='horizontal'?bounds.bottom-root.top+parent.scrollTop-3:bounds.top-root.top+parent.scrollTop}px)`,width:axis==='horizontal'?bounds.width+'px':'3px',height:axis==='horizontal'?'3px':bounds.height+'px'}); };
    const mutations=new MutationObserver(measure);mutations.observe(parent,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-current','aria-selected','aria-checked']});
    measure();const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(measure);observer?.observe(parent);return()=>{observer?.disconnect();mutations.disconnect();};
  },[value,selector,axis]);
  return <span ref={marker} aria-hidden="true" className="motion-selection-marker" />;
}
export function MotionComparison() {
  const [step,setStep]=useState(0),snappy=useRef<HTMLDivElement>(null),smooth=useRef<HTMLDivElement>(null);
  // Preview is explicitly triggered, never a decorative loop or persisted preference change.
  const play=()=>{setStep(value=>value+1);for(const [ref,duration] of [[snappy,80],[smooth,280]] as const){const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;if(ref.current?.animate&&!reduced)ref.current.animate([{translate:'0 0',background:'var(--surface-3)'},{translate:'0 -2px',background:'color-mix(in srgb,var(--accent) 20%,var(--surface-3))',offset:.7},{translate:'0 0',background:'var(--surface-3)'}],{duration,easing:'cubic-bezier(.2,.7,.2,1)'});}};
  return <div className="motion-comparison"><div ref={snappy}><span>Snappy</span><small>Immediate</small></div><div ref={smooth}><span>Smooth</span><small>Flowing</small></div><button type="button" onClick={play} aria-label="Preview Snappy and Smooth motion">Try it{step>0&&<span className="sr-only"> again</span>}</button></div>;
}
export function CategoryMotion({ children, category }: { children: ReactNode; category: string }) {
 const element=useRef<HTMLDivElement>(null);useLayoutEffect(()=>{if(element.current){const animation=enterSurface(element.current,'category');return()=>animation?.cancel();}},[category]);return <div ref={element}>{children}</div>;
}
