import { useEffect, useState } from 'react';
import AppModal from './AppModal';
import api from '../../lib/api';
import { getLocalDiagnostics } from '../../lib/diagnostics';
import { getPlatform, getConnection } from '../../lib/platform';
import { CLIENT_BUILD, CLIENT_PROTOCOL, getAcceptedCapabilities } from '../../lib/connection';
import { getDesktopBuild, unwrap } from '../../lib/desktop';
export default function DiagnosticsPanel({open,onClose}:{open:boolean;onClose:()=>void}) {
  const [searchStatus,setSearchStatus]=useState<{rebuilding:boolean;processed:number;resources:number;indexed:number;complete:boolean;failure:string}|null>(null);
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
    <div className="rounded-lg border border-border p-3 mb-3 text-sm"><strong>Saved-note search index</strong><p>{searchStatus?`${searchStatus.indexed} / ${searchStatus.resources} resources indexed · ${searchStatus.rebuilding?'Rebuilding':searchStatus.complete?'Ready':'Incomplete'}`:'Loading…'}</p>{searchStatus?.failure&&<p role="alert">{searchStatus.failure}</p>}{searchError&&<p role="alert">{searchError}</p>}<button className="library-button" onClick={()=>void searchRefresh()}>Refresh index status</button><button className="library-button" disabled={searchStatus?.rebuilding} onClick={()=>void searchRefresh(true)}>Rebuild search index</button></div>
    <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs">{report?JSON.stringify(report,null,2):localReport?JSON.stringify({localServer:localReport,server:'Waiting for server diagnostics…'},null,2):'Loading diagnostics…'}</pre>
  </AppModal>;
}
