import { useEffect, useState } from 'react';
import AppModal from './AppModal';
import api from '../../lib/api';
import { getLocalDiagnostics } from '../../lib/diagnostics';
import { getPlatform, getConnection } from '../../lib/platform';
import { CLIENT_BUILD, CLIENT_PROTOCOL, getAcceptedCapabilities } from '../../lib/connection';
import { getDesktopBuild, unwrap } from '../../lib/desktop';
import type {FileCoverage} from '../../lib/resourceSearch';
export default function DiagnosticsPanel({open,onClose}:{open:boolean;onClose:()=>void}) {
  const [searchStatus,setSearchStatus]=useState<{rebuilding:boolean;processed:number;resources:number;indexed:number;complete:boolean;failure:string;files?:FileCoverage}|null>(null);
  const [fileJobs,setFileJobs]=useState<{items:{id:string;title:string;state:string;detail:string}[];totalPages:number}|null>(null),[filePage,setFilePage]=useState(0),[fileBusy,setFileBusy]=useState(false);
  async function filesRefresh(page=filePage,retry=false){if(fileBusy)return;setFileBusy(true);try{if(retry)await api.post('/diagnostics/search/files/retry');setFileJobs((await api.get('/diagnostics/search/files',{params:{page,size:30}})).data);setFilePage(page);await searchRefresh();}catch{setSearchError('Could not load file coverage. Update the host to 0.7.0 or retry.');}finally{setFileBusy(false);}}
  const [searchError,setSearchError]=useState('');
  async function searchRefresh(rebuild=false){try{setSearchError('');const {data}=rebuild?await api.post('/diagnostics/search/rebuild'):await api.get('/diagnostics/search');setSearchStatus(data);}catch{setSearchError('Could not access the search index. Retry.');}}
  const [report,setReport]=useState<unknown>(null);
  const [localReport,setLocalReport]=useState<unknown>(null);
  async function refresh() {
    const local=window.vaultorDesktop?.localStatus?.().then(unwrap).catch(e=>({error:String(e)}));
    if(local) void local.then(setLocalReport);
    const results=await Promise.allSettled(['/health','/capabilities','/diagnostics/events','/diagnostics/integrity','/diagnostics/search'].map(path=>api.get(path)));
    const localServer=await local;
    setReport({generatedAt:new Date().toISOString(),clientBuild:CLIENT_BUILD,desktopBuild:getDesktopBuild(),localServer,serverBuild:getAcceptedCapabilities()?.serverBuild,clientProtocol:CLIENT_PROTOCOL,connection:getConnection(),browser:getLocalDiagnostics(),server:results.map(r=>r.status==='fulfilled'?r.value.data:{error:String(r.reason)})});
  }
  useEffect(()=>{if(open) { const timer=setTimeout(()=>{void refresh();void searchRefresh();},0); return ()=>clearTimeout(timer); }},[open]);
  return <AppModal open={open} onClose={onClose} title="Diagnostics" description="Recent failures, request IDs, backend health, and workspace integrity." widthClassName="max-w-4xl">
    <div className="flex gap-3 pb-3"><button onClick={()=>void refresh()}>Refresh</button><button onClick={()=>void getPlatform().saveBlob(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),'vaultor-diagnostics.json').catch(()=>setSearchError('Report download failed. Retry.'))}>Download report</button><button onClick={()=>void api.get<Blob>('/openapi.json',{responseType:'blob'}).then(({data})=>getPlatform().saveBlob(data,'vaultor-openapi.json')).catch(()=>setSearchError('Specification download failed. Retry.'))}>API specification</button></div>
    <div className="rounded-lg border border-border p-3 mb-3 text-sm"><strong>Saved-content search index</strong><p>{searchStatus?`${searchStatus.indexed} / ${searchStatus.resources} titles and note documents · ${searchStatus.rebuilding?'Rebuilding':searchStatus.complete?'Ready':'Incomplete'}`:'Loading…'}</p>{searchStatus?.files&&<p>Files: {searchStatus.files.indexed} searchable · {searchStatus.files.queued+searchStatus.files.indexing} pending · {searchStatus.files.unsupported} unsupported · {searchStatus.files.noText} without text · {searchStatus.files.limitExceeded+searchStatus.files.encrypted+searchStatus.files.invalid+searchStatus.files.failed} unavailable</p>}{searchStatus?.failure&&<p role="alert">{searchStatus.failure}</p>}{searchStatus?.files?.failure&&<p role="alert">{searchStatus.files.failure}</p>}{searchError&&<p role="alert">{searchError}</p>}<button className="library-button" onClick={()=>void searchRefresh()}>Refresh index status</button><button className="library-button" disabled={searchStatus?.rebuilding} onClick={()=>void searchRefresh(true)}>Rebuild search index</button><button className="library-button" disabled={fileBusy} onClick={()=>void filesRefresh()}>Inspect file coverage</button><button className="library-button" disabled={fileBusy} onClick={()=>void filesRefresh(0,true)}>Retry unavailable files</button>{fileJobs&&<><ul>{fileJobs.items.map(item=><li key={item.id} className="py-2 border-b border-border"><span className="break-words">{item.title}</span><span className="block text-xs text-[var(--text-secondary)]">{item.state} · {item.detail}</span></li>)}</ul>{fileJobs.totalPages>1&&<div><button disabled={fileBusy||filePage===0} onClick={()=>void filesRefresh(filePage-1)}>Previous files</button><button disabled={fileBusy||filePage+1>=fileJobs.totalPages} onClick={()=>void filesRefresh(filePage+1)}>Next files</button></div>}</>}</div>
    <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs">{report?JSON.stringify(report,null,2):localReport?JSON.stringify({localServer:localReport,server:'Waiting for server diagnostics…'},null,2):'Loading diagnostics…'}</pre>
  </AppModal>;
}
