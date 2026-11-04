import { useRef, useState } from 'react';
import type { Resource } from '../types';
import type { OrganizationItem } from '../lib/organization';
import { useSelection } from '../lib/resourceSelection';
import { changeMembership, commandScope, pinResources } from '../lib/resourceBatchCommands';
import { requestResourceAction } from '../lib/resourceActions';
import { CollectionPicker } from './ResourceCollections';
import OrganizationManager from './OrganizationManager';
import LibraryPopover from './LibraryPopover';
import { MoreHorizontal } from 'lucide-react';
import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';
import { useDesktopInteraction } from '../lib/desktopInteraction';

export default function ResourceBatchActions({resources,collection,contextResource}:{resources:Resource[];collection?:OrganizationItem|null;contextResource?:Resource}){
 const selection=useSelection(),interaction=useDesktopInteraction(),focus=useRestoreFocusOnClose();
 const [targets,setTargets]=useState<Resource[]>([]),[dialog,setDialog]=useState<'collection'|'tags'|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const running=useRef(false);
 async function work(task:()=>Promise<void>){if(running.current)return;running.current=true;setBusy(true);setError('');try{await task();}catch(failure){const detail=failure instanceof Error?failure.message:'Organization failed. Your selection is retained.';setError(detail);interaction?.report(detail,true);}finally{running.current=false;setBusy(false);}}
 const scope=()=>interaction?.scope??commandScope();
 const pin=async(favorite:boolean)=>{const result=await pinResources(resources,favorite,scope());selection?.remove(result.completed);if(result.failed.length)throw new Error(result.completed.length+' completed; '+result.failed.length+' failed. '+result.failed.map(item=>item.title+': '+item.detail).join('; '));};
 const done=()=>{setDialog(null);focus.restoreFocus();};
 const actions=(close:()=>void)=><><button disabled={busy} className="library-button" onClick={()=>{close();focus.captureFocus();setTargets(resources);setDialog('collection');}}>Add to collection…</button><button disabled={busy} className="library-button" onClick={()=>{close();focus.captureFocus();setTargets(resources);setDialog('tags');}}>Apply / remove tags…</button>{collection&&<button disabled={busy} className="library-button" onClick={()=>void work(async()=>{await changeMembership(resources.map(item=>item.id),'collection',collection.id,'remove',scope());selection?.remove(resources.map(item=>item.id));close();})}>Remove from this collection</button>}<button disabled={busy} className="library-button" onClick={()=>void work(async()=>{await pin(true);close();})}>Pin selection</button><button disabled={busy} className="library-button" onClick={()=>void work(async()=>{await pin(false);close();})}>Unpin selection</button><button disabled={busy} className="library-button text-red-500" onClick={()=>void work(async()=>{await requestResourceAction('trash',resources);close();})}>Move selection to Trash…</button></>;
 return <>{contextResource?<LibraryPopover contextTarget=".library-row" label={'Actions for '+contextResource.title} trigger={<MoreHorizontal size={17}/>} className="browse-icon-button">{close=><><p className="text-xs px-2">{resources.length} selected</p>{actions(close)}{error&&<p role="alert">{error}</p>}</>}</LibraryPopover>:<><LibraryPopover label="Organize selection">{close=><>{actions(close)}{error&&<p role="alert">{error}</p>}</>}</LibraryPopover>{error&&<p role="alert">{error}</p>}</>}{dialog==='collection'&&<CollectionPicker resourceIds={targets.map(item=>item.id)} onClose={done}/>}{dialog==='tags'&&<OrganizationManager initialKind="tag" resourceIds={targets.map(item=>item.id)} onClose={done} onApplied={done} tags={[]} onTag={()=>{}} onTagRenamed={()=>{}} onCollection={()=>{}} selectedCollection={null}/>}</>;
}
