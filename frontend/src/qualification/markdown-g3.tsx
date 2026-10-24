// Isolated desktop harness. Never imported by App/index.html.
import { createRoot } from 'react-dom/client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { JSONContent } from '@tiptap/core';
import { Surface, type Lab } from './markdown-g1';
import { MarkdownSession } from '../lib/markdown/session';
import { browserPort } from '../lib/markdown/browserPort';
import { SharedNoteDocuments } from '../lib/sharedNoteDocuments';
import { PaneNavigation } from '../lib/paneNavigation';
import type { Resource } from '../types';
import '../index.css';
import './markdown-g3.css';

type Context = { token: string; epoch: string; workspace: string; generation: string; sequence: number };
type Revision = { identity: string; sha256: string; metadata: string; source: string; size: number };
type Opened = { document: string; epoch: string; name: string; base: Revision; readonly?: boolean; root?: string; viewId?: string; seed?: string; visual?: JSONContent; recoveryOnly?: boolean; reading?: ReturnType<PaneNavigation['exportSession']> };
type Document = Opened & { id: string; session: MarkdownSession; shared: SharedNoteDocuments; labs: Map<string, Lab>; saved: number; journaled: number; nativeVersion: number; protectedVersion: number; protectedSource?: string; metadataVersion: number; journaledMetadata: number; sourceDraft?: { block: number; text: string }; validated: boolean; notice: string; retained: string; blocked?: boolean; refreshing?: boolean; timer?: ReturnType<typeof setTimeout>; journal?: Promise<void>; detached?: () => void };
type Recovery = { operation: string; state: string; name: string; version: number };
type Review = { ticket: string; state: string; base: string; local: string; visual: string; disk: Revision | null };
declare global { interface Window { linkedGate3?: { context: () => Promise<Context>; request: (request: unknown) => Promise<unknown> }; markdownG3: { documents: Map<string, Document>; navigation: PaneNavigation; call: typeof call; envelope: typeof envelope; protect: typeof protect; save: typeof save; refresh: typeof refresh } } }
let context: Context;
function envelope(operation: string, payload: Record<string, unknown> = {}) { return { token: context.token, epoch: context.epoch, workspace: context.workspace, generation: context.generation, id: String(++context.sequence), operation, payload }; }
const documents = new Map<string, Document>();
const listeners = new Set<() => void>();
let snapshotVersion = 0;
const emit = () => { snapshotVersion++; listeners.forEach(listener => listener()); };
async function call<T>(operation: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!window.linkedGate3) throw new Error('Private desktop harness required');
  return await window.linkedGate3.request(envelope(operation, payload)) as T;
}
const navigation = new PaneNavigation(() => ({ max: 3, behavior: 'fill',
  load: async id => { const d = documents.get(id); return d ? { id, type: 'note', title: d.name, tags: [], createdAt: '', updatedAt: '' } satisfies Resource : null; },
  save: async id => { const d = documents.get(id); if (d && d.session.status.version > d.journaled) await protect(d); }, preview: () => {}, committed: () => {},
}));
async function protect(d: Document, force = false) {
  if (d.journal) { await d.journal; if (d.session.status.version > d.journaled || d.metadataVersion !== d.journaledMetadata || force) return protect(d, force); return; }
  const editorVersion = d.session.status.version, metadataVersion = d.metadataVersion;
  if (!force && editorVersion <= d.journaled && metadataVersion === d.journaledMetadata) return;
  const version = ++d.nativeVersion;
  const draft = structuredClone(d.session.checkpoint().draft);
  const claimedSource = d.session.status.state === 'ready' ? d.session.source : undefined;
  d.journal = (async () => {
    const result = await call<{ validated: boolean; reason?: string }>('journal', { document: d.document, version, editorVersion, draft, claimedSource, sourceDraft: d.sourceDraft, reading: navigation.exportSession() });
    d.journaled = editorVersion; d.journaledMetadata = metadataVersion; d.protectedVersion = version; d.protectedSource = claimedSource; d.validated = result.validated; d.notice = result.reason ? `Draft retained; visual Save refused: ${result.reason}` : 'Draft protected locally'; emit();
  })();
  try { await d.journal; } finally { d.journal = undefined; }
}
async function save(d: Document) {
  if (d.blocked || d.sourceDraft || d.session.status.state !== 'ready') throw new Error('Visual edit is not validated. Your draft is retained.');
  if (d.saved === d.session.status.version) { d.notice = 'No unsaved visual edits'; emit(); return; }
  await protect(d); const version = d.protectedVersion, editorVersion = d.journaled, savedSource = d.protectedSource;
  if (!d.validated || savedSource === undefined) throw new Error('Independent source validation required');
  const receipt = await call<{ state: string; version: number }>('save', { document: d.document, version });
  d.validated = false;
  if (receipt.version !== version) throw new Error('Unexpected Save receipt; draft retained for recovery');
  if (receipt.state === 'COMMITTED') { d.saved = editorVersion; d.retained = savedSource; d.notice = d.session.status.version === editorVersion ? 'Saved to original file' : 'Saved earlier version; newer edits remain unsaved'; }
  else d.notice = receipt.state === 'CONFLICT' ? 'Disk changed. Your draft is retained; compare before resolving.' : 'Save needs recovery review. Your draft and source versions remain retained.';
  emit();
}
async function makeDocument(opened: Opened, id = 'linked:' + (opened.viewId ?? crypto.randomUUID()), publish = true) {
  const session = new MarkdownSession(browserPort(new Worker(new URL('../lib/markdown/markdown.worker.ts', import.meta.url), { type: 'module' })), new TextEncoder().encode(opened.seed ?? opened.base.source));
  try { await session.ready; } catch (error) { session.dispose(); throw error; }
  const d: Document = { ...opened, id, session, shared: new SharedNoteDocuments(), labs: new Map(), saved: opened.seed !== undefined ? -1 : 0, journaled: -1, nativeVersion: 0, protectedVersion: -1, metadataVersion: 0, journaledMetadata: -1, validated: false, blocked: opened.recoveryOnly, notice: opened.recoveryOnly ? 'Recovered original is missing or independent; draft-only authority' : 'Original source opened', retained: opened.base.source };
  let observed = 0;
  d.detached = session.subscribe(() => { emit(); if (session.status.version !== observed) { observed = session.status.version; clearTimeout(d.timer); d.timer = setTimeout(() => { void protect(d).catch(error => { d.notice = 'Draft protection failed: ' + String(error); emit(); }); }, 1200); } });
  if (publish) { documents.set(id, d); emit(); } return d;
}
async function refresh(d: Document) {
  if (d.refreshing || d.session.status.version !== d.saved) throw new Error('Dirty draft retained; automatic refresh refused');
  d.refreshing = true; const version = d.session.status.version, epoch = context.epoch; let ticket: string | undefined; let next: Document | undefined;
  try {
    const opened = await call<Opened & { ticket: string }>('refresh', { document: d.document }); ticket = opened.ticket;
    next = await makeDocument(opened, d.id, false);
    for (const lab of d.labs.values()) lab.editor?.setEditable(false, false);
    await new Promise(resolve => setTimeout(resolve, 0));
    if (context.epoch !== epoch || documents.get(d.id) !== d || d.session.status.version !== version || d.session.status.reason === 'COMPOSITION_IN_PROGRESS' || d.sourceDraft) throw new Error('New visual draft retained; refresh cancelled');
    await call('commit-refresh', { ticket }); ticket = undefined;
    if (context.epoch !== epoch || documents.get(d.id) !== d) throw new Error('Refresh scope superseded');
    d.detached?.(); clearTimeout(d.timer); d.session.dispose(); documents.set(d.id, next); next = undefined;
    documents.get(d.id)!.notice = 'External source refreshed; reading position retained'; emit();
  } catch (error) { d.notice = 'External change review required; current draft retained'; emit(); throw error; }
  finally { d.refreshing = false; if (ticket) await call('abort-refresh', { ticket }).catch(() => {}); if (next) { next.detached?.(); next.session.dispose(); } for (const lab of d.labs.values()) if (lab.editor && !lab.editor.isDestroyed) lab.editor.setEditable(true, false); }
}
function labFor(d: Document, paneId: string): Lab {
  const existing = d.labs.get(paneId); if (existing) return existing;
  const lab: Lab = { session: d.session, stress: false, shared: d.shared, initialDraft: d.visual, documentId: d.id, keys: [], transactions: 0, longTasks: [],
    registerEditor: editor => {
      lab.editor = editor;
      const pane = navigation.snapshot().panes.find(p => p.paneId === paneId), visit = pane?.history[pane.cursor];
      if (visit) { const saved = navigation.position(visit.visitId).selection; if (saved) queueMicrotask(() => { if (!editor.isDestroyed) editor.commands.setTextSelection({ from: Math.max(0, Math.min(saved.from, editor.state.doc.content.size)), to: Math.max(0, Math.min(saved.to, editor.state.doc.content.size)) }); }); }
      if (d.visual && d.session.status.version === 0) queueMicrotask(() => { if (!editor.isDestroyed && d.session.status.version === 0) { try { const desired = editor.schema.nodeFromJSON(d.visual!); desired.check(); const trim = (node: JSONContent) => ({ ...node, content: (node.content ?? []).filter(child => child.type !== 'paragraph' || child.content?.length) }); if (JSON.stringify(trim(desired.toJSON() as JSONContent)) !== JSON.stringify(trim(editor.getJSON()))) throw new Error('Recovered draft differs from mounted schema'); d.session.submit(editor.getJSON()); } catch { d.blocked = true; d.notice = 'Recovered visual draft requires export or validated-source review'; emit(); } } });
      editor.on('selectionUpdate', () => { const current = navigation.snapshot().panes.find(p => p.paneId === paneId), step = current?.history[current.cursor]; if (step) navigation.recordPosition(paneId, step.visitId, { selection: { from: editor.state.selection.from, to: editor.state.selection.to } }); });
    }, recordKey: ms => { lab.keys.push(ms); if (lab.keys.length > 4096) lab.keys.shift(); }, recordTransaction: () => { lab.transactions++; },
    activated: () => navigation.activate(paneId), focusHandled: () => navigation.focusHandled(paneId),
    sourceDraftChanged: draft => { d.sourceDraft = draft; d.metadataVersion++; clearTimeout(d.timer); d.timer = setTimeout(() => { void protect(d).catch(error => { d.notice = 'Draft protection failed: ' + String(error); emit(); }); }, 1200); emit(); },
    beforeSourceApply: async (block, text) => {
      await protect(d); let index = 0; let expected: JSONContent | undefined;
      lab.editor?.state.doc.forEach(node => { if (node.type.name === 'paragraph' && !node.content.size) return; if (index++ === block) expected = node.toJSON(); });
      if (!expected) throw new Error('Ambiguous region retained without change');
      await call('source', { document: d.document, version: d.protectedVersion, block, expected, text });
    },
  }; d.labs.set(paneId, lab); return lab;
}
function freezeDocuments() {
  const frozen = [...documents.values()];
  if (frozen.some(d => d.session.status.reason === 'COMPOSITION_IN_PROGRESS')) throw new Error('Finish or cancel text composition before leaving this workspace');
  for (const d of frozen) for (const lab of d.labs.values()) lab.editor?.setEditable(false, false);
  return () => { for (const d of frozen) for (const lab of d.labs.values()) if (lab.editor && !lab.editor.isDestroyed) lab.editor.setEditable(!d.sourceDraft, false); };
}
async function protectDeparture() {
  const release = freezeDocuments();
  try { await new Promise(resolve => setTimeout(resolve, 0)); for (const d of documents.values()) await protect(d, true); }
  catch (error) { release(); throw error; }
  return release;
}
async function closeDocument(d: Document, paneId: string) {
  const release = await protectDeparture();
  try { await navigation.closeSession(paneId); await call('close', { document: d.document }); d.detached?.(); clearTimeout(d.timer); d.session.dispose(); documents.delete(d.id); emit(); }
  finally { release(); }
}
export function Harness() {
  useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => snapshotVersion);
  const nav = useSyncExternalStore(navigation.subscribe, navigation.snapshot);
  const [ready, setReady] = useState(false), [root, setRoot] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [recoveries, setRecoveries] = useState<Recovery[]>([]), [review, setReview] = useState<Review & { operation: string }>();
  const [compare, setCompare] = useState<{ base: string; local: string; disk: string }>();
  const [readonly, setReadonly] = useState<Opened & { text: string; offset: number }>();
  const act = async (action: () => Promise<void>) => { setBusy(true); setError(''); try { await action(); } catch (failure) { setError(String(failure)); } finally { setBusy(false); } };
  useEffect(() => { void window.linkedGate3?.context().then(value => { context = value; setReady(true); }); }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (document.querySelector('[role="dialog"]')) return; const id = navigation.snapshot().panes.find(p => p.paneId === navigation.snapshot().activePaneId)?.id, d = id ? documents.get(id) : undefined; if (d) void act(async () => save(d)); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    let running = false;
    const timer = setInterval(() => { if (running) return; running = true; void (async () => {
      for (const d of documents.values()) {
        try { const state = await call<{ state: string; disk: Revision | null }>('check', { document: d.document });
          if (state.state === 'EXTERNAL_CHANGED' && d.session.status.version === d.saved) await refresh(d);
          else if (['CONFLICT', 'DOCUMENT_REPLACED', 'DOCUMENT_MISSING', 'SOURCE_UNAVAILABLE', 'SOURCE_REVOKED', 'SOURCE_EPOCH_STALE', 'ROOT_REPLACED', 'DISK_TOO_LARGE_READ_ONLY', 'DOCUMENT_OR_DIRECTORY_UNAVAILABLE', 'DOCUMENT_UNQUALIFIED'].includes(state.state)) { if (state.state !== 'CONFLICT') d.blocked = true; d.notice = state.state + ': draft and reading context retained'; emit(); }
        } catch { /* The current scope may have closed. Never replace a draft on a failed check. */ }
      }
    })().finally(() => { running = false; }); }, 2000);
    return () => clearInterval(timer);
  }, []);
  const active = documents.get(nav.panes.find(p => p.paneId === nav.activePaneId)?.id ?? '');
  return <main className="g3-harness"><header><h1>Linked Markdown qualification</h1><p role="status">Gate 3 blocked: native Save and source repair are refused. Draft inspection only. Disposable development data.</p>
    <div className="g3-actions"><button disabled={!ready || busy} onClick={() => void act(async () => { const selected = await call<{ root?: string }>('authorize'); if (selected.root) setRoot(selected.root); })}>Authorize folder</button>
      <button disabled={!root || busy} onClick={() => void act(async () => { const opened = await call<Opened & { outcome?: string }>('open', { root }); if (opened.outcome === 'cancelled') return;
        if (opened.readonly) { const chunk = await call<{ bytes: string }>('chunk', { document: opened.document, offset: 0 }); setReadonly({ ...opened, text: new TextDecoder().decode(Uint8Array.from(atob(chunk.bytes), c => c.charCodeAt(0))), offset: 65536 }); return; }
        const known = [...documents.values()].find(d => d.document === opened.document), d = known ?? await makeDocument({ ...opened, root }); await navigation.open(d.id); await protect(d);
      })}>Open Markdown</button>
      <button disabled={!active || busy || active.blocked || !!active.sourceDraft || active.session.status.state !== 'ready'} onClick={() => void act(async () => { if (active) await save(active); })}>Save original</button>
      <button disabled={!active || busy} onClick={() => void act(async () => { if (active) { await protect(active); const disk = await call<{ disk: Revision | null }>('check', { document: active.document }); setCompare({ base: active.retained, local: active.session.source, disk: disk.disk?.source ?? 'Source unavailable' }); } })}>Compare versions</button>
      <button disabled={busy} onClick={() => void act(async () => setRecoveries(await call<Recovery[]>('recovery')))}>Review recovery</button>
      <button disabled={busy} onClick={() => void act(async () => { const release = await protectDeparture(); try { const next = await call<Context>('switch-workspace', { workspace: context.workspace === 'qualification-a' ? 'qualification-b' : 'qualification-a' }); for (const d of documents.values()) { d.detached?.(); clearTimeout(d.timer); d.session.dispose(); } documents.clear(); navigation.reset(); context = next; setRoot(''); setCompare(undefined); setReview(undefined); setRecoveries([]); emit(); } finally { release(); } })}>Switch test workspace</button>
      <button disabled={!root || busy} onClick={() => void act(async () => { await call('revoke', { root }); for (const d of documents.values()) if (d.root === root) { d.blocked = true; await protect(d, true); } setRoot(''); emit(); })}>Revoke folder</button>
    </div></header>
    {error && <p role="alert">{error}</p>}
    <nav aria-label="Open Notes">{nav.sessions.map(pane => <button key={pane.paneId} aria-current={pane.paneId === nav.activePaneId ? 'page' : undefined} onClick={() => void act(async () => { await navigation.open(pane.id); })}>{documents.get(pane.id)?.name} {documents.get(pane.id)?.session.status.version !== documents.get(pane.id)?.saved ? '•' : ''}</button>)}
      <button disabled={!nav.activePaneId || busy} onClick={() => void act(async () => navigation.history(-1))}>Previous visit</button><button disabled={!nav.activePaneId || busy} onClick={() => void act(async () => navigation.history(1))}>Next visit</button>
      <button disabled={!nav.activePaneId || busy} onClick={() => void act(async () => { if (nav.activePaneId) await navigation.close(nav.activePaneId); })}>Hide pane</button>
      <button disabled={!active || !nav.activePaneId || busy} onClick={() => void act(async () => { if (active && nav.activePaneId) await closeDocument(active, nav.activePaneId); })}>Close note</button>
    </nav>
    {readonly && <section aria-label="Read-only large source"><h2>{readonly.name} — read only</h2><p>Outside the visual editing envelope. Original bytes remain intact; this is a live 64KiB chunk preview.</p><pre>{readonly.text}</pre><button onClick={() => void act(async () => { const chunk = await call<{ bytes: string }>('chunk', { document: readonly.document, offset: readonly.offset }); setReadonly({ ...readonly, text: new TextDecoder().decode(Uint8Array.from(atob(chunk.bytes), c => c.charCodeAt(0))), offset: readonly.offset + 65536 }); })}>Next chunk</button><button onClick={() => void act(async () => { await call('close', { document: readonly.document }); setReadonly(undefined); })}>Close preview</button></section>}
    <div className="g3-panes">{nav.panes.map(pane => { const d = documents.get(pane.id); if (!d) return null; return <section key={pane.slotId} aria-label={'Document pane ' + d.name} onPointerDown={() => navigation.activate(pane.paneId)}><h2>{d.name}</h2><p role="status">{d.session.status.version === d.saved && !d.sourceDraft ? 'No unsaved visual edits' : 'Unsaved draft'} · {d.session.status.version > d.journaled || d.metadataVersion !== d.journaledMetadata ? 'Protection pending' : 'Protected locally'} · {d.notice}</p><Surface key={d.document + pane.paneId} embedded active={pane.paneId === nav.activePaneId} restoreFocus={pane.paneId === nav.focusPaneId} paneId={pane.paneId} lab={labFor(d, pane.paneId)} /></section>; })}</div>
    {compare && <section aria-label="Version comparison"><h2>Compare retained versions</h2><button onClick={() => setCompare(undefined)}>Keep draft and close comparison</button>{Object.entries(compare).map(([label, text]) => <details key={label} open><summary>{label === 'local' ? 'Latest validated Vaultor source' : label}</summary><pre>{text}</pre></details>)}</section>}
    {!!recoveries.length && <section aria-label="Recovery records"><h2>Retained recovery</h2><p>Evidence stays until explicitly resolved. Review a version before repair; exports always create a separate file.</p>{recoveries.map(record => <div key={record.operation}><span>{record.state}</span> <button disabled={!root || busy} onClick={() => void act(async () => setReview({ ...await call<Review>('review', { operation: record.operation, root }), operation: record.operation }))}>Compare recovery</button><button disabled={busy} onClick={() => void act(async () => { const exported = await call<{ name?: string }>('export', { operation: record.operation, choice: 'visual' }); if (exported.name) setError('Separate draft exported as ' + exported.name); })}>Export visual draft</button></div>)}</section>}
    {review && <section aria-label="Recovery comparison"><h2>Review recovery · {review.state}</h2><p>Same-object repair checks the current disk revision again. A reused pathname is independent and cannot be overwritten.</p>{(['base', 'local', 'visual'] as const).map(kind => <details key={kind}><summary>{kind === 'visual' ? 'Unsaved visual draft (JSON)' : kind}</summary><pre>{review[kind]}</pre><button disabled={busy} onClick={() => void act(async () => { const exported = await call<{ name?: string }>('export', { operation: review.operation, choice: kind }); if (exported.name) setError('Separate version exported as ' + exported.name); })}>Export {kind}</button></details>)}<details><summary>Current disk</summary><pre>{review.disk?.source ?? 'Path unavailable or missing'}</pre></details>
      {review.state === 'SAME_ORIGINAL_OBJECT' && <><button disabled={busy} onClick={() => void act(async () => { const repaired = await call<{ state: string }>('repair', { ticket: review.ticket, choice: 'local' }); setError(repaired.state); setReview(undefined); })}>Restore reviewed validated source</button><button disabled={busy} onClick={() => void act(async () => { const repaired = await call<{ state: string }>('repair', { ticket: review.ticket, choice: 'base' }); setError(repaired.state); setReview(undefined); })}>Restore reviewed base</button></>}
      {review.state === 'PATH_MISSING' && <button disabled={busy} onClick={() => void act(async () => { const restored = await call<{ state: string }>('restore', { ticket: review.ticket }); setError(restored.state); setReview(undefined); })}>Restore captured base to missing name</button>}
      <button onClick={() => setReview(undefined)}>Keep evidence and close</button></section>}
  </main>;
}
window.markdownG3 = { documents, navigation, call, envelope, protect, save, refresh };
createRoot(document.getElementById('root')!).render(<Harness />);
