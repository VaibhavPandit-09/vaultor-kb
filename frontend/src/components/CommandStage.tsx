import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { enterCommandStage } from '../lib/motion';

/** Only body bounds change; the query, native Tab order and shell stay mounted. */
export default function CommandStage({ stage, depth, pending=false, children }: { stage:string; depth:number; pending?:boolean; children:ReactNode }) {
 const viewport=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null);
 const previous=useRef({stage,depth});
 useLayoutEffect(()=>{
  const node=content.current,root=viewport.current;if(!node||!root)return;
  const measure=()=>{if(pending)return;root.style.setProperty('--palette-body-height',`${Math.max(96,node.scrollHeight)}px`);};
  measure();const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(measure);observer?.observe(node);
  return()=>observer?.disconnect();
 },[children,pending]);
 useLayoutEffect(()=>{
  const node=content.current,root=viewport.current;if(!node||!root)return;
  const old=previous.current;previous.current={stage,depth};
  if(old.stage===stage)return;
  root.scrollTop=0;
  const animation=enterCommandStage(node,depth<old.depth?-1:1);
  return()=>animation?.cancel();
 },[stage,depth]);
 return <div ref={viewport} className="palette-stage" data-stage={stage}><div ref={content} className="palette-stage-content">{children}</div></div>;
}
