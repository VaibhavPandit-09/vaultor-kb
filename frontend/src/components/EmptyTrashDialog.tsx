import { useEffect,useRef,useState } from 'react';
import AppModal from './modals/AppModal';
import api from '../lib/api';
import {requireBackgroundOperations} from '../lib/connection';
import { dispatchTrash,type TrashSnapshot } from '../lib/trashActivity';
import { getConnection } from '../lib/platform';
import type { Identity } from '../lib/sessionStore';
import { reportError } from '../lib/diagnostics';
export default function EmptyTrashDialog({onClose}:{onClose():void}){
 const [id]=useState(()=>crypto.randomUUID()),[snapshot,setSnapshot]=useState<TrashSnapshot>(),[identity,setIdentity]=useState<Identity>(),[error,setError]=useState(''),[pending,setPending]=useState(false),[attempt,setAttempt]=useState(0);
 const running=useRef(false),[epoch]=useState(()=>getConnection().epoch);
 function dismiss(){if(running.current)return;if(snapshot&&!snapshot.confirmed)void api.delete('/resources/trash/snapshots/'+id,{connectionEpoch:epoch,headers:{'X-Vaultor-Generation':identity?.generation},backgroundDiagnostic:true}).catch(error=>reportError('trash.preview.cleanup',error,undefined,false));onClose();}
 useEffect(()=>{let active=true;void(async()=>{try{setError('');await requireBackgroundOperations();const workspace=(await api.get<Identity>('/workspace/identity',{connectionEpoch:epoch})).data;const result=(await api.put<TrashSnapshot>('/resources/trash/snapshots/'+id,undefined,{connectionEpoch:epoch,headers:{'X-Vaultor-Generation':workspace.generation}})).data;if(active){setIdentity(workspace);setSnapshot(result);}}catch(e){if(active)setError((e as Error).message);}})();return()=>{active=false;};},[id,epoch,attempt]);
 async function confirm(){if(running.current||!snapshot||!identity)return;running.current=true;setPending(true);setError('');try{await dispatchTrash(snapshot,identity);onClose();}catch(e){setError((e as Error).message);}finally{running.current=false;setPending(false);}}
 return <AppModal open title="Empty Trash?" onClose={dismiss} footer={<div className="flex justify-between gap-2"><button className="library-button" disabled={pending} onClick={dismiss}>Cancel</button><button className="library-button text-red-500" disabled={!snapshot||!snapshot.total||pending} onClick={()=>void confirm()}>Permanently delete {snapshot?.total??'…'} resources</button></div>}>
  {snapshot?<><p className="text-sm">This permanently deletes exactly <strong>{snapshot.total}</strong> trashed resources across all pages, including entries hidden by search. This cannot be undone.</p><p className="text-sm mt-3">{snapshot.sources} active saved notes refer to these resources. Their references will remain broken. Managed originals are removed; linked external files remain untouched.</p><p className="text-sm mt-3">New Trash entries are excluded. Changed or restored resources are protected by their reviewed revisions. Progress and safe retries appear in Activity.</p></>:<p role="status">Preparing an exact Trash snapshot…</p>}
  {error&&<p role="alert" className="text-sm text-red-500">{error}<button className="library-button" onClick={()=>setAttempt(value=>value+1)}>Retry snapshot</button></p>}
 </AppModal>;
}
