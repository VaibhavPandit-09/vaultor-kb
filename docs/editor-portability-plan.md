# Editor imports, tables and individual exports

Status: Sprint 1 implemented; native pointer verification remains outstanding. Sprints 2–4 are implemented; remaining manual verification limits are recorded below. DOCX visual pagination remains unverified. Created 2026-09-22.

Sprint 1 is implemented as recorded in the handoff below; Sprint 2 was subsequently authorized and implemented; Sprint 3 was subsequently authorized and implemented; Sprint 4 was subsequently authorized and implemented. Read [CODEBASE.md](CODEBASE.md) for current implementation. This plan incorporates the user's approval of text-import choices, individual exports and table improvements, plus the corrected picker reproduction and request for filtering only among spreadsheet features.

## Execution contract

- Implement **one sprint per explicitly authorized agentic call**. Approval of this plan is not authorization to begin implementation.
- After each sprint, stop, report changes and actual validation, update this tracker and CODEBASE.md, and discuss the next sprint with the user. Do not start the next sprint automatically.
- If a sprint cannot be finished in one call, record remaining work honestly. Resume that sprint when requested rather than advancing or silently reducing acceptance criteria.
- Keep routine checks minimal: compilation and targeted checks for changed failure-prone behavior. Keep APIs ready and use them for specific debugging or explicit requests; no routine API smoke/full-suite reruns. Use browser/native checks only where necessary for a visual or native interaction fact, or when requested. Do not run broad browser exploration.
- Preserve the workspace design and data. Use disposable storage for mutation tests. Shared fixes must cover every caller, not just one upload extension.
- Planning-only changes: this document, its index link and a guide maintenance entry. No runtime changes, deployments or application tests in the planning call.

## Agreed scope and boundaries

1. Fix residual slash text and investigate the keyboard-specific native picker pointer failure across Markdown, CSV and other upload entry points.
2. Offer explicit file-versus-note choices when importing text files from the sidebar.
3. Improve existing Tiptap table editing, including filtering.
4. Export individual notes as Markdown, PDF and DOCX. Export individual tables initially as CSV.

No formulas or spreadsheet-style sorting are required; they are excluded rather than deferred deliverables. Table XLSX/PDF and Google Docs publishing remain future work outside these four sprints. Keep workspace ZIP transfer separate from importing ordinary files.

## Sprint 1 — Shared imports and picker reliability

Status: implemented and automatically validated; native pointer visibility not verified. Recommended reasoning: GPT-6 Astra Medium.

### Reproduction and diagnosis

User-confirmed behavior: type `/uploa`; CSV and Markdown suggestions appear. Selecting either using the keyboard opens the native file dialog with an invisible pointer. Selecting by mouse does not. Previous changes did not resolve the issue. Markdown insertion also leaves part of the slash command in the note.

Treat the keyboard/mouse distinction as the primary reproduction. Compare keydown/keyup, default handling, command execution, current selection/range, menu dismissal and picker focus sequencing. Check a minimal native file input if needed to distinguish application behavior from browser/OS pointer behavior. Do not assume another focus change proves a fix. Do not change OS settings or synthesize pointer movement as a workaround.

### Planned behavior

- Capture the originating note/editor and the **current complete slash range**, not a stale rendered range or whichever pane becomes active later.
- Share picker lifecycle and command execution across Markdown/CSV; audit sidebar upload and inline resource-link upload callers too.
- Close the menu before opening the picker; keep native user-activation requirements intact. No delayed background refocus while the dialog is open.
- Replace the full command with imported content only after parsing succeeds. Cancellation/failure leaves the original document intact. Map the insertion anchor through intervening transactions or reject safely if the originating editor/anchor no longer exists.
- Successful insertion is one undoable document operation. Prevent duplicate execution from a keyboard event and subsequent click.
- Show per-file pending/error/retry feedback; a retry must not duplicate an already uploaded resource.

### Sidebar choices

| Type | Default | Alternative |
| --- | --- | --- |
| .md / .markdown | Formatted note | Original file resource |
| .txt | Plain-text note | Original file resource |
| Source code, JSON, YAML, logs | Original file resource | Note containing a code block |
| .csv / .tsv | Original file resource | Note containing a table |
| PDF, images, Office documents | Original file resource | No conversion in this update |

Use one review dialog for multi-file imports, per-file choices, and Apply to similar files. Title notes from filenames, create new IDs, never overwrite by title. Distinguish Import files, editor insertion, and Import workspace ZIP. Validate text size/encoding before mutation and explain unsupported files. Relative Markdown assets cannot be recovered from a lone file automatically: show missing-asset warnings, preserve useful link text, and do not silently discard references or fetch remote/private paths.

Acceptance:

- [x] Current full-command range replacement is covered by component/editor tests for `/`, `/uploa` and full commands; keyboard and mouse use the same target/import flow.
- [x] Cancellation, invalid input, retries, stale targets, duplicate picker activation, undo and multi-pane upload routing are covered by tests.
- [x] Sidebar choices and per-file retries are component-tested; API tests verify structured read-back, bytes, identity, conflicts and backlinks.
- [x] Shared key-release sequencing is tested and all ordinary upload callers audited. Native comparison is platform-limited; see the outstanding verification below.

## Sprint 2 — Table editing foundations

Status: implemented on 2026-09-22 following explicit authorization. Recommended reasoning: Medium.

Deliver a selection-aware contextual toolbar, row/column selection handles, insert above/below/left/right, delete/move rows and columns, explicit Delete table, header-row/header-column toggles, merge/split cells, visible selection/resize handles, drag sizing, distribute widths and fit available width. Make interaction mouse-first; retain normal Tab/Shift+Tab, Enter, arrows and accessible focusable buttons without an elaborate keyboard-navigation system. Preserve selection and use normal editor undo/redo. Disable invalid commands with an explanation, especially moves/merges that would break spanning cells. Confirm whole-table deletion; undo must restore it.

Keep table source references and stable table identification suitable for later filtering/export. Define how column identity survives insert/delete/move; avoid treating a displayed column index as a permanent identity. Do not introduce a separate spreadsheet data store.

Acceptance:

- [x] Commands use the selected table/pane; axis handles select explicitly. Pane isolation checked; visual/focus polish remains manually unverified.
- [x] Focused structural checks cover spans, headers, movement boundaries and undo/redo.
- [x] Structured JSON reload and source-reference preservation checked locally. Existing transfer retains JSON attributes; no repeat API round trip performed.
- [x] Minimal verification: compilation, targeted lint and focused transaction/shortcut tests.
- [ ] Manual toolbar/resize usability in both themes and narrow layouts remains outstanding.

## Sprint 3 — Individual note export

Status: implemented 2026-09-23; DOCX visual pagination and dialog usability remain unverified. Recommended reasoning: Medium.

Add Export to each note's title-bar menu. Deliver Markdown first, then PDF and DOCX within this sprint; no legacy .doc support. Flush pending saves before export; failed saving retains drafts and offers Retry. Use the shared exporter registry and structured-document traversal, with APIs discoverable in OpenAPI/export-formats and operation/request diagnostics. Snapshot the selected note consistently and prevent later edits from changing an in-progress export.

Cover headings, lists/tasks, marks, Unicode, code, tables (including spans and wide tables), assets and internal/missing resource links. Markdown offers a plain .md or an asset ZIP when needed. Define format fidelity explicitly: use a documented fallback for constructs Markdown cannot represent, and report warnings rather than silently dropping content. Internal links should retain labels and a deliberate local-workspace link/reference policy; do not imply exported files are fully standalone when linked resources are absent.

PDF and DOCX need appropriate pagination, table widths, repeatable headers where supported and readable code. Select maintained rendering libraries after evaluating representative fixtures; do not scrape live editor DOM. Do not automatically download remote assets during export.

Acceptance:

- [x] Markdown, asset ZIP, PDF and DOCX render with download metadata; selected-note saves flush first and failures are retryable.
- [x] Focused service checks cover discovery, selection validation, immutable snapshot behavior and metadata. UI check covers failed-save retry. No HTTP/API smoke was run, per the reduced-testing preference.
- [x] Representative Markdown/ZIP/PDF/DOCX content and structural checks pass; PDF rendered and visually reviewed.
- [ ] DOCX visual pagination: bundled LibreOffice is unavailable; structure is checked but layout is not proven.
- [x] Existing workspace ZIP renderer remains registered and unchanged; only implemented note formats are exposed.

## Sprint 4 — Table entry, filtering and CSV export

Status: implemented 2026-09-23 following explicit authorization. Manual fullscreen/visual checks remain outstanding.

Deliver spreadsheet paste into cells, rectangular TSV copy, Tab/Shift+Tab navigation, undo/redo, an expanded table-editing view, and selected-table CSV export.

Filtering is included; formulas and sorting are excluded. Implemented behavior (see TABLES.md for precise limits):

- Per-column text contains, selected values, empty/nonempty; conditions across columns combine with AND and selected values within a column with OR.
- Filtering hides rows in the current table view without deleting/reordering stored rows. Display visible/total counts, active filters and Clear filters. Keep headers visible and show a clear no-results state.
- Keep filters as session view state initially, outside saved note content. Content edits still save normally. Hidden rows must survive edits, reload and workspace round trips.
- Disable ambiguous structural edits while filtered, with a Clear filters explanation. For vertically merged body cells, disable filtering with an explanation until unmerged; do not partially hide a spanning cell.
- Copy/export must state whether it uses visible rows or all rows. Default full-note export to all rows; table CSV offers an explicit all/visible choice. CSV cannot preserve styles/merged-cell structure: explain flattening and place merged values in the top-left cell.
- Handle multiline/quoted cells and ragged pasted ranges predictably. Avoid partial mutations when a paste cannot fit or parse. Define keyboard navigation over visible cells and behavior at the final row.

Acceptance:

- [x] Atomic TSV paste/copy handles quoted/multiline values, growth, filtered visible targets and undo.
- [x] Session filters preserve JSON and hidden rows; transaction guards reject hidden/structural changes and merged-cell restrictions are explicit.
- [x] Fullscreen expands the original editor container and hides other blocks with decorations; no second document/editor.
- [ ] Actual browser fullscreen and both-theme/narrow-layout usability remain manually unverified.
- [x] CSV uses explicit all/visible scope, quoting/BOM/CRLF and apostrophe protection; TSV keeps original values.
- [x] Five focused editor/shortcut cases pass; build and targeted lint used. API smoke omitted per user preference; no new API endpoints.

## Reasoning-level recommendation

The official GPT-6 Astra API names the lower effort `low`, not `light`, and also supports `medium`: [official model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra). Desktop wording can differ; no setting is changed by this plan.

Task-specific judgment: retain Medium for each complete sprint because they involve unresolved native events, editor transactions, document rendering, or filtered table selection. Low is appropriate for bounded copy/icon/style changes, documentation, adding a known regression fixture or a simple CSV serializer after its contract is settled. It is not necessary to increase above Medium by default. Reasoning level does not replace acceptance tests or guarantee total token savings; debugging retries can offset savings.

## Tracking and handoff

At each sprint completion append: files/behavior changed, decisions, actual commands/results, native/visual evidence if required, unresolved issues, and proposed next-sprint scope. Keep future checkboxes unchecked. Archive this plan only after the scoped work is complete; retain manual limitations explicitly.

Planning validation (before implementation): checked against the guide and user decisions; only documentation changed at that stage. Sprint 1 was subsequently explicitly authorized.

### Sprint 1 handoff — 2026-09-22

Implemented shared connected file inputs with key-release sequencing, fresh plugin ranges, mapped editor-owned insertion and review/cancel without document mutation. Sidebar imports offer note/original-file choices, with strict bounded conversion, missing-asset warnings and per-file retry. Audited Markdown, CSV, sidebar/palette and inline-resource callers. Inline-resource keyboard routing is keyed by editor view. Added the retry-safe multipart creation API and documented it in OpenAPI/API.md.

Validation results:

- Frontend build and lint pass. Nine test files / 24 tests pass.
- Backend Maven: eight tests pass, zero failures/errors.
- Docker Compose build passes. Disposable project `vaultor-sprint1-check` uses its own named volume at port 18080.
- Existing workspace API smoke: 18 checks pass, request ID `smoke-1790087982551`.
- New file-import API smoke: 10 checks pass, request ID `file-import-1790087984910`. Covers multipart note/binary creation, repeated requests, changed-payload conflicts, malformed documents, duplicate-title isolation, binary equality, backlinks and integrity.
- No broad browser debugging was performed. Existing large-bundle/Browserslist build warnings remain non-blocking.
- Normal Compose container updated at port 8080 using the existing `vaultor-kb_vaultor_data` volume. No smoke mutations or replacement import ran against that volume; health and integrity were checked read-only after deployment.

Native limitation: the available computer-use surface has browser control but native app controls are disabled. No browser screenshot was substituted for a native-dialog check. Keyboard timing is tested; Windows/Vivaldi pointer visibility is not established. After updating, compare `/uploa` followed by keyboard selection versus mouse selection for both CSV and Markdown. Do not describe this native symptom as confirmed fixed without that observation.

Decisions: review precedes slash insertion so conversion warnings are visible; Cancel preserves the original command. Sidebar CSV-to-note creates no duplicate binary; slash CSV retains its source resource. Conversion limits: 5 MiB text, 10,000 rows, 500 columns, 50,000 cells. UTF-8 and BOM-marked UTF-16 are supported. Larger/unsupported text can remain original resources. Fingerprints are internal, omitted from exports, and prevent overwriting an occupied ID after restore.

Sprint 2 was explicitly authorized after this handoff; the native picker limitation remains open.


### Sprint 2 handoff — 2026-09-22

Implemented selection-based mouse-first controls, row/column handles, insert/delete/move, header toggles, merge/split, sizing and confirmed whole-table deletion. Replaced the hover-target mismatch. Enter retains paragraph editing; Tab/Shift+Tab and arrows remain native Tiptap. Moves across merged cells and whole-table axis deletion are guarded. Width minimum is 80px per column.

New table/column IDs persist in document attributes; column structure and ID changes share a transaction. Source references remain unchanged. Ctrl+Alt+PageDown/PageUp switch notes (Cmd+Option on Mac); Ctrl+Shift+Arrow was avoided because it selects words. Exact old default overrides migrate; other custom bindings remain.

Validation: five focused table/shortcut cases passed, covering identity/content movement, insertion/deletion, pane isolation, source metadata, JSON reload, undo/redo, spans/headers, boundaries and shortcut migration. Backend compiles with tests skipped. Frontend production build and targeted ESLint pass; three existing editor regressions also pass (eight focused cases total). No API smoke, backend suite or browser automation. Native picker behavior, actual toolbar placement/resizing and both-theme/narrow-pane appearance remain manually unverified.

Deployment: normal Docker Compose image rebuilt successfully and container recreated at 127.0.0.1:8080 with the existing named data volume. Container reports running; no API smoke or disposable verification deployment was performed.

Stop after Sprint 2. Discuss before Sprint 3 (individual Markdown/PDF/DOCX export). Filtering/expanded table view/TSV entry/CSV export stay in Sprint 4; formulas and sorting remain excluded.


### Sprint 3 handoff — 2026-09-23

Implemented individual export through the title-bar Export icon, save barrier, discovery, progress, conversion warnings, retry and downloadable Markdown/asset ZIP/PDF/DOCX. Snapshot content/title and local binaries before returning the operation; render on the existing worker independently of later edits. Extended operation metadata and OpenAPI; added POI/OpenHTMLtoPDF and licensed Noto Sans fonts. Format fidelity, dependencies and limits are in [NOTE-EXPORTS.md](NOTE-EXPORTS.md).

Changed default note switching to Alt+Left/Right, migrating both earlier defaults while keeping other custom bindings. Non-Mac history now uses Ctrl+Alt+Left/Right; Mac history remains Cmd+[ / Cmd+]. Shortcut capture accepts Alt bindings.

Validation: frontend production build/targeted lint and six focused cases pass. Renderer fixture covers all four output formats; PDF PNG inspected and DOCX XML/image/header/span structure checked. Focused export service check passes after fixing a reproduced SQLite contention issue between note saves and operation progress writes. Brief progress writes now use the workspace gate; bounded status-write retries handle transient SQLITE_BUSY. No broad API smoke or browser automation ran.

Outstanding: bundled LibreOffice is absent, so DOCX visual pagination is unverified; the export dialog also has no browser visual verification. PDF unsupported glyphs use explicit codepoint labels; Word lists use editable text markers with warnings. Native picker pointer limitation remains from Sprint 1.

Deployment: Docker Compose build passed; normal container recreated at 127.0.0.1:8080 with the existing data volume and reports running. No API smoke mutations were run against the user workspace.

Stop after Sprint 3. Discuss before authorizing Sprint 4 (table filtering, expanded view, tabular paste/copy and CSV export).


### Sprint 4 handoff — 2026-09-23

Implemented [table workflows](TABLES.md): per-column session filters, visible counts/no-results, hidden-row transaction protection, atomic TSV paste and rectangular copy, explicit all/visible CSV export, and same-editor fullscreen expansion. No formulas or sorting. CSV is generated locally from the current editor document (including unsaved changes); persisted resource APIs retain all structured data.

Fixed the screenshot's shortcut collision: migration now covers stored Mod+Alt+Arrow, not just the older Mod+Arrow/PageUp/PageDown defaults. Alt+Arrow switches notes, history remains Ctrl+Alt+Arrow on Windows/Cmd+brackets on Mac. Help, dispatch and reserved-key validation share one history mapping; duplicate Navigation groups/React keys were removed.

Validation: five focused cases passed; frontend build/targeted lint used. No broad API smoke or browser automation. Manual fullscreen/clipboard and visual checks remain outstanding alongside earlier native-picker and DOCX-pagination limits. Keep this tracker available until those remaining checks are resolved; no next sprint is started automatically.

Sprint 4 deployment: final Docker Compose build passed (frontend TypeScript/Vite and backend packaging), and the normal container was recreated at 127.0.0.1:8080 using the existing data volume. Container reports running. No API smoke mutations were performed.


### Sprint 4 table-menu refinement — 2026-09-23

Implemented the approved compact automatic toolbar in a table-local portal; Row/Column handle popovers, separate Filter and Copy/export panels, More/help/deletion and compact local feedback. Opaque semantic surfaces and stronger borders/shadows distinguish controls from note content. Pane clipping, scrolling/resizing, narrow icon labels and fullscreen ownership preserve the same editor and data behavior. No API/schema changes.

Validation: frontend production build and targeted ESLint pass; four focused table-menu tests plus the existing shared-positioning regression pass. A disposable editor fixture (no API/storage) was inspected in light/dark themes, at 320px pane width, with the table below paragraphs, during pane scrolling, and in fullscreen. This exposed and fixed clipping against the old pane in fullscreen. Temporary fixture removed afterward. No API smoke, Docker rebuild or Docker verification performed; running container is unchanged. Full Dashboard/multi-pane integration and native clipboard remain unverified. Existing native-picker and DOCX-pagination limitations remain. No next sprint was started.
