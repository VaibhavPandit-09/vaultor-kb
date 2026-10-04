import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { blockConnectionSwitch } from '../../lib/desktop';
import { Download, FileText, LoaderCircle, X } from 'lucide-react';
import AppModal from './AppModal';
import api from '../../lib/api';
import { NoteExportController, exportFailure, type ExportFormat, type ExportJob, type GraphPreview } from '../../lib/noteExportController';

const labels: Record<string, string> = { md: 'Markdown (.md)', 'md-assets': 'Markdown + assets (.zip)', pdf: 'PDF (.pdf)', docx: 'Word (.docx)' };
const button = 'aria-pressed:bg-[var(--surface-3)] aria-pressed:border-primary rounded-xl border border-border px-3 py-2 text-sm hover:bg-[var(--surface-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50';
function Progress({ job, manager }: { job: ExportJob; manager: NoteExportController }) {
  const busy = !['error', 'downloaded'].includes(job.stage);
  const status = { saving: 'Saving note…', preparing: 'Preparing export…', downloading: 'Saving export…', downloaded: job.outcome === 'saved' ? 'Saved' : 'Download requested', error: 'Export needs attention' }[job.stage];
  return <div className="space-y-3 text-sm">
    <p role="status" className="flex items-center gap-2">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}{status}</p>
    {job.stage === 'saving' && <button className={button} onClick={manager.cancel}>Cancel export</button>}
    {job.stage === 'preparing' && job.operation && <progress aria-label="Export preparation" className="h-1 w-full" max={100} value={job.operation.progress} />}
    {job.error && <p role="alert" className="text-red-500">{job.error}</p>}
    {job.retry && <button className={button} onClick={() => void manager.retry()}>{job.retry === 'download' ? 'Retry download' : job.retry === 'status' ? 'Retry status check' : 'Retry export'}</button>}
    {job.stage === 'downloaded' && <button className={button} onClick={() => void manager.downloadAgain()}>Download again</button>}
    {job.stage === 'error' && !job.retry && <p className="text-xs text-[var(--text-secondary)]">The request could not be confirmed. Check Diagnostics before starting another export.</p>}
    {!!job.operation?.warnings?.length && <details className="text-[var(--text-secondary)]"><summary className="cursor-pointer">Conversion warnings ({job.operation.warnings.length})</summary><ul className="mt-2 list-disc space-y-1 pl-5">{job.operation.warnings.map(w => <li key={w}>{w}</li>)}</ul></details>}
    <details className="text-xs text-[var(--text-secondary)]"><summary className="cursor-pointer">Details</summary><div className="mt-2 space-y-2 break-words">
      <p>{labels[job.format.format]} · {job.title}</p>
      <p>Exports a saved snapshot. {job.linked ? 'Includes outgoing linked notes and local files.' : 'Linked notes are not included.'} Remote images are not fetched.</p>
      {job.format.format === 'md' && <p>Tables and underline/highlight use HTML. Use the asset ZIP to include referenced files.</p>}
      {job.operation && <p>Operation {job.operation.id}</p>}
      {(job.requestId || job.operation?.requestId) && <p>Request {job.requestId || job.operation?.requestId}</p>}
    </div></details>
  </div>;
}

/** Always mounted by Dashboard; only the picker is conditional. */
export default function NoteExportModal({ noteId, title, flush, flushNote, onClose }: { noteId?: string; title: string; flush: () => Promise<void>; flushNote?: (id: string) => Promise<void>; onClose: () => void }) {
  const [manager] = useState(() => new NoteExportController());
  const job = useSyncExternalStore(manager.subscribe, manager.snapshot);
  useEffect(() => { if (job && ['saving', 'preparing', 'downloading'].includes(job.stage)) return blockConnectionSwitch('note export preparation/download'); }, [job]);
  const lastStage = useRef(job?.stage);
  useEffect(() => {
    const justDownloaded = job?.stage === 'downloaded' && lastStage.current !== 'downloaded';
    lastStage.current = job?.stage;
    if (justDownloaded && noteId === job?.noteId) onClose();
  }, [job, noteId, onClose]);
  const [linked, setLinked] = useState(false);
  const [references, setReferences] = useState(false);
  const [previewState, setPreviewState] = useState<{ key: string; data?: GraphPreview; error?: string }>();
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [previewOwner, setPreviewOwner] = useState(noteId);
  if (previewOwner !== noteId) { setPreviewOwner(noteId); setLinked(false); setReferences(false); }
  const previewKey = `${noteId}:${linked}:${previewAttempt}`;
  const preview = previewState?.key === previewKey ? previewState.data : undefined;
  const previewError = previewState?.key === previewKey ? previewState.error : undefined;
  useEffect(() => {
    if (!noteId || !linked) return;
    const controller = new AbortController();
    void api.get<GraphPreview>('/exports/notes/' + noteId + '/preview', { signal: controller.signal }).then(({data}) => {
      if (!controller.signal.aborted) setPreviewState({key: previewKey, data});
    }).catch(e => { if (!controller.signal.aborted) setPreviewState({key: previewKey, error: exportFailure(e).error}); });
    return () => controller.abort();
  }, [noteId, linked, previewKey]);
  const [formats, setFormats] = useState<ExportFormat[]>([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => () => manager.dispose(), [manager]);
  useEffect(() => {
    if (!noteId) return;
    const controller = new AbortController();
    void api.get<ExportFormat[]>('/export-formats', { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) { setFormats(data.filter(f => f.scope === 'notes' && labels[f.format])); setError(''); }
    }).catch(e => { if (!controller.signal.aborted) setError(exportFailure(e).error); });
    return () => controller.abort();
  }, [noteId, attempt]);
  const blocked = Boolean(job && job.stage !== 'downloaded');
  return <>
    <AppModal open={Boolean(noteId)} onClose={onClose} title="Export note" description={title}>
      <div className="space-y-4">
        <div className="flex gap-2" role="group" aria-label="Export scope">
          <button className={button} aria-pressed={!linked} disabled={blocked} onClick={() => setLinked(false)}>This note</button>
          <button className={button} aria-pressed={linked} disabled={blocked} onClick={() => setLinked(true)}>Include linked resources</button>
        </div>
        {linked && <div className="text-sm text-[var(--text-secondary)]">{preview ? <p>{preview.notes} notes · {preview.files} files · Saved links{preview.files > 0 && ' · Downloads as ZIP'}</p> : <p role="status">{previewError || 'Counting linked resources…'}</p>}{previewError && <button className={button} onClick={() => setPreviewAttempt(n => n + 1)}>Retry preview</button>}{!!preview?.warnings.length && <details><summary>Missing resources</summary>{preview.warnings.map(w => <p key={w}>{w}</p>)}</details>}</div>}
        <details className="text-sm"><summary className="cursor-pointer">Options</summary><label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={references} disabled={blocked} onChange={e => setReferences(e.target.checked)} />Include omitted/missing references list</label></details>
        <div className="grid gap-2">{formats.filter(format => !linked || format.format !== 'md-assets').map(format => <button key={format.format} disabled={blocked || (linked && !preview)} className={button + ' flex items-center gap-3 text-left'} onClick={() => { if (noteId) void manager.start(noteId, title, format, flush, { linked, references, flushNote, reviewedGraph: preview }); }}><FileText size={18} />{linked && (format.format.startsWith('md') || (preview?.files ?? 0) > 0) ? labels[format.format].replace(/\(.*\)/, '') + 'package (.zip)' : labels[format.format]}</button>)}</div>
        {!formats.length && !error && <p role="status">Loading formats…</p>}
        {error && <div><p role="alert">{error}</p><button className={button} onClick={() => setAttempt(n => n + 1)}>Retry loading formats</button></div>}
        {job && <div className="border-t border-border pt-4">{job.noteId !== noteId && <p className="mb-2 truncate font-medium">Exporting {job.title}</p>}<Progress job={job} manager={manager} />{job.stage === 'error' && <button className={button + ' mt-3'} onClick={() => { manager.clear(); setPreviewAttempt(n => n + 1); }}>Dismiss export</button>}</div>}
      </div>
    </AppModal>
    {!noteId && job && <aside aria-label="Note export" className="fixed bottom-4 right-4 z-[85] max-h-[50vh] w-80 max-w-[calc(100vw-2rem)] overflow-auto rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-4 text-[var(--text-primary)] shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-2"><p className="truncate text-sm font-medium">{job.title}</p>{['error', 'downloaded'].includes(job.stage) && <button aria-label="Dismiss export" className="rounded p-1 hover:bg-[var(--surface-3)]" onClick={manager.clear}><X size={16} /></button>}</div>
      <Progress job={job} manager={manager} />
    </aside>}
  </>;
}
