import {DragHoverLease,type DragFeedback} from '../lib/dragHover';
import { GripVertical } from 'lucide-react';
import {DesktopDragContext as Context,INTERNAL_DRAG,dropIntent,canDragResource,revealNote,targetResource,useDragItems,useDesktopInteraction,useDropTarget,type DragPayload,type DragContext,type DropTarget,type DragSurface,type DragContent} from '../lib/desktopInteraction';
import {EditorDropCaret,canInsertDrop,captureEditorDrop,editorDropTarget,insertDroppedLinks} from '../lib/editorDrop';
import {useOrganizationPage,type OrganizationItem} from '../lib/organization';
import {createContext,useContext,useCallback,useEffect,useRef,useState,useMemo,useLayoutEffect,type DragEvent,type ReactNode,type HTMLAttributes} from 'react';
import type {Resource} from '../types';
import {getConnection} from '../lib/platform';
import {useEscapeLayer} from '../lib/escape/escape';
import {boundedResources,changeMembership,pinResources,reparentCollection,requireCommandScope} from '../lib/resourceBatchCommands';
import {requestResourceAction} from '../lib/resourceActions';

type Props={onRevealResource?:(resource:Resource,valid:()=>boolean)=>Promise<void>;children:ReactNode;generation?:string;sourceKey:string;openResourceIds?:string[];visibleSessionIds?:string[];onPane:(resource:Resource,paneId:string)=>Promise<void>;onImport:(files:File[],collection?:OrganizationItem)=>void;onResolveResources?:(resources:Resource[],scope:import('../lib/resourceBatchCommands').CommandScope)=>Promise<Resource[]>;onArrangeSession?:(id:string,target?:string,edge?:'before'|'after'|'swap')=>Promise<void>;onReorderSession?:(id:string,before:string|null)=>void;onDragSourceChange?:(surface:DragSurface|null)=>void};
export function DesktopInteractionProvider({children,generation,sourceKey,onPane,onImport,openResourceIds=[],onResolveResources=async resources=>resources,onArrangeSession,onReorderSession,onDragSourceChange,visibleSessionIds=[],onRevealResource}:Props){
 const [external,setExternal]=useState(false),[payload,setPayload]=useState<DragPayload|null>(null),[message,setMessage]=useState(''),[error,setError]=useState(false),[busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState<DragFeedback>({phase:'idle',label:''});
 const updateFeedback=useCallback((next:DragFeedback)=>setFeedback(previous=>previous.phase===next.phase&&previous.label===next.label&&previous.owner===next.owner?previous:next),[]);
 const hoverLease=useMemo(()=>new DragHoverLease(updateFeedback),[updateFeedback]);
 const mutedTitles=useRef(new Map<Element,string>());
 const restoreTitles=useCallback(()=>{for(const [element,title] of mutedTitles.current){if(element.isConnected&&!element.hasAttribute('title'))element.setAttribute('title',title);}mutedTitles.current.clear();},[]);
 const muteTitles=(node:EventTarget|null)=>{let element=node instanceof Element?node.closest('[title]'):null;while(element){if(!mutedTitles.current.has(element))mutedTitles.current.set(element,element.getAttribute('title')??'');element.removeAttribute('title');element=element.parentElement?.closest('[title]')??null;}};
 useEffect(()=>{if(feedback.phase==='error'){setMessage(feedback.label);setError(true);}},[feedback]);
 const latestSource=useRef(sourceKey);useLayoutEffect(()=>{latestSource.current=sourceKey;},[sourceKey]);
 const caret=useMemo(()=>new EditorDropCaret(),[]);
 const editorFeedback=useRef<HTMLElement|null>(null);
 const clearEditorFeedback=useCallback(()=>{caret.clear();if(editorFeedback.current){delete editorFeedback.current.dataset.dropState;delete editorFeedback.current.dataset.dropIntent;delete editorFeedback.current.dataset.paneDropEdge;editorFeedback.current=null;}},[caret]);
 const running=useRef(false),edge=useRef<{element:HTMLElement;y:number}|null>(null);
 const openedIds=useMemo(()=>new Set(openResourceIds),[openResourceIds]),scope={epoch:getConnection().epoch,generation};
 const report=(text:string,failure=false)=>{if(latestSource.current!==sourceKey)return;setMessage(text);setError(failure);};
 const cancel=useCallback(()=>{hoverLease.clear();restoreTitles();updateFeedback({phase:'idle',label:''});clearEditorFeedback();setPayload(null);setExternal(false);edge.current=null;},[clearEditorFeedback,hoverLease,restoreTitles,updateFeedback]);
 useEffect(()=>()=>{hoverLease.clear();restoreTitles();clearEditorFeedback();},[sourceKey,clearEditorFeedback,hoverLease,restoreTitles]);
 useEffect(()=>{if(!message||error||busy)return;const timer=setTimeout(()=>setMessage(''),3000);return()=>clearTimeout(timer);},[message,error,busy]);
 useEscapeLayer({active:Boolean(payload)||external,priority:600,close:cancel,restoreFocusOnEscape:false});
 const [previousSource,setPreviousSource]=useState(sourceKey);
 if(previousSource!==sourceKey){setPreviousSource(sourceKey);setPayload(null);setExternal(false);setMessage('');}
 useEffect(()=>{onDragSourceChange?.(payload?.surface??null);return()=>onDragSourceChange?.(null);},[payload?.surface,onDragSourceChange]);
 useEffect(()=>{
  if(!payload&&!external)return;
  const end=(event:Event)=>{if(event.type!=='blur'||event.target===window)cancel();};
  window.addEventListener('dragend',end);window.addEventListener('drop',end);window.addEventListener('blur',end);
  let frame=0;const tick=()=>{const value=edge.current;if(value){const rect=value.element.getBoundingClientRect(),distance=value.y-rect.top,bottom=rect.bottom-value.y;const previous=value.element.scrollTop;value.element.scrollTop+=distance<36?-Math.ceil((36-distance)/4):bottom<36?Math.ceil((36-bottom)/4):0;if(value.element.scrollTop!==previous)caret.refresh();}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('dragend',end);window.removeEventListener('drop',end);window.removeEventListener('blur',end);};
 },[payload,external,cancel,caret]);
 const start:DragContext['start']=(event,content,onDrop)=>{
  if(running.current){event.preventDefault();return;}
  if(content.kind==='resources')try{boundedResources(content.resources);if(content.resources.some(resource=>!canDragResource(resource)))throw Error('Unsupported drag source');}catch{event.preventDefault();return;}
  const ticket=crypto.randomUUID();event.dataTransfer.effectAllowed=content.kind==='collection'||content.kind==='session'?'move':'copy';muteTitles(event.currentTarget);updateFeedback({phase:'discovering',label:content.kind==='tag'?'Drop this tag onto a resource':content.kind==='collection'?'Choose a parent collection':content.kind==='session'?'Reorder Open Notes or arrange workspace panes':'Hover a note to show its editor, or choose an organization target'});event.dataTransfer.setData(INTERNAL_DRAG,ticket);
  const preview=document.createElement('div');preview.className='resource-drag-preview';preview.textContent=content.kind==='collection'?content.collection.name:content.kind==='resources'?content.resources.length===1?content.resources[0].title:content.resources.length+' resources':content.kind==='tag'?content.name:content.title;
  document.body.append(preview);event.dataTransfer.setDragImage?.(preview,-16,-20);setTimeout(()=>preview.remove(),0);
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
   }else if(current.kind==='tag'&&targetResource(target)){const resources=await onResolveResources([targetResource(target)!],current.scope);requireCommandScope(current.scope);if(latestSource.current!==current.sourceKey)throw Error('Workspace changed.');await changeMembership(resources.map(resource=>resource.id),'tag',current.id,'add',current.scope);}
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
 const leave=useCallback((owner:string)=>hoverLease.leave(owner),[hoverLease]);
 const hover:DragContext['hover']=(owner,event,target,onDiscover)=>{
  if(!payload)return;const note=revealNote(payload,target),intent=dropIntent(payload,target);
  if(note){hoverLease.enter(owner,event.clientX,event.clientY,'Pause to show '+note.title,async valid=>{const admitted=()=>valid()&&latestSource.current===payload.sourceKey&&getConnection().epoch===payload.scope.epoch;if(!admitted())return;requireCommandScope(payload.scope);if(!onRevealResource)throw Error('Note reveal is unavailable. Open this note normally.');await onRevealResource(note,admitted);},'Move into the editor to choose the insertion position');}
  else if(onDiscover&&(intent||target.kind==='discovery'||target.kind==='collection'&&(payload.kind==='resources'||payload.kind==='collection')))hoverLease.enter(owner,event.clientX,event.clientY,target.kind==='discovery'?target.label:intent??'Browse child collections',valid=>{if(valid())onDiscover();});
  else{hoverLease.clear();updateFeedback({phase:'discovering',owner,label:intent??'This target cannot accept this drag'});}
 };
 const importFiles:DragContext['importFiles']=(event,collection)=>{
  event.preventDefault();event.stopPropagation();setExternal(false);if(busy)return;
  if(!window.vaultorDesktop?.dropFiles&&Array.from(event.dataTransfer.items).some(item=>item.webkitGetAsEntry?.()?.isDirectory)){report('Use Import → Browse folder in this browser to preserve folder paths.',true);return;}
  onImport(Array.from(event.dataTransfer.files),collection);
 };
 const scroll=(event:DragEvent)=>{const element=event.target instanceof Element?event.target.closest<HTMLElement>('.library-view,.sidebar-secondary,.collection-destination-scroll,.journey-viewport,.palette-results'):null;edge.current=element?{element,y:event.clientY}:null;};
 const body=(event:DragEvent)=>event.target instanceof Element?event.target.closest('.ProseMirror,input,textarea,[aria-label="Read-only Markdown preview"]'):null;
 const editorTarget=(event:DragEvent):DropTarget|null=>{
  const adapter=editorDropTarget(event.target),pane=event.target instanceof Element?event.target.closest<HTMLElement>('[data-pane-id]'):null;
  if(payload?.kind==='session'){if(!pane?.dataset.paneId)return null;const rect=pane.getBoundingClientRect(),edge=event.clientX<rect.left+Math.min(48,rect.width*.2)?'before':event.clientX>rect.right-Math.min(48,rect.width*.2)?'after':'swap';return {kind:'pane',paneId:pane.dataset.paneId,edge};}
  if(payload?.kind==='tag'&&adapter)return {kind:'resource',resource:adapter.resource};
  return adapter?{kind:'editor',target:adapter,x:event.clientX,y:event.clientY}:null;
 };
 return <Context.Provider value={{feedback,hover,leave,payload,external,markExternal:owner=>{setExternal(true);updateFeedback({phase:'discovering',owner,label:'Review import into this collection'});},start,cancel,drop,importFiles,scroll,stopScroll:()=>{edge.current=null;},scope,openedIds,report,visibleSessionIds,arrangeSession:async(id,target,edge)=>{if(!onArrangeSession)throw Error('Pane arrangement is unavailable.');await onArrangeSession(id,target,edge);}}}>
  <div className="desktop-interaction-root" onDragEnterCapture={event=>{if(payload)muteTitles(event.target);}} onDragOverCapture={event=>{
   if(payload&&event.dataTransfer.types.includes(INTERNAL_DRAG)||event.dataTransfer.types.includes('Files'))scroll(event);
   if(!payload||!event.dataTransfer.types.includes(INTERNAL_DRAG)||!body(event)){clearEditorFeedback();return;}hoverLease.clear();
   event.preventDefault();event.stopPropagation();const target=editorTarget(event),intent=target&&dropIntent(payload,target);event.dataTransfer.dropEffect=intent?payload.kind==='session'?'move':'copy':'none';updateFeedback({phase:target?.kind==='editor'&&intent?'positioning':'discovering',label:target?.kind==='editor'&&intent?'Choose the insertion position':intent||'This editor cannot accept this drag'});
   const element=event.target instanceof Element?event.target.closest<HTMLElement>('.ProseMirror'):null;if(editorFeedback.current!==element)clearEditorFeedback();if(element){editorFeedback.current=element;element.dataset.dropState=intent?'valid':'invalid';element.dataset.dropIntent=intent||'Requires an editable Vaultor note';if(target?.kind==='pane'&&target.edge)element.dataset.paneDropEdge=target.edge;else delete element.dataset.paneDropEdge;}if(target?.kind==='editor'&&intent)caret.show(target.target,event.clientX,event.clientY);else caret.clear();scroll(event);
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
  }} onDragLeave={event=>{if(!(event.relatedTarget instanceof Node)||!event.currentTarget.contains(event.relatedTarget)){setExternal(false);edge.current=null;hoverLease.clear();clearEditorFeedback();}}} onDragOver={event=>{
   if(!event.dataTransfer.types.includes('Files')||payload)return;event.preventDefault();setExternal(true);event.dataTransfer.dropEffect=busy?'none':'copy';
  }} onDrop={event=>{if(event.dataTransfer.types.includes('Files')&&!payload&&!event.defaultPrevented)importFiles(event);}}>
   {children}{external&&<div className="organization-external-drop" aria-hidden="true"><span>Drop files or folders to review an import</span></div>}
   {message&&<div className="organization-drop-status" data-motion-surface="notice" data-motion-key="desktop-drop-status" role={error?'alert':'status'}><span>{message}</span>{!busy&&<button aria-label="Dismiss organization status" onClick={()=>setMessage('')}>×</button>}</div>}
  </div>
 </Context.Provider>;
}
export function PaneDropTarget({paneId,resource,...props}:Omit<HTMLAttributes<HTMLDivElement>,'resource'>&{paneId:string;resource?:Resource}){
 const drag=useDesktopInteraction(),[edge,setEdge]=useState<'before'|'after'|'swap'>('swap');
 const arranging=drag?.payload?.kind==='session';
 const drop=useDropTarget(drag?.payload?.kind==='tag'&&resource?{kind:'resource',resource}:{kind:'pane',paneId,edge});
 return <div {...props} data-pane-id={paneId} {...drop} data-pane-drop-edge={arranging&&drop['data-drop-state']==='valid'?edge:undefined} onDragOver={event=>{if(arranging){const rect=event.currentTarget.getBoundingClientRect();const next=event.clientX<rect.left+Math.min(48,rect.width*.2)?'before':event.clientX>rect.right-Math.min(48,rect.width*.2)?'after':'swap';if(next!==edge)setEdge(next);}drop.onDragOver(event);}}/>;
}
export function SessionDragHandle({session,className='pane-arrange-handle'}:{className?:string;session:Extract<DragContent,{kind:'session'}>}){
 const drag=useDesktopInteraction();
 return <button className={className} aria-label={'Arrange '+session.title} title="Drag to arrange panes · Alt+Shift+Left/Right moves this pane" aria-keyshortcuts="Alt+Shift+ArrowLeft Alt+Shift+ArrowRight" draggable onDragStart={event=>drag?.start(event,session)} onDragEnd={()=>drag?.cancel()} onKeyDown={event=>{if(!drag||!event.altKey||!event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopPropagation();const index=drag.visibleSessionIds.indexOf(session.sessionId),other=drag.visibleSessionIds[index+(event.key==='ArrowLeft'?-1:1)];if(other)void drag.arrangeSession(session.sessionId,other,event.key==='ArrowLeft'?'before':'after').catch(error=>drag.report(String(error),true));}}><GripVertical size={14}/></button>;
}
export function TagDragButton({tagId,name,...props}:HTMLAttributes<HTMLButtonElement>&{tagId:string;name:string}){const drag=useDesktopInteraction();return <button {...props} draggable onDragStart={event=>drag?.start(event,{kind:'tag',id:tagId,name})} onDragEnd={()=>drag?.cancel()}/>;}
export function TagDropTarget({tagId,name,...props}:HTMLAttributes<HTMLSpanElement>&{tagId:string;name:string}){const drop=useDropTarget({kind:'tag',id:tagId,name});return <span {...props} {...drop}/>;}
export function NavigationDropButton({target,...props}:HTMLAttributes<HTMLButtonElement>&{target:DropTarget|null}){const drop=useDropTarget(target);return <button {...props} {...drop}/>;}

// Discovery remains inside the existing navigation allocation; resource rows never move.
const CollectionBrowserContext=createContext<(()=>void)|null>(null);
export function SidebarDragGuidance({children}:{children:ReactNode}){
 const drag=useDesktopInteraction();return <div className="sidebar-drag-guidance"><div aria-hidden={Boolean(drag?.payload)} inert={Boolean(drag?.payload)}>{children}</div>{drag?.payload&&<div className="sidebar-drag-message" role="status" aria-live="polite">{drag.feedback.phase==='navigating'?'Opening destination…':drag.feedback.phase==='error'?'Destination unavailable; review the error':drag.feedback.label||'Choose a destination'}</div>}</div>;
}
function DiscoveryButton({id,label,action,children,...props}:HTMLAttributes<HTMLButtonElement>&{id:string;label:string;action:()=>void}){const drop=useDropTarget({kind:'discovery',id,label},action);return <button {...props} {...drop} onClick={action}>{children}</button>;}
function CollectionDestination({item,onDescend}:{item:OrganizationItem;onDescend:()=>void}){const drop=useDropTarget({kind:'collection',collection:item},item.childCount?onDescend:undefined);return <button className="sidebar-nav collection-destination" data-collection-destination={item.id} {...drop} onClick={onDescend}><span>{item.name}</span>{Boolean(item.childCount)&&<span aria-label="Child collections">›</span>}</button>;}
function CollectionBreadcrumb({item}:{item:OrganizationItem}){const drop=useDropTarget({kind:'collection',collection:item});return <span className="collection-current" {...drop}>{item.name}</span>;}
export function SidebarDragNavigation({children}:{children:ReactNode}){
 const drag=useDesktopInteraction(),[ticket,setTicket]=useState<string|null>(null),[path,setPath]=useState<OrganizationItem[]>([]),[page,setPage]=useState(0),root=useRef<HTMLDivElement>(null);
 const open=Boolean(drag?.payload&&ticket===drag.payload.ticket),parent=path.at(-1),result=useOrganizationPage('collection','',page,open,false,20,parent?.id??'');
 const show=()=>{if(!drag?.payload)return;setPath([]);setPage(0);setTicket(drag.payload.ticket);};
 const back=()=>{setPage(0);if(path.length)setPath(path.slice(0,-1));else setTicket(null);};
 return <CollectionBrowserContext.Provider value={show}><div ref={root} className="sidebar-drag-navigation" data-collections-open={open||undefined} onDragLeave={event=>{if(!open||event.relatedTarget instanceof Node&&event.currentTarget.contains(event.relatedTarget))return;const hit=document.elementFromPoint?.(event.clientX,event.clientY);if(hit&&event.currentTarget.contains(hit))return;setTicket(null);}}><div className="sidebar-navigation-items" aria-hidden={open||undefined} inert={open}>{children}</div>{open&&<section className="collection-destination-browser" aria-label="Collection drop destinations"><header><DiscoveryButton id="collection-back" label={parent?'Show parent collections':'Return to navigation'} action={back} aria-label={parent?'Show parent collections':'Return to navigation'}>‹ {!parent&&'Navigation'}</DiscoveryButton>{parent&&<CollectionBreadcrumb item={parent}/>}<span>{drag?.payload?.kind==='collection'?'Move into':'Add to'}</span></header><div className="collection-destination-scroll">{result.data?.items.map(item=><CollectionDestination key={item.id} item={item} onDescend={()=>{if(item.childCount){setPath([...path,item]);setPage(0);}}}/>)}{result.loading&&<p role="status">Loading collections…</p>}{result.error&&<p role="alert">{result.error}<button onClick={result.retry}>Retry</button></p>}{!result.loading&&result.data?.items.length===0&&<p>No child collections</p>}</div>{(result.data?.totalPages??0)>1&&<footer><DiscoveryButton id="collection-previous" label="Previous collections" action={()=>{if(page)setPage(page-1);}}>Previous</DiscoveryButton><span>{page+1}/{result.data?.totalPages}</span><DiscoveryButton id="collection-next" label="Next collections" action={()=>{if(page+1<(result.data?.totalPages??0))setPage(page+1);}}>Next</DiscoveryButton></footer>}</section>}</div></CollectionBrowserContext.Provider>;
}
export function CollectionDropButton({onOpen,...props}:HTMLAttributes<HTMLButtonElement>&{onOpen:()=>void}){
 const show=useContext(CollectionBrowserContext),drag=useDesktopInteraction(),eligible=drag?.payload?.kind==='resources'||drag?.payload?.kind==='collection';
 const drop=useDropTarget(eligible?{kind:'discovery',id:'collections',label:'Pause to browse collection destinations'}:null,eligible?()=>show?.():undefined);
 return <button {...props} {...drop} onClick={onOpen} onDragEnter={event=>{if(!event.dataTransfer.types.includes(INTERNAL_DRAG)&&event.dataTransfer.types.includes('Files'))onOpen();}}/>;
}
export function ResourceDropSurface({resource,...props}:Omit<HTMLAttributes<HTMLDivElement>,'resource'>&{resource?:Resource}){const drop=useDropTarget(resource?{kind:'resource',resource}:null);return <div {...props} {...drop}/>;}

export function SidebarOpenNotesShortcut({count,onOpen,children}:{count:number;onOpen:()=>void;children:ReactNode}){const stable=useDragItems([count],false)[0];return stable>0?<button className="sidebar-nav" onClick={onOpen}>{children}<span className="ml-auto text-xs opacity-60">{stable}</span></button>:null;}
