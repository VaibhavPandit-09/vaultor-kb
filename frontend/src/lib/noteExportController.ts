import api from './api';
import { getPlatform } from './platform';

export type ExportFormat = { scope: string; format: string; extension: string };
export type ExportOperation = { id: string; status: string; phase: string; progress: number; detail?: string; requestId?: string; filename?: string; warnings?: string[] };
export type GraphPreview = { notes: number; files: number; noteIds: string[]; resourceIds: string[]; warnings: string[]; fingerprint: string };
export type ExportOptions = { linked?: boolean; references?: boolean; reviewedGraph?: GraphPreview; flushNote?: (id: string) => Promise<void> };
type Stage = 'saving' | 'preparing' | 'downloading' | 'downloaded' | 'error';
type Retry = 'save' | 'prepare' | 'status' | 'download';
export type ExportJob = { noteId: string; title: string; format: ExportFormat; stage: Stage; operation?: ExportOperation; error?: string; requestId?: string; retry?: Retry; linked?: boolean; graph?: GraphPreview };
export function exportFailure(error: unknown) {
  const failure = error as { response?: { data?: { detail?: string; requestId?: string } }; message?: string };
  return { error: failure.response?.data?.detail || failure.message || 'Export failed. Please try again.', requestId: failure.response?.data?.requestId };
}

/** One live export per workspace view; independent of the format picker lifetime. */
export class NoteExportController {
  private job: ExportJob | null = null;
  private listeners = new Set<() => void>();
  private controller?: AbortController;
  private busy = false;
  private options: ExportOptions = {};
  private flush?: () => Promise<void>;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.job;
  private update(patch: Partial<ExportJob>) { if (this.job) { this.job = { ...this.job, ...patch }; this.listeners.forEach(listener => listener()); } }
  clear = () => { if (!this.busy) { this.job = null; this.flush = undefined; this.listeners.forEach(listener => listener()); } };
  cancel = () => { if (this.job?.stage === 'saving') { this.controller?.abort(); this.update({ stage: 'error', error: 'Export cancelled before preparation.', retry: undefined }); } };
  dispose = () => { this.controller?.abort(); };
  start = async (noteId: string, title: string, format: ExportFormat, flush: () => Promise<void>, options: ExportOptions = {}) => {
    if (this.busy || (this.job && this.job.stage !== 'downloaded')) return;
    this.job = { noteId, title, format, stage: 'saving', linked: options.linked }; this.flush = flush; this.options = options;
    await this.run('save');
  };
  retry = async () => { if (this.job?.retry) await this.run(this.job.retry); };
  downloadAgain = async () => { if (this.job?.operation?.status === 'SUCCEEDED') await this.run('download'); };
  private async run(action: Retry) {
    if (this.busy || !this.job) return;
    this.busy = true;
    const controller = new AbortController(); this.controller = controller;
    const signal = controller.signal;
    this.update({ error: undefined, retry: undefined });
    let retry: Retry | undefined = action;
    try {
      if (action === 'save' || action === 'prepare') {
        this.update({ stage: 'saving' }); retry = 'save';
        await this.flush?.();
        if (signal.aborted) return;
        let graph: GraphPreview | undefined;
        if (this.options.linked) {
          if (!this.options.flushNote) throw new Error('Linked-note saving is unavailable.');
          const saved = new Set([this.job.noteId]);
          for (let round = 0; round < 6; round++) {
            const response = await api.get<GraphPreview>('/exports/notes/' + this.job.noteId + '/preview', { signal });
            if (signal.aborted) return;
            graph = response.data; this.update({ graph });
            const reviewed = this.options.reviewedGraph;
            if (reviewed && (graph.files !== reviewed.files || [...graph.resourceIds].sort().join('|') !== [...reviewed.resourceIds].sort().join('|'))) {
              retry = undefined;
              throw new Error('Linked resources changed after saving. Dismiss export and review the updated counts.');
            }
            const pending = graph.noteIds.filter(id => !saved.has(id));
            if (!pending.length) break;
            if (round === 5) throw new Error('Linked notes keep changing. Retry when editing settles.');
            for (const id of pending) { await this.options.flushNote(id); saved.add(id); if (signal.aborted) return; }
          }
        }
        this.update({ stage: 'preparing', operation: undefined });
        // POST is not idempotent. An ambiguous failure must not automatically create another job.
        retry = undefined;
        const { data } = await api.post<ExportOperation>('/exports', { scope: 'notes', format: this.job.format.format, noteId: this.job.noteId, ...(this.options.linked ? { links: 'linked', fingerprint: graph?.fingerprint } : {}), ...(this.options.references ? { references: 'true' } : {}) }, { signal });
        if (signal.aborted) return;
        this.update({ operation: data });
      }
      if (action !== 'download') {
        retry = 'status'; this.update({ stage: 'preparing' });
        let failures = 0;
        while (this.job.operation && ['QUEUED', 'RUNNING'].includes(this.job.operation.status)) {
          await this.delay(failures ? 2000 : 1000, signal);
          try {
            const { data } = await api.get<ExportOperation>('/operations/' + this.job.operation.id, { signal });
            if (signal.aborted) return;
            this.update({ operation: data }); failures = 0;
          } catch (error) { if (signal.aborted || ++failures >= 3) throw error; }
        }
        const operation = this.job.operation;
        if (operation?.status !== 'SUCCEEDED') {
          retry = operation?.status === 'FAILED' ? 'prepare' : undefined;
          throw new Error(operation?.detail || 'Export did not complete.');
        }
      }
      retry = 'download'; this.update({ stage: 'downloading' });
      const operation = this.job.operation!;
      const { data } = await api.get<Blob>('/exports/' + operation.id + '/download', { responseType: 'blob', signal });
      if (signal.aborted) return;
      const outcome = await getPlatform().saveBlob(data, operation.filename || this.job.title + '.' + this.job.format.extension);
      if (outcome === 'cancelled') throw new Error('Download cancelled. Retry to download the prepared export.');
      this.update({ stage: 'downloaded' });
    } catch (error) {
      if (!signal.aborted) {
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status === 409 && !this.job.operation) retry = 'save';
        this.update({ stage: 'error', ...exportFailure(error), retry });
      }
    } finally { this.busy = false; }
  }
  private delay(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new Error('Export tracking stopped')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
      if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    });
  }
}
