import {DesktopDragContext as Context,INTERNAL_DRAG,dropIntent,useDesktopInteraction,useDropTarget,type DragPayload,type DragContext,type DropTarget} from '../lib/desktopInteraction';
import { useAnchoredPortalPosition } from '../lib/useAnchoredPortalPosition';
import { createPortal } from 'react-dom';
import { useOrganizationPage } from '../lib/organization';
import { useEffect, useRef, useState, useMemo, useLayoutEffect, type DragEvent, type ReactNode, type HTMLAttributes } from 'react';
import type { Resource } from '../types';
import type { OrganizationItem } from '../lib/organization';
import { getConnection } from '../lib/platform';
import { useEscapeLayer } from '../lib/escape/escape';
import { boundedResources, changeMembership, pinResources, reparentCollection } from '../lib/resourceBatchCommands';
import { requestResourceAction } from '../lib/resourceActions';
export function DesktopInteractionProvider({children,generation,sourceKey,onPane,onImport,openResourceIds=[]}:{children:ReactNode;generation?:string;sourceKey:string;openResourceIds?:string[];onPane:(resource:Resource,paneId:string)=>Promise<void>;onImport:(files:File[])=>void}){
 const [external,setExternal]=useState(false),[payload,setPayload]=useState<DragPayload|null>(null),[message,setMessage]=useState(''),[error,setError]=useState(false),[busy,setBusy]=useState(false);
 const latestSource=useRef(sourceKey);useLayoutEffect(()=>{latestSource.current=sourceKey;},[sourceKey]);
 const running=useRef(false),edge=useRef<{element:HTMLElement;y:number}|null>(null);
 const openedIds=useMemo(()=>new Set(openResourceIds),[openResourceIds]);
 const scope={epoch:getConnection().epoch,generation};
 const cancel=()=>{setPayload(null);setExternal(false);edge.current=null;};
 useEscapeLayer({active:Boolean(payload),priority:600,close:cancel,restoreFocusOnEscape:false});
 const [previousSource,setPreviousSource]=useState(sourceKey);
 if(previousSource!==sourceKey){setPreviousSource(sourceKey);setPayload(null);setExternal(false);setMessage('');}
 useEffect(()=>{if(!payload&&!external)return;const end=(event:Event)=>{if(event.type!=='blur'||event.target===window)cancel();};window.addEventListener('dragend',end);window.addEventListener('drop',end);window.addEventListener('blur',end);let frame=0;const tick=()=>{const value=edge.current;if(value){const rect=value.element.getBoundingClientRect(),distance=value.y-rect.top,bottom=rect.bottom-value.y;value.element.scrollTop+=distance<36?-Math.ceil((36-distance)/4):bottom<36?Math.ceil((36-bottom)/4):0;}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(frame);window.removeEventListener('dragend',end);window.removeEventListener('drop',end);window.removeEventListener('blur',end);};},[payload,external]);
 const start:DragContext['start']=(event,content)=>{
  if(running.current){event.preventDefault();return;}
  if(content.kind==='resources')try{boundedResources(content.resources);}catch{event.preventDefault();return;}
  const ticket=crypto.randomUUID();event.dataTransfer.effectAllowed=content.kind==='collection'?'move':'copy';event.dataTransfer.setData(INTERNAL_DRAG,ticket);
  // Only an opaque ticket leaves memory; resource bodies, paths and credentials never enter drag data.
  const preview=document.createElement('div');preview.className='resource-drag-preview';preview.textContent=content.kind==='collection'?content.collection.name:content.resources.length===1?content.resources[0].title:content.resources.length+' resources';document.body.append(preview);event.dataTransfer.setDragImage?.(preview,12,12);setTimeout(()=>preview.remove(),0);
  setMessage('');setPayload({...content,ticket,scope,sourceKey});
 };
 const drop:DragContext['drop']=async(event,target)=>{
  event.preventDefault();event.stopPropagation();const current=payload;cancel();
  if(!current||!dropIntent(current,target)||event.dataTransfer.getData(INTERNAL_DRAG)!==current.ticket||current.sourceKey!==sourceKey||current.scope.epoch!==getConnection().epoch||running.current)return;
  running.current=true;setBusy(true);setError(false);setMessage('Working…');
  try{
   if(current.kind==='collection'&&target.kind==='collection')await reparentCollection(current.collection,target.collection,current.scope);
   else if(current.kind==='resources'){
    const resources=current.resources;
    if(target.kind==='collection'||target.kind==='tag')await changeMembership(resources.map(item=>item.id),target.kind,target.kind==='collection'?target.collection.id:target.id,'add',current.scope);
    else if(target.kind==='pinned'){const result=await pinResources(resources,true,current.scope);if(result.failed.length)throw new Error(result.completed.length+' pinned; '+result.failed.length+' failed. '+result.failed.map(item=>item.title+': '+item.detail).join('; '));}
    else if(target.kind==='trash')await requestResourceAction('trash',resources);
    else await onPane(resources[0],target.paneId);
   }
   if(latestSource.current!==current.sourceKey)return;
   setMessage(target.kind==='trash'?'Review the Trash confirmation.':'Done. '+dropIntent(current,target));
  }catch(failure){if(latestSource.current!==current.sourceKey)return;setError(true);setMessage(failure instanceof Error?failure.message:'Drop failed. Use the existing actions to retry.');}finally{running.current=false;setBusy(false);}
 };
 const scroll=(event:DragEvent)=>{const element=event.currentTarget.closest<HTMLElement>('.library-view,.sidebar-secondary,.collection-drop-browser');edge.current=element?{element,y:event.clientY}:null;};
 return <Context.Provider value={{payload,start,cancel,drop,scroll,stopScroll:()=>{edge.current=null;},scope,openedIds,report:(text,failure=false)=>{if(latestSource.current!==sourceKey)return;setMessage(text);setError(failure);}}}><div className="desktop-interaction-root" onDragOverCapture={event=>{if(!payload||!event.dataTransfer.types.includes(INTERNAL_DRAG)||!(event.target instanceof Element)||!event.target.closest('input,textarea,[contenteditable="true"]'))return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect=payload.kind==='resources'&&payload.resources.length===1?'copy':'none';}} onDropCapture={event=>{if(!payload||!event.dataTransfer.types.includes(INTERNAL_DRAG)||!(event.target instanceof Element)||!event.target.closest('input,textarea,[contenteditable="true"]'))return;const pane=event.target.closest<HTMLElement>('[data-pane-id]');event.preventDefault();event.stopPropagation();if(pane?.dataset.paneId)void drop(event,{kind:'pane',paneId:pane.dataset.paneId});else cancel();}} onDragLeave={event=>{if(!(event.relatedTarget instanceof Node)||!event.currentTarget.contains(event.relatedTarget))setExternal(false);}} onDragOver={event=>{if(!event.dataTransfer.types.includes('Files')||payload)return;event.preventDefault();setExternal(true);event.dataTransfer.dropEffect=busy?'none':'copy';}} onDrop={event=>{if(!event.dataTransfer.types.includes('Files')||payload||event.defaultPrevented)return;event.preventDefault();setExternal(false);if(busy)return;if(!window.vaultorDesktop?.dropFiles&&Array.from(event.dataTransfer.items).some(item=>item.webkitGetAsEntry?.()?.isDirectory)){setError(true);setMessage('Use Import → Browse folder in this browser to preserve folder paths.');return;}onImport(Array.from(event.dataTransfer.files));}}>{children}{external&&<div className="organization-external-drop" aria-hidden="true"><span>Drop files or folders to review an import</span></div>}{message&&<div className="organization-drop-status" role={error?'alert':'status'}><span>{message}</span>{!busy&&<button aria-label="Dismiss organization status" onClick={()=>setMessage('')}>×</button>}</div>}</div></Context.Provider>;
}
export function PaneDropTarget({paneId,...props}:HTMLAttributes<HTMLDivElement>&{paneId:string}){const drop=useDropTarget({kind:'pane',paneId});return <div {...props} data-pane-id={paneId} {...drop}/>;}
export function TagDropTarget({tagId,name,...props}:HTMLAttributes<HTMLSpanElement>&{tagId:string;name:string}){const drop=useDropTarget({kind:'tag',id:tagId,name});return <span {...props} {...drop}/>;}
export function NavigationDropButton({target,...props}:HTMLAttributes<HTMLButtonElement>&{target:DropTarget|null}){const drop=useDropTarget(target);return <button {...props} {...drop}/>;}
function DropDestination({item,onDescend}:{item:OrganizationItem;onDescend:(item:OrganizationItem)=>void}){const drop=useDropTarget({kind:'collection',collection:item},()=>{if(item.childCount)onDescend(item);});return <button className="library-button" {...drop} onClick={()=>onDescend(item)} title={item.childCount?'Hold over this collection to browse children':item.name}>{item.name}{Boolean(item.childCount)&&' ›'}</button>;}
/** Temporary destination shelf keeps the original resource list mounted throughout the drag. */
export function CollectionDropButton({onOpen,...props}:HTMLAttributes<HTMLButtonElement>&{onOpen:()=>void}){
 const drag=useDesktopInteraction(),[requested,setRequested]=useState<string|null>(null),[parent,setParent]=useState<OrganizationItem|null>(null),[page,setPage]=useState(0);
 const open=Boolean(drag?.payload&&requested===drag.payload.ticket),anchor=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const {position}=useAnchoredPortalPosition(open,anchor,{width:280,align:'start'});
 const result=useOrganizationPage('collection','',page,open,false,20,parent?.id??'');

 return <><button {...props} ref={anchor} onClick={onOpen} onDragEnter={()=>{if(drag?.payload){if(requested!==drag.payload.ticket){setParent(null);setPage(0);}setRequested(drag.payload.ticket);}}}/>{open&&position&&createPortal(<div ref={panel} role="region" aria-label="Collection drop destinations" className="library-popover application-menu collection-drop-browser" style={{position:'fixed',zIndex:86,top:position.top,left:position.left,width:position.width,maxHeight:position.maxHeight,transform:position.placement==='top'?'translateY(-100%)':undefined}}><p className="text-xs px-2">{parent?parent.name:'Collections'} · {drag?.payload?.kind==='collection'?'drop to move collection':'drop to add membership'}</p>{parent&&<button className="library-button" onDragEnter={()=>{setParent(null);setPage(0);}} onClick={()=>{setParent(null);setPage(0);}}>All root collections</button>}{result.data?.items.map(item=><DropDestination key={item.id} item={item} onDescend={item=>{if(item.childCount){setParent(item);setPage(0);}}}/>)}{result.loading&&<p role="status">Loading collections…</p>}{result.error&&<p role="alert">{result.error}<button onClick={result.retry}>Retry</button></p>}{result.data?.items.length===0&&!result.loading&&<p className="text-xs">No child collections. Use Add to collection to create one.</p>}{(result.data?.totalPages??0)>1&&<div><button className="library-button" disabled={!page} onDragEnter={()=>{if(page)setPage(page-1);}} onClick={()=>setPage(page-1)}>Previous</button><button className="library-button" disabled={page+1>=(result.data?.totalPages??0)} onDragEnter={()=>{if(page+1<(result.data?.totalPages??0))setPage(page+1);}} onClick={()=>setPage(page+1)}>Next</button></div>}</div>,document.body)}</>;
}
