// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { expect, it } from 'vitest';
import { SharedHistory, SharedNoteDocuments } from './sharedNoteDocuments';
import { WorkspaceTable } from '../components/editor/WorkspaceTable';
import { TableWorkspace, ensureTableIdentity, setTableFilters, tableViewState } from '../components/editor/TableWorkspace';
import { tableContext } from '../components/editor/tableCommands';
it('remote table changes cannot be rejected by another views local filters', () => {
  const shared = new SharedNoteDocuments();
  const create = () => new Editor({ onBeforeCreate: ({ editor }) => shared.prepare(editor), extensions: [StarterKit.configure({ undoRedo: false }), SharedHistory, WorkspaceTable, TableWorkspace, TableRow, TableCell, TableHeader], content: '<table><tr><th>Name</th></tr><tr><td>Keep</td></tr><tr><td>Hidden</td></tr></table>' });
  const a = create(), b = create(); const detachA = shared.attach('note', a), detachB = shared.attach('note', b);
  try {
    a.commands.setTextSelection(3); ensureTableIdentity(a);
    b.commands.setTextSelection(3); const table = tableContext(b)!.table;
    setTableFilters(b, { [table.attrs.columnIds[0]]: { mode: 'contains', query: 'Keep', values: [] } });
    a.commands.addRowAfter();
    expect(b.getJSON()).toEqual(a.getJSON()); expect(tableViewState(b.state).filters).toEqual({});
    expect(tableViewState(b.state).notice).toContain('another pane');
    b.commands.undo(); expect(a.getJSON()).toEqual(b.getJSON());
  } finally { detachA(); detachB(); a.destroy(); b.destroy(); }
});
