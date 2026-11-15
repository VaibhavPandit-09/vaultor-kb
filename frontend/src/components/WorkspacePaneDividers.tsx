import {useEffect,useRef,useState} from 'react';
import {frameResizeObserver} from '../lib/frameResizeObserver';
import {sideBySideCapacity} from '../lib/paneCapacity';
import {movePaneBoundary} from '../lib/paneSizing';
import {capturePaneReadingAnchors} from '../lib/paneReadingAnchor';

function applyWeights(host:HTMLElement,value:number[],width=host.clientWidth){
 value.forEach((weight,i)=>host.style.setProperty('--pane-weight-'+i,String(weight)));
 host.querySelectorAll<HTMLElement>('[data-pane-boundary]').forEach((handle,i)=>{handle.style.left=(32+16*i+(width-32-16*value.length)*value.slice(0,i+1).reduce((a,b)=>a+b,0))+'px';});
}

/** Bounded sibling boundaries over the original allocation slots. */
export default function WorkspacePaneDividers({ids,weights,change}:{ids:string[];weights:number[];change:(weights:number[])=>void}){
 const root=useRef<HTMLDivElement>(null),[width,setWidth]=useState(0),frame=useRef(0);
 const drag=useRef<{index:number;x:number;width:number;initial:number[];value:number[];restore:ReturnType<typeof capturePaneReadingAnchors>}|null>(null);
 const available=Math.max(1,width-32-16*ids.length),key=JSON.stringify(ids);
 const write=(value:number[])=>{
  const host=root.current?.parentElement;if(!host)return;
  applyWeights(host,value,width);
 };
 const finish=(commit:boolean)=>{
  const current=drag.current;if(!current)return;drag.current=null;
  write(commit?current.value:current.initial);delete root.current?.parentElement?.dataset.resizing;
  if(commit)change(current.value);cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>current.restore());
 };
 useEffect(()=>{
  const host=root.current?.parentElement;if(!host)return;
  const cancel=()=>{const current=drag.current;if(!current)return;drag.current=null;cancelAnimationFrame(frame.current);applyWeights(host,current.initial);delete host.dataset.resizing;current.restore();};
  const measure=()=>{if(drag.current&&Math.abs(host.clientWidth-32-16*ids.length-drag.current.width)>1)cancel();setWidth(host.clientWidth);};measure();const observer=frameResizeObserver(measure);observer.observe(host);window.addEventListener('blur',cancel);
  return()=>{observer.disconnect();window.removeEventListener('blur',cancel);cancelAnimationFrame(frame.current);delete host.dataset.resizing;drag.current=null;};
 },[key,ids.length]);
 if(ids.length<2||sideBySideCapacity(width)<ids.length)return <div ref={root} className="workspace-pane-dividers"/>;
 return <div ref={root} className="workspace-pane-dividers">{weights.slice(0,-1).map((_,index)=>{
  const position=weights.slice(0,index+1).reduce((a,b)=>a+b,0);
  return <div key={ids[index]+'-'+ids[index+1]} role="separator" tabIndex={0} aria-orientation="vertical" aria-label={`Resize panes ${index+1} and ${index+2}`} aria-valuenow={Math.round(position*100)} aria-valuemin={Math.round(movePaneBoundary(weights,index,-1,available).slice(0,index+1).reduce((a,b)=>a+b,0)*100)} aria-valuemax={Math.round(movePaneBoundary(weights,index,1,available).slice(0,index+1).reduce((a,b)=>a+b,0)*100)} data-pane-boundary={index} className="workspace-pane-divider" style={{left:32+16*index+available*position}} title="Drag to resize · Left/Right to adjust · Escape to cancel"
   onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(false);return;}if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();change(movePaneBoundary(weights,index,event.key==='Home'?-1:event.key==='End'?1:event.key==='ArrowLeft'?-.02:.02,available));}}
   onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);root.current!.parentElement!.dataset.resizing='true';drag.current={index,x:event.clientX,width:available,initial:weights,value:weights,restore:capturePaneReadingAnchors(root.current!.parentElement!)};}}
   onPointerMove={event=>{const current=drag.current;if(!current)return;current.value=movePaneBoundary(current.initial,current.index,(event.clientX-current.x)/current.width,current.width);write(current.value);cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>current.restore());}}
   onPointerUp={event=>{finish(true);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
   onPointerCancel={()=>finish(false)} onLostPointerCapture={()=>finish(false)}/>;
 })}</div>;
}
