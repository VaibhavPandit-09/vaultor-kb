import type {DragFeedback} from './dragHover';
import {createContext,useContext,useEffect,useId,useState,type DragEvent} from 'react';
import type {Resource} from '../types';
import type {OrganizationItem} from './organization';
import type {CommandScope} from './resourceBatchCommands';
import {resourceKind} from './resourceKinds';
import {canInsertDrop,type EditorDropTarget} from './editorDrop';
export const INTERNAL_DRAG='application/x-vaultor-organization';
export type DragSurface='browse'|'palette'|'other';
export type DragContent={kind:'resources';resources:Resource[]}|{kind:'collection';collection:OrganizationItem}|{kind:'tag';id:string;name:string}|{kind:'session';sessionId:string;resourceId:string;title:string;visible:boolean;canAdd:boolean};
export type DragPayload=DragContent&{ticket:string;scope:CommandScope;sourceKey:string;surface?:DragSurface;onDrop?:()=>void};
export type DropTarget={kind:'collection';collection:OrganizationItem}|{kind:'tag';id:string;name:string}|{kind:'resource';resource:Resource}|{kind:'pinned'}|{kind:'trash'}|{kind:'pane';paneId:string;edge?:'before'|'after'|'swap'}|{kind:'session-order';sessionId:string|null;resource?:Resource}|{kind:'discovery';id:string;label:string}|{kind:'editor';target:EditorDropTarget;x:number;y:number};
export const canDragResource=(resource:Resource)=>!resource.trashedAt&&resourceKind(resource.type).mode!=='unsupported';
export function dropIntent(payload:DragPayload,target:DropTarget):string|null{
 if(payload.kind==='collection')return target.kind==='collection'&&payload.collection.id!==target.collection.id&&!target.collection.ancestors?.some(item=>item.id===payload.collection.id)&&payload.collection.parentId!==target.collection.id?'Move collection into '+target.collection.name:null;
 if(payload.kind==='tag'){const resource=targetResource(target);return resource&&!resource.trashedAt?'Apply '+payload.name+' to '+resource.title:null;}
 if(payload.kind==='session'){
  if(target.kind==='session-order')return target.sessionId!==payload.sessionId?'Reorder open notes':null;
  return target.kind==='pane'&&target.paneId!==payload.sessionId&&(payload.visible||payload.canAdd)?(payload.visible?(target.edge&&target.edge!=='swap'?'Move note '+target.edge+' this pane':'Swap note positions'):'Show note beside this pane'):null;
 }
 if(!payload.resources.length||payload.resources.some(resource=>!canDragResource(resource)))return null;
 const count=payload.resources.length,noun=count===1?'resource':count+' resources';
 if(target.kind==='editor')return canInsertDrop(target.target)?'Insert '+noun+' as '+(count===1?'a link':'links'):null;
 if(target.kind==='collection')return 'Add '+noun+' to '+target.collection.name;
 if(target.kind==='tag')return 'Tag '+noun+' with '+target.name;
 if(target.kind==='pinned')return 'Pin '+noun;
 if(target.kind==='trash')return 'Review moving '+noun+' to Trash';
 return target.kind==='pane'&&count===1?'Open in this pane':null;
}
export function targetResource(target:DropTarget|null){return target?.kind==='resource'||target?.kind==='session-order'?target.resource:undefined;}
export function revealNote(payload:DragPayload|null,target:DropTarget|null){const resource=targetResource(target);return payload?.kind==='resources'&&resource?.type==='note'&&!resource.trashedAt?resource:undefined;}
export type DragContext={feedback:DragFeedback;hover:(owner:string,event:DragEvent,target:DropTarget,onDiscover?:()=>void)=>void;leave:(owner:string)=>void;payload:DragPayload|null;external:boolean;markExternal:(owner?:string)=>void;start:(event:DragEvent,content:DragContent,onDrop?:()=>void)=>void;cancel:()=>void;drop:(event:DragEvent,target:DropTarget)=>Promise<void>;importFiles:(event:DragEvent,collection?:OrganizationItem)=>void;scroll:(event:DragEvent)=>void;stopScroll:()=>void;scope:CommandScope;openedIds:ReadonlySet<string>;visibleSessionIds:string[];arrangeSession:(id:string,target?:string,edge?:'before'|'after'|'swap')=>Promise<void>;report:(message:string,error?:boolean)=>void};
export const DesktopDragContext=createContext<DragContext|null>(null);
export const useDesktopInteraction=()=>useContext(DesktopDragContext);
export function useDropTarget(target:DropTarget|null,onDiscover?:()=>void){
 const context=useDesktopInteraction(),owner=useId(),[overTicket,setOver]=useState<string|null>(null);
 const leave=context?.leave;useEffect(()=>()=>leave?.(owner),[leave,owner]);
 const external=Boolean(context?.external&&overTicket==='external'&&target?.kind==='collection'&&context.feedback.owner===owner);
 const over=external||Boolean(context?.payload&&overTicket===context.payload.ticket&&context.feedback.owner===owner);
 const intent=external?'Review import into '+(target?.kind==='collection'?target.collection.name:'collection'):context?.payload&&target?dropIntent(context.payload,target):null;
 const reveal=revealNote(context?.payload??null,target),discovery=target?.kind==='discovery'||Boolean(onDiscover&&target?.kind==='collection');
 const clear=()=>{setOver(null);context?.leave(owner);};
 return {'data-resource-target':target?.kind==='resource'||target?.kind==='session-order'?target.resource?.id:undefined,'data-drag-reveal':over&&reveal?(context?.feedback.phase==='ready'?'ready':'waiting'):undefined,'data-drop-state':over?(intent?'valid':reveal||discovery?'reveal':'invalid'):undefined,'data-drop-intent':over?(intent??(reveal?'Pause to show '+reveal.title:discovery?(target?.kind==='discovery'?target.label:'Pause to browse child collections'):'Unavailable drop target')):undefined,
  onDragOver:(event:DragEvent<HTMLElement>)=>{
   if(!target||!context)return;
   if(!context.payload&&target.kind==='collection'&&event.dataTransfer.types.includes('Files')){event.preventDefault();event.stopPropagation();context.markExternal(owner);setOver('external');event.dataTransfer.dropEffect='copy';return;}
   if(!context.payload||!event.dataTransfer.types.includes(INTERNAL_DRAG))return;
   if(target.kind==='resource'&&context.payload.kind!=='tag'&&!reveal)return;
   event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect=intent?(context.payload.kind==='collection'||context.payload.kind==='session'?'move':'copy'):'none';setOver(context.payload.ticket);context.scroll(event);context.hover(owner,event,target,onDiscover);
  },
  onDragLeave:(event:DragEvent<HTMLElement>)=>{if(event.relatedTarget instanceof Node&&event.currentTarget.contains(event.relatedTarget))return;const hit=document.elementFromPoint?.(event.clientX,event.clientY);if(hit&&event.currentTarget.contains(hit))return;clear();context?.stopScroll();},
  onDrop:(event:DragEvent<HTMLElement>)=>{if(!target||!context)return;if(!context.payload&&target.kind==='collection'&&event.dataTransfer.types.includes('Files')){clear();context.importFiles(event,target.collection);return;}if(!context.payload||target.kind==='resource'&&context.payload.kind!=='tag'&&!reveal)return;clear();void context.drop(event,target);}
 };
}

/** Freeze the loaded resource order during a gesture; chronological refresh resumes on completion. */
export function useDragItems<T>(items:T[],allowInitialLoad=true){const drag=useDesktopInteraction(),ticket=drag?.payload?.ticket??null;const [snapshot,setSnapshot]=useState({ticket,items});if(ticket!==snapshot.ticket||allowInitialLoad&&ticket&&snapshot.items.length===0&&items.length>0){setSnapshot({ticket,items});return items;}return ticket?snapshot.items:items;}
