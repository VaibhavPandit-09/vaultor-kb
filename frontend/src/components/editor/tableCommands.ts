import type { Editor } from '@tiptap/core';
import type { Command } from '@tiptap/pm/state';
import { CellSelection, selectedRect, isInTable, moveTableColumn, moveTableRow, addColumnBefore, addColumnAfter, deleteColumn } from '@tiptap/pm/tables';

export function tableContext(editor: Editor) {
  if (!isInTable(editor.state)) return null;
  const rect = selectedRect(editor.state);
  let spans = false;
  rect.table.descendants(node => { if (node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell') spans ||= node.attrs.colspan > 1 || node.attrs.rowspan > 1; });
  return { ...rect, pos: rect.tableStart - 1, spans };
}

export function selectTableAxis(editor: Editor, axis: 'row' | 'column', index: number) {
  const ctx = tableContext(editor);
  if (!ctx) return;
  const { map, tableStart } = ctx;
  const first = axis === 'row' ? index * map.width : index;
  const last = axis === 'row' ? first + map.width - 1 : (map.height - 1) * map.width + index;
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, tableStart + map.map[first], tableStart + map.map[last])));
  editor.view.focus();
}

// Column identity changes in the SAME transaction as the structural edit, including undo.
export function changeColumns(editor: Editor, action: 'before' | 'after' | 'delete' | 'left' | 'right', apply = true) {
  const ctx = tableContext(editor);
  if (!ctx) return false;
  const { left, right, map } = ctx;
  const ids: string[] = Array.from({ length: map.width }, (_, i) => ctx.table.attrs.columnIds?.[i] ?? crypto.randomUUID());
  let command: Command;
  if (action === 'before' || action === 'after') {
    ids.splice(action === 'before' ? left : right, 0, crypto.randomUUID());
    command = action === 'before' ? addColumnBefore : addColumnAfter;
  } else if (action === 'delete') {
    if (right - left === map.width) return false;
    ids.splice(left, right - left); command = deleteColumn;
  } else {
    const target = left + (action === 'left' ? -1 : 1);
    if (ctx.spans || right - left !== 1 || target < 0 || target >= map.width) return false;
    const [id] = ids.splice(left, 1); ids.splice(target, 0, id);
    command = moveTableColumn({ from: left, to: target });
  }
  return command(editor.state, apply ? tr => {
    const table = tr.doc.nodeAt(ctx.pos);
    if (table?.type.name === 'table') tr.setNodeMarkup(ctx.pos, undefined, { ...table.attrs, tableId: table.attrs.tableId ?? crypto.randomUUID(), columnIds: ids });
    editor.view.dispatch(tr);
    editor.view.focus();
  } : undefined);
}

export function moveRow(editor: Editor, direction: -1 | 1, apply = true) {
  const ctx = tableContext(editor);
  if (!ctx || ctx.spans || ctx.bottom - ctx.top !== 1 || ctx.top + direction < 0 || ctx.top + direction >= ctx.map.height) return false;
  return moveTableRow({ from: ctx.top, to: ctx.top + direction })(editor.state, apply ? tr => { editor.view.dispatch(tr); editor.view.focus(); } : undefined);
}

export function sizeColumns(editor: Editor, totalWidth: number) {
  const ctx = tableContext(editor);
  if (!ctx) return;
  const width = Math.max(80, Math.floor(totalWidth / ctx.map.width));
  const tr = editor.state.tr;
  ctx.table.descendants((node, offset) => {
    if (node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell') {
      tr.setNodeMarkup(ctx.tableStart + offset, undefined, { ...node.attrs, colwidth: Array(node.attrs.colspan).fill(width) });
    }
  });
  editor.view.dispatch(tr); editor.view.focus();
}
