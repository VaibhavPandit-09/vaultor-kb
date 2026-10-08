import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import type { Resource } from '../types';
import { requestResourceAction,supportedResourceActions } from '../lib/resourceActions';
import { resourceKind } from '../lib/resourceKinds';
import { setResourceFavorite } from '../lib/resourceBrowse';
import { saveApiFile } from '../lib/platform';
import LibraryPopover from './LibraryPopover';
import { CollectionPicker } from './ResourceCollections';
import OrganizationManager from './OrganizationManager';
import AppModal from './modals/AppModal';
import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';
import { useFormKeyboard } from '../lib/useFormKeyboard';

export default function ResourceActions({resource}:{resource:Resource}) {
 const focus=useRestoreFocusOnClose(),[dialog,setDialog]=useState<'rename'|'collection'|'tags'|null>(null),[name,setName]=useState(resource.title),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const capabilities=supportedResourceActions(resource);
 const running=useRef(false);
 async function work(task:()=>Promise<unknown>,close?:()=>void) {if(running.current)return;running.current=true;setBusy(true);setError('');try{await task();close?.();}catch(e){setError(e instanceof Error?e.message:'Resource action failed. Retry.');}finally{running.current=false;setBusy(false);}}
 const done=()=>{setDialog(null);focus.restoreFocus();};
 const form=useFormKeyboard(()=>void work(()=>requestResourceAction('rename',[resource],name.trim()),done));
 return <><LibraryPopover label={'Actions for '+resource.title} trigger={<MoreHorizontal size={17}/>} className="browse-icon-button">{close=><>
 {capabilities.open?<button className="library-button" disabled={busy} onClick={()=>void work(()=>requestResourceAction('open',[resource]),close)}>{resourceKind(resource.type).action}</button>:<p className="text-xs">Opening this resource type is unsupported.</p>}
 <button className="library-button" onClick={()=>{close();void work(()=>requestResourceAction('references',[resource]));}}>Used in / links…</button>
 {capabilities.rename&&<button className="library-button" onClick={()=>{close();focus.captureFocus();setName(resource.title);setDialog('rename');}}>Rename…</button>}
 <button className="library-button" onClick={()=>{close();focus.captureFocus();setDialog('collection');}}>Add to collection…</button>
 <button className="library-button" onClick={()=>{close();focus.captureFocus();setDialog('tags');}}>Manage tags…</button>
 <button className="library-button" disabled={busy} onClick={()=>void work(()=>setResourceFavorite(resource.id,!resource.favorite),close)}>{resource.favorite?'Unpin':'Pin'}</button>
 {capabilities.export&&<button className="library-button" onClick={()=>void work(()=>requestResourceAction('export',[resource]),close)}>Export note…</button>}
 {capabilities.download&&<button className="library-button" disabled={busy} onClick={()=>void work(async()=>{if(await saveApiFile('/resources/'+resource.id+'/raw',resource.title)==='cancelled')throw new Error('Download cancelled. Try again.');},close)}>Download original</button>}
 <button className="library-button text-red-500" disabled={busy} onClick={()=>void work(()=>requestResourceAction('trash',[resource]),close)}>Move to Trash…</button>{error&&<p role="alert">{error}</p>}
 </>}</LibraryPopover>
 {dialog==='rename'&&createPortal(<AppModal open title="Rename resource" onClose={()=>{if(!busy)done();}}><form {...form} className="space-y-3"><input autoFocus aria-label="Resource name" className="organization-input w-full" value={name} maxLength={500} onChange={e=>setName(e.target.value)}/><button className="library-button" disabled={busy||!name.trim()}>Save name</button>{error&&<p role="alert">{error}</p>}</form></AppModal>,document.body)}
 {dialog==='collection'&&<CollectionPicker resourceIds={[resource.id]} onClose={done}/>}
 {dialog==='tags'&&<OrganizationManager initialKind="tag" resourceIds={[resource.id]} onClose={done} onApplied={done} tags={[]} onTag={()=>{}} onTagRenamed={()=>{}} onCollection={()=>{}} selectedCollection={null}/>}
 </>;
}
