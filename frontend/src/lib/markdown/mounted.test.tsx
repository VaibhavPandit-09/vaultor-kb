// @vitest-environment jsdom
import { cleanup, render, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Editor, JSONContent } from '@tiptap/core';
import BlockEditor from '../../components/editor/BlockEditor';
import { SharedNoteDocuments } from '../sharedNoteDocuments';
import { EscapeManagerProvider } from '../escape/EscapeManagerProvider';
import { MarkdownEngine } from './engine';
import { MarkdownSession } from './session';
import { markdownExtensions } from './extensions';
import type { MarkdownPort, WorkerReply, WorkerRequest } from './protocol';
afterEach(cleanup);
class AsyncPort implements MarkdownPort {
  onmessage: MarkdownPort['onmessage'] = null; onerror: MarkdownPort['onerror'] = null;
  engine!: MarkdownEngine; terminated = false; delay = 5;
  postMessage = (r: WorkerRequest) => { setTimeout(() => {
    if (this.terminated) return;
    let reply: WorkerReply;
    if (r.type === 'open') { this.engine = new MarkdownEngine(r.bytes); reply = { type: 'ready', doc: this.engine.projection.doc, source: this.engine.source }; }
    else if (r.type === 'edit') reply = { type: 'result', version: r.version, result: this.engine.apply(r.doc), historyBytes: this.engine.historyBytes };
    else throw new Error('Use reviewed source action');
    this.onmessage?.({ data: reply });
  }, this.delay); };
  terminate = () => { this.terminated = true; };
}
async function create(source: string) { const port = new AsyncPort(), session = new MarkdownSession(port, new TextEncoder().encode(source)); await session.ready; return { session, port }; }
function mount(session: MarkdownSession, shared = new SharedNoteDocuments(), pane = 'a', savedSelection?: { from: number; to: number }) {
  let editor!: Editor; const updates = vi.fn();
  const unsupported = vi.fn();
  const integration = { extensions: markdownExtensions(), headingLevels: [1, 2, 3, 4, 5, 6] as Array<1 | 2 | 3 | 4 | 5 | 6>, unsupported, attach: (e: Editor) => { editor = e; return session.attach(e); } };
  const props = { integration, savedSelection, paneId: pane, sharedDocuments: shared, noteId: 'g1-memory', noteTitle: 'Gate 1', saveStatus: 'saved' as const, onRetrySave: () => {}, content: session.checkpoint().draft ?? session.initialDoc!, autosaveDelay: 0, isActive: false, interactionLocked: false, shouldRestoreFocus: false, onOpenResource: () => {}, onUpdate: updates, onSelectionChange: () => {}, onActivate: () => {}, onFocusRestored: () => {}, onRequestMdUpload: () => {}, onRequestCsvUpload: () => {}, onRequestLinkUpload: () => {} };
  const view = render(<EscapeManagerProvider><BlockEditor {...props} /></EscapeManagerProvider>);
  return { ...view, get editor() { return editor; }, updates, unsupported, props };
}
const settled = async (s: MarkdownSession) => { await Promise.resolve(); await waitFor(() => expect(s.status.state, s.status.reason).toBe('ready')); };
function locate(e: Editor, text: string) { let result = -1; e.state.doc.descendants((n, p) => { if (result < 0 && n.isText && n.text!.includes(text)) result = p + n.text!.indexOf(text); }); return result; }

it('actual mounted BlockEditor preserves no-op source and does not autosave on opening', async () => {
  const source = '\ufeff---\r\ntitle: keep\r\n---\r\n\r\nText **bold**.\r\n\r\n<!-- comment -->\r\n', { session } = await create(source), v = mount(session);
  await waitFor(() => expect(v.editor).toBeTruthy()); await settled(session); expect(session.source).toBe(source); expect(session.lastResult?.patches ?? []).toEqual([]); expect(v.updates).not.toHaveBeenCalled(); expect(v.container.querySelector('[aria-label="Edit yaml source"]')).toBeTruthy(); v.unmount(); session.dispose();
});
it('rapid edits render before delayed validation, preserve selection and create no feedback transactions', async () => {
  const { session, port } = await create('Text.\n\nTail.\n'), v = mount(session); await waitFor(() => expect(v.editor).toBeTruthy()); port.delay = 40;
  let transactions = 0; v.editor.on('transaction', ({ transaction }) => { if (transaction.docChanged) transactions++; });
  for (let i = 0; i < 12; i++) v.editor.view.dispatch(v.editor.state.tr.insertText('x', 2));
  expect(v.editor.getText()).toContain('xxxxxxxxxxxx'); const selection = v.editor.state.selection.toJSON(); expect(session.source).toBe('Text.\n\nTail.\n');
  await settled(session); expect(session.source).toContain('xxxxxxxxxxxx'); expect(v.editor.state.selection.toJSON()).toEqual(selection); expect(transactions).toBe(12); v.unmount(); session.dispose();
});
it('actual shared history and mirrored views patch once and retain independent selections', async () => {
  const { session } = await create('Paragraph.\n\nTail.\n'), shared = new SharedNoteDocuments(), a = mount(session, shared), b = mount(session, shared, 'b');
  await waitFor(() => expect(a.editor && b.editor).toBeTruthy());
  a.editor.commands.setTextSelection(5); b.editor.commands.setTextSelection(2);
  a.editor.commands.toggleBold(); a.editor.view.dispatch(a.editor.state.tr.insertText('EDIT', 5)); await settled(session);
  expect(b.editor.getJSON()).toEqual(a.editor.getJSON()); expect(b.editor.state.selection.from).toBe(2);
  b.editor.commands.undo(); await settled(session); expect(session.source).toBe('Paragraph.\n\nTail.\n'); a.unmount(); b.unmount(); session.dispose();
});
it('mounted Enter and formatting shortcuts use ordinary keymaps', async () => {
  const { session } = await create('Paragraph.\n\nTail.\n'), v = mount(session); await waitFor(() => expect(v.editor).toBeTruthy());
  v.editor.commands.setTextSelection(5); fireEvent.keyDown(v.editor.view.dom, { key: 'Enter', code: 'Enter' });
  await settled(session); expect(v.editor.state.doc.childCount).toBe(3);
  v.editor.commands.setTextSelection({ from: 1, to: 4 }); fireEvent.keyDown(v.editor.view.dom, { key: 'b', code: 'KeyB', ctrlKey: true });
  await settled(session); expect(session.source).toContain('**'); v.unmount(); session.dispose();
});
it('actual table appended IDs do not trigger unrelated Markdown changes', async () => {
  const source = 'Text.\n\n| h | t |\n| --- | --- |\n| cell | x |\n\nTail.\n', { session } = await create(source), v = mount(session); await waitFor(() => expect(v.editor).toBeTruthy());
  const p = locate(v.editor, 'cell'); v.editor.commands.setTextSelection(p); v.editor.commands.addRowAfter(); await settled(session);
  expect(session.source.startsWith('Text.\n\n')).toBe(true); expect(session.source.endsWith('\n\nTail.\n')).toBe(true);
  const tables: JSONContent[] = []; v.editor.state.doc.descendants(n => { if (n.type.name === 'table') tables.push(n.toJSON()); }); expect(tables[0].attrs?.tableId).toBeTruthy(); v.unmount(); session.dispose();
});
it('unsupported marks retain mounted draft and Undo rejoins accepted source', async () => {
  const { session } = await create('Text.\n'), v = mount(session); await waitFor(() => expect(v.editor).toBeTruthy());
  v.editor.chain().setTextSelection({ from: 1, to: 4 }).toggleUnderline().run(); await waitFor(() => expect(session.status.state).toBe('needs-source'));
  expect(v.editor.getHTML()).toContain('<u>'); expect(session.checkpoint().draft).toEqual(v.editor.getJSON()); expect(() => session.bytes()).toThrow();
  v.editor.commands.undo(); await settled(session); expect(session.source).toBe('Text.\n'); v.unmount(); session.dispose();
});
it('remount retains accepted bytes and draft while session remains alive', async () => {
  const { session } = await create('Text _keep_.\n'), a = mount(session); await waitFor(() => expect(a.editor).toBeTruthy()); a.editor.commands.setTextSelection(3); a.editor.commands.splitBlock(); await settled(session);
  const source = session.source, draft = a.editor.getJSON(), selection = { from: a.editor.state.selection.from, to: a.editor.state.selection.to }; a.unmount(); const b = mount(session, undefined, 'a', selection); await waitFor(() => expect(b.editor).toBeTruthy()); expect(b.editor.getJSON()).toEqual(draft); expect(b.editor.state.selection.from).toBe(selection.from); expect(session.source).toBe(source); b.editor.commands.insertContent('new'); await settled(session); b.unmount(); session.dispose();
});
it('source-only mark boundary normalization keeps ordinary whitespace-inclusive bold practical', async () => {
  const { session } = await create('Before.\n\nText with spaces.\n\nTail.\n'), v = mount(session); await waitFor(() => expect(v.editor).toBeTruthy());
  const p = locate(v.editor, 'Text with spaces.'); v.editor.chain().setTextSelection({ from: p, to: p + 10 }).toggleBold().run(); await settled(session);
  expect(session.source).toContain('**Text with** spaces.'); expect(session.source.startsWith('Before.\n\n')).toBe(true); v.unmount(); session.dispose();
});
it('actual DOM paste handles plain text and supported HTML without source feedback', async () => {
  const { session } = await create('Text.\n\nTail.\n'), v = mount(session); await waitFor(() => expect(v.editor).toBeTruthy());
  v.editor.commands.setTextSelection(2); v.editor.view.pasteText('ordinary paste', new Event('paste') as ClipboardEvent); await settled(session); expect(session.source).toContain('ordinary paste');
  v.editor.view.pasteHTML('<p>Rich <em>paste</em></p>', new Event('paste') as ClipboardEvent); await settled(session); expect(v.editor.getHTML()).toContain('<em>paste</em>'); expect(session.source.endsWith('\n\nTail.\n')).toBe(true); v.unmount(); session.dispose();
});
it('source adapter renders imported heading levels4–6 without changing managed heading defaults', async () => {
  const { session } = await create('###### Small heading\n\nTail.\n'), v = mount(session); await waitFor(() => expect(v.editor).toBeTruthy()); expect(v.container.querySelector('h6')?.textContent).toBe('Small heading'); await settled(session); expect(session.source).toBe('###### Small heading\n\nTail.\n'); v.unmount(); session.dispose();
});
it('source adapter refuses managed image side effects with an explicit reason and unchanged document', async () => {
  const { session } = await create('Text.\n'), v = mount(session); await waitFor(() => expect(v.editor).toBeTruthy());
  const original = v.editor.getJSON(); v.editor.view.dom.dispatchEvent(new CustomEvent('vaultor:image-picker', { detail: { position: 1 } }));
  fireEvent.paste(v.editor.view.dom, { clipboardData: { files: [], items: [], getData: (type: string) => type === 'text/html' ? '<img src="file:///never-read">' : '' } });
  expect(v.unsupported).toHaveBeenCalledTimes(2); expect(v.editor.getJSON()).toEqual(original); await settled(session); expect(session.source).toBe('Text.\n'); v.unmount(); session.dispose();
});
it('actual Lowlight code view handles Enter and language changes without rewriting adjacent blocks', async () => {
  const { session } = await create('Keep.\n\n~~~~js meta\nfirst\n~~~~\n\nTail.\n'), v = mount(session); await waitFor(() => expect(v.editor).toBeTruthy());
  v.editor.commands.setTextSelection(locate(v.editor, 'first') + 5); fireEvent.keyDown(v.editor.view.dom, { key: 'Enter', code: 'Enter' }); v.editor.commands.insertContent('second'); await settled(session);
  expect(session.source).toContain('~~~~js meta\nfirst\nsecond\n~~~~'); v.editor.commands.setCodeBlock({ language: 'typescript' }); await settled(session); expect(session.source).toContain('typescript meta'); expect(session.source.startsWith('Keep.\n\n')).toBe(true); expect(session.source.endsWith('\n\nTail.\n')).toBe(true); v.unmount(); session.dispose();
});
it('actual task-list creation and checkbox interaction produce GFM without touching adjacent text', async () => {
  const { session } = await create('Task text.\n\nTail.\n'), v = mount(session); await waitFor(() => expect(v.editor).toBeTruthy());
  v.editor.commands.setTextSelection(3); v.editor.commands.toggleTaskList(); await settled(session); expect(session.source).toContain('- [ ] Task text.');
  const checkbox = v.container.querySelector<HTMLInputElement>('input[type="checkbox"]')!; fireEvent.click(checkbox); await settled(session); expect(session.source).toContain('- [x] Task text.'); expect(session.source.endsWith('\n\nTail.\n')).toBe(true); v.unmount(); session.dispose();
});
