import {getConnection} from '../lib/platform';
import {isMac} from '../lib/shortcuts';
import ResourceBatchActions from './ResourceBatchActions';
import { useSelection } from '../lib/resourceSelection';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import type { Resource } from '../types';
import { executeResourceCommand,resourceCommandEnabled,resourceCommands,supportedResourceActions } from '../lib/resourceActions';
import { resourceKind } from '../lib/resourceKinds';
import LibraryPopover from './LibraryPopover';
import { CollectionPicker } from './ResourceCollections';
import OrganizationManager from './OrganizationManager';
import AppModal from './modals/AppModal';
import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';
import { useFormKeyboard } from '../lib/useFormKeyboard';

export default function ResourceActions({resource}:{resource:Resource}) {
 const focus=useRestoreFocusOnClose(),[dialog,setDialog]=useState<'rename'|'collection'|'tags'|null>(null),[name,setName]=useState(resource.title),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const selection=useSelection(),renderEpoch=getConnection().epoch;
 const capabilities=supportedResourceActions(resource);
 const running=useRef(false);
 async function work(task:()=>Promise<unknown>,close?:()=>void) {if(running.current)return;running.current=true;setBusy(true);setError('');try{if(renderEpoch!==getConnection().epoch)throw Error('Workspace changed. Reopen the resource actions.');await task();close?.();}catch(e){setError(e instanceof Error?e.message:'Resource action failed. Retry.');}finally{running.current=false;setBusy(false);}}
 const done=()=>{setDialog(null);focus.restoreFocus();};
 const form=useFormKeyboard(()=>void work(()=>executeResourceCommand('rename',resource,name.trim()),done));
 if(selection&&selection.ids.includes(resource.id)&&selection.resources.length>1)return <ResourceBatchActions resources={selection.resources} collection={selection.collection} contextResource={resource}/>;
 return <><LibraryPopover contextTarget=".library-row,.sidebar-shortcut,.workspace-note-pane,.preview-shell" label={'Actions for '+resource.title} trigger={<MoreHorizontal size={17}/>} className="browse-icon-button">{close=><>
 {capabilities.open?<button className="library-button" disabled={busy} onClick={()=>void work(()=>executeResourceCommand('open',resource),close)}>{resourceKind(resource.type).action}</button>:<p className="text-xs">Opening this resource type is unsupported.</p>}
 {capabilities.open&&resource.type!=='file'&&<button className="library-button" disabled={busy} onClick={()=>void work(()=>executeResourceCommand('open-another',resource),close)}>{resourceCommands['open-another'].title}</button>}
 <button className="library-button" disabled={busy} onClick={()=>void work(()=>executeResourceCommand('references',resource),close)}>Links and mentions…</button>
 {capabilities.rename&&<button className="library-button" onClick={()=>{close();focus.captureFocus();setName(resource.title);setDialog('rename');}}>Rename…</button>}
 <button className="library-button" onClick={()=>{close();focus.captureFocus();setDialog('collection');}}>Add to collection…</button>
 <button className="library-button" onClick={()=>{close();focus.captureFocus();setDialog('tags');}}>Manage tags…</button>
 <button className="library-button" disabled={busy} onClick={()=>void work(()=>executeResourceCommand('pin',resource),close)}>{resource.favorite?'Unpin':'Pin'}</button>
 {resourceCommandEnabled('copy-resources',resource)&&<><button className="library-button" disabled={busy} onClick={()=>void work(()=>executeResourceCommand('copy-resources',resource),close)}>Copy resource <kbd>{isMac?'⌘C':'Ctrl+C'}</kbd></button><button className="library-button" disabled={busy} onClick={()=>void work(()=>executeResourceCommand('copy-links',resource),close)}>Copy resource link</button></>}
 {resourceCommandEnabled('export-copy',resource)&&<button className="library-button" disabled={busy} onClick={()=>void work(()=>executeResourceCommand('export-copy',resource),close)}>Export copy for Explorer…</button>}
 <button className="library-button" disabled={busy} onClick={()=>void work(()=>executeResourceCommand('copy-title',resource),close)}>Copy title</button>
 {capabilities.export&&<button className="library-button" onClick={()=>void work(()=>executeResourceCommand('export',resource),close)}>Export note…</button>}
 {capabilities.download&&<button className="library-button" disabled={busy} onClick={()=>void work(()=>executeResourceCommand('download',resource),close)}>Download original</button>}
 <button className="library-button text-red-500" disabled={busy} onClick={()=>void work(()=>executeResourceCommand('trash',resource),close)}>Move to Trash…</button>{error&&<p role="alert">{error}</p>}
 </>}</LibraryPopover>
 {dialog==='rename'&&createPortal(<AppModal open title="Rename resource" onClose={()=>{if(!busy)done();}}><form {...form} className="space-y-3"><input autoFocus aria-label="Resource name" className="organization-input w-full" value={name} maxLength={500} onChange={e=>setName(e.target.value)}/><button className="library-button" disabled={busy||!name.trim()}>Save name</button>{error&&<p role="alert">{error}</p>}</form></AppModal>,document.body)}
 {dialog==='collection'&&<CollectionPicker resourceIds={[resource.id]} onClose={done}/>}
 {dialog==='tags'&&<OrganizationManager initialKind="tag" resourceIds={[resource.id]} onClose={done} onApplied={done} tags={[]} onTag={()=>{}} onTagRenamed={()=>{}} onCollection={()=>{}} selectedCollection={null}/>}
 </>;
}
