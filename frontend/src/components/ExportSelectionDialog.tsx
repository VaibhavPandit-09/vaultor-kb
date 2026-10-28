import {useRef,useState} from 'react';
import AppModal from './modals/AppModal';
import type {Resource} from '../types';
import {requestResourceAction} from '../lib/resourceActions';
import {dispatchTransfer} from '../lib/transferActivity';
export default function ExportSelectionDialog({resources,onClose}:{resources:Resource[];onClose():void}){
 const [pending,setPending]=useState(false),[error,setError]=useState(''),running=useRef(false);
 async function apply(){if(running.current)return;running.current=true;setPending(true);setError('');try{await requestResourceAction('prepare-export',resources);await dispatchTransfer('workspace-export',undefined,'Export '+resources.length+' selected items',resources.map(resource=>resource.id));onClose();}catch(e){setError((e as Error).message);}finally{running.current=false;setPending(false);}}
 return <AppModal open title="Export selection" onClose={()=>{if(!pending)onClose();}} footer={<button className="library-button" disabled={pending} onClick={()=>void apply()}>Create ZIP</button>}><p className="text-sm">Export {resources.length} selected items to a ZIP. Save it from Activity when ready.</p><details className="text-sm mt-3"><summary>What’s included</summary><p>Includes selected items, their tags and collections. Other items and external source files are excluded. Links to omitted items stay as text. This ZIP can add copies to a workspace; it cannot replace one.</p></details>{error&&<p role="alert" className="text-sm text-red-500">{error}</p>}</AppModal>;
}
