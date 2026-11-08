import {useRef,useState} from 'react';
import type {Resource} from '../types';
import {executeResourceCommand} from '../lib/resourceActions';
import {commandScope,requireCommandScope} from '../lib/resourceBatchCommands';
import {useFormKeyboard} from '../lib/useFormKeyboard';
import AppModal from './modals/AppModal';
export default function ResourceRenameDialog({resource,onClose}:{resource:Resource;onClose:()=>void}){
 const [name,setName]=useState(resource.title),[busy,setBusy]=useState(false),[error,setError]=useState(''),[scope]=useState(commandScope),running=useRef(false);
 const save=async()=>{if(running.current||!name.trim())return;running.current=true;setBusy(true);setError('');try{requireCommandScope(scope);await executeResourceCommand('rename',resource,name.trim());onClose();}catch(error){setError(error instanceof Error?error.message:'Rename failed.');}finally{running.current=false;setBusy(false);}};
 const form=useFormKeyboard(save);
 return <AppModal open title="Rename resource" onClose={()=>{if(!running.current)onClose();}}><form {...form} className="space-y-3"><input autoFocus aria-label="Resource name" className="organization-input w-full" value={name} maxLength={500} onChange={event=>setName(event.target.value)}/><button className="library-button" disabled={busy||!name.trim()}>Save name</button>{error&&<p role="alert">{error}</p>}</form></AppModal>;
}
