import { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Copy, Download } from 'lucide-react';
import { describeTable, setTableFilters, tableViewState, tableRows, delimited, ensureTableIdentity, cellText } from './TableWorkspace';
import { tableContext } from './tableCommands';

export default function TableDataPanel({ editor, mode }: { editor: Editor; mode: 'filter' | 'export' | 'help' }) {
  const [column, setColumn] = useState(0);
  const [scope, setScope] = useState<'visible' | 'all'>('visible');
  const [message, setMessage] = useState('');
  const [valueSearch, setValueSearch] = useState('');
  const ctx = tableContext(editor);
  if (!ctx) return null;
  const nested = editor.state.doc.resolve(ctx.pos).depth > 0;
  const filters = tableViewState(editor.state).filters[ctx.table.attrs.tableId] ?? {};
  const info = describeTable(ctx.table, filters);
  const index = Math.min(column, info.map.width - 1);
  const id = ctx.table.attrs.columnIds?.[index];
  const filter = filters[id];
  const visibleBody = info.visible.filter(row => row >= info.headers).length;
  const choices = mode === 'filter' ? [...new Set(Array.from({ length: info.map.height - info.headers }, (_, i) => cellText(ctx.table.nodeAt(info.map.map[(i + info.headers) * info.map.width + index])!)))].sort() : [];
  const update = (next: typeof filter | undefined) => {
    const table = ensureTableIdentity(editor), columnId = table.attrs.columnIds[index];
    const current = { ...(tableViewState(editor.state).filters[table.attrs.tableId] ?? {}) };
    if (next) current[columnId] = next; else delete current[columnId];
    setTableFilters(editor, current);
  };
  const rows = () => tableRows(ctx.table, scope === 'visible' ? info.visible : undefined);
  async function copy() {
    try { await navigator.clipboard.writeText(delimited(rows(), '\t')); setMessage(`Copied ${scope} rows as TSV.`); }
    catch { setMessage('Clipboard access failed. Retry, use Ctrl+C on selected cells, or download CSV.'); }
  }
  function download() {
    const blob = new Blob(['\uFEFF' + delimited(rows(), ',', true)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `table-${scope}.csv`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`Downloaded ${scope} rows as CSV.`);
  }
  return <div className="table-data-panel">
    {mode === 'filter' && <>
      <div className="table-panel-summary"><span>{visibleBody} / {info.map.height - info.headers} rows</span>
        {info.filtered && <button type="button" className="table-action" onClick={() => setTableFilters(editor, {})}>Clear filters</button>}
      </div>
      {visibleBody === 0 && info.filtered && <p role="status">No matching rows. Adjust or clear filters.</p>}
      {info.filtered && <p className="table-help-text">Clear filters before structural edits, cutting ranges or resizing.</p>}
      {info.verticalSpans && <p>Split vertically merged cells before filtering.</p>}
      {nested && <p>Filtering requires a top-level table.</p>}
      <fieldset disabled={info.verticalSpans || nested} className="table-filter-fields disabled:opacity-50">
        <label>Column <select className="table-field" value={index} onChange={event => { setColumn(Number(event.target.value)); setValueSearch(''); }}>
          {Array.from({ length: info.map.width }, (_, col) => <option key={col} value={col}>{info.headers ? cellText(ctx.table.nodeAt(info.map.map[col])!).slice(0, 50) || `Column ${col + 1}` : `Column ${col + 1}`}</option>)}
        </select></label>
        <label>Condition <select className="table-field" value={filter?.mode ?? 'none'} onChange={event => update(event.target.value === 'none' ? undefined : { mode: event.target.value as 'contains' | 'values' | 'empty' | 'nonempty', query: '', values: [] })}>
          <option value="none">All values</option><option value="contains">Contains text</option><option value="values">Selected values</option><option value="empty">Empty</option><option value="nonempty">Not empty</option>
        </select></label>
        {filter?.mode === 'contains' && <input className="table-field" aria-label="Filter text" placeholder="Contains…" value={filter.query} onChange={event => update({ ...filter, query: event.target.value })} />}
        {filter?.mode === 'values' && <div className="space-y-2">
          <input className="table-field" aria-label="Search filter values" placeholder="Find a value…" value={valueSearch} onChange={event => setValueSearch(event.target.value)} />
          <p className="table-help-text">No values checked means all values.</p>
          <div className="max-h-32 overflow-auto">{choices.filter(value => value.toLocaleLowerCase().includes(valueSearch.toLocaleLowerCase())).slice(0, 200).map(value => <label key={value} className="flex items-center gap-2 p-1"><input type="checkbox" checked={filter.values.includes(value)} onChange={event => update({ ...filter, values: event.target.checked ? [...filter.values, value] : filter.values.filter(v => v !== value) })} /><span className="break-all">{value || '(empty)'}</span></label>)}</div>
          {choices.length > 200 && <p className="table-help-text">Showing up to 200 matching values. Search to narrow the list.</p>}
        </div>}
      </fieldset>
    </>}
    {mode === 'export' && <div className="table-export-fields">
      <label>Rows to include <select className="table-field" value={scope} onChange={event => { setScope(event.target.value as 'visible' | 'all'); setMessage(''); }}><option value="visible">Visible rows (with headers)</option><option value="all">All rows (with headers)</option></select></label>
      <button type="button" className="table-action" onClick={() => void copy()}><Copy size={15} />Copy TSV</button>
      <button type="button" className="table-action" onClick={download}><Download size={15} />Download CSV</button>
      <details className="table-help-text"><summary>About exported values</summary><p>CSV/TSV contain values only. Merged values occupy their top-left cell; covered cells are empty. CSV prefixes formula-like values with an apostrophe. TSV copies original values.</p></details>
    </div>}
    {mode === 'help' && <div className="table-help-text space-y-3">
      <p>Drag across cells to select a range. Use Row → Select row or Column → Select column for entire rows or columns. Drag a column edge to resize.</p>
      <p>Split merged cells before moving rows or columns. Clear filters before structural edits.</p>
      <p>Tab and Shift+Tab move between cells. Enter adds a paragraph. Copy a selected range with Ctrl+C (Cmd+C on Mac).</p>
      <p>Expanded view uses normal note autosave. Its header shows save status and retry. Return to note keeps your changes and undo history.</p>
    </div>}
    {message && <p role="status" className="table-feedback">{message}</p>}
  </div>;
}
