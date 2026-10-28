import {WorkspaceSelectionContext} from '../../lib/workspaceSelection';
import { useContext,useEffect, useRef, useState } from 'react';
import AppModal from './AppModal';
import api from '../../lib/api';
import { getConnection,saveApiFile } from '../../lib/platform';
import { pickFiles } from '../../lib/filePicker';
import { dispatchTransfer } from '../../lib/transferActivity';
import type { Identity } from '../../lib/sessionStore';
type Operation = { id: string; kind: string; status: string; phase: string; progress: number; detail?: string; requestId?: string };
type Preview = { partial?:boolean; operation: Operation; resources: number; files: number; notes: number; tags: number; reviews?: number; warnings: string[] };
export default function TransferModal({ mode, onClose, flush, onImported }: {
  mode: 'export' | 'import' | null; onClose: () => void; flush: () => Promise<void>; onImported: () => Promise<void>;
}) {
  const workspaceSelector=useContext(WorkspaceSelectionContext);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [modify,setModify]=useState(false);
  const [mergeMode, setMergeMode] = useState('merge');
  const [confirmed, setConfirmed] = useState(false);
  const completed = useRef<string | null>(null);
  const source=useRef<{epoch:number;identity:Promise<Identity|undefined>}|undefined>(undefined);
  useEffect(()=>{if(!mode){source.current=undefined;return;}const epoch=getConnection().epoch;source.current={epoch,identity:api.get<Identity>('/workspace/identity',{connectionEpoch:epoch,backgroundDiagnostic:true}).then(({data})=>data).catch(e=>{setError((e as Error).message);return undefined;})};},[mode]);
  async function originalSource(){const selected=source.current;if(!selected)throw Error('Wait for source verification.');const workspace=await selected.identity;if(!workspace)throw Error('Original workspace could not be verified. Reopen this review.');return {workspace,epoch:selected.epoch};}
  function closeReview(){setOperation(null);setPreview(null);setError('');setConfirmed(false);setModify(false);onClose();}
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
    const outcome = await saveApiFile('/exports/'+operation.id+'/download', 'workspace.zip');
    if(outcome==='cancelled') throw new Error('Save cancelled. The prepared ZIP is ready to download again.');
  }
  return <AppModal open={mode !== null} onClose={() => { if(!working)closeReview(); }} title={mode === 'export' ? 'Export workspace' : 'Import workspace'} description="Import or export a workspace ZIP.">
    <div className="space-y-4">
      {error && <p role="alert" className="text-red-500">{error}</p>}
      {mode==='import'&&workspaceSelector?.imports&&!modify&&!working&&<><button className="library-button" onClick={()=>{closeReview();window.dispatchEvent(new Event('vaultor:workspace-import'));}}>Import as a new workspace</button><p className="text-sm">Creates a separate workspace. Approval from the computer sharing it may be required.</p><button className="library-button" onClick={()=>setModify(true)}>Add to or replace this workspace…</button></>}
      {mode === 'import' && (modify||!workspaceSelector?.imports) && !working && <button className="library-button" onClick={()=>void run(async()=>{
          const file=(await pickFiles('.zip'))[0]; if(!file) return;
          const proof=await originalSource();const body=new FormData();body.append('file',file);const {data}=await api.post<Preview>('/imports/preview',body,{connectionEpoch:proof.epoch,headers:{'X-Vaultor-Generation':proof.workspace.generation}});setPreview(data);setOperation(data.operation);if(data.partial)setMergeMode("merge");setConfirmed(false);
        })}>Choose workspace ZIP</button>}
      {preview && operation?.status === 'PREVIEW' && <>
        <p>{preview.notes} notes · {preview.files} files · {preview.tags} tags · {preview.reviews??0} reviews</p>
        {preview.warnings.map((warning,index)=><p key={index} className="text-amber-600">{warning}</p>)}
        {preview?.partial&&<p role="status" className="text-sm">This ZIP contains selected items only. It can add copies but cannot replace this workspace.</p>}
        <label className="block">Import mode <select value={mergeMode} onChange={e=>{setMergeMode(e.target.value);setConfirmed(false);}} className="rounded border bg-background p-2"><option value="merge">Add new copies to this workspace</option><option value="replace" disabled={preview?.partial}>Replace this workspace</option></select></label>
        <p className="text-sm">{mergeMode==='merge'?'Adds new copies of notes, files and reviews. Existing items and settings stay unchanged.':'Removes current items, tags and reviews, then imports the ZIP and its workspace settings. Appearance on this device stays unchanged.'}</p>
        {mergeMode==='replace' && <label className="block text-red-500"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /> I confirm replacement of the current workspace.</label>}
        <button disabled={pending || (mergeMode==='replace' && !confirmed)} className="rounded bg-primary p-3 text-white disabled:opacity-50" onClick={()=>void run(async()=>{const proof=await originalSource();if(mergeMode==='merge'){await dispatchTransfer('workspace-merge',operation.id,undefined,undefined,proof);closeReview();return;}const {data}=await api.post<Operation>('/imports/'+operation.id+'/commit',{mode:mergeMode,confirmation:confirmed?'replace':''},{connectionEpoch:proof.epoch,headers:{'X-Vaultor-Generation':proof.workspace.generation}});setOperation(data);})}>{mergeMode==='replace'?'Replace workspace':'Import new copies'}</button>
      </>}
      {mode==='export' && !working && operation?.status!=='SUCCEEDED' && <button className="rounded bg-primary p-3 text-white" onClick={()=>void run(async()=>{await dispatchTransfer('workspace-export',undefined,undefined,undefined,await originalSource());closeReview();})}>Create ZIP</button>}
      {pending && <p role="status">Uploading and validating…</p>}
      {operation && <div aria-live="polite"><p>{operation.phase}</p><progress max="1" value={operation.status==='SUCCEEDED'?1:undefined} className="w-full" /><p>{operation.detail}</p><p className="text-xs">Operation {operation.id} · Request {operation.requestId}</p></div>}
      {working && <p>Workspace transfer in progress. Please wait before editing.</p>}
      {operation && (['QUEUED','PREVIEW'].includes(operation.status) || (operation.kind==='import' && operation.status==='RUNNING' && operation.phase==='preparing')) && <button className="rounded border p-2" onClick={()=>void run(async()=>{const {data}=await api.post<Operation>('/operations/'+operation.id+'/cancel');setOperation(data);}, false)}>Cancel import</button>}
      {operation?.status==='FAILED' && <p>Choose the archive again to retry an import. Export can be retried above.</p>}
      {operation?.status==='SUCCEEDED' && operation.kind==='export' && <button className="rounded bg-primary p-3 text-white" onClick={()=>void run(download, false)}>Download ZIP</button>}
    </div>
  </AppModal>;
}
