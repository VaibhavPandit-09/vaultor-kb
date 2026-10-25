import type { Editor, JSONContent } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';
import { resetSharedHistory } from '../sharedNoteDocuments';
import { isSharedTransaction } from '../sharedNoteDocuments';
import type { EngineResult } from './engine';
import type { MarkdownPort, WorkerReply } from './protocol';
import { LIMITS } from './limits';
import { snapshotCache } from './foreground';
// Admission constants only; importing parser code here would block the renderer.
export const INTERACTIVE_BYTES = LIMITS.interactiveBytes;

export type MarkdownStatus = { state: 'opening' | 'validating' | 'ready' | 'needs-source' | 'failed' | 'closed'; version: number; acceptedVersion: number; reason?: string };
/** Foreground coordinator: no parsing, source serialization or content replacement. */
export class MarkdownSession {
  status: MarkdownStatus = { state: 'opening', version: 0, acceptedVersion: 0 };
  source = ''; initialDoc?: JSONContent; lastResult?: EngineResult; historyBytes = 0;
  lastTelemetry?: { version: number; result: EngineResult };
  private listeners = new Set<() => void>();
  private busy = false;
  private inFlight?: number;
  private inFlightDoc?: JSONContent;
  private validatedDoc?: JSONContent;
  private queued?: { version: number; doc: JSONContent };
  private disposed = false;
  private draft?: JSONContent;
  private sourceResolve?: (doc: JSONContent) => void;
  private sourceReject?: (error: Error) => void;
  private regionResolve?: (text: string) => void;
  private regionReject?: (error: Error) => void;
  private timer?: ReturnType<typeof setTimeout>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  readonly ready = new Promise<void>((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject; });
  private port: MarkdownPort;
  private timeoutMs: number;
  private regionTicket?: { block: number; version: number; token?: string };
  readonly originalBytes: Uint8Array;
  constructor(port: MarkdownPort, bytes: Uint8Array, timeoutMs = 15000, options: { stress?: boolean } = {}) {
    this.port = port; this.timeoutMs = timeoutMs;
    this.originalBytes = bytes.slice();
    port.onmessage = event => this.receive(event.data);
    port.onerror = () => this.fail('WORKER_FAILED');
    this.watchdog(); port.postMessage({ type: 'open', bytes, byteLimit: options.stress ? LIMITS.bytes : INTERACTIVE_BYTES });
  }
  private watchdog() { clearTimeout(this.timer); this.timer = setTimeout(() => this.fail('VALIDATION_TIMEOUT'), this.timeoutMs); }
  private fail(reason: string) {
    if (this.disposed) return;
    clearTimeout(this.timer); this.busy = false;
    this.port.onmessage = null; this.port.onerror = null; this.port.terminate();
    if (!this.initialDoc) this.readyReject(new Error(reason));
    this.status = { ...this.status, state: 'failed', reason }; this.emit();
    this.sourceReject?.(new Error(reason)); this.sourceResolve = undefined; this.sourceReject = undefined;
    this.regionReject?.(new Error(reason)); this.regionResolve = undefined; this.regionReject = undefined;
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.status;
  private emit() { this.listeners.forEach(listener => listener()); }
  private receive(reply: WorkerReply) {
    if (this.disposed || this.status.state === 'failed') return;
    if (reply.type === 'ready' && this.initialDoc) return;
    if (reply.type !== 'ready' && reply.version !== this.inFlight) return;
    clearTimeout(this.timer);
    if (reply.type === 'ready') { this.initialDoc = reply.doc; this.validatedDoc = reply.doc; this.source = reply.source; this.status = { ...this.status, state: 'ready' }; this.readyResolve(); this.emit(); return; }
    const completedDoc=this.inFlightDoc;this.inFlightDoc=undefined;
    this.busy = false; this.inFlight = undefined;
    if (reply.type === 'error') { this.fail(reply.reason); return; }
    if (reply.type === 'region') { if (this.regionTicket) this.regionTicket.token = reply.token; this.regionResolve?.(reply.text); this.regionResolve = undefined; this.regionReject = undefined; this.sendLatest(); return; }
    this.lastTelemetry = { version: reply.version, result: reply.result };
    this.historyBytes = reply.historyBytes;
    if (reply.result.accepted) { this.validatedDoc=reply.doc??completedDoc??this.validatedDoc; this.source = reply.result.source; this.status = { ...this.status, acceptedVersion: reply.version }; }
    if (reply.version === this.status.version) {
      this.lastResult = reply.result;
      if (reply.result.accepted) { this.source = reply.result.source; this.status = { ...this.status, acceptedVersion: reply.version, state: 'ready', reason: undefined }; }
      else this.status = { ...this.status, state: 'needs-source', reason: reply.result.reason };
      if (reply.doc && reply.result.accepted) { this.draft = reply.doc; this.sourceResolve?.(reply.doc); this.sourceResolve = undefined; this.sourceReject = undefined; }
    }
    this.sendLatest(); this.emit();
  }
  submit(doc: JSONContent) {
    if (this.disposed || this.status.state === 'failed' || !this.initialDoc) throw new Error('SESSION_CLOSED_OR_FAILED');
    this.regionTicket = undefined; this.draft = doc; const version = this.status.version + 1;
    this.status = { ...this.status, version, state: 'validating', reason: undefined }; this.queued = { version, doc };
    this.sendLatest(); this.emit();
  }
  editSource(block: number, text: string): Promise<JSONContent> {
    if (this.busy || this.queued || this.disposed || this.status.state === 'failed') return Promise.reject(new Error('SOURCE_EDIT_NOT_READY'));
    const ticket = this.regionTicket; this.regionTicket = undefined;
    if (!ticket?.token || ticket.block !== block || ticket.version !== this.status.version || this.status.state !== 'ready') return Promise.reject(new Error('SOURCE_REGION_TICKET_REQUIRED'));
    const version = this.status.version + 1;
    this.status = { ...this.status, version, state: 'validating' }; this.busy = true; this.inFlight = version; this.watchdog();
    const pending = new Promise<JSONContent>((resolve, reject) => { this.sourceResolve = resolve; this.sourceReject = reject; });
    this.port.postMessage({ type: 'source', version, token: ticket.token, text }); this.emit(); return pending;
  }
  readRegion(block: number, expected: JSONContent): Promise<string> {
    if (this.busy || this.queued || this.disposed || this.status.state === 'failed') return Promise.reject(new Error('SOURCE_EDIT_NOT_READY'));
    if (this.status.state !== 'ready' || this.status.version !== this.status.acceptedVersion) return Promise.reject(new Error('SOURCE_REGION_REQUIRES_VALIDATED_DRAFT'));
    this.regionTicket = { block, version: this.status.version };
    this.busy = true; this.inFlight = this.status.version; this.watchdog();
    const result = new Promise<string>((resolve, reject) => { this.regionResolve = resolve; this.regionReject = reject; });
    this.port.postMessage({ type: 'region', version: this.status.version, block, expected }); return result;
  }
  async applySource(editor: Editor, block: number, text: string) {
    // Caller explicitly chose the targeted replacement. Retain the old draft for
    // recovery before calling; asynchronous acknowledgement never replaces it.
    const version = this.status.version;
    const doc = await this.editSource(block, text);
    if (editor.isDestroyed || this.status.version !== version + 1) throw new Error('SOURCE_EDIT_SUPERSEDED');
    const next = editor.schema.nodeFromJSON(doc), tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, next.content);
    const clamp = (pos: number) => tr.doc.resolve(Math.min(pos, tr.doc.content.size));
    tr.setSelection(TextSelection.between(clamp(editor.state.selection.anchor), clamp(editor.state.selection.head)));
    editor.view.dispatch(resetSharedHistory(tr, editor.state).setMeta('markdownSourceReset', true));
  }
  restoreValidated(editor:Editor){
    if(this.status.state!=='needs-source'||!this.validatedDoc||editor.isDestroyed)throw Error('VALIDATED_RESTORE_NOT_READY');
    const doc=this.validatedDoc,next=editor.schema.nodeFromJSON(doc),tr=editor.state.tr.replaceWith(0,editor.state.doc.content.size,next.content);
    const clamp=(pos:number)=>tr.doc.resolve(Math.min(pos,tr.doc.content.size));tr.setSelection(TextSelection.between(clamp(editor.state.selection.anchor),clamp(editor.state.selection.head)));
    editor.view.dispatch(resetSharedHistory(tr,editor.state).setMeta('markdownSourceReset',true));this.submit(doc);
  }
  private sendLatest() {
    if (this.busy || !this.queued || this.disposed) return;
    const request = this.queued; this.queued = undefined; this.busy = true; this.inFlight = request.version; this.inFlightDoc=request.doc;
    this.watchdog(); this.port.postMessage({ type: 'edit', ...request });
  }
  attach(editor: Editor) {
    const snapshot = snapshotCache();
    let scheduled = false, attached = true, composing = false;
    const compositionStart = () => {
      composing = true; this.draft = snapshot(editor.state.doc);
      this.status = { ...this.status, version: this.status.version + 1, state: 'validating', reason: 'COMPOSITION_IN_PROGRESS' }; this.emit();
    };
    const compositionEnd = () => queueMicrotask(() => {
      if (!attached || this.disposed || editor.isDestroyed || this.status.state === 'failed') return;
      composing = false;
      editor.view.dispatch(editor.state.tr.setMeta('markdownCompositionEnd', true));
      this.submit(snapshot(editor.state.doc));
    });
    const changed = ({ transaction }: { transaction: Transaction }) => {
      if (!transaction.docChanged || isSharedTransaction(transaction) || transaction.getMeta('markdownSourceReset') || scheduled) return;
      scheduled = true;
      queueMicrotask(() => { scheduled = false; if (attached && !this.disposed && !editor.isDestroyed && this.status.state !== 'failed') { const doc = snapshot(editor.state.doc); if (composing) this.draft = doc; else this.submit(doc); } });
    };
    editor.on('transaction', changed);
    editor.view.dom.addEventListener('compositionstart', compositionStart);
    editor.view.dom.addEventListener('compositionend', compositionEnd);
    return () => { if ((scheduled || composing) && !editor.isDestroyed && !this.disposed && this.status.state !== 'failed') this.submit(snapshot(editor.state.doc)); attached = false; editor.off('transaction', changed); editor.view.dom.removeEventListener('compositionstart', compositionStart); editor.view.dom.removeEventListener('compositionend', compositionEnd); };
  }
  checkpoint() { return { source: this.source, originalBytes: this.originalBytes, draft: this.draft ?? this.initialDoc, status: this.status }; }
  bytes() { if (this.status.state !== 'ready' || this.status.acceptedVersion !== this.status.version) throw new Error('UNVALIDATED_DRAFT'); return new TextEncoder().encode(this.source); }
  dispose() { this.disposed = true; clearTimeout(this.timer); this.queued = undefined; this.sourceReject?.(new Error('SESSION_CLOSED')); this.regionReject?.(new Error('SESSION_CLOSED')); if (!this.initialDoc) this.readyReject(new Error('SESSION_CLOSED')); this.sourceResolve = undefined; this.sourceReject = undefined; this.regionResolve = undefined; this.regionReject = undefined; this.port.onmessage = null; this.port.onerror = null; this.port.terminate(); this.status = { ...this.status, state: 'closed' }; this.listeners.clear(); }
}
