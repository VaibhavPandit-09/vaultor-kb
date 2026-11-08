import {useEffect,useRef,useState} from 'react';
import {getPlatform} from '../lib/platform';
import type {Resource} from '../types';
import type {PreparedExportCopy} from '../lib/nativeContracts';
import AppModal from './modals/AppModal';
export default function NativeExportCopy({resource,onClose,intent}:{resource:Resource;onClose:()=>void;intent?:'reveal'|'open'}){
 const platform=getPlatform(),[copy,setCopy]=useState<PreparedExportCopy|null>(null),[preparing,setPreparing]=useState(false),[acting,setActing]=useState(false),[expired,setExpired]=useState(false),[error,setError]=useState('');
 const controller=useRef<AbortController|null>(null),record=useRef<PreparedExportCopy|null>(null),alive=useRef(true),running=useRef(false),busy=preparing||acting;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();const value=record.current;if(value)void platform.releaseExportCopy?.(value.receipt).catch(()=>{});};},[platform]);
 useEffect(()=>{if(!copy)return;const timer=setTimeout(()=>{setExpired(true);void platform.releaseExportCopy?.(copy.receipt).catch(()=>{});},Math.max(0,copy.expires-Date.now()));return()=>clearTimeout(timer);},[copy,platform]);
 const prepare=async()=>{
  if(running.current)return;running.current=true;setPreparing(true);setExpired(false);setError('');controller.current=new AbortController();
  try{if(!platform.prepareExportCopy)throw Error('This requires Vaultor Desktop.');const value=await platform.prepareExportCopy(resource.id,controller.current.signal);if(!alive.current){void platform.releaseExportCopy?.(value.receipt).catch(()=>{});return;}record.current=value;setCopy(value);if(intent){if(intent==='open'&&!value.canOpen)throw Error('This file type cannot be opened automatically. Reveal or download the copy and choose an application.');await platform.exportCopyAction!(value.receipt,intent);}}
  catch(error){if(alive.current)setError(error instanceof Error?error.message:'Could not prepare export copy.');}
  finally{running.current=false;if(alive.current)setPreparing(false);}
 };
 const act=async(action:'reveal'|'open'|'drag')=>{
  if(!copy||expired||running.current)return;running.current=true;setActing(true);setError('');
  try{await platform.exportCopyAction!(copy.receipt,action);}catch(error){if(alive.current)setError(error instanceof Error?error.message:'Native action failed. Prepare the copy again.');}finally{running.current=false;if(alive.current)setActing(false);}
 };
 return <AppModal open title="Export copy for Explorer" onClose={()=>{controller.current?.abort();onClose();}}>
  <p className="browse-feedback native-export-name">Export a copy of “{resource.title}”. The Vaultor resource and its memberships stay unchanged.</p>
  {!copy?<button className="library-button library-button-primary" disabled={busy} onClick={()=>void prepare()}>{preparing?'Preparing copy…':intent==='reveal'?'Prepare and reveal copy':intent==='open'?'Prepare and open copy':'Prepare export copy'}</button>:<div className="native-export-actions">
   <p className="text-sm native-export-name">{copy.filename}</p>
   <button className="library-button library-button-primary" disabled={busy||expired} draggable={!busy&&!expired} onDragStart={event=>{event.preventDefault();event.stopPropagation();void act('drag');}}>Drag exported copy to Explorer</button>
   <div className="flex gap-2 flex-wrap"><button className="library-button" disabled={busy||expired} onClick={()=>void act('reveal')}>Reveal export copy</button>{copy.canOpen&&<button className="library-button" disabled={busy||expired} onClick={()=>void act('open')}>Open copy in default app</button>}<button className="library-button" disabled={busy} onClick={()=>{record.current=null;void platform.releaseExportCopy?.(copy.receipt).catch(()=>{});setCopy(null);setError('');}}>Prepare again</button></div>
   <p role="status" className="browse-feedback">{expired?'This export copy expired. Prepare again to use native actions.':acting?'Opening native action…':'Ready for five minutes. Reveal or open the copy as a keyboard alternative.'}</p>
  </div>}
  {preparing&&<button className="library-button" onClick={()=>{controller.current?.abort();onClose();}}>Cancel preparation</button>}{error&&<p role="alert">{error}</p>}
 </AppModal>;
}
