import {createContext,useContext,useEffect,useRef,useState,type DragEvent} from 'react';
import type {Resource} from '../types';
import type {OrganizationItem} from './organization';
import type {CommandScope} from './resourceBatchCommands';
import {resourceKind} from './resourceKinds';
export const INTERNAL_DRAG='application/x-vaultor-organization';
export type DragPayload=({kind:'resources';resources:Resource[]}|{kind:'collection';collection:OrganizationItem})&{ticket:string;scope:CommandScope;sourceKey:string};
export type DropTarget={kind:'collection';collection:OrganizationItem}|{kind:'tag';id:string;name:string}|{kind:'pinned'}|{kind:'trash'}|{kind:'pane';paneId:string};
export function dropIntent(payload:DragPayload,target:DropTarget):string|null{
 if(payload.kind==='collection')return target.kind==='collection'&&payload.collection.id!==target.collection.id&&!target.collection.ancestors?.some(item=>item.id===payload.collection.id)&&payload.collection.parentId!==target.collection.id?'Move collection into '+target.collection.name:null;
 if(payload.resources.some(resource=>resource.trashedAt))return null;
 const count=payload.resources.length,noun=count===1?'resource':count+' resources';
 if(target.kind==='collection')return 'Add '+noun+' to '+target.collection.name;
 if(target.kind==='tag')return 'Tag '+noun+' with '+target.name;
 if(target.kind==='pinned')return 'Pin '+noun;
 if(target.kind==='trash')return 'Review moving '+noun+' to Trash';
 return count===1&&resourceKind(payload.resources[0].type).mode!=='unsupported'?'Open in this pane':null;
}
export type DragContext={payload:DragPayload|null;start:(event:DragEvent,content:{kind:'resources';resources:Resource[]}|{kind:'collection';collection:OrganizationItem})=>void;cancel:()=>void;drop:(event:DragEvent,target:DropTarget)=>Promise<void>;scroll:(event:DragEvent)=>void;stopScroll:()=>void;scope:CommandScope;openedIds:ReadonlySet<string>;report:(message:string,error?:boolean)=>void};
export const DesktopDragContext=createContext<DragContext|null>(null);
export const useDesktopInteraction=()=>useContext(DesktopDragContext);
export function useDropTarget(target:DropTarget|null,onHover?:()=>void){
 const context=useDesktopInteraction(),[overTicket,setOver]=useState<string|null>(null),hover=useRef<ReturnType<typeof setTimeout>|null>(null);
 const over=Boolean(context?.payload&&overTicket===context.payload.ticket);
 const intent=context?.payload&&target?dropIntent(context.payload,target):null;
 const clear=()=>{setOver(null);if(hover.current)clearTimeout(hover.current);hover.current=null;};
 useEffect(()=>()=>{if(hover.current)clearTimeout(hover.current);hover.current=null;},[context?.payload]);
 return { 'data-drop-state':over?(intent?'valid':'invalid'):undefined,'data-drop-intent':over?(intent??'Unavailable drop target'):undefined,
  onDragOver:(event:DragEvent<HTMLElement>)=>{if(!target||!context?.payload||!event.dataTransfer.types.includes(INTERNAL_DRAG))return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect=intent?context.payload.kind==='collection'?'move':'copy':'none';if(!over)setOver(context.payload.ticket);context.scroll(event);if(intent&&onHover&&!hover.current)hover.current=setTimeout(onHover,650);},
  onDragLeave:(event:DragEvent<HTMLElement>)=>{if(!(event.relatedTarget instanceof Node)||!event.currentTarget.contains(event.relatedTarget)){clear();context?.stopScroll();}},
  onDrop:(event:DragEvent<HTMLElement>)=>{if(!target||!context?.payload)return;clear();void context.drop(event,target);}
 };
}
