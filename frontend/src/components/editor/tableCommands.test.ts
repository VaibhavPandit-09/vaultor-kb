// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { closeHistory } from '@tiptap/pm/history';
import { afterEach, expect, it } from 'vitest';
import { WorkspaceTable } from './WorkspaceTable';
import { tableContext, selectTableAxis, changeColumns, moveRow, sizeColumns } from './tableCommands';
import { resolveShortcutBindings, shortcutMatchesEvent } from '../../lib/shortcuts';

const editors: Editor[] = [];
function makeEditor() {
  const editor = new Editor({ extensions: [StarterKit, WorkspaceTable, TableRow, TableCell, TableHeader], content: '<table data-source-resource-id="asset"><tr><th>A</th><th>B</th><th>C</th></tr><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>d</td><td>e</td><td>f</td></tr></table><p>After</p>' });
  editors.push(editor);
  editor.commands.setTextSelection(4);
  editor.commands.insertContent('!'); // Initializes legacy table identity on first edit.
  editor.view.dispatch(closeHistory(editor.state.tr));
  return editor;
}
afterEach(() => editors.splice(0).forEach(e => e.destroy()));

it('moves column contents and identities together, preserving source and undo/reload', () => {
  const editor = makeEditor();
  const before = editor.getJSON();
  const ids = tableContext(editor)!.table.attrs.columnIds;
  selectTableAxis(editor, 'column', 0);
  expect(changeColumns(editor, 'right')).toBe(true);
  expect(tableContext(editor)!.table.attrs.columnIds).toEqual([ids[1], ids[0], ids[2]]);
  expect(tableContext(editor)!.table.child(1).child(0).textContent).toBe('b');
  expect(tableContext(editor)!.table.attrs.sourceResourceId).toBe('asset');
  const saved = editor.getJSON();
  editor.commands.undo();
  expect(editor.getJSON()).toEqual(before);
  editor.commands.redo();
  expect(editor.getJSON()).toEqual(saved);
  editor.commands.setContent(saved);
  expect(editor.getJSON()).toEqual(saved);
});

it('inserts/deletes only the chosen columns, keeps surviving IDs and isolates panes', () => {
  const first = makeEditor(), other = makeEditor();
  const untouched = other.getJSON(), ids = tableContext(first)!.table.attrs.columnIds;
  selectTableAxis(first, 'column', 1);
  changeColumns(first, 'before');
  expect(tableContext(first)!.table.attrs.columnIds).toEqual([ids[0], expect.any(String), ids[1], ids[2]]);
  selectTableAxis(first, 'column', 1); changeColumns(first, 'delete');
  expect(tableContext(first)!.table.attrs.columnIds).toEqual(ids);
  expect(other.getJSON()).toEqual(untouched);
});

it('moves rows and rejects moves through spans or outside boundaries; sizes spanning cells', () => {
  const editor = makeEditor();
  selectTableAxis(editor, 'row', 1);
  expect(moveRow(editor, 1)).toBe(true);
  expect(tableContext(editor)!.table.child(2).child(0).textContent).toBe('a');
  expect(moveRow(editor, 1, false)).toBe(false);
  selectTableAxis(editor, 'row', 0);
  editor.commands.mergeCells();
  expect(moveRow(editor, 1, false)).toBe(false);
  expect(changeColumns(editor, 'right', false)).toBe(false);
  sizeColumns(editor, 600);
  expect(tableContext(editor)!.table.child(0).child(0).attrs.colwidth).toEqual([200, 200, 200]);
  editor.commands.splitCell();
  expect(tableContext(editor)!.map.problems).toBeNull();
  editor.commands.toggleHeaderColumn(); editor.commands.toggleHeaderRow();
  expect(tableContext(editor)!.map.problems).toBeNull();
});

it('guards whole-table axis deletion and restores explicit table deletion with undo', () => {
  const editor = makeEditor();
  selectTableAxis(editor, 'row', 0);
  expect(changeColumns(editor, 'delete', false)).toBe(false);
  const before = editor.getJSON();
  editor.commands.deleteTable(); editor.commands.undo();
  expect(editor.getJSON()).toEqual(before);
});

it('migrates former note-switch defaults without capturing word movement or custom bindings', () => {
  const defaults = resolveShortcutBindings({ switchNoteNext: { windows: 'Mod+ArrowRight' }, switchNotePrevious: { windows: 'Mod+Shift+J' } }, 'windows');
  expect(defaults.switchNoteNext).toBe('Alt+ArrowRight');
  expect(defaults.switchNotePrevious).toBe('Mod+Shift+J');
  expect(shortcutMatchesEvent(defaults.switchNoteNext, new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true }))).toBe(false);
  expect(shortcutMatchesEvent(defaults.switchNoteNext, new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }))).toBe(true);
});
