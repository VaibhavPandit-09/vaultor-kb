import {useRef,useState} from 'react';
import {useEscapeLayer} from '../lib/escape/escape';
export default function SidebarResizeHandle({width,save}:{width:number;save:(width:number)=>void}){
 const origin=useRef<{x:number;width:number}|undefined>(undefined),latest=useRef(width);const [active,setActive]=useState(false);
 const apply=(next:number)=>{latest.current=Math.max(240,Math.min(400,Math.round(next)));document.querySelector<HTMLElement>('.next-shell')?.style.setProperty('--next-sidebar-width',latest.current+'px');};
 const cancel=()=>{if(origin.current)apply(origin.current.width);origin.current=undefined;setActive(false);};
 useEscapeLayer({active,priority:450,close:cancel,restoreFocusOnEscape:false});
 return <div data-sidebar-resizer className="next-sidebar-resizer" role="separator" aria-label="Resize sidebar" aria-orientation="vertical" aria-valuemin={240} aria-valuemax={400} aria-valuenow={width} tabIndex={0} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();save(e.key==='Home'?240:e.key==='End'?400:Math.max(240,Math.min(400,width+(e.key==='ArrowRight'?4:-4))));}} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();origin.current={x:e.clientX,width};latest.current=width;setActive(true);e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(origin.current)apply(origin.current.width+e.clientX-origin.current.x);}} onPointerUp={e=>{if(!origin.current)return;origin.current=undefined;setActive(false);save(latest.current);e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={cancel} onLostPointerCapture={()=>{if(origin.current)cancel();}}/>;
}
