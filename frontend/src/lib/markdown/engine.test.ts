// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TextSelection } from '@tiptap/pm/state';
import { MarkdownEngine } from './engine';
import { markdownExtensions } from './extensions';
import { canonical, project } from './syntax';
import type { JSONContent } from '@tiptap/core';
const bytes = (s: string) => new TextEncoder().encode(s);
function fixture(source = 'Before unchanged.\n\nParagraph **bold** and _italic_ text.\n\nAfter unchanged.\n') {
  const engine = new MarkdownEngine(bytes(source));
  const editor = new Editor({ extensions: [StarterKit, Table, TableRow, TableCell, TableHeader, TaskList, TaskItem.configure({ nested: true }), ...markdownExtensions()], content: engine.projection.doc });
  const locate = (text: string) => { let from = -1; editor.state.doc.descendants((n, p) => { if (from < 0 && n.isText && n.text!.includes(text)) from = p + n.text!.indexOf(text); }); if (from < 0) throw new Error('Not found: ' + text); return from; };
  const sync = () => { const result = engine.apply(editor.getJSON()); expect(result.accepted, result.reason).toBe(true); expect(canonical(project(engine.source).doc)).toEqual(canonical(editor.getJSON())); return result; };
  return { engine, editor, locate, sync };
}

describe('G1-B source boundaries and structural operations', () => {
  it('table text patches ignore renderer-only empty root paragraphs, including immutable worker snapshots', () => {
    const source = 'Before.\r\n\r\n| h | t |\r\n| :--- | ---: |\r\n| cell | x |\r\n\r\n<!-- retain -->\r\n';
    for (const immutable of [false, true]) {
      const engine = new MarkdownEngine(bytes(source));
      const original = structuredClone(engine.projection.doc);
      const target = structuredClone(original);
      target.content!.push({ type: 'paragraph' }); // Tiptap trailing-node plugin
      const table = target.content!.find(n => n.type === 'table')!;
      table.content![1].content![0].content![0].content![0].text = 'cell LOCAL';
      const result = engine.apply(target, immutable);
      expect(result.accepted, result.reason).toBe(true);
      expect(engine.source).toBe(source.replace('cell', 'cell LOCAL'));
      expect(engine.apply(original, immutable).accepted).toBe(true);
      expect(engine.source).toBe(source);
    }
  });
  for (const eol of ['\n', '\r\n']) {
    it(`no-op exact Unicode/BOM/EOL ${JSON.stringify(eol)}`, () => {
      const source = '\ufeff---\ntitle: x\n---\n\n# Heading ###\n\n😀 é &amp; \\*x\\*\n\n<!-- keep -->\n'.replaceAll('\n', eol);
      const f = fixture(source); f.sync(); expect(f.engine.source).toBe(source); f.editor.destroy();
    });
    for (const [name, act] of [
      ['text replace punctuation', (f: ReturnType<typeof fixture>) => f.editor.commands.insertContentAt({ from: f.locate('Paragraph'), to: f.locate('Paragraph') + 9 }, 'A *literal*')],
      ['delete all paragraph text', (f: ReturnType<typeof fixture>) => f.editor.commands.deleteRange({ from: f.locate('Paragraph'), to: f.locate('text.') + 5 })],
      ['split paragraph Enter', (f: ReturnType<typeof fixture>) => f.editor.chain().setTextSelection(f.locate('Paragraph') + 4).splitBlock().run()],
      ['join paragraph Backspace', (f: ReturnType<typeof fixture>) => f.editor.chain().setTextSelection(f.locate('After')).joinBackward().run()],
      ['bold apply', (f: ReturnType<typeof fixture>) => f.editor.chain().setTextSelection({ from: f.locate('Paragraph'), to: f.locate('Paragraph') + 9 }).toggleBold().run()],
      ['bold remove', (f: ReturnType<typeof fixture>) => f.editor.chain().setTextSelection({ from: f.locate('bold'), to: f.locate('bold') + 4 }).unsetBold().run()],
      ['italic apply', (f: ReturnType<typeof fixture>) => f.editor.chain().setTextSelection({ from: f.locate('Paragraph'), to: f.locate('Paragraph') + 9 }).toggleItalic().run()],
      ['inline code', (f: ReturnType<typeof fixture>) => f.editor.chain().setTextSelection({ from: f.locate('Paragraph'), to: f.locate('Paragraph') + 9 }).toggleCode().run()],
      ['heading create', (f: ReturnType<typeof fixture>) => f.editor.chain().setTextSelection(f.locate('Paragraph')).setHeading({ level: 2 }).run()],
      ['bullet list create', (f: ReturnType<typeof fixture>) => f.editor.chain().setTextSelection(f.locate('Paragraph')).toggleBulletList().run()],
      ['ordered list create', (f: ReturnType<typeof fixture>) => f.editor.chain().setTextSelection(f.locate('Paragraph')).toggleOrderedList().run()],
      ['relative link insert', (f: ReturnType<typeof fixture>) => f.editor.chain().setTextSelection({ from: f.locate('Paragraph'), to: f.locate('Paragraph') + 9 }).setLink({ href: '../docs/next.md#part' }).run()],
      ['cross-mark replace', (f: ReturnType<typeof fixture>) => f.editor.commands.insertContentAt({ from: f.locate('Paragraph') + 4, to: f.locate('italic') + 3 }, { type: 'text', text: 'replacement' })],
      ['paste supported rich blocks', (f: ReturnType<typeof fixture>) => f.editor.commands.insertContentAt(f.locate('Paragraph'), '<p>Inserted <strong>rich</strong></p><p>More text</p>')],
    ] as const) it(`${name} preserves outside boundary ${JSON.stringify(eol)}`, () => {
      const source = 'Before unchanged.\n\nParagraph **bold** and _italic_ text.\n\nAfter unchanged.\n'.replaceAll('\n', eol), f = fixture(source);
      act(f); const r = f.sync();
      if (!name.startsWith('join')) expect(f.engine.source.startsWith('Before unchanged.' + eol + eol)).toBe(true);
      if (!name.startsWith('join')) expect(f.engine.source.endsWith(eol + eol + 'After unchanged.' + eol)).toBe(true);
      for (const p of r.patches) {
        const old = bytes(source), next = bytes(f.engine.source);
        expect(next.slice(0, p.start)).toEqual(old.slice(0, p.start));
        expect(next.slice(p.start + bytes(p.text).length)).toEqual(old.slice(p.end));
      }
      f.editor.destroy();
    });
  }
  it('nested lists indent/outdent, extend and Undo restore exact original', () => {
    const source = 'Keep.\n\n7) first\n8) second\n9) third\n\nTail.\n', f = fixture(source);
    f.editor.commands.setTextSelection(f.locate('second')); expect(f.editor.commands.sinkListItem('listItem')).toBe(true); f.sync();
    expect(f.editor.commands.liftListItem('listItem')).toBe(true); f.sync();
    f.editor.commands.setTextSelection(f.locate('third') + 5); f.editor.commands.splitListItem('listItem'); f.editor.commands.insertContent('fourth'); f.sync();
    f.editor.commands.undo(); f.sync(); expect(f.engine.source).toBe(source); f.editor.commands.redo(); f.sync(); f.editor.destroy();
  });
  it('code fence editing preserves unrelated content and safely enlarges fence', () => {
    const f = fixture('Keep.\n\n~~~~js extra-meta\noriginal\n~~~~\n\nTail.\n');
    f.editor.commands.insertContentAt({ from: f.locate('original'), to: f.locate('original') + 8 }, '```\nnext'); f.sync();
    expect(f.engine.source).toContain('js extra-meta'); expect(f.engine.source.endsWith('\n\nTail.\n')).toBe(true); f.editor.destroy();
  });
  it('table row/column/cell changes stay within the table', () => {
    const f = fixture('Keep.\n\n| head | other |\n| --- | --- |\n| cell | value |\n\nTail.\n');
    f.editor.commands.setTextSelection(f.locate('cell')); f.editor.commands.addRowAfter(); f.sync();
    f.editor.commands.addColumnAfter(); f.sync(); f.editor.commands.insertContent('new'); f.sync();
    expect(f.engine.source.startsWith('Keep.\n\n')).toBe(true); expect(f.engine.source.endsWith('\n\nTail.\n')).toBe(true); f.editor.destroy();
  });
  it('protected constructs survive surrounding structural edits and reject deletion', () => {
    const source = '---\ntitle: keep\n---\n\nText.\n\n<!-- comment -->\n\n:::warning\nraw\n:::\n\n[ref][x]\n\n[x]: ../target.md\n', f = fixture(source);
    f.editor.commands.setTextSelection(f.locate('Text.')); f.editor.commands.toggleHeading({ level: 2 }); f.sync();
    for (const raw of ['---\ntitle: keep\n---', '<!-- comment -->', ':::warning\nraw\n:::', '[ref][x]', '[x]: ../target.md']) expect(f.engine.source).toContain(raw);
    const before = f.engine.source; f.editor.commands.deleteRange({ from: 0, to: f.editor.state.doc.firstChild!.nodeSize });
    const r = f.engine.apply(f.editor.getJSON()); expect(r.accepted).toBe(false); expect(r.reason).toContain('PROTECTED'); expect(f.engine.source).toBe(before); expect(f.editor.getJSON()).not.toEqual(f.engine.projection.doc); f.editor.destroy();
  });
  it('moving a block retains its raw spelling and unrelated blocks', () => {
    const source = '# A ###\n\nParagraph _unusual_.\n\n# B ##\n', f = fixture(source);
    const doc = f.editor.getJSON(); doc.content = [doc.content![2], doc.content![1], doc.content![0]];
    f.editor.commands.setContent(doc); f.sync(); expect(f.engine.source).toBe('# B ##\n\nParagraph _unusual_.\n\n# A ###\n'); f.editor.destroy();
  });
  it('targeted source changes one protected block and retains surrounding source', () => {
    const e = new MarkdownEngine(bytes('<!-- old -->\n\nTail.\n')); e.editSource(0, '<!-- updated -->'); expect(e.source).toBe('<!-- updated -->\n\nTail.\n');
  });
  it('unrepresentable semantics reject with accepted source untouched', () => {
    const e = new MarkdownEngine(bytes('Text.\n')); const doc: JSONContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'draft', marks: [{ type: 'underline' }] }] }] };
    expect(e.apply(doc).reason).toContain('UNSUPPORTED_MARK'); expect(e.source).toBe('Text.\n');
  });
  it('invalid encodings, Unicode and excessive size fail closed', () => {
    expect(() => new MarkdownEngine(new Uint8Array([128]))).toThrow(); expect(() => project('\ud800')).toThrow('UNICODE'); expect(() => new MarkdownEngine(new Uint8Array(1024 * 1024 + 1))).toThrow('SIZE');
  });
  it('Enter empty paragraph then typing is practical and maintains caret layout', () => {
    const f = fixture('Text.\n'); f.editor.commands.setTextSelection(6); f.editor.commands.splitBlock(); f.sync(); expect(f.editor.state.doc.childCount).toBe(2);
    f.editor.commands.insertContent('Next.'); f.sync(); expect(f.engine.source).toContain('Next.'); expect(f.editor.state.selection).toBeInstanceOf(TextSelection); f.editor.destroy();
  });
  it('rejects a targeted source edit that would swallow unrelated blocks', () => {
    const e = new MarkdownEngine(bytes('<!-- old -->\n\nTail.\n')); expect(() => e.editSource(0, '```js\nunterminated')).toThrow('SOURCE_EDIT_CROSSES_BOUNDARY'); expect(e.source).toBe('<!-- old -->\n\nTail.\n');
  });
  it('large code is protected without losing any source, ordinary code remains visual', () => {
    const source = '```js\n' + 'x'.repeat(17000) + '\n```\n\nTail.\n', e = new MarkdownEngine(bytes(source)); expect(e.projection.doc.content![0].type).toBe('sourceBlock'); expect(e.source).toBe(source);
  });
  it('interactive byte admission applies to later structural changes as well as open', () => {
    const e = new MarkdownEngine(bytes('Text.\n'), 100); expect(e.apply({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(101) }] }] }).reason).toBe('SOURCE_SIZE_LIMIT'); expect(e.source).toBe('Text.\n');
  });
  it('formatting a paragraph preserves unrelated inline link destination/title/code/emphasis bytes', () => {
    const source = "Before [link](<../path with space.md> 'single title') plus ``code`` and *italics*.\n\nTail.\n", f = fixture(source);
    f.editor.chain().setTextSelection({ from: 1, to: 7 }).toggleBold().run(); f.sync();
    for (const raw of ["[link](<../path with space.md> 'single title')", '``code``', '*italics*']) expect(f.engine.source).toContain(raw);
    expect(f.engine.source.endsWith('\n\nTail.\n')).toBe(true); f.editor.destroy();
  });
  it('changing a link label preserves its destination spelling and quote choice', () => {
    const f = fixture("[label](<../a b.md> 'title')\n\nTail.\n"), p = f.locate('label');
    f.editor.view.dispatch(f.editor.state.tr.insertText('new', p, p + 5)); f.sync(); expect(f.engine.source).toBe("[new](<../a b.md> 'title')\n\nTail.\n"); f.editor.destroy();
  });
  it('positional inline provenance distinguishes duplicate code spellings during formatting', () => {
    const f = fixture('Start `same` and ``same``.\n\nTail.\n'); f.editor.chain().setTextSelection({ from: 1, to: 6 }).toggleBold().run();
    f.sync(); expect(f.engine.source).toBe('**Start** `same` and ``same``.\n\nTail.\n'); f.editor.commands.undo(); f.sync(); expect(f.engine.source).toBe('Start `same` and ``same``.\n\nTail.\n'); f.editor.destroy();
  });
  it('CRLF code edits retain fence spelling, metadata, and exact external ranges', () => {
    const f = fixture('Keep.\r\n\r\n~~~~js meta\r\nfirst\r\nsecond\r\n~~~~\r\n\r\nTail.\r\n'); const p = f.locate('second'); f.editor.view.dispatch(f.editor.state.tr.insertText('new', p, p + 6)); f.sync();
    expect(f.engine.source).toBe('Keep.\r\n\r\n~~~~js meta\r\nfirst\r\nnew\r\n~~~~\r\n\r\nTail.\r\n'); f.editor.destroy();
  });
  it('history exhaustion refuses source admission, retaining the latest accepted bytes', () => {
    const e = new MarkdownEngine(bytes('Text 0\n'), 1024, 4); let rejected = false;
    for (let i = 1; i <= 4; i++) {
      const r = e.apply({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text ' + i }] }] });
      if (!r.accepted) { expect(i).toBe(4); expect(r.reason).toBe('SOURCE_HISTORY_LIMIT'); rejected = true; }
    }
    expect(rejected).toBe(true); expect(e.source).toContain('Text 3'); expect(e.apply(project('Text 0\n').doc).accepted).toBe(true); expect(e.source).toBe('Text 0\n');
  }, 15000);
  for (const source of ['Text &amp; more \\*literal\\*.\n\nTail.\n', '1. Text &amp; line\r\n   continuation \\*literal\\*.\r\n\r\nTail.\r\n']) it('decoded source maps keep entities, escapes and continuation indentation exact: ' + source.slice(0, 6), () => {
    const f = fixture(source), p = f.locate('Text'); f.editor.view.dispatch(f.editor.state.tr.insertText('Edited', p, p + 4)); f.sync(); expect(f.engine.source).toBe(source.replace('Text', 'Edited')); f.editor.destroy();
  });
  it('partial formatting of encoded text preserves positional token spelling', () => {
    const source = 'Text &amp; remains.\n\nTail.\n', f = fixture(source); f.editor.chain().setTextSelection({ from: 1, to: 5 }).toggleBold().run(); f.sync(); expect(f.engine.source).toBe('**Text** &amp; remains.\n\nTail.\n'); f.editor.commands.undo(); f.sync(); expect(f.engine.source).toBe(source); f.editor.destroy();
  });
  it('removes inline code/italic and edits a relative link destination through normal commands', () => {
    const f = fixture('Keep.\n\nText `code` and _italic_ [label](../old.md).\n\nTail.\n');
    f.editor.chain().setTextSelection({ from: f.locate('code'), to: f.locate('code') + 4 }).unsetCode().run(); f.sync();
    f.editor.chain().setTextSelection({ from: f.locate('italic'), to: f.locate('italic') + 6 }).unsetItalic().run(); f.sync();
    f.editor.chain().setTextSelection({ from: f.locate('label'), to: f.locate('label') + 5 }).setLink({ href: '../new.md#section' }).run(); f.sync(); expect(f.engine.source).toContain('../new.md#section'); expect(f.engine.source.endsWith('\n\nTail.\n')).toBe(true); f.editor.destroy();
  });
  it('protects parser-replaced NUL bytes and preserves lone CR while editing another block', () => {
    const source = 'Before.\r\rA\0B.\r\rTail.', f = fixture(source), p = f.locate('Before.');
    expect(f.engine.projection.doc.content![1].content![0].type).toBe('sourceInline'); f.editor.view.dispatch(f.editor.state.tr.insertText('Edited.', p, p + 7)); f.sync(); expect(f.engine.source).toBe(source.replace('Before.', 'Edited.')); f.editor.destroy();
  });
});

it('image preview attributes never change preserved image source during unrelated editing',()=>{const source='Before.\r\n\r\n![Alt Ω](<images/picture one.png> "Keep title")\r\n\r\nAfter.\r\n';const f=fixture(source);try{f.sync();expect(f.engine.source).toBe(source);const projected=f.engine.projection.doc.content![1].content![0];expect(projected.attrs).toMatchObject({kind:'image',mdUrl:'images/picture one.png',mdAlt:'Alt Ω'});f.editor.commands.insertContentAt(f.locate('Before.'),'Edit ');f.sync();expect(f.engine.source).toBe(source.replace('Before.','Edit Before.'));}finally{f.editor.destroy();}});
