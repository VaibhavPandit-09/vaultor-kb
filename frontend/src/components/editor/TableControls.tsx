import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject, type ReactNode, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { Columns3, Rows3, GripHorizontal, GripVertical, Trash2, Merge, Split, Undo2, Redo2, Filter, Maximize2, Minimize2, MoreHorizontal, Download, CircleHelp, X, ArrowLeft, CircleAlert } from 'lucide-react';
import TableDataPanel from './TableDataPanel';
import SaveIndicator from '../SaveIndicator';
import type { SaveStatus } from '../../lib/saveCoordinator';
import { describeTable, ensureTableIdentity, tableViewKey, tableViewState } from './TableWorkspace';
import { tableContext, selectTableAxis, changeColumns, moveRow, sizeColumns } from './tableCommands';
import { ESCAPE_PRIORITIES, useEscapeLayer } from '../../lib/escape/escape';
import { useAnchoredPortalPosition } from '../../lib/useAnchoredPortalPosition';
import { tableOverlayHost, tableToolbarPosition, visibleEditorBounds, type Bounds } from './tableOverlayGeometry';

type Handle = { index: number; top: number; left: number };
type Geometry = { rows: Handle[]; columns: Handle[]; width: number; available: number; pane: Bounds; table: Bounds; toolbar: NonNullable<ReturnType<typeof tableToolbarPosition>>; host: Element };
type Menu = 'row' | 'column' | 'more' | 'filter' | 'export' | 'help';
const titles: Record<Menu, string> = { row: 'Row actions', column: 'Column actions', more: 'Table actions', filter: 'Filter rows', export: 'Copy / export', help: 'Table help' };

export default function TableControls({ editor, active, containerRef, noteTitle = 'Note', saveStatus = 'saved', onRetrySave = () => {} }: { editor: Editor; active: boolean; containerRef: RefObject<HTMLDivElement | null>; noteTitle?: string; saveStatus?: SaveStatus; onRetrySave?: () => void }) {
  const [, refresh] = useState(0);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandError, setExpandError] = useState('');
  const toolbarRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const keyboardOpen = useRef(false);
  const owner = useId();
  useEscapeLayer({ active: expanded && filtersOpen, priority: ESCAPE_PRIORITIES.popover - 1, close: () => setFiltersOpen(false) });
  const ctx = tableContext(editor);
  const shown = active && Boolean(ctx && geometry);
  const close = () => { setMenu(null); setConfirmDelete(false); };
  useEscapeLayer({ id: owner, active: shown && Boolean(menu), priority: ESCAPE_PRIORITIES.popover, close,
    restoreFocus: () => { if (anchorRef.current?.isConnected) anchorRef.current.focus({ preventScroll: true }); else editor.view.focus(); } });
  const { position, updatePosition } = useAnchoredPortalPosition(shown && Boolean(menu), anchorRef, {
    width: menu === 'filter' || menu === 'export' || menu === 'help' ? 288 : 236,
    align: 'end', viewportPadding: 6, offset: 6, bounds: expanded && containerRef.current ? visibleEditorBounds(containerRef.current) : geometry?.pane,
  });
  useLayoutEffect(() => {
    if (!expanded && geometry && toolbarRef.current) {
      const next = tableToolbarPosition(geometry.table, geometry.pane, toolbarRef.current.offsetWidth, toolbarRef.current.offsetHeight);
      if (next && (next.top !== geometry.toolbar.top || next.left !== geometry.toolbar.left)) {
        // Align the portal using its actual rendered size, before paint.
        setGeometry({ ...geometry, toolbar: next });
        return;
      }
    }
    if (menu && anchorRef.current && !anchorRef.current.isConnected) {
      setMenu(null);
      return;
    }
    if (menu && geometry) updatePosition();
    if (menu && position && keyboardOpen.current) {
      popupRef.current?.querySelector<HTMLElement>('button:not(:disabled),select,input')?.focus({ preventScroll: true });
      keyboardOpen.current = false;
    }
  }, [geometry, menu, position, updatePosition, expanded]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-table-controls]')?.getAttribute('data-table-controls') === owner) return;
      setMenu(null); setConfirmDelete(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [owner]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      refresh(n => n + 1);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const current = tableContext(editor), container = containerRef.current;
        if (!current || !container || !active) { setGeometry(null); return; }
        const dom = editor.view.nodeDOM(current.pos);
        const table = dom instanceof Element ? (dom.matches('table') ? dom : dom.querySelector('table')) : null;
        if (!(table instanceof HTMLTableElement)) { setGeometry(null); return; }
        const full = document.fullscreenElement === container;
        const canvas = container.querySelector<HTMLElement>('.table-editor-canvas');
        const bounds = table.getBoundingClientRect(), pane = visibleEditorBounds(full && canvas ? canvas : container);
        const clip = table.closest('.tableWrapper')?.getBoundingClientRect() ?? bounds;
        const info = describeTable(current.table, tableViewState(editor.state).filters[current.table.attrs.tableId]);
        // Keep filter recovery reachable when a headerless table has no matching rows.
        const visibleTable = { top: bounds.top, bottom: info.filtered && !info.visible.length ? Math.max(bounds.bottom, bounds.top + 52) : bounds.bottom, left: Math.max(bounds.left, clip.left), right: Math.min(bounds.right, clip.right) };
        const toolbar = full ? { top: pane.top, left: pane.left, maxWidth: pane.right - pane.left } : tableToolbarPosition(visibleTable, pane, toolbarRef.current?.offsetWidth || 310, toolbarRef.current?.offsetHeight || 40);
        if (!toolbar) { setGeometry(null); return; }
        const visible = info.visible;
        const rows = visible.map(index => {
          const row = table.rows[index]?.getBoundingClientRect();
          return { index, top: row ? row.top + row.height / 2 : bounds.top, left: Math.max(pane.left + 2, clip.left - 20) };
        }).filter(h => h.top >= pane.top + 9 && h.top <= pane.bottom - 9);
        const columns = Array.from({ length: current.map.width }, (_, index) => {
          const offset = current.map.map[(visible[0] ?? 0) * current.map.width + index];
          const cell = editor.view.nodeDOM(current.tableStart + offset);
          const rect = cell instanceof Element ? cell.getBoundingClientRect() : null;
          const cellStart = current.map.findCell(offset).left;
          const span = Number(current.table.nodeAt(offset)?.attrs.colspan ?? 1);
          return { index, top: bounds.top - 20, left: rect ? rect.left + rect.width * (index - cellStart + 0.5) / span : bounds.left };
        }).filter(h => visible.length > 0 && h.top >= pane.top && h.top + 18 <= pane.bottom && h.left >= Math.max(pane.left, clip.left) + 9 && h.left <= Math.min(pane.right, clip.right) - 9);
        setGeometry({ rows, columns, width: bounds.width, available: Math.min(clip.width, pane.right - pane.left), pane, table: visibleTable, toolbar, host: tableOverlayHost(container) });
      });
    };
    const selectionChanged = () => {
      // Filtering may move the document selection; retain the input that owns that action.
      if (!popupRef.current?.contains(document.activeElement)) { setMenu(null); setConfirmDelete(false); }
    };
    const fullChanged = () => {
      const full = document.fullscreenElement === containerRef.current;
      setExpanded(full);
      setMenu(null); setFiltersOpen(false);
      if (!full && !editor.isDestroyed && tableViewState(editor.state).expanded) editor.view.dispatch(editor.state.tr.setMeta(tableViewKey, { expanded: null }));
      update();
    };
    editor.on('selectionUpdate', selectionChanged);
    editor.on('transaction', update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('fullscreenchange', fullChanged);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    for (let element: HTMLElement | null = containerRef.current; element; element = element.parentElement) observer?.observe(element);
    const canvas = containerRef.current?.querySelector('.table-editor-canvas');
    if (canvas) observer?.observe(canvas);
    fullChanged();
    return () => {
      cancelAnimationFrame(frame); editor.off('transaction', update); editor.off('selectionUpdate', selectionChanged);
      window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true);
      document.removeEventListener('fullscreenchange', fullChanged); observer?.disconnect();
    };
  }, [editor, active, containerRef]);

  if (!shown || !ctx || !geometry) return null;
  const filtered = Boolean(tableViewState(editor.state).filters[ctx.table.attrs.tableId]);
  const filterCount = Object.keys(tableViewState(editor.state).filters[ctx.table.attrs.tableId] ?? {}).length;
  const notice = expandError || tableViewState(editor.state).notice;
  const open = (kind: Menu, event: MouseEvent<HTMLElement>) => {
    anchorRef.current = event.currentTarget;
    keyboardOpen.current = event.detail === 0;
    setMenu(menu === kind ? null : kind); setConfirmDelete(false);
  };
  const run = (action: () => unknown) => { action(); close(); };
  const button = (label: string, action: () => unknown, enabled = true, reason = 'Not available for this selection', structural = true, icon?: ReactNode) => (
    <button type="button" className="table-action" disabled={!enabled || (structural && filtered)} title={structural && filtered ? 'Clear filters before structural edits' : enabled ? label : reason} onClick={() => run(action)}>{icon}{label}</button>
  );
  const trigger = (kind: Menu, label: string, icon: ReactNode) => <button type="button" className="table-action" title={label} aria-label={label} aria-expanded={menu === kind} aria-haspopup="dialog" onClick={event => open(kind, event)}>{icon}<span className="table-tool-label">{label}</span>{kind === 'filter' && filterCount > 0 && <span className="table-filter-badge">{filterCount}</span>}</button>;
  async function expand() {
    setExpandError('');
    try {
      if (expanded) { await document.exitFullscreen(); return; }
      if (editor.state.doc.resolve(ctx!.pos).depth > 0) throw new Error('Move this table out of its enclosing block before expanding.');
      if (!containerRef.current?.requestFullscreen) throw new Error('Expanded view requires browser fullscreen support.');
      const table = ensureTableIdentity(editor);
      await containerRef.current.requestFullscreen();
      editor.view.dispatch(editor.state.tr.setMeta(tableViewKey, { expanded: table.attrs.tableId }));
      setExpanded(true); close();
    } catch (error) {
      setExpandError(error instanceof Error ? error.message : 'Could not open expanded view. Retry the Expand button.');
      anchorRef.current = toolbarRef.current; setMenu('help');
    }
  }
  const preserveSelection = (event: React.MouseEvent) => { if ((event.target as Element).closest('button')) event.preventDefault(); };
  const moveReason = 'Select one row or column; split merged cells before moving';
  return createPortal(<>
    {expanded ? <section data-table-controls={owner} className="table-expanded-chrome" aria-label="Expanded table workspace" onMouseDown={preserveSelection}>
      <header className="table-expanded-heading">
        <div className="table-expanded-title"><span>TABLE WORKSPACE</span><strong title={noteTitle}>{noteTitle}</strong><small>{ctx.map.height} rows · {ctx.map.width} columns</small></div>
        <div className="table-expanded-save"><SaveIndicator status={saveStatus} onRetry={onRetrySave} /><span>{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'failed' ? 'Save failed' : 'All changes saved'}</span>{saveStatus === 'failed' && <button className="table-action" onClick={onRetrySave}>Retry save</button>}</div>
        <button type="button" className="table-action table-return" onClick={() => void expand()}><ArrowLeft size={16} />Return to note</button>
      </header>
      <div className="table-expanded-actions" role="toolbar" aria-label="Table editing controls">
        <div className="table-action-group" aria-label="Structure">{trigger('row', 'Row', <Rows3 size={16} />)}{trigger('column', 'Column', <Columns3 size={16} />)}
          {button('Header row', () => editor.chain().focus().toggleHeaderRow().run())}
          {button('Header column', () => editor.chain().focus().toggleHeaderColumn().run())}</div>
        <div className="table-action-group" aria-label="Cells">
          {button('Merge', () => editor.chain().focus().mergeCells().run(), editor.can().mergeCells(), undefined, true, <Merge size={15} />)}
          {button('Split', () => editor.chain().focus().splitCell().run(), editor.can().splitCell(), undefined, true, <Split size={15} />)}
          {button('Even widths', () => sizeColumns(editor, geometry.width))}
          {button('Fit width', () => sizeColumns(editor, geometry.available))}</div>
        <div className="table-action-group" aria-label="History">
          {button('Undo', () => editor.chain().focus().undo().run(), editor.can().undo(), undefined, false, <Undo2 size={15} />)}
          {button('Redo', () => editor.chain().focus().redo().run(), editor.can().redo(), undefined, false, <Redo2 size={15} />)}</div>
        <div className="table-action-group" aria-label="Data">
          <button type="button" className="table-action" aria-expanded={filtersOpen} onClick={() => { setFiltersOpen(!filtersOpen); close(); }}><Filter size={16} />Filters{filterCount > 0 && <span className="table-filter-badge">{filterCount}</span>}</button>
          {trigger('export', 'Copy / export', <Download size={16} />)}{trigger('more', 'More', <MoreHorizontal size={16} />)}</div>
      </div>
      {filtersOpen && <div className="table-expanded-filters" role="region" aria-label="Table filters"><TableDataPanel editor={editor} mode="filter" /><button type="button" className="table-action" aria-label="Close filters" onClick={() => setFiltersOpen(false)}><X size={16} /></button></div>}
      {notice && <p role="status" className="table-feedback">{notice}</p>}
    </section> : <div ref={toolbarRef} data-table-controls={owner} className={`table-tools${geometry.toolbar.maxWidth < 340 ? ' table-tools-compact' : ''}`} role="toolbar" aria-label="Table editing controls" style={geometry.toolbar} onMouseDown={preserveSelection}>
      {trigger('row', 'Row', <Rows3 size={16} />)}
      {trigger('column', 'Column', <Columns3 size={16} />)}
      <span className="table-tool-divider" />
      {trigger('filter', 'Filter', <Filter size={16} />)}
      <button type="button" className="table-action" title={expanded ? 'Exit expanded view' : 'Expand table'} aria-label={expanded ? 'Exit expanded view' : 'Expand table'} onClick={() => void expand()}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}<span className="table-tool-label">{expanded ? 'Exit' : 'Expand'}</span></button>
      {trigger('more', 'More', <MoreHorizontal size={17} />)}
      {notice && <button type="button" className="table-action table-notice" title={notice} aria-label="Table notification" onClick={event => open('help', event)}><CircleAlert size={16} /></button>}
    </div>}
    {menu && position && <div ref={popupRef} data-table-controls={owner} className="table-popover" role="dialog" aria-label={titles[menu]} style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight, transform: position.placement === 'top' ? 'translateY(-100%)' : undefined }} onMouseDown={preserveSelection}>
      <div className="table-popover-heading">
        {(menu === 'export' || menu === 'help') && <button type="button" className="table-action" aria-label="Back to table actions" title="Back" onClick={() => setMenu('more')}><ArrowLeft size={14} /></button>}
        <span>{titles[menu]}</span><button type="button" className="table-action" title="Close menu" aria-label="Close table menu" onClick={() => { close(); anchorRef.current?.focus({ preventScroll: true }); }}><X size={14} /></button>
      </div>
      <div className="table-popover-content">
        {menu === 'row' && <>
          {button('Select row', () => selectTableAxis(editor, 'row', ctx.top))}
          {button('Insert above', () => editor.chain().focus().addRowBefore().run())}
          {button('Insert below', () => editor.chain().focus().addRowAfter().run())}
          {button('Move up', () => moveRow(editor, -1), moveRow(editor, -1, false), moveReason)}
          {button('Move down', () => moveRow(editor, 1), moveRow(editor, 1, false), moveReason)}
          {button('Toggle header row', () => editor.chain().focus().toggleHeaderRow().run())}
          <hr />{button('Delete selected rows', () => editor.chain().focus().deleteRow().run(), ctx.bottom - ctx.top < ctx.map.height, 'Use Delete table to remove the whole table')}
        </>}
        {menu === 'column' && <>
          {button('Select column', () => selectTableAxis(editor, 'column', ctx.left))}
          {button('Insert left', () => changeColumns(editor, 'before'))}
          {button('Insert right', () => changeColumns(editor, 'after'))}
          {button('Move left', () => changeColumns(editor, 'left'), changeColumns(editor, 'left', false), moveReason)}
          {button('Move right', () => changeColumns(editor, 'right'), changeColumns(editor, 'right', false), moveReason)}
          {button('Toggle header column', () => editor.chain().focus().toggleHeaderColumn().run())}
          {button('Distribute columns evenly', () => sizeColumns(editor, geometry.width))}
          {button('Fit available width', () => sizeColumns(editor, geometry.available))}
          <hr />{button('Delete selected columns', () => changeColumns(editor, 'delete'), ctx.right - ctx.left < ctx.map.width, 'Use Delete table to remove the whole table')}
        </>}
        {menu === 'more' && <>
          {button('Merge cells', () => editor.chain().focus().mergeCells().run(), editor.can().mergeCells(), undefined, true, <Merge size={15} />)}
          {button('Split cell', () => editor.chain().focus().splitCell().run(), editor.can().splitCell(), undefined, true, <Split size={15} />)}
          <hr />
          <button type="button" className="table-action" onClick={() => setMenu('export')}><Download size={15} />Copy / export…</button>
          {button('Undo', () => editor.chain().focus().undo().run(), editor.can().undo(), undefined, false, <Undo2 size={15} />)}
          {button('Redo', () => editor.chain().focus().redo().run(), editor.can().redo(), undefined, false, <Redo2 size={15} />)}
          <button type="button" className="table-action" onClick={() => setMenu('help')}><CircleHelp size={15} />Table help</button>
          <hr />
          <button type="button" disabled={filtered} title={filtered ? 'Clear filters before deleting the table' : 'Delete table'} className="table-action table-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={15} />Delete table…</button>
          {confirmDelete && <div className="table-delete-confirm" role="alert"><span>Delete this entire table? You can undo this.</span>{button('Delete entire table', () => editor.chain().focus().deleteTable().run())}<button type="button" className="table-action" onClick={() => setConfirmDelete(false)}>Cancel</button></div>}
        </>}
        {(menu === 'filter' || menu === 'export' || menu === 'help') && <TableDataPanel key={`${ctx.table.attrs.tableId || ctx.pos}-${menu}`} editor={editor} mode={menu} />}
        {notice && <p role="status" className="table-feedback">{notice}</p>}
      </div>
    </div>}
    {geometry.rows.map(handle => <button data-table-controls={owner} type="button" key={`r${handle.index}`} className="table-axis-handle table-row-handle" style={{ top: handle.top, left: handle.left }} aria-label={`Select row ${handle.index + 1}`} title={`Row ${handle.index + 1} actions`} onMouseDown={event => event.preventDefault()} onClick={event => { selectTableAxis(editor, 'row', handle.index); anchorRef.current = event.currentTarget; keyboardOpen.current = event.detail === 0; setMenu('row'); }}><GripVertical size={14} /></button>)}
    {geometry.columns.map(handle => <button data-table-controls={owner} type="button" key={`c${handle.index}`} className="table-axis-handle table-column-handle" style={{ top: handle.top, left: handle.left }} aria-label={`Select column ${handle.index + 1}`} title={`Column ${handle.index + 1} actions`} onMouseDown={event => event.preventDefault()} onClick={event => { selectTableAxis(editor, 'column', handle.index); anchorRef.current = event.currentTarget; keyboardOpen.current = event.detail === 0; setMenu('column'); }}><GripHorizontal size={14} /></button>)}
  </>, geometry.host);
}
