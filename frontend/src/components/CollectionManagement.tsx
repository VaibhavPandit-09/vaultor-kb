import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AppModal from './modals/AppModal';
import api from '../lib/api';
import { organizationChanged, type OrganizationItem } from '../lib/organization';
import { organizationError } from '../lib/organizationControls';
export default function CollectionManagement({collection,onClose,onChanged}:{collection:OrganizationItem;onClose:()=>void;onChanged:(item:OrganizationItem|null)=>void}) {
 const [name,setName]=useState(collection.name),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const running=useRef(false);
 async function save(deleting=false){if(running.current)return;running.current=true;setBusy(true);setError('');try{
 if(deleting){await api.delete('/collections/'+collection.id,{backgroundDiagnostic:true});onChanged(null);}
 else{const {data}=await api.put<OrganizationItem>('/collections/'+collection.id,{name},{backgroundDiagnostic:true});onChanged(data);}
 organizationChanged('collection');onClose();
 }catch(e){setError(organizationError(e));}finally{running.current=false;setBusy(false);}}
 return createPortal(<AppModal open title={'Manage '+collection.name} onClose={()=>{if(!running.current)onClose();}}><form className="space-y-3" onSubmit={e=>{e.preventDefault();void save();}}><label className="block text-sm">Collection name<input className="organization-input w-full mt-2" maxLength={100} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label><button className="library-button" disabled={busy||!name.trim()}>Save name</button>{error&&<p role="alert">{error}</p>}<div className="border-t border-border pt-4">{confirm?<><p className="text-sm mb-2">Delete this collection? Its notes and files will be kept.</p><button type="button" className="library-button text-red-500" disabled={busy} onClick={()=>void save(true)}>Confirm delete</button><button type="button" className="library-button" onClick={()=>setConfirm(false)}>Cancel</button></>:<button type="button" className="library-button text-red-500" onClick={()=>setConfirm(true)}>Delete collection…</button>}</div></form></AppModal>,document.body);
}
