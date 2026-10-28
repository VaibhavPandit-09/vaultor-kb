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
 return <AppModal open title="Empty Trash?" onClose={dismiss} footer={<div className="flex justify-between gap-2"><button className="library-button" disabled={pending} onClick={dismiss}>Cancel</button><button className="library-button text-red-500" disabled={!snapshot||!snapshot.total||pending} onClick={()=>void confirm()}>Permanently delete {snapshot?.total??'…'} items</button></div>}>
  {snapshot?<><p className="text-sm">Permanently delete <strong>{snapshot.total}</strong> items from Trash? This cannot be undone.</p><p className="text-sm mt-3">Includes all pages and search-hidden items. Files linked from your computer stay untouched.</p>{snapshot.sources>0&&<p className="text-sm mt-3">{snapshot.sources} saved notes link to these items. Those links will remain broken.</p>}<details className="text-sm mt-3"><summary>Deletion details</summary><p>Copies stored in Vaultor are removed. Items added to Trash later are excluded. Items changed or restored after this review are protected. Follow progress in Activity.</p></details></>:<p role="status">Counting items in Trash…</p>}
  {error&&<p role="alert" className="text-sm text-red-500">{error}<button className="library-button" onClick={()=>setAttempt(value=>value+1)}>Check again</button></p>}
 </AppModal>;
}
