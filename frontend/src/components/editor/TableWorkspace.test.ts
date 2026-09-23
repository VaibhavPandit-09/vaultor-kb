// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { closeHistory } from '@tiptap/pm/history';
import { afterEach, expect, it } from 'vitest';
import { WorkspaceTable } from './WorkspaceTable';
import { TableWorkspace, tableViewState, setTableFilters, ensureTableIdentity, describeTable, pasteTable, parseTabular, delimited, tableRows, tableViewKey } from './TableWorkspace';
import { tableContext, selectTableAxis } from './tableCommands';
import { getShortcutCategories, resolveShortcutBindings, historyShortcuts, shortcutMatchesEvent, validateShortcutBinding } from '../../lib/shortcuts';
const editors: Editor[] = [];
function editor() {
  const e = new Editor({ extensions: [StarterKit, WorkspaceTable, TableWorkspace, TableRow, TableCell, TableHeader], content: '<table data-source-resource-id="source"><tr><th>Name</th><th>Value</th></tr><tr><td>Keep</td><td>1</td></tr><tr><td>Hidden</td><td>2</td></tr><tr><td>Keep</td><td>3</td></tr></table><p>After</p>' });
  editors.push(e);e.commands.setTextSelection(4);ensureTableIdentity(e);return e;
}
afterEach(() => editors.splice(0).forEach(e => e.destroy()));
it('migrates the photographed collision and shares history/help/validation definitions', () => {
  const keys = resolveShortcutBindings({ switchNoteNext: { windows: 'Mod+Alt+ArrowRight' }, switchNotePrevious: { windows: 'Ctrl+Alt+Left' } }, 'windows');
  expect(keys.switchNoteNext).toBe('Alt+ArrowRight');expect(keys.switchNotePrevious).toBe('Alt+ArrowLeft');
  const history = historyShortcuts('windows');expect(shortcutMatchesEvent(keys.switchNoteNext, new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, altKey: true }))).toBe(false);
  expect(validateShortcutBinding('switchNoteNext', history.forward, keys)).toContain('history');
  const navigation = getShortcutCategories(keys).filter(g => g.category === 'Navigation');expect(navigation).toHaveLength(1);
  expect(navigation[0].items.find(i => i.description === 'Switch note (next)')?.keys).toEqual(['Alt', 'Right']);
});
it('keeps filters out of saved JSON and rejects hidden-row and structural mutations', () => {
  const e = editor(), before = e.getJSON(), table = tableContext(e)!.table, columnId = table.attrs.columnIds[0];
  setTableFilters(e, { [columnId]: { mode: 'contains', query: 'keep', values: [] } });
  const ctx = tableContext(e)!;expect(describeTable(ctx.table, tableViewState(e.state).filters[table.attrs.tableId]).visible).toEqual([0, 1, 3]);
  expect(e.getJSON()).toEqual(before);
  e.commands.deleteTable();expect(e.getJSON()).toEqual(before);
  const hidden = ctx.tableStart + ctx.map.map[2 * ctx.map.width + 1];
  e.view.dispatch(e.state.tr.insertText('lost', hidden + 2));expect(e.getJSON()).toEqual(before);
  setTableFilters(e, {});expect(e.getJSON()).toEqual(before);
});
it('pastes into visible rows only, rejects oversized filtered paste and undoes atomically', () => {
  const e = editor(), table = tableContext(e)!.table;
  setTableFilters(e, { [table.attrs.columnIds[0]]: { mode: 'values', query: '', values: ['Keep'] } });
  const ctx = tableContext(e)!;e.commands.setTextSelection(ctx.tableStart + ctx.map.map[3] + 2);
  const before = e.getJSON();e.view.dispatch(closeHistory(e.state.tr));
  pasteTable(e.view, '"first\nline"\nlast');
  const rows = tableRows(tableContext(e)!.table);expect(rows[1][1]).toBe('first\nline');expect(rows[2]).toEqual(['Hidden', '2']);expect(rows[3][1]).toBe('last');
  e.commands.undo();expect(e.getJSON()).toEqual(before);
  expect(() => pasteTable(e.view, 'a\nb\nc')).toThrow('Clear filters');expect(e.getJSON()).toEqual(before);
});
it('grows unfiltered grids while retaining sources/column identities and quoted values', () => {
  const e = editor(), original = tableContext(e)!.table.attrs.columnIds;
  selectTableAxis(e, 'column', 1);e.commands.setTextSelection(tableContext(e)!.tableStart + tableContext(e)!.map.map[7] + 2);
  pasteTable(e.view, '"one\ttwo"\t"say ""yes"""\r\nnext\tlast\r\n');
  const ctx = tableContext(e)!;expect(ctx.map.width).toBe(3);expect(ctx.map.height).toBe(5);
  expect(ctx.table.attrs.columnIds.slice(0, 2)).toEqual(original);expect(ctx.table.attrs.sourceResourceId).toBe('source');
  expect(tableRows(ctx.table)[3].slice(1)).toEqual(['one\ttwo', 'say "yes"']);
  expect(parseTabular('a\tb\nx')).toEqual([['a', 'b'], ['x', '']]);
  expect(() => parseTabular('"unclosed')).toThrow('Malformed');
});
it('exports explicit row sets, quotes multiline values and neutralizes CSV formulas', () => {
  const e = editor(), ctx = tableContext(e)!;
  expect(tableRows(ctx.table, [0, 1, 3])).toHaveLength(3);expect(tableRows(ctx.table)).toHaveLength(4);
  expect(delimited([['=SUM(A1)', ' a,b', 'line\n"quote"', '  @cmd']], ',', true)).toBe('\'=SUM(A1)," a,b","line\n""quote""",\'  @cmd');
  expect(delimited([['=raw']], '\t')).toBe('=raw');
  e.view.dispatch(e.state.tr.setMeta(tableViewKey, { expanded: ctx.table.attrs.tableId }));
  expect(e.getJSON().content?.length).toBe(2);expect(e.getText()).toContain('After');
  e.commands.setTextSelection(e.state.doc.content.size - 1);expect(tableContext(e)).not.toBeNull();
  e.commands.deleteTable();expect(tableViewState(e.state).expanded).toBeNull();
});
