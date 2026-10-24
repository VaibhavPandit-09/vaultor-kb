import { useLayoutEffect, useRef, useState } from 'react';
import type { OrganizationItem } from '../lib/organization';

/** Keep the nearest ancestors readable; the heading Path control exposes the full chain. */
export default function CollectionBreadcrumb({collection,onCollection}:{collection:OrganizationItem;onCollection:(item:OrganizationItem|null)=>void}) {
 const nav=useRef<HTMLElement>(null);const [start,setStart]=useState(0);
 const ancestors=collection.ancestors??[];const identity=JSON.stringify(ancestors);
 useLayoutEffect(()=>{
   const element=nav.current;if(!element)return;let active=true;
   const measure=()=>{
     if(!active||!element.clientWidth)return;
     const context=document.createElement('canvas').getContext('2d');if(!context)return;
     context.font=getComputedStyle(element).font;
     const label=(text:string)=>context.measureText(text).width;
     const cap=label('0')*18, widths=ancestors.map(a=>Math.min(cap,label(a.name))+12);
     const available=element.clientWidth-label('Library')-16;
     if(widths.reduce((a,b)=>a+b,0)<=available){setStart(0);return;}
     let remaining=available-label('… / '),index=widths.length;
     while(index>0&&(index===widths.length||widths[index-1]<=remaining)){remaining-=widths[--index];}
     setStart(index);
   };
   const observer=new ResizeObserver(measure);observer.observe(element);measure();void document.fonts?.ready.then(measure);
   return()=>{active=false;observer.disconnect();};
 // The serialized ancestor chain owns measurement, including rename and move.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[identity]);
 return <nav ref={nav} className="collection-breadcrumb" aria-label="Breadcrumb" title={['Library',...ancestors.map(a=>a.name)].join(' / ')}>
   <button onClick={()=>onCollection(null)}>Library</button><span aria-hidden="true">/</span>{start>0&&<span aria-hidden="true">… /</span>}
   {ancestors.slice(start).map(ancestor=><span className="collection-ancestor" key={ancestor.id}><button title={ancestor.name} onClick={()=>onCollection({...ancestor,count:0})}>{ancestor.name}</button><span aria-hidden="true"> /</span></span>)}
 </nav>;
}
