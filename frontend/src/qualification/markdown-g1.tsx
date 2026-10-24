// Explicit laboratory entry only; index.html/App never imports it.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useMemo, useState, useSyncExternalStore } from 'react';
import type { Editor } from '@tiptap/core';
import BlockEditor from '../components/editor/BlockEditor';
import AppModal from '../components/modals/AppModal';
import { EscapeManagerProvider } from '../lib/escape/EscapeManagerProvider';
import { SharedNoteDocuments } from '../lib/sharedNoteDocuments';
import { MarkdownSession } from '../lib/markdown/session';
import { markdownExtensions } from '../lib/markdown/extensions';
import { browserPort } from '../lib/markdown/browserPort';
import '../index.css';

type Lab = { session: MarkdownSession; editor?: Editor; keys: number[]; transactions: number; longTasks: number[]; registerEditor: (editor: Editor) => void; recordKey: (ms: number) => void; recordTransaction: () => void };
declare global { interface Window { markdownG1: { open: (source: string) => Promise<void>; settled: () => Promise<void>; lab?: Lab } } }
const root = createRoot(document.getElementById('root')!);
const mountedSessions: MarkdownSession[] = [];
export function Surface({ lab }: { lab: Lab }) {
  const { session } = lab;
  const status = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [sourceEdit, setSourceEdit] = useState<{ block: number; text: string; loading?: boolean }>();
  const [retainedDraft, setRetainedDraft] = useState('');
  const [error, setError] = useState('');
  const shared = useMemo(() => new SharedNoteDocuments(), []);
  const integration = useMemo(() => ({ extensions: markdownExtensions(), headingLevels: [1, 2, 3, 4, 5, 6] as Array<1 | 2 | 3 | 4 | 5 | 6>, unsupported: setError, attach: (editor: Editor) => {
    lab.registerEditor(editor);
    const detach = session.attach(editor);
    const key = (event: KeyboardEvent) => { if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return; const start = performance.now(); requestAnimationFrame(() => lab.recordKey(performance.now() - start)); };
    const transactions = () => lab.recordTransaction();
    editor.view.dom.addEventListener('keydown', key, true); editor.on('transaction', transactions);
    return () => { detach(); editor.view.dom.removeEventListener('keydown', key, true); editor.off('transaction', transactions); };
  } }), [lab, session]);
  const editRegion = (pos: number) => {
    if (!lab.editor || !['ready', 'needs-source'].includes(status.state)) return;
    let region = 0;
    lab.editor.state.doc.forEach((node, offset) => {
      if (node.type.name === 'paragraph' && !node.content.size) return;
      const block = region++;
      if (pos >= offset && pos < offset + node.nodeSize) {
        setRetainedDraft(JSON.stringify(session.checkpoint().draft)); setSourceEdit({ block, text: '', loading: true });
        void session.readRegion(block).then(text => setSourceEdit(old => old?.block === block ? { block, text } : old)).catch(e => setError(String(e)));
      }
    });
  };
  const editProtected = (element: HTMLElement) => { if (lab.editor) editRegion(lab.editor.view.posAtDOM(element, 0)); };
  return <EscapeManagerProvider><main style={{ maxWidth: 896, margin: '24px auto', padding: 16 }}>
    <h1>Markdown Gate 1 laboratory</h1><p>In-memory documents only. No external files or Save API.</p>
    <div role="status" aria-live="polite">{status.state}{status.reason ? ' · ' + status.reason : ''}</div>
    {error && !sourceEdit && <p role="alert">{error}</p>}
    {status.state === 'needs-source' && <p role="alert">Your visual draft is retained. Undo the unsupported action or edit its source region. <button onClick={() => { if (lab.editor) editRegion(lab.editor.state.selection.from); }}>Edit selected block source</button></p>}
    <div onClick={e => { const element = (e.target as HTMLElement).closest<HTMLElement>('[data-source-kind]'); if (element) editProtected(element); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { const element = (e.target as HTMLElement).closest<HTMLElement>('[data-source-kind]'); if (element) { e.preventDefault(); editProtected(element); } } }}>
      <BlockEditor integration={integration} paneId="g1" sharedDocuments={shared} noteId="g1-memory-only" noteTitle="Markdown laboratory" saveStatus="saved" onRetrySave={() => {}} content={session.initialDoc!} autosaveDelay={0} isActive={false} interactionLocked={!!sourceEdit} shouldRestoreFocus={false} onOpenResource={() => {}} onUpdate={() => { throw new Error('Managed autosave must not run'); }} onSelectionChange={() => {}} onActivate={() => {}} onFocusRestored={() => {}} onRequestMdUpload={() => {}} onRequestCsvUpload={() => {}} onRequestLinkUpload={() => {}} />
    </div>
    <AppModal open={!!sourceEdit} title="Edit protected Markdown region" description="Only this source block will change. Your previous editor draft remains retained." onClose={() => { setSourceEdit(undefined); setError(''); }} footer={<button disabled={sourceEdit?.loading || status.state === 'validating'} onClick={() => void (async () => {
      if (!sourceEdit || !lab.editor) return;
      try { await session.applySource(lab.editor, sourceEdit.block, sourceEdit.text); flushSync(() => setSourceEdit(undefined)); lab.editor.commands.focus(undefined, { scrollIntoView: false }); }
      catch (e) { setError(e instanceof Error ? e.message : 'Source edit failed'); }
    })()}>Apply region</button>}>
      <label>Markdown source<textarea autoFocus disabled={sourceEdit?.loading} aria-label="Markdown source" value={sourceEdit?.text ?? ''} onChange={e => setSourceEdit(old => old ? { ...old, text: e.target.value } : old)} style={{ width: '100%', minHeight: 160 }} /></label>{error && <p role="alert">{error}</p>}
    </AppModal>
    {retainedDraft && <details><summary>Retained draft JSON</summary><pre>{retainedDraft}</pre></details>}
  </main></EscapeManagerProvider>;
}
window.markdownG1 = {
  async open(source) {
    mountedSessions.splice(0).forEach(s => s.dispose());
    const session = new MarkdownSession(browserPort(new Worker(new URL('../lib/markdown/markdown.worker.ts', import.meta.url), { type: 'module' })), new TextEncoder().encode(source), 15000, { stress: true });
    mountedSessions.push(session); await session.ready;
    const lab: Lab = { session, keys: [], transactions: 0, longTasks: [], registerEditor: e => { lab.editor = e; }, recordKey: ms => { lab.keys.push(ms); }, recordTransaction: () => { lab.transactions++; } }; window.markdownG1.lab = lab;
    const observer = new PerformanceObserver(list => { lab.longTasks.push(...list.getEntries().map(e => e.duration)); }); observer.observe({ entryTypes: ['longtask'] });
    root.render(<Surface key={crypto.randomUUID()} lab={lab} />);
    await new Promise<void>(resolve => { const check = () => lab.editor ? resolve() : setTimeout(check, 5); check(); });
    observer.disconnect(); // Benchmark attaches its own observer for typing.
  },
  async settled() {
    await new Promise(resolve => setTimeout(resolve, 0));
    const s = window.markdownG1.lab!.session;
    if (s.status.state === 'ready') return;
    await new Promise<void>((resolve, reject) => { const detach = s.subscribe(() => { if (s.status.state === 'ready') { detach(); resolve(); } else if (s.status.state === 'needs-source' || s.status.state === 'failed') { detach(); reject(new Error(s.status.reason)); } }); });
  },
};
void window.markdownG1.open('---\ntitle: protected\n---\n\nParagraph **bold** and _italic_.\n\n<!-- preserve me -->\n');
