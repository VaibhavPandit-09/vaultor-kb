import {useRef,useState} from 'react';
import AppModal from './modals/AppModal';
import type {Resource} from '../types';
import {requestResourceAction} from '../lib/resourceActions';
import {dispatchTransfer} from '../lib/transferActivity';
export default function ExportSelectionDialog({resources,onClose}:{resources:Resource[];onClose():void}){
 const [pending,setPending]=useState(false),[error,setError]=useState(''),running=useRef(false);
 async function apply(){if(running.current)return;running.current=true;setPending(true);setError('');try{await requestResourceAction('prepare-export',resources);await dispatchTransfer('workspace-export',undefined,'Export '+resources.length+' selected resources',resources.map(resource=>resource.id));onClose();}catch(e){setError((e as Error).message);}finally{running.current=false;setPending(false);}}
 return <AppModal open title="Export selection" onClose={()=>{if(!pending)onClose();}} footer={<button className="library-button" disabled={pending} onClick={()=>void apply()}>Prepare partial ZIP in Activity</button>}><p className="text-sm">Export {resources.length} selected resources and their organization in a portable partial ZIP. Unselected resources and external source files are excluded; links to omitted resources stay as text. Partial packages cannot replace a populated workspace.</p>{error&&<p role="alert" className="text-sm text-red-500">{error}</p>}</AppModal>;
}
