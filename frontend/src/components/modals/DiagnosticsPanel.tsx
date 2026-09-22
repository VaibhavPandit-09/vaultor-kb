import { useEffect, useState } from 'react';
import AppModal from './AppModal';
import api from '../../lib/api';
import { getLocalDiagnostics } from '../../lib/diagnostics';
export default function DiagnosticsPanel({open,onClose}:{open:boolean;onClose:()=>void}) {
  const [report,setReport]=useState<unknown>(null);
  async function refresh() {
    const results=await Promise.allSettled(['/health','/capabilities','/diagnostics/events','/diagnostics/integrity'].map(path=>api.get(path)));
    setReport({generatedAt:new Date().toISOString(),browser:getLocalDiagnostics(),server:results.map(r=>r.status==='fulfilled'?r.value.data:{error:String(r.reason)})});
  }
  useEffect(()=>{if(open) { const timer=setTimeout(()=>void refresh(),0); return ()=>clearTimeout(timer); }},[open]);
  return <AppModal open={open} onClose={onClose} title="Diagnostics" description="Recent failures, request IDs, backend health, and workspace integrity." widthClassName="max-w-4xl">
    <div className="flex gap-3 pb-3"><button onClick={()=>void refresh()}>Refresh</button><button onClick={()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='vaultor-diagnostics.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }}>Download report</button><a href="/api/openapi.json" target="_blank" rel="noreferrer">API specification</a></div>
    <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs">{report?JSON.stringify(report,null,2):'Loading diagnostics…'}</pre>
  </AppModal>;
}
