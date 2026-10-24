// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { MarkdownEngine } from './engine';
import { canonical, project, writeBlock } from './syntax';
import { markdownExtensions } from './extensions';

const corpus = ['docs/CODEBASE.md', 'docs/workspace/SESSIONS.md', 'docs/workspace/NAVIGATION.md', 'docs/security/HOST-ACCESS.md', 'docs/design/UI_PHILOSOPHY.md'];
function each(doc: JSONContent, visitor: (n: JSONContent) => void) { visitor(doc); doc.content?.forEach(c => each(c, visitor)); }
for (const path of corpus) it('G1-D corpus: exact no-op, text, marks, structural edit, protected raw, Undo bytes: ' + path, () => {
  const source = readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8'), e = new MarkdownEngine(new TextEncoder().encode(source));
  expect(e.apply(e.projection.doc).patches).toEqual([]); expect(e.source).toBe(source);
  const protectedRaw: string[] = []; each(e.projection.doc, n => { if (n.type === 'sourceBlock' || n.type === 'sourceInline') protectedRaw.push(n.attrs!.raw); });
  const initial = structuredClone(e.projection.doc), doc = structuredClone(e.projection.doc);
  const p = doc.content!.find(n => n.type === 'paragraph' && n.content?.some(c => c.type === 'text' && (c.text?.length ?? 0) > 40))!;
  const text = p.content!.find(n => n.type === 'text' && (n.text?.length ?? 0) > 40)!;
  text.text += ' qualified'; let r = e.apply(doc); expect(r.accepted, r.reason).toBe(true);
  // Match the adapter's explicit mark-boundary rule; engine remains strict.
  const trailing = /[ \t]+$/.exec(text.text ?? '')?.[0] ?? '';
  if (trailing) { text.text = text.text!.slice(0, -trailing.length); p.content!.splice(p.content!.indexOf(text) + 1, 0, { type: 'text', text: trailing }); }
  text.marks = [...(text.marks ?? []), { type: 'bold' }]; r = e.apply(doc); expect(r.accepted, r.reason).toBe(true);
  p.type = 'heading'; p.attrs = { level: 2 }; r = e.apply(doc); expect(r.accepted, r.reason).toBe(true);
  for (const raw of protectedRaw) expect(e.source).toContain(raw);
  expect(canonical(project(e.source).doc)).toEqual(canonical(doc));
  r = e.apply(initial); expect(r.accepted, r.reason).toBe(true); expect(e.source).toBe(source);
});
it('G1-D mixed syntax: preserves raw regions through a mounted command workflow', () => {
  const source = readFileSync(resolve('../experiments/linked-markdown/fixtures/mixed.md'), 'utf8'), e = new MarkdownEngine(new TextEncoder().encode(source));
  const editor = new Editor({ extensions: [StarterKit, Table, TableRow, TableCell, TableHeader, TaskList, TaskItem.configure({ nested: true }), ...markdownExtensions()], content: e.projection.doc });
  let paragraph = 0; editor.state.doc.descendants((n, p) => { if (n.isText && n.text?.startsWith('Paragraph original')) paragraph = p; });
  editor.commands.setTextSelection(paragraph + 3); editor.commands.splitBlock(); editor.commands.insertContent('New text');
  const r = e.apply(editor.getJSON()); expect(r.accepted, r.reason).toBe(true);
  for (const block of project(source).blocks) if (block.node.type === 'sourceBlock') expect(e.source).toContain(block.raw);
  editor.commands.undo(); expect(e.apply(editor.getJSON()).accepted).toBe(true); expect(e.source).toBe(source); editor.destroy();
});
it('G1-D batched disjoint structural edits preserve unusual gaps and every middle block', () => {
  const source = 'First _old_.\r\n\r\n\r\nMiddle [link](../x.md "keep").\n\n\nLast **old**.\r\n', e = new MarkdownEngine(new TextEncoder().encode(source)), doc = structuredClone(e.projection.doc);
  doc.content![0] = { type: 'heading', attrs: { level: 2 }, content: doc.content![0].content };
  doc.content![2] = { type: 'blockquote', content: [doc.content![2]] };
  const r = e.apply(doc); expect(r.accepted, r.reason).toBe(true); expect(e.source).toContain('\r\n\r\n\r\nMiddle [link](../x.md "keep").\n\n\n');
});
it('G1-D repeated edits and history restoration use bounded deltas rather than whole documents', () => {
  const source = 'A paragraph _keep_.\n\n' + 'Long unchanged paragraph.\n\n'.repeat(100), e = new MarkdownEngine(new TextEncoder().encode(source)), initial = structuredClone(e.projection.doc);
  for (let i = 0; i < 250; i++) { const target = structuredClone(e.projection.doc); target.content![0].content![0].text += 'x'; const r = e.apply(target); expect(r.accepted, `${i}: ${r.reason}; ${!r.accepted ? writeBlock(target.content![0], '\n', e.projection.fragments) : ''}`).toBe(true); }
  expect(e.historyBytes).toBeLessThan(40000); expect(e.apply(initial).accepted).toBe(true); expect(e.source).toBe(source);
}, 15000);
it('G1-R2 aligned table column change retains cell-owned alignment', () => {
  const source = '| a | b |\n| :--- | ---: |\n| c | d |\n', e = new MarkdownEngine(new TextEncoder().encode(source)), target = structuredClone(e.projection.doc);
  target.content![0].content!.forEach(row => row.content!.push(structuredClone(row.content![1])));
  const r = e.apply(target); expect(r.accepted, r.reason).toBe(true); expect(e.projection.doc.content![0].attrs!.mdAlign).toEqual(['left', 'right', 'right']); expect(e.apply(project(source).doc).accepted).toBe(true); expect(e.source).toBe(source);
});
it('G1-D soft-wrapped paragraph becomes a heading visually without losing words', () => {
  const e = new MarkdownEngine(new TextEncoder().encode('First line\nsecond line\n\nTail.\n')), target = structuredClone(e.projection.doc);
  target.content![0].type = 'heading'; target.content![0].attrs = { level: 2 };
  expect(e.apply(target).accepted).toBe(true); expect(e.source).toBe('## First line second line\n\nTail.\n');
});
it('G1-D structural Git evidence: mixed fixture and an actual repository paragraph', () => {
  const before = readFileSync(resolve('../experiments/linked-markdown/fixtures/mixed.md'), 'utf8'), engine = new MarkdownEngine(new TextEncoder().encode(before));
  const editor = new Editor({ extensions: [StarterKit, Table, TableRow, TableCell, TableHeader, TaskList, TaskItem.configure({ nested: true }), ...markdownExtensions()], content: engine.projection.doc });
  const locate = (s: string, exact = false) => { let found = -1; editor.state.doc.descendants((n, p) => { if (found < 0 && n.isText && (exact ? n.text === s : n.text!.includes(s))) found = p + n.text!.indexOf(s); }); if (found < 0) throw new Error(s); return found; };
  const history: object[] = [];
  const apply = () => { const old = new TextEncoder().encode(engine.source), result = engine.apply(editor.getJSON()); expect(result.accepted, result.reason).toBe(true); const next = new TextEncoder().encode(engine.source); for (const p of result.patches) { expect(next.slice(0, p.start)).toEqual(old.slice(0, p.start)); expect(next.slice(p.start + new TextEncoder().encode(p.text).length)).toEqual(old.slice(p.end)); } history.push(result); };
  editor.chain().setTextSelection(locate('Paragraph original')).setHeading({ level: 2 }).run(); apply();
  editor.commands.setTextSelection(locate('Next item')); editor.commands.sinkListItem('listItem'); apply();
  const label = locate('Inline original'); editor.chain().setTextSelection({ from: label, to: label + 15 }).toggleBold().run(); apply();
  const code = locate('const original'); editor.view.dispatch(editor.state.tr.insertText('const edited', code, code + 14)); apply();
  editor.commands.setTextSelection(locate('original', true)); editor.commands.addRowAfter(); apply();
  editor.commands.setTextSelection(locate('Final original.') + 15); editor.commands.splitBlock(); editor.commands.insertContent('New paragraph.'); apply();
  const after = engine.source;
  for (const block of project(before).blocks) if (block.node.type === 'sourceBlock') expect(after).toContain(block.raw);
  expect(after).toContain('../workspace/SESSIONS.md#durable-drafts-and-conflicts "Keep title"');
  if (process.env.VAULTOR_RECORD_MARKDOWN_G1 === '1') {
    const dir = resolve('../experiments/linked-markdown/g1/evidence'); mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'mixed.before.md'), before); writeFileSync(resolve(dir, 'mixed.after.md'), after);
    const diff = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--', 'mixed.before.md', 'mixed.after.md'], { cwd: dir, encoding: 'utf8', windowsHide: true }); expect(diff.status).toBe(1); writeFileSync(resolve(dir, 'structural.diff'), diff.stdout);
    const original = readFileSync(resolve('../docs/CODEBASE.md'), 'utf8'), real = new MarkdownEngine(new TextEncoder().encode(original)), target = structuredClone(real.projection.doc);
    const p = target.content!.find(n => n.type === 'paragraph' && n.content?.some(t => t.text?.includes('Vaultor is a personal')))!; p.type = 'heading'; p.attrs = { level: 2 };
    const result = real.apply(target); expect(result.accepted, result.reason).toBe(true);
    writeFileSync(resolve(dir, 'corpus.before.tmp'), original); writeFileSync(resolve(dir, 'corpus.after.tmp'), real.source);
    const realDiff = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--', 'corpus.before.tmp', 'corpus.after.tmp'], { cwd: dir, encoding: 'utf8', windowsHide: true }); expect(realDiff.status).toBe(1); writeFileSync(resolve(dir, 'codebase.diff'), realDiff.stdout); unlinkSync(resolve(dir, 'corpus.before.tmp')); unlinkSync(resolve(dir, 'corpus.after.tmp'));
    const sha = (s: string) => createHash('sha256').update(s).digest('hex');
    writeFileSync(resolve(dir, 'fidelity.json'), JSON.stringify({ beforeHash: sha(before), afterHash: sha(after), operations: history, repository: { path: 'docs/CODEBASE.md', beforeHash: sha(original), afterHash: sha(real.source), result } }, null, 2) + '\n');
  }
  editor.destroy();
});
