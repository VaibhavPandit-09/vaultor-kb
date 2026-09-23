import { useEffect, useRef, useState } from 'react';
import AppModal from './AppModal';
import api from '../../lib/api';

type Format = { scope: string; format: string; mediaType: string; extension: string };
type Operation = { id: string; status: string; phase: string; progress: number; detail?: string; requestId?: string; filename?: string; warnings?: string[] };
const labels: Record<string, string> = { md: 'Markdown (.md)', 'md-assets': 'Markdown + assets (.zip)', pdf: 'PDF (.pdf)', docx: 'Word (.docx)' };
function message(error: unknown) {
  const failure = error as { response?: { data?: { detail?: string; requestId?: string } }; message?: string };
  const problem = failure.response?.data;
  return (problem?.detail || failure.message || 'Export failed. Please retry.') + (problem?.requestId ? ` · ${problem.requestId}` : '');
}
export default function NoteExportModal({ noteId, title, flush, onClose }: { noteId: string; title: string; flush: () => Promise<void>; onClose: () => void }) {
  const [formats, setFormats] = useState<Format[]>([]);
  const [format, setFormat] = useState('md');
  const [formatAttempt, setFormatAttempt] = useState(0);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [pollAttempt, setPollAttempt] = useState(0);
  const alive = useRef(true);
  const busy = pending || Boolean(operation && ['QUEUED', 'RUNNING'].includes(operation.status));
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    void api.get<Format[]>('/export-formats', { signal: controller.signal }).then(({ data }) => setFormats(data.filter(f => f.scope === 'notes'))).catch(e => { if (!controller.signal.aborted) setError(message(e)); });
    return () => controller.abort();
  }, [formatAttempt]);
  const operationId = operation?.id;
  const operationStatus = operation?.status;
  useEffect(() => {
    if (!operationId || !operationStatus || !['QUEUED', 'RUNNING'].includes(operationStatus)) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>; let failures = 0;
    const poll = async () => {
      try {
        const { data } = await api.get<Operation>('/operations/' + operationId, { signal: controller.signal });
        if (controller.signal.aborted) return;
        failures = 0; setOperation(data); setError('');
        if (['QUEUED', 'RUNNING'].includes(data.status)) timer = setTimeout(() => void poll(), 1000);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(message(e));
        if (++failures < 3) timer = setTimeout(() => void poll(), 2000);
      }
    };
    timer = setTimeout(() => void poll(), 500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [operationId, operationStatus, pollAttempt]);
  async function start() {
    setPending(true); setError(''); setOperation(null);
    try {
      await flush();
      const { data } = await api.post<Operation>('/exports', { scope: 'notes', format, noteId });
      if (alive.current) setOperation(data);
    } catch (e) { if (alive.current) setError(message(e)); }
    finally { if (alive.current) setPending(false); }
  }
  async function download() {
    if (!operation) return;
    setPending(true); setError('');
    try {
      const { data } = await api.get<Blob>('/exports/' + operation.id + '/download', { responseType: 'blob' });
      const url = URL.createObjectURL(data); const link = document.createElement('a');
      link.href = url; link.download = operation.filename || 'note.' + (formats.find(f => f.format === format)?.extension ?? format);
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(message(e)); } finally { setPending(false); }
  }
  return <AppModal open onClose={() => { if (!pending) onClose(); }} title="Export note" description={title}>
    <div className="space-y-4">
      <fieldset disabled={busy} className="space-y-2"><legend className="mb-2 text-sm font-medium">Format</legend>
        {formats.map(f => <label key={f.format} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 hover:bg-background"><input type="radio" name="note-export-format" value={f.format} checked={format === f.format} onChange={() => { setFormat(f.format); setOperation(null); setError(''); }} />{labels[f.format] ?? f.format}</label>)}
      </fieldset>
      <p className="text-xs text-[var(--text-secondary)]">Saves pending changes, then exports a fixed snapshot. Linked notes remain workspace references. Asset ZIP includes referenced local files. Remote images are never fetched.</p>
      {format === 'md' && <p className="text-xs text-[var(--text-secondary)]">Tables and underline/highlight use embedded HTML. Choose the asset ZIP to include linked files.</p>}
      {error && formats.length === 0 && <button className="rounded-lg border border-border px-3 py-2" onClick={() => { setError(''); setFormatAttempt(n => n + 1); }}>Retry loading formats</button>}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {pending && <p role="status">{operation?.status === 'SUCCEEDED' ? 'Downloading…' : 'Saving note and preparing export…'}</p>}
      {operation && <div aria-live="polite" className="space-y-2 text-sm"><p>{operation.phase} · {operation.progress}%</p><p>{operation.detail}</p>{busy && <progress className="w-full" value={operation.progress} max={100} />}<p className="break-all text-xs text-[var(--text-secondary)]">Operation {operation.id} · Request {operation.requestId}</p></div>}
      {!!operation?.warnings?.length && <div className="rounded-xl border border-amber-500/40 p-3 text-sm"><p className="mb-2 font-medium">Export notes</p><ul className="list-disc space-y-1 pl-5">{operation.warnings.map(w => <li key={w}>{w}</li>)}</ul></div>}
      {error && operation && ['QUEUED', 'RUNNING'].includes(operation.status) && <button className="rounded-lg border border-border px-3 py-2" onClick={() => setPollAttempt(n => n + 1)}>Retry status check</button>}
      {operation?.status === 'SUCCEEDED' ? <button disabled={pending} className="rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-50" onClick={() => void download()}>Download {operation.filename}</button> : <button disabled={busy || !formats.some(f => f.format === format)} className="rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-50" onClick={() => void start()}>{error || operation?.status === 'FAILED' ? 'Retry export' : 'Create export'}</button>}
      {operation && <p className="text-xs text-[var(--text-secondary)]">You can close this dialog after preparation; the operation continues in the background. Keep the operation ID to retrieve it through the API.</p>}
    </div>
  </AppModal>;
}
