// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, expect, it } from 'vitest';
import { SharedHistory, SharedNoteDocuments, resetSharedHistory } from './sharedNoteDocuments';
const editors: Editor[] = [];
const registry = new SharedNoteDocuments();
function create(id = 'note') {
  const editor = new Editor({ onBeforeCreate: ({ editor }) => registry.prepare(editor), extensions: [StarterKit.configure({ undoRedo: false }), SharedHistory], content: '<p>hello</p>' }); editors.push(editor);
  const detach = registry.attach(id, editor); editor.on('destroy', detach); return editor;
}
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); });
it('shares synchronous steps and history while mapping independent selections', () => {
  const a = create(), b = create();
  a.commands.setTextSelection(1); b.commands.setTextSelection(6);
  a.commands.insertContent('X');
  expect(b.getText()).toBe('Xhello'); expect(b.state.selection.from).toBe(7); expect(a.state.selection.from).toBe(2);
  b.commands.insertContent('Y'); expect(a.getText()).toBe('XhelloY');
  b.commands.undo(); expect(a.getText()).toBe(b.getText()); expect(a.getText()).toBe('Xhello');
  a.commands.undo(); expect(b.getText()).toBe('hello');
  b.commands.redo(); expect(a.getText()).toBe('Xhello');
});
it('a new view joins the live document and undo history without replacing existing selections', () => {
  const a = create(); a.commands.setTextSelection(6); a.commands.insertContent(' world'); const before = a.state.selection.from;
  const b = create(); expect(b.getText()).toBe('hello world'); expect(a.state.selection.from).toBe(before);
  b.commands.undo(); expect(a.getText()).toBe('hello');
});
it('unrelated notes and removed views do not receive changes', () => {
  const a = create(), other = create('other'), removed = create(); removed.destroy();
  a.commands.insertContent('X'); expect(other.getText()).toBe('hello');
});

it('sibling formatting commands and input rules use the same schema types', () => {
  const a = create(), b = create(); b.commands.selectAll(); b.commands.toggleBold(); b.commands.toggleHeading({ level: 2 });
  expect(a.getJSON()).toEqual(b.getJSON()); expect(b.getJSON().content?.[0].type).toBe('heading');
  expect(b.getJSON().content?.[0].content?.[0].marks?.[0].type).toBe('bold');
  b.commands.undo(); expect(a.getJSON()).toEqual(b.getJSON());
});

it('authoritative document replacement clears obsolete undo in both views', () => {
  const a = create(), b = create(); a.commands.insertContent('old');
  a.view.dispatch(resetSharedHistory(a.state.tr.replaceWith(0, a.state.doc.content.size, a.schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'rewritten' }] }] }).content), a.state));
  expect(b.getText()).toBe('rewritten'); expect(b.commands.undo()).toBe(false); expect(a.getText()).toBe('rewritten');
});
