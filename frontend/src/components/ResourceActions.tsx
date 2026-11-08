import {MenuAction,MenuSeparator} from './MenuAction';
import {FolderPlus,FolderMinus,Tags,Pin,Pencil,Trash2} from 'lucide-react';
import {changeMembership,commandScope} from '../lib/resourceBatchCommands';
import {getConnection} from '../lib/platform';
import {isMac} from '../lib/shortcuts';
import ResourceBatchActions from './ResourceBatchActions';
import { useSelection } from '../lib/resourceSelection';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import type { Resource } from '../types';
import { executeResourceCommand,resourceCommandEnabled,resourceCommands,supportedResourceActions } from '../lib/resourceActions';
import LibraryPopover from './LibraryPopover';
import { CollectionPicker } from './ResourceCollections';
import OrganizationManager from './OrganizationManager';
import AppModal from './modals/AppModal';
import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';
import { useFormKeyboard } from '../lib/useFormKeyboard';

export default function ResourceActions({resource}:{resource:Resource}) {
 const focus=useRestoreFocusOnClose(),[dialog,setDialog]=useState<'rename'|'collection'|'tags'|null>(null),[name,setName]=useState(resource.title),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const selection=useSelection(),renderEpoch=getConnection().epoch,renderGeneration=getConnection().generation;
 const capabilities=supportedResourceActions(resource);
 const running=useRef(false);
 async function work(task:()=>Promise<unknown>,close?:()=>void) {if(running.current)return;running.current=true;setBusy(true);setError('');try{if(renderEpoch!==getConnection().epoch||renderGeneration!==getConnection().generation)throw Error('Workspace changed. Reopen the resource actions.');await task();close?.();}catch(e){setError(e instanceof Error?e.message:'Resource action failed. Retry.');}finally{running.current=false;setBusy(false);}}
 const done=()=>{setDialog(null);focus.restoreFocus();};
 const form=useFormKeyboard(()=>void work(()=>executeResourceCommand('rename',resource,name.trim()),done));
 if(selection&&selection.ids.includes(resource.id)&&selection.resources.length>1)return <ResourceBatchActions resources={selection.resources} collection={selection.collection} contextResource={resource}/>;
 return <><LibraryPopover contextTarget=".library-row,.sidebar-shortcut,.workspace-note-pane,.preview-shell,[data-linked-result]" label={'Actions for '+resource.title} trigger={<MoreHorizontal size={17}/>} className="browse-icon-button">{close=><>

 {(['open','open-another','references'] as const).filter(id=>resourceCommandEnabled(id,resource)).map(id=>{const command=resourceCommands[id];return <MenuAction key={id} icon={command.icon} disabled={busy} onClick={()=>void work(()=>executeResourceCommand(id,resource),close)}>{command.title}</MenuAction>;})}
 <MenuSeparator/>
 {(['copy-links','copy-resources','copy-title'] as const).filter(id=>resourceCommandEnabled(id,resource)).map(id=><MenuAction key={id} icon={resourceCommands[id].icon} hint={id==='copy-resources'?(isMac?'⌘C':'Ctrl+C'):undefined} disabled={busy} onClick={()=>void work(()=>executeResourceCommand(id,resource),close)}>{resourceCommands[id].title}</MenuAction>)}
 <MenuSeparator/>
 {capabilities.rename&&<MenuAction icon={Pencil} hint="F2" disabled={busy} onClick={()=>{close();focus.captureFocus();setName(resource.title);setDialog('rename');}}>Rename…</MenuAction>}
 <MenuAction icon={FolderPlus} disabled={busy} onClick={()=>{close();focus.captureFocus();setDialog('collection');}}>Add to collection…</MenuAction>
 {selection?.collection&&<MenuAction icon={FolderMinus} disabled={busy} onClick={()=>void work(()=>changeMembership([resource.id],'collection',selection.collection!.id,'remove',commandScope()),close)}>Remove from {selection.collection.name}</MenuAction>}
 <MenuAction icon={Tags} disabled={busy} onClick={()=>{close();focus.captureFocus();setDialog('tags');}}>Manage tags…</MenuAction>
 <MenuAction icon={Pin} disabled={busy} onClick={()=>void work(()=>executeResourceCommand('pin',resource),close)}>{resource.favorite?'Unpin':'Pin'}</MenuAction>
 {(capabilities.export||capabilities.download||resourceCommandEnabled('export-copy',resource))&&<MenuSeparator/>}
 {(['export','download','export-copy','reveal-copy','open-copy'] as const).filter(id=>resourceCommandEnabled(id,resource)).map(id=><MenuAction key={id} icon={resourceCommands[id].icon} disabled={busy} onClick={()=>void work(()=>executeResourceCommand(id,resource),close)}>{resourceCommands[id].title}</MenuAction>)}
 <MenuSeparator/>
 <MenuAction icon={Trash2} destructive disabled={busy} onClick={()=>void work(()=>executeResourceCommand('trash',resource),close)}>{resource.type==='linked'?'Move reference to Trash…':'Move to Trash…'}</MenuAction>{error&&<p role="alert">{error}</p>}
 </>}</LibraryPopover>
 {dialog==='rename'&&createPortal(<AppModal open title="Rename resource" onClose={()=>{if(!busy)done();}}><form {...form} className="space-y-3"><input autoFocus aria-label="Resource name" className="organization-input w-full" value={name} maxLength={500} onChange={e=>setName(e.target.value)}/><button className="library-button" disabled={busy||!name.trim()}>Save name</button>{error&&<p role="alert">{error}</p>}</form></AppModal>,document.body)}
 {dialog==='collection'&&<CollectionPicker resourceIds={[resource.id]} onClose={done}/>}
 {dialog==='tags'&&<OrganizationManager initialKind="tag" resourceIds={[resource.id]} onClose={done} onApplied={done} tags={[]} onTag={()=>{}} onTagRenamed={()=>{}} onCollection={()=>{}} selectedCollection={null}/>}
 </>;
}
