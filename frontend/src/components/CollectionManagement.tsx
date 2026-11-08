import { useDesktopInteraction } from '../lib/desktopInteraction';
import { reparentCollection, commandScope,requireCommandScope,commandConfig } from '../lib/resourceBatchCommands';
import CollectionDeletionDialog from './CollectionDeletionDialog';
import CollectionDestination from './CollectionDestination';
import { useFormKeyboard } from '../lib/useFormKeyboard';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AppModal from './modals/AppModal';
import api from '../lib/api';
import { organizationChanged, type OrganizationItem } from '../lib/organization';
import { organizationError } from '../lib/organizationControls';
export default function CollectionManagement({collection,onClose,onChanged,section='manage'}:{section?:'rename'|'move'|'manage';collection:OrganizationItem;onClose:()=>void;onChanged:(item:OrganizationItem|null)=>void}) {
 const interaction=useDesktopInteraction();const [scope]=useState(()=>interaction?.scope??commandScope());
 const [destination,setDestination]=useState<OrganizationItem|null>(collection.parentId?{id:collection.parentId,name:collection.ancestors?.at(-1)?.name??'Parent',count:0}:null);
 const [name,setName]=useState(collection.name),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const running=useRef(false);
 async function save(){if(running.current||!name.trim())return;running.current=true;setBusy(true);setError('');try{
 {requireCommandScope(scope);const {data}=await api.put<OrganizationItem>('/collections/'+collection.id,{name},{...commandConfig(scope),backgroundDiagnostic:true});requireCommandScope(scope);onChanged(data);}
 organizationChanged('collection');onClose();
 }catch(e){setError(organizationError(e));}finally{running.current=false;setBusy(false);}}
 async function move(){if(running.current)return;running.current=true;setBusy(true);setError('');try{const data=await reparentCollection(collection,destination,scope);onChanged(data);onClose();}catch(e){setError(organizationError(e));}finally{running.current=false;setBusy(false);}}
 const form=useFormKeyboard(()=>section==='move'?move():save());
 return createPortal(<AppModal open title={(section==='rename'?'Rename ':section==='move'?'Move ':'Manage ')+collection.name} onClose={()=>{if(!running.current)onClose();}}><form {...form} className="space-y-3">{section!=='move'&&<><label className="block text-sm">Collection name<input autoFocus className="organization-input w-full mt-2" maxLength={100} value={name} readOnly={busy} onChange={e=>setName(e.target.value)}/></label><button className="library-button" disabled={busy||!name.trim()}>Save name</button></>}{section!=='rename'&&<><CollectionDestination value={destination} onChange={setDestination} exclude={collection.id} disabled={busy}/><button type="button" className="library-button" disabled={busy||(destination?.id??null)===(collection.parentId??null)} onClick={()=>void move()}>Move collection and children</button></>}{error&&<p role="alert">{error}</p>}{section==='manage'&&<div className="border-t border-border pt-4"><button type="button" className="library-button text-red-500" onClick={()=>setConfirm(true)}>Delete collection…</button></div>}</form>{confirm&&<CollectionDeletionDialog collection={collection} onClose={()=>setConfirm(false)} onDeleted={()=>{setConfirm(false);onClose();}}/>}</AppModal>,document.body);
}
