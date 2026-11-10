import {useState} from 'react';
import {createPortal} from 'react-dom';
import AppModal from '../components/modals/AppModal';
import {media} from './media';
import type {Note} from './client';
export default function RenameResource({note,close,committed}:{note:Note;close:()=>void;committed:()=>void}){const [title,setTitle]=useState(note.title),[busy,setBusy]=useState(false),[error,setError]=useState('');return createPortal(<AppModal open title="Rename resource" onClose={()=>{if(!busy)close();}}><form onSubmit={event=>{event.preventDefault();if(busy)return;setBusy(true);void media({op:'rename',id:note.id,title,revision:note.revision}).then(()=>{committed();close();}).catch(e=>setError(String(e))).finally(()=>setBusy(false));}}><input autoFocus aria-label="Resource name" value={title} maxLength={240} onChange={e=>setTitle(e.target.value)}/>{error&&<p role="alert">{error}</p>}<div className="next-recovery-actions"><button type="button" disabled={busy} onClick={close}>Cancel</button><button disabled={busy||!title.trim()}>Rename</button></div></form></AppModal>,document.body);}
