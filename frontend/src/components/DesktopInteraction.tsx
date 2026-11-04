import { GripVertical } from 'lucide-react';
import {DesktopDragContext as Context,INTERNAL_DRAG,dropIntent,useDesktopInteraction,useDropTarget,type DragPayload,type DragContext,type DropTarget,type DragSurface,type DragContent} from '../lib/desktopInteraction';
import {canInsertDrop,captureEditorDrop,editorDropTarget,insertDroppedLinks} from '../lib/editorDrop';
import {useAnchoredPortalPosition} from '../lib/useAnchoredPortalPosition';
import {createPortal} from 'react-dom';
import {useOrganizationPage,type OrganizationItem} from '../lib/organization';
import {useCallback,useEffect,useRef,useState,useMemo,useLayoutEffect,type DragEvent,type ReactNode,type HTMLAttributes} from 'react';
import type {Resource} from '../types';
import {getConnection} from '../lib/platform';
import {useEscapeLayer} from '../lib/escape/escape';
import {boundedResources,changeMembership,pinResources,reparentCollection,requireCommandScope} from '../lib/resourceBatchCommands';
import {requestResourceAction} from '../lib/resourceActions';

type Props={children:ReactNode;generation?:string;sourceKey:string;openResourceIds?:string[];visibleSessionIds?:string[];onPane:(resource:Resource,paneId:string)=>Promise<void>;onImport:(files:File[],collection?:OrganizationItem)=>void;onResolveResources?:(resources:Resource[],scope:import('../lib/resourceBatchCommands').CommandScope)=>Promise<Resource[]>;onArrangeSession?:(id:string,target?:string,edge?:'before'|'after'|'swap')=>Promise<void>;onReorderSession?:(id:string,before:string|null)=>void;onDragSourceChange?:(surface:DragSurface|null)=>void};
export function DesktopInteractionProvider({children,generation,sourceKey,onPane,onImport,openResourceIds=[],onResolveResources=async resources=>resources,onArrangeSession,onReorderSession,onDragSourceChange,visibleSessionIds=[]}:Props){
 const [external,setExternal]=useState(false),[payload,setPayload]=useState<DragPayload|null>(null),[message,setMessage]=useState(''),[error,setError]=useState(false),[busy,setBusy]=useState(false);
 const latestSource=useRef(sourceKey);useLayoutEffect(()=>{latestSource.current=sourceKey;},[sourceKey]);
 const editorFeedback=useRef<HTMLElement|null>(null);
 const clearEditorFeedback=useCallback(()=>{if(editorFeedback.current){delete editorFeedback.current.dataset.dropState;delete editorFeedback.current.dataset.dropIntent;delete editorFeedback.current.dataset.paneDropEdge;editorFeedback.current=null;}},[]);
 const running=useRef(false),edge=useRef<{element:HTMLElement;y:number}|null>(null);
 const openedIds=useMemo(()=>new Set(openResourceIds),[openResourceIds]),scope={epoch:getConnection().epoch,generation};
 const report=(text:string,failure=false)=>{if(latestSource.current!==sourceKey)return;setMessage(text);setError(failure);};
 const cancel=useCallback(()=>{clearEditorFeedback();setPayload(null);setExternal(false);edge.current=null;},[clearEditorFeedback]);
 useEffect(()=>()=>clearEditorFeedback(),[sourceKey,clearEditorFeedback]);
 useEscapeLayer({active:Boolean(payload)||external,priority:600,close:cancel,restoreFocusOnEscape:false});
 const [previousSource,setPreviousSource]=useState(sourceKey);
 if(previousSource!==sourceKey){setPreviousSource(sourceKey);setPayload(null);setExternal(false);setMessage('');}
 useEffect(()=>{onDragSourceChange?.(payload?.surface??null);return()=>onDragSourceChange?.(null);},[payload?.surface,onDragSourceChange]);
 useEffect(()=>{
  if(!payload&&!external)return;
  const end=(event:Event)=>{if(event.type!=='blur'||event.target===window)cancel();};
  window.addEventListener('dragend',end);window.addEventListener('drop',end);window.addEventListener('blur',end);
  let frame=0;const tick=()=>{const value=edge.current;if(value){const rect=value.element.getBoundingClientRect(),distance=value.y-rect.top,bottom=rect.bottom-value.y;value.element.scrollTop+=distance<36?-Math.ceil((36-distance)/4):bottom<36?Math.ceil((36-bottom)/4):0;}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('dragend',end);window.removeEventListener('drop',end);window.removeEventListener('blur',end);};
 },[payload,external,cancel]);
 const start:DragContext['start']=(event,content,onDrop)=>{
  if(running.current){event.preventDefault();return;}
  if(content.kind==='resources')try{boundedResources(content.resources);}catch{event.preventDefault();return;}
  const ticket=crypto.randomUUID();event.dataTransfer.effectAllowed=content.kind==='collection'||content.kind==='session'?'move':'copy';event.dataTransfer.setData(INTERNAL_DRAG,ticket);
  const preview=document.createElement('div');preview.className='resource-drag-preview';preview.textContent=content.kind==='collection'?content.collection.name:content.kind==='resources'?content.resources.length===1?content.resources[0].title:content.resources.length+' resources':content.kind==='tag'?content.name:content.title;
  document.body.append(preview);event.dataTransfer.setDragImage?.(preview,12,12);setTimeout(()=>preview.remove(),0);
  const surface=event.currentTarget.closest('.palette-shell')?'palette':event.currentTarget.closest('.library-view')?'browse':'other';
  setMessage('');setPayload({...content,ticket,scope,sourceKey,surface,onDrop});
 };
 const drop:DragContext['drop']=async(event,target)=>{
  event.preventDefault();event.stopPropagation();const current=payload;
  if(!current||!dropIntent(current,target)||event.dataTransfer.getData(INTERNAL_DRAG)!==current.ticket||current.sourceKey!==sourceKey||current.scope.epoch!==getConnection().epoch||running.current){cancel();return;}
  // Capture the mapped insertion anchor before closing a palette or awaiting metadata.
  let insertion:ReturnType<typeof captureEditorDrop>|undefined;
  cancel();running.current=true;setBusy(true);report('Working…');
  try{
   insertion=target.kind==='editor'?captureEditorDrop(target.target,target.x,target.y):undefined;
   current.onDrop?.();
   requireCommandScope(current.scope);
   if(current.kind==='session'){
    if(target.kind==='session-order')onReorderSession?.(current.sessionId,target.sessionId);
    else if(target.kind==='pane'){if(!onArrangeSession)throw new Error('Pane arrangement is unavailable.');await onArrangeSession(current.sessionId,target.paneId,target.edge);}
   }else if(current.kind==='tag'&&target.kind==='resource'){const resources=await onResolveResources([target.resource],current.scope);requireCommandScope(current.scope);if(latestSource.current!==current.sourceKey)throw Error('Workspace changed.');await changeMembership(resources.map(resource=>resource.id),'tag',current.id,'add',current.scope);}
   else if(current.kind==='collection'&&target.kind==='collection')await reparentCollection(current.collection,target.collection,current.scope);
   else if(current.kind==='resources'){
    const resources=await onResolveResources(current.resources,current.scope);requireCommandScope(current.scope);if(latestSource.current!==current.sourceKey)throw new Error('Workspace changed.');boundedResources(resources);if(resources.length!==current.resources.length||resources.some((resource,index)=>resource.id!==current.resources[index].id))throw Error('Resource identity changed. Start the drag again.');
    if(target.kind==='editor'&&insertion){if(!canInsertDrop(target.target))throw new Error('The editor became read-only.');insertDroppedLinks(insertion,resources);}
    else if(target.kind==='collection'||target.kind==='tag')await changeMembership(resources.map(item=>item.id),target.kind,target.kind==='collection'?target.collection.id:target.id,'add',current.scope);
    else if(target.kind==='pinned'){const result=await pinResources(resources,true,current.scope);if(result.failed.length)throw new Error(result.completed.length+' pinned; '+result.failed.length+' failed. '+result.failed.map(item=>item.title+': '+item.detail).join('; '));}
    else if(target.kind==='trash')await requestResourceAction('trash',resources);
    else if(target.kind==='pane')await onPane(resources[0],target.paneId);
   }
   if(latestSource.current!==current.sourceKey)return;
   report(target.kind==='trash'?'Review the Trash confirmation.':'Done. '+dropIntent(current,target));
  }catch(failure){report(failure instanceof Error?failure.message:'Drop failed. Use the existing actions to retry.',true);}finally{insertion?.dispose();running.current=false;setBusy(false);}
 };
 const importFiles:DragContext['importFiles']=(event,collection)=>{
  event.preventDefault();event.stopPropagation();setExternal(false);if(busy)return;
  if(!window.vaultorDesktop?.dropFiles&&Array.from(event.dataTransfer.items).some(item=>item.webkitGetAsEntry?.()?.isDirectory)){report('Use Import → Browse folder in this browser to preserve folder paths.',true);return;}
  onImport(Array.from(event.dataTransfer.files),collection);
 };
 const scroll=(event:DragEvent)=>{const element=event.currentTarget.closest<HTMLElement>('.library-view,.sidebar-secondary,.collection-drop-browser,.journey-viewport');edge.current=element?{element,y:event.clientY}:null;};
 const body=(event:DragEvent)=>event.target instanceof Element?event.target.closest('.ProseMirror,input,textarea,[aria-label="Read-only Markdown preview"]'):null;
 const editorTarget=(event:DragEvent):DropTarget|null=>{
  const adapter=editorDropTarget(event.target),pane=event.target instanceof Element?event.target.closest<HTMLElement>('[data-pane-id]'):null;
  if(payload?.kind==='session'){if(!pane?.dataset.paneId)return null;const rect=pane.getBoundingClientRect(),edge=event.clientX<rect.left+Math.min(48,rect.width*.2)?'before':event.clientX>rect.right-Math.min(48,rect.width*.2)?'after':'swap';return {kind:'pane',paneId:pane.dataset.paneId,edge};}
  if(payload?.kind==='tag'&&adapter)return {kind:'resource',resource:adapter.resource};
  return adapter?{kind:'editor',target:adapter,x:event.clientX,y:event.clientY}:null;
 };
 return <Context.Provider value={{payload,external,markExternal:()=>setExternal(true),start,cancel,drop,importFiles,scroll,stopScroll:()=>{edge.current=null;},scope,openedIds,report,visibleSessionIds,arrangeSession:async(id,target,edge)=>{if(!onArrangeSession)throw Error('Pane arrangement is unavailable.');await onArrangeSession(id,target,edge);}}}>
  <div className="desktop-interaction-root" onDragOverCapture={event=>{
   clearEditorFeedback();if(!payload||!event.dataTransfer.types.includes(INTERNAL_DRAG)||!body(event))return;
   event.preventDefault();event.stopPropagation();const target=editorTarget(event),intent=target&&dropIntent(payload,target);event.dataTransfer.dropEffect=intent?payload.kind==='session'?'move':'copy':'none';
   const element=event.target instanceof Element?event.target.closest<HTMLElement>('.ProseMirror'):null;if(element){editorFeedback.current=element;element.dataset.dropState=intent?'valid':'invalid';element.dataset.dropIntent=intent||'Requires an editable Vaultor note';if(target?.kind==='pane'&&target.edge)element.dataset.paneDropEdge=target.edge;}scroll(event);
  }} onDropCapture={event=>{
   if(!body(event))return;
   if(payload&&event.dataTransfer.types.includes(INTERNAL_DRAG)){const target=editorTarget(event);if(target)void drop(event,target);else{event.preventDefault();event.stopPropagation();cancel();report('Drop inside an editable Vaultor note.',true);}return;}
   const adapter=editorDropTarget(event.target);if(!event.dataTransfer.types.includes('Files')||!adapter)return;
   // Existing managed-image drops remain owned by the editor's image pipeline.
   const files=Array.from(event.dataTransfer.files);if(files.length&&files.every(file=>/^image\/(png|jpeg|gif|webp)$/.test(file.type)))return;
   event.preventDefault();event.stopPropagation();setExternal(false);
   if(!canInsertDrop(adapter)||!adapter.importFile){report('File links require an editable Vaultor note.',true);return;}
   if(files.length!==1||Array.from(event.dataTransfer.items).some(item=>item.webkitGetAsEntry?.()?.isDirectory)){report('Drop one file into a note. Use Import for folders or multiple files.',true);return;}
   const position=adapter.editor.view.posAtCoords({left:event.clientX,top:event.clientY})?.pos;if(position===undefined){report('Drop inside the editable document.',true);return;}adapter.importFile(adapter.editor,position,files);
  }} onDragLeave={event=>{if(!(event.relatedTarget instanceof Node)||!event.currentTarget.contains(event.relatedTarget)){setExternal(false);clearEditorFeedback();}}} onDragOver={event=>{
   if(!event.dataTransfer.types.includes('Files')||payload)return;event.preventDefault();setExternal(true);event.dataTransfer.dropEffect=busy?'none':'copy';
  }} onDrop={event=>{if(event.dataTransfer.types.includes('Files')&&!payload&&!event.defaultPrevented)importFiles(event);}}>
   {children}{external&&<div className="organization-external-drop" aria-hidden="true"><span>Drop files or folders to review an import</span></div>}
   {message&&<div className="organization-drop-status" role={error?'alert':'status'}><span>{message}</span>{!busy&&<button aria-label="Dismiss organization status" onClick={()=>setMessage('')}>×</button>}</div>}
  </div>
 </Context.Provider>;
}
export function PaneDropTarget({paneId,resource,...props}:Omit<HTMLAttributes<HTMLDivElement>,'resource'>&{paneId:string;resource?:Resource}){
 const drag=useDesktopInteraction(),[edge,setEdge]=useState<'before'|'after'|'swap'>('swap');
 const drop=useDropTarget(drag?.payload?.kind==='tag'&&resource?{kind:'resource',resource}:{kind:'pane',paneId,edge});
 return <div {...props} data-pane-id={paneId} {...drop} data-pane-drop-edge={drag?.payload?.kind==='session'&&drop['data-drop-state']==='valid'?edge:undefined} onDragOver={event=>{if(drag?.payload?.kind==='session'){const rect=event.currentTarget.getBoundingClientRect();const next=event.clientX<rect.left+Math.min(48,rect.width*.2)?'before':event.clientX>rect.right-Math.min(48,rect.width*.2)?'after':'swap';if(next!==edge)setEdge(next);}drop.onDragOver(event);}}/>;
}
export function SessionDragHandle({session}:{session:Extract<DragContent,{kind:'session'}>}){
 const drag=useDesktopInteraction();
 return <button className="pane-arrange-handle" aria-label={'Arrange '+session.title} title="Drag to arrange panes · Alt+Shift+Left/Right moves this pane" aria-keyshortcuts="Alt+Shift+ArrowLeft Alt+Shift+ArrowRight" draggable onDragStart={event=>drag?.start(event,session)} onDragEnd={()=>drag?.cancel()} onKeyDown={event=>{if(!drag||!event.altKey||!event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopPropagation();const index=drag.visibleSessionIds.indexOf(session.sessionId),other=drag.visibleSessionIds[index+(event.key==='ArrowLeft'?-1:1)];if(other)void drag.arrangeSession(session.sessionId,other,event.key==='ArrowLeft'?'before':'after').catch(error=>drag.report(String(error),true));}}><GripVertical size={14}/></button>;
}
export function TagDragButton({tagId,name,...props}:HTMLAttributes<HTMLButtonElement>&{tagId:string;name:string}){const drag=useDesktopInteraction();return <button {...props} draggable onDragStart={event=>drag?.start(event,{kind:'tag',id:tagId,name})} onDragEnd={()=>drag?.cancel()}/>;}
export function TagDropTarget({tagId,name,...props}:HTMLAttributes<HTMLSpanElement>&{tagId:string;name:string}){const drop=useDropTarget({kind:'tag',id:tagId,name});return <span {...props} {...drop}/>;}
export function NavigationDropButton({target,...props}:HTMLAttributes<HTMLButtonElement>&{target:DropTarget|null}){const drop=useDropTarget(target);return <button {...props} {...drop}/>;}
function DropDestination({item,onDescend}:{item:OrganizationItem;onDescend:(item:OrganizationItem)=>void}){const drop=useDropTarget({kind:'collection',collection:item},()=>{if(item.childCount)onDescend(item);});return <button className="library-button" {...drop} onClick={()=>onDescend(item)} title={item.childCount?'Hold over this collection to browse children':item.name}>{item.name}{Boolean(item.childCount)&&' ›'}</button>;}
/** Temporary destination shelf keeps the original resource list mounted throughout the drag. */
export function CollectionDropButton({onOpen,...props}:HTMLAttributes<HTMLButtonElement>&{onOpen:()=>void}){
 const drag=useDesktopInteraction(),[requested,setRequested]=useState<string|null>(null),[parent,setParent]=useState<OrganizationItem|null>(null),[page,setPage]=useState(0);
 const open=Boolean(drag?.payload&&requested===drag.payload.ticket),anchor=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const {position}=useAnchoredPortalPosition(open,anchor,{width:280,align:'start'});
 const result=useOrganizationPage('collection','',page,open,false,20,parent?.id??'');

 return <><button {...props} ref={anchor} onClick={onOpen} onDragEnter={event=>{if(!drag?.payload&&event.dataTransfer.types.includes('Files')){onOpen();return;}if(drag?.payload){if(requested!==drag.payload.ticket){setParent(null);setPage(0);}setRequested(drag.payload.ticket);}}}/>{open&&position&&createPortal(<div ref={panel} role="region" aria-label="Collection drop destinations" className="library-popover application-menu collection-drop-browser" style={{position:'fixed',zIndex:86,top:position.top,left:position.left,width:position.width,maxHeight:position.maxHeight,transform:position.placement==='top'?'translateY(-100%)':undefined}}><p className="text-xs px-2">{parent?parent.name:'Collections'} · {drag?.payload?.kind==='collection'?'drop to move collection':'drop to add membership'}</p>{parent&&<button className="library-button" onDragEnter={()=>{setParent(null);setPage(0);}} onClick={()=>{setParent(null);setPage(0);}}>All root collections</button>}{result.data?.items.map(item=><DropDestination key={item.id} item={item} onDescend={item=>{if(item.childCount){setParent(item);setPage(0);}}}/>)}{result.loading&&<p role="status">Loading collections…</p>}{result.error&&<p role="alert">{result.error}<button onClick={result.retry}>Retry</button></p>}{result.data?.items.length===0&&!result.loading&&<p className="text-xs">No child collections. Use Add to collection to create one.</p>}{(result.data?.totalPages??0)>1&&<div><button className="library-button" disabled={!page} onDragEnter={()=>{if(page)setPage(page-1);}} onClick={()=>setPage(page-1)}>Previous</button><button className="library-button" disabled={page+1>=(result.data?.totalPages??0)} onDragEnter={()=>{if(page+1<(result.data?.totalPages??0))setPage(page+1);}} onClick={()=>setPage(page+1)}>Next</button></div>}</div>,document.body)}</>;
}
