# Table editing and data workflows

Sprint 4 implemented 2026-09-23; contextual menu refined the same day. Click inside a table for a compact floating toolbar: Row, Column, Filter, Expand and More. Filter opens column conditions; More → Copy / export opens row scope, TSV copy and CSV download. Expand uses browser fullscreen on the existing editor container.

## Contextual controls

In notes, the toolbar is outside document flow and uses a raised, opaque theme surface, border and shadow. It sits above the table's right edge where space permits, otherwise at its visible upper edge within the owning pane. It follows scrolling/resizing and hides when the table is offscreen or no longer selected. Narrow panes show icons with hover labels. Row/Column menus act on the clicked cell’s row/column (or current selected range). There are no repeated edge buttons in either view. Opening a menu preserves cell selection; Select row/Select column explicitly selects the whole axis when wanted. Menu headings show the affected row/column range.

Row/Column provide selection, insert/delete/move, header toggles and column sizing. More contains merge/split, copy/export, undo/redo, help and confirmed table deletion. Filter, copy/export and help are separate bounded popovers. Instructions are in Help/disclosures; action feedback stays in the current popover. Escape and outside clicks dismiss menus without losing editor selection. Fullscreen menus live inside the fullscreen element and ignore its former pane's clipping bounds.

## Filtering

- Conditions: contains text (case-insensitive), selected exact values, empty, nonempty. Columns combine with AND; checked values within one column combine with OR. No checked values means all values.
- Headers remain visible. Counts show matching body rows / total body rows; no results shows a message and Clear filters remains available.
- Filters are editor-session plugin state keyed by table ID and column ID. They never enter saved note JSON, workspace archives or individual note exports. Reload clears filters; hidden values survive.
- Filter values are searchable; the UI lists at most 200 matching distinct choices at a time. Search can reach values outside the initial list.
- Split vertically merged cells before filtering. Horizontal spans use their originating value for matching each covered column. Filtering/expanded view currently require top-level tables, not tables nested in cells or quotes.
- Structural edits, resizing and cutting cell ranges require clearing filters. A transaction guard rejects table removal, structural/width changes and edits that touch hidden rows. Broad formatting/undo that would change hidden cells is also rejected; clear filters to perform it. Undo of visible-cell edits remains available.
- Plain edits recompute the view. If an edited row stops matching, selection moves to another visible row when available. Tab and arrow movement at cell boundaries skip hidden rows; the final visible cell does not append rows while filtered.

## Spreadsheet paste and copy

Paste TSV from Excel/Sheets into a cell. Parsing supports quoted tabs, multiline values, escaped quotes, CRLF and ragged rows (padded with empty cells). A terminal clipboard newline does not add a spurious row. Paste is one undoable transaction, preserving source references and surviving column IDs.

Unfiltered paste grows a regular table to fit. Filtered paste uses visible rows only and must fit existing visible rows/columns. A selected rectangle requires matching dimensions, except a single pasted value can fill it. Tables containing merged cells must be split before a tabular paste. Validation failures leave the document unchanged and show a message. Plain single-cell text can still use normal editor paste.

Limits: 5 MiB clipboard text, 10,000 rows, 500 columns and 50,000 logical cells in the resulting table. This is value paste; spreadsheet formulas become text, not calculations. There is no formula engine or sorting feature.

Ctrl+C on a selected cell rectangle writes quoted TSV using only visible selected rows. Copy TSV in the export popover copies the whole table with the explicitly chosen All rows or Visible rows scope (including headers). Clipboard API failures suggest Ctrl+C or CSV instead. TSV preserves raw values, including formula-like strings; spreadsheet applications may interpret them on paste.

## CSV export

Download CSV uses the selected table's current editor document, including unsaved edits, and an explicit All / Visible row scope. This is a local text download, separate from persisted note-export operations. It does not require an API request or force a save. Existing resource APIs still expose all structured table data for agent debugging; no new table-specific endpoint is introduced.

UTF-8 CSV includes a BOM, CRLF row separators and proper quoting for delimiters, quotes and multiline cells. Cells beginning with optional whitespace/control characters followed by =, +, - or @ receive an apostrophe prefix to prevent normal spreadsheet formula interpretation. This deliberately changes those CSV values; raw TSV copy preserves them. Merged values appear only in their top-left cell; covered cells are empty. Formatting, cell spans and source-file metadata are not representable in CSV.

## Expanded editing

The browser Fullscreen API expands the existing BlockEditor container into a dedicated table workspace. A non-scrolling header shows the note title, table dimensions, live Saving/Saved/Save failed status, retry and Return to note. A grouped editing bar exposes structure, headers, merge/split, sizing, undo/redo, filters and copy/export. Filters open in a collapsible panel beneath the bar and remain open while selecting/editing cells. The same EditorContent scrolls in a separate canvas below the chrome; row/column actions live in the editing bar, with no repeated edge buttons. Action groups wrap at smaller sizes, with bounded chrome/filter height. Decorations hide other top-level note blocks temporarily; no second editor or document copy is created. The same selection, undo history, save callbacks and save coordinator remain active. Exit expanded view or browser Escape returns to the note. Selection stays inside the expanded table; deleting it or replacing the document clears expanded state and exits fullscreen. Unsupported/denied fullscreen shows an actionable message. App note/history shortcuts are suspended during fullscreen.

Native Tab/Shift+Tab and arrow behavior remains for ordinary tables; expanded view keeps movement within the table and Tab at the last unfiltered cell can add a row. Fullscreen menu ownership/placement was checked in the disposable browser fixture. Save status/retry now also appears in the expanded header, fed by the existing note save coordinator. Entering or returning does not rewrite column widths; Fit width is an explicit undoable action.

## Implementation and verification

- `TableWorkspace.ts`: session filters, decorations, navigation/clipboard handlers, transaction guards, bounded TSV parsing and CSV/TSV serialization.
- `TableDataPanel.tsx`: filter/value UI, explicit copy/export scope, download feedback and help disclosures.
- `TableControls.tsx`: in-note floating toolbar, expanded header/action bar/filter panel, toolbar-anchored structural popovers, Escape/focus and same-container fullscreen lifecycle.
- `tableOverlayGeometry.ts`: pane/viewport intersections, table-local placement and fullscreen portal ownership.
- `BlockEditor.tsx`: installs the plugin, routes spreadsheet paste before Markdown, clears view state before external document replacement.

Five focused cases pass: the reported shortcut collision/help/validation, filter serialization and hidden-data guards, filtered paste/undo/rejection, growing unfiltered paste/identity/quotes, and CSV safety/row scope/expanded-state nonmutation. For the menu refinement, four focused tests cover geometry, selection, dismissal and fullscreen clipping/ownership; the existing positioning regression also passes. Frontend production build and focused lint pass. A disposable browser fixture verified both themes, a table after several paragraphs, 320px pane, scrolling and fullscreen menus. This was not a full Dashboard/multi-pane or OS clipboard check. No API smoke or Docker verification ran.

Workspace evolution Sprint 2 validation: six focused table-control tests pass, including live save state/retry, docked filter persistence, same-document entry/edit/return and undo. Three editor regressions pass; frontend production build and targeted lint pass. A disposable real BlockEditor fixture visually confirmed the light-theme fullscreen bar does not overlap the table. Dark/small-window layout and full Dashboard integration remain manually unverified for this iteration. No API/Docker checks.

Workspace evolution Sprint 4: removed row/column edge buttons from both views. Two added real-editor regressions verify menus preserve the clicked cell and select the correct row/column in in-note and fullscreen views. All eight table-control cases pass; frontend build and targeted lint pass. No new browser visual check.
