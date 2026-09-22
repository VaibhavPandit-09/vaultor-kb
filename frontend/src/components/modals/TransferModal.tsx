import { useEffect, useRef, useState } from 'react';
import AppModal from './AppModal';
import api from '../../lib/api';
type Operation = { id: string; kind: string; status: string; phase: string; progress: number; detail?: string; requestId?: string };
type Preview = { operation: Operation; resources: number; files: number; notes: number; tags: number; warnings: string[] };
export default function TransferModal({ mode, onClose, flush, onImported }: {
  mode: 'export' | 'import' | null; onClose: () => void; flush: () => Promise<void>; onImported: () => Promise<void>;
}) {
  const [operation, setOperation] = useState<Operation | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [mergeMode, setMergeMode] = useState('merge');
  const [confirmed, setConfirmed] = useState(false);
  const completed = useRef<string | null>(null);
  const imported = useRef(onImported); imported.current = onImported;
  const working = pending || Boolean(operation && ['QUEUED', 'RUNNING', 'CLEANUP'].includes(operation.status));
  useEffect(() => {
    if (!operation || !['QUEUED', 'RUNNING', 'CLEANUP'].includes(operation.status)) return;
    let active = true;
    const timer = setInterval(() => {
      void api.get<Operation>('/operations/' + operation.id).then(async ({ data }) => {
        if (!active) return;
        setOperation(data);

      }).catch(() => { if(active) setError('Connection interrupted. Status checks will retry; do not start a duplicate import.'); });
    }, 750);
    return () => { active = false; clearInterval(timer); };
  }, [operation]);
  useEffect(() => {
    if (operation?.status === 'SUCCEEDED' && operation.kind === 'import' && completed.current !== operation.id) {
      completed.current = operation.id;
      void imported.current().catch(error => setError(String(error)));
    }
  }, [operation]);
  async function run(task: () => Promise<void>, flushFirst = true) {
    setPending(true); setError('');
    try { if (flushFirst) await flush(); await task(); } catch(e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setPending(false); }
  }
  async function download() {
    if(!operation) return;
    const {data} = await api.get('/exports/'+operation.id+'/download', {responseType:'blob'});
    const url=URL.createObjectURL(data); const link=document.createElement('a');link.href=url;link.download='workspace.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <AppModal open={mode !== null} onClose={() => { if(!working) {setOperation(null);setPreview(null);setError('');setConfirmed(false);onClose();} }} title={mode === 'export' ? 'Export workspace' : 'Import workspace'} description="Portable ZIP with notes, tags, settings, and files. No password required.">
    <div className="space-y-4">
      {error && <p role="alert" className="text-red-500">{error}</p>}
      {mode === 'import' && !working && <label className="block">Choose workspace ZIP
        <input type="file" accept=".zip" className="block w-full py-3" onChange={event => {
          const file=event.target.files?.[0]; if(!file) return;
          void run(async () => { const body=new FormData();body.append('file',file);const {data}=await api.post<Preview>('/imports/preview',body);setPreview(data);setOperation(data.operation);setConfirmed(false); });
        }} /></label>}
      {preview && operation?.status === 'PREVIEW' && <>
        <p>{preview.notes} notes · {preview.files} files · {preview.tags} tags</p>
        {preview.warnings.map((warning,index)=><p key={index} className="text-amber-600">{warning}</p>)}
        <label className="block">Import mode <select value={mergeMode} onChange={e=>{setMergeMode(e.target.value);setConfirmed(false);}} className="rounded border bg-background p-2"><option value="merge">Merge — add imported resources</option><option value="replace">Replace — remove current resources</option></select></label>
        <p className="text-sm">{mergeMode==='merge'?'Creates new notes/files and keeps existing settings and tag colors.':'Replaces resources, tags and workspace settings. Your appearance preferences remain.'}</p>
        {mergeMode==='replace' && <label className="block text-red-500"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /> I confirm replacement of the current workspace.</label>}
        <button disabled={pending || (mergeMode==='replace' && !confirmed)} className="rounded bg-primary p-3 text-white disabled:opacity-50" onClick={()=>void run(async()=>{const {data}=await api.post<Operation>('/imports/'+operation.id+'/commit',{mode:mergeMode,confirmation:confirmed?'replace':''});setOperation(data);})}>Apply import</button>
      </>}
      {mode==='export' && !working && operation?.status!=='SUCCEEDED' && <button className="rounded bg-primary p-3 text-white" onClick={()=>void run(async()=>{const {data}=await api.post<Operation>('/exports',{scope:'workspace',format:'zip'});setOperation(data);})}>Create ZIP export</button>}
      {pending && <p role="status">Uploading and validating…</p>}
      {operation && <div aria-live="polite"><p>{operation.phase} · {operation.progress}%</p><progress max="100" value={operation.progress} className="w-full" /><p>{operation.detail}</p><p className="text-xs">Operation {operation.id} · Request {operation.requestId}</p></div>}
      {working && <p>Workspace transfer in progress. Please wait before editing.</p>}
      {operation && (['QUEUED','PREVIEW'].includes(operation.status) || (operation.kind==='import' && operation.status==='RUNNING' && operation.phase==='preparing')) && <button className="rounded border p-2" onClick={()=>void run(async()=>{const {data}=await api.post<Operation>('/operations/'+operation.id+'/cancel');setOperation(data);}, false)}>Cancel operation</button>}
      {operation?.status==='FAILED' && <p>Choose the archive again to retry an import. Export can be retried above.</p>}
      {operation?.status==='SUCCEEDED' && operation.kind==='export' && <button className="rounded bg-primary p-3 text-white" onClick={()=>void run(download, false)}>Download ZIP</button>}
    </div>
  </AppModal>;
}
