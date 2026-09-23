import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { TableMap, CellSelection, isInTable, selectedRect } from '@tiptap/pm/tables';
import type { Node as ProseNode } from '@tiptap/pm/model';
import Papa from 'papaparse';

export type ColumnFilter = { mode: 'contains' | 'values' | 'empty' | 'nonempty'; query: string; values: string[] };
export type TableFilters = Record<string, ColumnFilter>;
type ViewState = { filters: Record<string, TableFilters>; expanded: string | null; notice: string };
export const tableViewKey = new PluginKey<ViewState>('tableView');
const empty: ViewState = { filters: {}, expanded: null, notice: '' };
export function tableViewState(state: EditorState): ViewState { return tableViewKey.getState(state) ?? empty; }
export function cellText(node: ProseNode) { return node.textBetween(0, node.content.size, '\n', leaf => leaf.type.name === 'resourceLink' ? String(leaf.attrs.label ?? '') : leaf.type.name === 'hardBreak' ? '\n' : ''); }
export function describeTable(table: ProseNode, filters: TableFilters = {}) {
  const map = TableMap.get(table);
  let headers = 0, verticalSpans = false;
  for (let row = 0; row < map.height; row++) {
    let allHeader = true;
    for (let col = 0; col < map.width; col++) {
      const cell = table.nodeAt(map.map[row * map.width + col])!;
      allHeader &&= cell.type.name === 'tableHeader';
      verticalSpans ||= cell.attrs.rowspan > 1;
    }
    if (row === headers && allHeader) headers++;
  }
  const visible = Array.from({ length: map.height }, (_, row) => row).filter(row => row < headers || Object.entries(filters).every(([id, filter]) => {
    const col = (table.attrs.columnIds as string[] | null)?.indexOf(id) ?? -1;
    if (col < 0 || verticalSpans) return true;
    const value = cellText(table.nodeAt(map.map[row * map.width + col])!);
    switch (filter.mode) {
      case 'contains': return value.toLocaleLowerCase().includes(filter.query.toLocaleLowerCase());
      case 'empty': return !value.trim();
      case 'nonempty': return !!value.trim();
      case 'values': return filter.values.length === 0 || filter.values.includes(value);
    }
  }));
  return { map, headers, verticalSpans, visible, filtered: Object.keys(filters).length > 0 };
}
export function setTableNotice(view: EditorView, notice: string) { view.dispatch(view.state.tr.setMeta(tableViewKey, { notice })); }
export function ensureTableIdentity(editor: Editor) {
  const ctx = selectedRect(editor.state);
  if (!ctx.table.attrs.tableId || !Array.isArray(ctx.table.attrs.columnIds)) {
    editor.view.dispatch(editor.state.tr.setNodeMarkup(ctx.tableStart - 1, undefined, { ...ctx.table.attrs, tableId: ctx.table.attrs.tableId ?? crypto.randomUUID(), columnIds: Array.from({ length: ctx.map.width }, () => crypto.randomUUID()) }));
  }
  return selectedRect(editor.state).table;
}
export function setTableFilters(editor: Editor, filters: TableFilters) {
  const selected = selectedRect(editor.state);
  if (editor.state.doc.resolve(selected.tableStart - 1).depth > 0 && Object.keys(filters).length) { setTableNotice(editor.view, 'Filtering requires a top-level table.'); return; }
  const table = ensureTableIdentity(editor);
  if (describeTable(table).verticalSpans && Object.keys(filters).length) { setTableNotice(editor.view, 'Split vertically merged cells before filtering.'); return; }
  editor.view.dispatch(editor.state.tr.setMeta(tableViewKey, { tableId: table.attrs.tableId, filters, notice: '' }));
}
export function tableRows(table: ProseNode, rows?: number[], rectangle?: { left: number; right: number }) {
  const map = TableMap.get(table);
  return (rows ?? Array.from({ length: map.height }, (_, r) => r)).map(row => Array.from({ length: (rectangle?.right ?? map.width) - (rectangle?.left ?? 0) }, (_, i) => {
    const col = (rectangle?.left ?? 0) + i, offset = map.map[row * map.width + col];
    const cell = map.findCell(offset);
    return cell.top === row && cell.left === col ? cellText(table.nodeAt(offset)!) : '';
  }));
}
export function delimited(rows: string[][], delimiter: ',' | '\t', safe = false) {
  return rows.map(row => row.map(value => {
    // eslint-disable-next-line no-control-regex -- Detect control/whitespace prefixes before spreadsheet formulas.
    const protectedValue = safe && /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? "'" + value : value;
    return /["\r\n]/.test(protectedValue) || protectedValue.includes(delimiter) ? '"' + protectedValue.replaceAll('"', '""') + '"' : protectedValue;
  }).join(delimiter)).join('\r\n');
}
export function parseTabular(text: string): string[][] {
  if (text.length > 5 * 1024 * 1024) throw new Error('Paste is limited to 5 MiB.');
  const parsed = Papa.parse<string[]>(text, { delimiter: '\t', skipEmptyLines: false });
  if (parsed.errors.length) throw new Error('Malformed quoted table data. Nothing was pasted.');
  const rows = parsed.data;
  if (/\r?\n$/.test(text) && rows.at(-1)?.length === 1 && rows.at(-1)?.[0] === '') rows.pop();
  const width = Math.max(0, ...rows.map(row => row.length));
  if (!width || rows.length > 10000 || width > 500 || rows.length * width > 50000) throw new Error('Paste exceeds 10,000 rows, 500 columns or 50,000 cells.');
  return rows.map(row => [...row, ...Array(width - row.length).fill('')]);
}
export function pasteTable(view: EditorView, text: string) {
  const state = view.state, rect = selectedRect(state), filters = tableViewState(state).filters[rect.table.attrs.tableId] ?? {};
  const info = describeTable(rect.table, filters);
  let values = parseTabular(text);
  const selectedRows = info.visible.filter(row => row >= rect.top && row < rect.bottom);
  if (state.selection instanceof CellSelection && (selectedRows.length > 1 || rect.right - rect.left > 1)) {
    if (values.length === 1 && values[0].length === 1) values = selectedRows.map(() => Array(rect.right - rect.left).fill(values[0][0]));
    else if (values.length !== selectedRows.length || values[0].length !== rect.right - rect.left) throw new Error('Paste dimensions must match the selected visible rectangle, or start from a single cell.');
  }
  const targets = info.filtered ? info.visible.filter(row => row >= rect.top).slice(0, values.length) : Array.from({ length: values.length }, (_, i) => rect.top + i);
  const width = Math.max(info.map.width, rect.left + values[0].length), height = Math.max(info.map.height, (targets.at(-1) ?? 0) + 1);
  if (width * height > 50000 || width > 500 || height > 10000) throw new Error('Result exceeds 50,000 cells, 500 columns or 10,000 rows.');
  if (info.filtered && (targets.length !== values.length || width !== info.map.width)) throw new Error('Clear filters or select a smaller paste range. Nothing was changed.');
  // Rebuilding a regular grid is atomic; do not guess how to overwrite merged cells.
  if (rect.table.content.content.some(row => row.content.content.some(cell => cell.attrs.colspan > 1 || cell.attrs.rowspan > 1))) throw new Error('Split merged cells before pasting a tabular range.');
  const sourceRows = new Map(targets.map((row, i) => [row, i]));
  const rows: ProseNode[] = [];
  for (let row = 0; row < height; row++) {
    const oldRow = row < rect.table.childCount ? rect.table.child(row) : null;
    const cells: ProseNode[] = [];
    for (let col = 0; col < width; col++) {
      let cell = oldRow && col < oldRow.childCount ? oldRow.child(col) : state.schema.nodes[row < info.headers ? 'tableHeader' : 'tableCell'].createAndFill()!;
      const sourceRow = sourceRows.get(row) ?? -1, sourceCol = col - rect.left;
      if (sourceRow >= 0 && sourceCol >= 0 && sourceCol < values[0].length) {
        const lines = values[sourceRow][sourceCol].split(/\r\n?|\n/);
        const inline: ProseNode[] = [];
        lines.forEach((line, index) => { if (index) inline.push(state.schema.nodes.hardBreak.create()); if (line) inline.push(state.schema.text(line)); });
        cell = cell.type.create(cell.attrs, state.schema.nodes.paragraph.create(null, inline));
      }
      cells.push(cell);
    }
    rows.push(state.schema.nodes.tableRow.create(oldRow?.attrs, cells));
  }
  const columnIds = Array.from({ length: width }, (_, i) => rect.table.attrs.columnIds?.[i] ?? crypto.randomUUID());
  const replacement = rect.table.type.create({ ...rect.table.attrs, tableId: rect.table.attrs.tableId ?? crypto.randomUUID(), columnIds }, rows);
  const tr = state.tr.replaceWith(rect.tableStart - 1, rect.tableStart - 1 + rect.table.nodeSize, replacement);
  const map = TableMap.get(replacement);
  tr.setSelection(TextSelection.near(tr.doc.resolve(rect.tableStart + map.map[rect.top * width + rect.left] + 1)));
  view.dispatch(tr.setMeta(tableViewKey, { notice: '' }));
}
export function handleTablePaste(view: EditorView, event: ClipboardEvent) {
  if (!isInTable(view.state)) return false;
  const text = event.clipboardData?.getData('text/plain');
  if (!text || (!text.includes('\t') && !text.includes('\n') && !(view.state.selection instanceof CellSelection))) return false;
  event.preventDefault();
  try { pasteTable(view, text); } catch (error) { setTableNotice(view, error instanceof Error ? error.message : 'Could not paste table data.'); }
  return true;
}
function tables(doc: ProseNode) {
  const result = new Map<string, { node: ProseNode; pos: number }>();
  doc.descendants((node, pos) => { if (node.type.name === 'table') { result.set(node.attrs.tableId, { node, pos }); return false; } });
  return result;
}
function structure(table: ProseNode) { return JSON.stringify(table.content.content.map(row => row.content.content.map(cell => [cell.type.name, cell.attrs.colspan, cell.attrs.rowspan, cell.attrs.colwidth]))); }

export const TableWorkspace = Extension.create({
  name: 'tableWorkspace',
  priority: 1100,
  addProseMirrorPlugins() {
    return [new Plugin<ViewState>({
      key: tableViewKey,
      state: {
        init: () => ({ filters: {}, expanded: null, notice: '' }),
        apply(tr, previous) {
          const meta = tr.getMeta(tableViewKey);
          if (meta?.reset) return { filters: {}, expanded: null, notice: '' };
          const next = { ...previous, filters: { ...previous.filters }, ...(meta?.notice !== undefined ? { notice: meta.notice } : {}) };
          if (meta?.tableId) { if (Object.keys(meta.filters).length) next.filters[meta.tableId] = meta.filters; else delete next.filters[meta.tableId]; }
          if (meta?.expanded !== undefined) next.expanded = meta.expanded;
          if (tr.docChanged) for (const id of Object.keys(next.filters)) if (!tables(tr.doc).has(id)) delete next.filters[id];
          return next;
        },
      },
      filterTransaction(tr, state) {
        if (!tr.docChanged) return true;
        const before = tables(state.doc), after = tables(tr.doc);
        for (const [id, filters] of Object.entries(tableViewState(state).filters)) {
          const old = before.get(id), next = after.get(id);
          if (!old) continue;
          if (!next || structure(old.node) !== structure(next.node) || JSON.stringify(old.node.attrs.columnIds) !== JSON.stringify(next.node.attrs.columnIds)) return false;
          const info = describeTable(old.node, filters);
          for (let row = 0; row < old.node.childCount; row++) if (!info.visible.includes(row) && !old.node.child(row).eq(next.node.child(row))) return false;
        }
        return true;
      },
      appendTransaction(transactions, _old, state) {
        if (!transactions.some(tr => tr.docChanged || tr.selectionSet || tr.getMeta(tableViewKey))) return null;
        const expanded = tableViewState(state).expanded;
        if (expanded) {
          const target = tables(state.doc).get(expanded);
          if (!target) return state.tr.setMeta(tableViewKey, { expanded: null });
          if (!isInTable(state) || selectedRect(state).table.attrs.tableId !== expanded) {
            const info = describeTable(target.node, tableViewState(state).filters[expanded]);
            const row = info.visible[0] ?? 0;
            return state.tr.setSelection(TextSelection.near(state.doc.resolve(target.pos + 2 + info.map.map[row * info.map.width])));
          }
        }
        if (!isInTable(state)) return null;
        const rect = selectedRect(state), filters = tableViewState(state).filters[rect.table.attrs.tableId];
        if (!filters) return null;
        const info = describeTable(rect.table, filters);
        if (info.visible.includes(rect.top)) return null;
        const row = info.visible.find(row => row >= rect.top) ?? info.visible.at(-1);
        if (row === undefined) return null;
        const pos = rect.tableStart + info.map.map[row * info.map.width + rect.left] + 1;
        return state.tr.setSelection(TextSelection.near(state.doc.resolve(pos), 1));
      },
      props: {
        decorations(state) {
          const { filters, expanded } = tableViewState(state); const decorations: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'table') return;
            const active = filters[node.attrs.tableId];
            if (active) {
              decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'table-filter-active' }));
              const info = describeTable(node, active);
              node.forEach((row, offset, index) => { if (!info.visible.includes(index)) decorations.push(Decoration.node(pos + 1 + offset, pos + 1 + offset + row.nodeSize, { class: 'table-filter-hidden', 'aria-hidden': 'true' })); });
            }
            return false;
          });
          if (expanded) state.doc.forEach((node, pos) => { if (node.type.name !== 'table' || node.attrs.tableId !== expanded) decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'table-expanded-hidden' })); });
          return DecorationSet.create(state.doc, decorations);
        },
        handlePaste: handleTablePaste,
        handleDOMEvents: {
          copy(view, event) {
            if (!(view.state.selection instanceof CellSelection)) return false;
            const rect = selectedRect(view.state), info = describeTable(rect.table, tableViewState(view.state).filters[rect.table.attrs.tableId]);
            event.clipboardData?.setData('text/plain', delimited(tableRows(rect.table, info.visible.filter(row => row >= rect.top && row < rect.bottom), rect), '\t'));
            event.preventDefault(); return true;
          },
          cut(view, event) {
            if (!(view.state.selection instanceof CellSelection) || !isInTable(view.state)) return false;
            const rect = selectedRect(view.state);
            if (!tableViewState(view.state).filters[rect.table.attrs.tableId]) return false;
            event.preventDefault();setTableNotice(view, 'Clear filters before cutting a cell range. Copy visible rows remains available.');return true;
          },
        },
        handleKeyDown(view, event) {
          if (!isInTable(view.state) || event.ctrlKey || event.metaKey || event.altKey) return false;
          const rect = selectedRect(view.state), filters = tableViewState(view.state).filters[rect.table.attrs.tableId];
          const expanded = tableViewState(view.state).expanded === rect.table.attrs.tableId;
          if ((!filters && !expanded) || !['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return false;
          if (event.shiftKey && event.key !== 'Tab') return false;
          if (event.key !== 'Tab' && !view.endOfTextblock(({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const)[event.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'])) return false;
          const info = describeTable(rect.table, filters), index = info.visible.indexOf(rect.top);
          let nextRow = index, nextCol = rect.left;
          if (['Tab', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { nextCol += event.shiftKey || event.key === 'ArrowLeft' ? -1 : 1; if (nextCol < 0) { nextRow--; nextCol = info.map.width - 1; } if (nextCol >= info.map.width) { nextRow++; nextCol = 0; } }
          else nextRow += event.key === 'ArrowUp' ? -1 : 1;
          if (!filters && event.key === 'Tab' && nextRow === info.visible.length) return false;
          event.preventDefault();
          if (nextRow >= 0 && nextRow < info.visible.length) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(rect.tableStart + info.map.map[info.visible[nextRow] * info.map.width + nextCol] + 1))).scrollIntoView());
          return true;
        },
      },
    })];
  },
});
