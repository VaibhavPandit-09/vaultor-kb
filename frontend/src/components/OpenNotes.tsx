import { useState } from 'react';
import { MoreHorizontal,X } from 'lucide-react';
import type { Pane } from '../lib/paneNavigation';
import { useDesktopInteraction,useDropTarget } from '../lib/desktopInteraction';
import LibraryPopover from './LibraryPopover';
type Props={sessions:Pane[];panes:Pane[];activeId:string|null;canSplit:boolean;onOpen:(id:string)=>void;onSplit:(id:string)=>void;onClose:(id:string)=>void;onCloseOthers:(keep?:string)=>void;onReorder?:(id:string,before:string|null)=>void;onReveal?:(id:string)=>Promise<void>};
function SessionRow({session,index,...props}:Props&{session:Pane;index:number}){
 const title=session.history[session.cursor].title,paneIndex=props.panes.findIndex(pane=>pane.paneId===session.paneId),drag=useDesktopInteraction();
 const drop=useDropTarget({kind:'session-order',sessionId:session.paneId},()=>{if((paneIndex>=0||props.canSplit)&&props.onReveal)void props.onReveal(session.paneId);},true);
 return <div {...drop} data-open-session={session.id} className="flex items-center gap-1">
  <button className="sidebar-nav min-w-0 flex-1" aria-current={props.activeId===session.paneId?'page':undefined} onClick={()=>props.onOpen(session.id)} title={title} draggable onDragStart={event=>drag?.start(event,{kind:'session',sessionId:session.paneId,resourceId:session.id,title,visible:paneIndex>=0,canAdd:props.canSplit})} onDragEnd={()=>drag?.cancel()}><span className="truncate">{title}</span>{paneIndex>=0&&<span className="ml-auto shrink-0 text-[10px] opacity-60">Pane {paneIndex+1}</span>}</button>
  <LibraryPopover contextTarget="[data-open-session]" label={'Session actions for '+title} trigger={<MoreHorizontal size={13}/>}>
   {close=><>{paneIndex<0&&<button className="library-button" disabled={!props.canSplit} onClick={()=>{close();props.onSplit(session.id);}}>Open in another pane</button>}{props.onReorder&&<><button className="library-button" disabled={index===0} onClick={()=>{close();props.onReorder?.(session.paneId,props.sessions[index-1].paneId);}}>Move earlier in Open Notes</button><button className="library-button" disabled={index===props.sessions.length-1} onClick={()=>{close();props.onReorder?.(session.paneId,props.sessions[index+2]?.paneId??null);}}>Move later in Open Notes</button></>}<button className="library-button" onClick={()=>{close();props.onCloseOthers(session.paneId);}}>Close other notes</button><button className="library-button" onClick={()=>{close();props.onClose(session.paneId);}}>Close note</button></>}
  </LibraryPopover><button className="rounded p-1 text-slate-400 hover:text-foreground focus-visible:outline-primary" aria-label={'Close '+title} onClick={()=>props.onClose(session.paneId)}><X size={13}/></button>
 </div>;
}
function SessionEndTarget(){const drag=useDesktopInteraction(),drop=useDropTarget({kind:'session-order',sessionId:null});return drag?.payload?.kind==='session'?<div {...drop} className="library-button text-xs">Move to end of Open Notes</div>:null;}
/** Sessions remain in the shared sidebar scroll owner; reordering never navigates. */
export default function OpenNotes(props:Props){
 const [query,setQuery]=useState('');if(!props.sessions.length)return null;
 const filtered=props.sessions.filter(session=>session.history[session.cursor].title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 return <section aria-label="Open notes" className="px-3 pb-2"><div className="flex items-center justify-between text-xs text-slate-400"><span>Open notes · {props.sessions.length}</span><LibraryPopover label="Manage open notes" trigger={<MoreHorizontal size={14}/>}>{close=><button className="library-button" onClick={()=>{close();props.onCloseOthers();}}>Close all notes</button>}</LibraryPopover></div>{(props.sessions.length>5||query)&&<input aria-label="Find open note" placeholder="Find open note…" className="my-1 w-full rounded border border-border bg-background px-2 py-1 text-xs" value={query} onChange={event=>setQuery(event.target.value)}/>}{filtered.map(session=><SessionRow key={session.paneId} {...props} session={session} index={props.sessions.indexOf(session)}/>)}<SessionEndTarget/>{!filtered.length&&<p className="py-1 text-xs text-slate-400">No matching open notes</p>}</section>;
}
