import {useEffect,useState} from 'react';
import api from '../lib/api';
type Request={id:string;deviceId:string;input:{filename:string;sha256:string;name:string;bytes:number;workspaceId:string};state:string;preview?:{notes:number;files:number;warnings:string[]}};
/** Host owner authorizes only the exact staged archive; devices never receive owner authority. */
export default function CollectedZipApprovals(){
 const [rows,setRows]=useState<Request[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){try{const rows=(await api.get<Request[]>('/owner/collected-zips',{backgroundDiagnostic:true})).data;if(!Array.isArray(rows))throw Error('Host ZIP requests could not be read. Existing transfers remain available.');setRows(rows);setError('');}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void refresh();},[]);
 async function act(id:string,action:string){setBusy(true);try{await api.post('/owner/collected-zips/'+id+'/'+action,undefined,{backgroundDiagnostic:true,timeout:120000});await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section aria-label="Collected workspace ZIP approvals" className="space-y-2"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">Workspace import requests</h3><button className="library-button" disabled={busy} onClick={()=>void refresh()}>Refresh requests</button></div>
 {error&&<p role="alert" className="text-sm text-red-400">{error}</p>}
 {!rows.length&&<p className="text-sm text-[var(--text-secondary)]">Android requests appear here for your approval.</p>}
 {rows.map(r=><div key={r.id} className="border-t border-border py-2 space-y-1"><p className="text-sm font-medium break-words">{r.input.name} · {r.input.filename}</p><p role="status" className="text-sm">{({AWAITING_OWNER:'Needs review',PREVIEWED:'Ready to approve',APPROVED:'Approved',SUCCEEDED:'Workspace created',FAILED:'Could not finish',REJECTED:'Rejected'} as Record<string,string>)[r.state]??'Needs review'} · {(r.input.bytes/1048576).toFixed(1)} MiB</p><details><summary className="text-sm">Details</summary><p className="text-xs break-all">State {r.state}<br/>Device {r.deviceId}<br/>Source {r.input.workspaceId}<br/>SHA-256 {r.input.sha256}<br/>Operation {r.id}</p></details>
 {r.preview&&<><p className="text-sm">{r.preview.notes} notes · {r.preview.files} files. Creates a separate workspace.</p>{r.preview.warnings.map((w,i)=><p key={i} className="text-sm">{w}</p>)}</>}
 <div className="flex flex-wrap gap-2">{r.state==='AWAITING_OWNER'&&<button className="library-button" disabled={busy} onClick={()=>void act(r.id,'preview')}>Review ZIP</button>}{r.state==='PREVIEWED'&&<button className="library-button" disabled={busy} onClick={()=>void act(r.id,'approve')}>Create workspace</button>}{r.state==='APPROVED'&&<button className="library-button" disabled={busy} onClick={()=>void act(r.id,'approve')}>Check workspace creation</button>}{['AWAITING_OWNER','PREVIEWED'].includes(r.state)&&<button className="library-button" disabled={busy} onClick={()=>void act(r.id,'reject')}>Reject request</button>}</div></div>)}
 </section>;
}
