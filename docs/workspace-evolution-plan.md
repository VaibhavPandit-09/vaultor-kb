# Workspace evolution plan

Status: Sprints 1–4 and U1 complete. U2 and U3 require their own implementation calls; original Sprint 5 is absorbed into U3. Implement exactly one sprint per authorized request; hand off and discuss before starting the next. Preserve unrelated work and existing workspace data.

## Sprint 1 — Close empty notes reliably
- [x] Reproduce editor consumption of the close-note shortcut.
- [x] Fix shortcut ownership, preserving custom bindings, ordinary Backspace, dialog/fullscreen restrictions and save-before-close.
- [x] Focused regression checks for empty/populated/emptied notes, pane ownership and failed saves.
- [x] Update the living guide and record actual results.

## Sprint 2 — Dedicated expanded-table workspace
- [x] Fixed note/table header, save status/retry and Return to note.
- [x] Grouped editing bar; scrolling table canvas without controls covering headers.
- [x] Collapsible filter panel; retain mouse-first row/column handles.
- [x] Same editor, document, undo history and saves; preserve column widths and offer explicit Fit width.
- [x] In-note floating controls remain separate. Responsive wrapping/theme tokens implemented; light-theme visual check completed. Dark/small-window manual checks deferred per minimal-browser preference.

## Sprint 3 — Scalable Library and sidebar
- [x] Sidebar quick navigation: Search, Library, Recent, Favorites, bounded favorite items, create/import and utilities.
- [x] Library view preserves open notes/drafts; virtualized, paginated summaries, title search, type filters, sorting and error/retry states.
- [x] Server-side queries with stable pagination; bodies fetched on opening; remove eager loading dependencies in palette/pickers.
- [x] Central resource-type presentation/actions, initially Notes and Files.

## Sprint 4 — Collections and tag management
Authorized direction: flat collections plus tags; a resource can belong to multiple collections. No folders, nesting or saved views in this release.
- [x] Collection CRUD/favorites; deleting a collection never deletes its resources.
- [x] Searchable tag navigation/management; Library collection/type/all-selected-tags filters.
- [x] Bulk membership and tag changes; no bulk deletion.
- [x] Collection/membership APIs and persisted favorites; workspace transfer preserves/remaps organization transactionally.

## Original Sprint 5 — Note content search (now included in U3)
- [ ] Rebuildable SQLite full-text index from saved structured note content, including tables/code.
- [ ] Title-weighted search, safe snippets and collection/tag/type filters; shared Library/quick-search service.
- [ ] Synchronize edits/deletes/import/replace; diagnostic indexing/rebuild status; distinguish unsaved drafts.

## Sprint 6 — Supported file search and scale verification
- [ ] Bounded background extraction with persisted status/retry/stale-result protection for text/Markdown/source/config, CSV/TSV, text PDFs and DOCX.
- [ ] Unsupported formats stay searchable by metadata; OCR, legacy DOC and other Office formats deferred.
- [ ] Disposable thousands-of-resources/hundreds-of-tags verification of loading, rendering, search, organization and returning to open notes.

## Validation and handoff policy
Compile affected code and run focused checks for meaningful risks. Use targeted visual checks for layout changes. No routine full suites, API smoke runs or Docker rebuilds. Record deployment separately from implementation. Update docs/CODEBASE.md and supporting docs each sprint. Archive this tracker under docs/history only when the agreed scope is complete.

## Sprint 1 findings and results
Completed 2026-09-23. A real Tiptap/ProseMirror regression reproduced the old bubbling listener losing the shortcut only at the empty document boundary. A capture-phase listener now reserves only the configured close action before the editor fallback. The existing Dashboard save barrier remains authoritative. Custom bindings are honored; ordinary Backspace is unchanged; dialogs/modal overlays, fullscreen and IME composition do not close notes. Repeats and additional invocations during an in-flight close are suppressed.

Changed: frontend/src/lib/closeNoteShortcut.ts and Dashboard registration; focused regression file closeNoteShortcut.test.ts. No backend, schema or visual architecture changes.

Validation: five focused tests pass, covering original reproduction, empty/populated/emptied content and sibling preservation, custom bindings/ordinary Backspace, modal/fullscreen/composition/repeat restrictions, and delayed/failed save plus retry. npx tsc -b and targeted ESLint pass. No broad suites, browser session, API smoke or Docker rebuild. The running Docker container is unchanged; this fix is in source only.

Remaining: actual native browser shortcut interaction is not manually verified; the regression uses the real editor in jsdom. Existing picker-pointer and DOCX-pagination limitations are unchanged. Next discussion: Sprint 2 dedicated expanded-table layout, including save status and a fixed editing bar. Do not start it automatically.

## Sprint 2 handoff — 2026-09-23

Implemented a dedicated expanded-table header with note title, dimensions, live save state/retry and Return to note; grouped editing bar; docked collapsible filters; and a scrolling EditorContent canvas. In-note floating controls are unchanged. Controls share the same commands, document, save coordinator and undo history. Entry preserves stored widths; explicit Fit width remains undoable. BlockEditor props and memo comparison carry current title/save state into fullscreen. No backend/API/schema changes.

Validation: six table-control checks and three editor regression cases pass; frontend production build and targeted ESLint pass. Lifecycle test verifies entry preserves JSON, expanded edits survive returning, and undo restores the prior document. Disposable real-editor light-theme screenshot confirms controls sit above the table. Browser work was curtailed per the user preference; dark/small-window visual checks and full Dashboard integration remain unverified. Temporary fixture removed. No API smoke or Docker rebuild; running container unchanged.

Stop here. Discuss/authorize Sprint 3 (scalable Library/sidebar) separately. Collections remain a proposal for Sprint 4.

## Sprint 3 handoff — 2026-09-23

Library/sidebar implemented; authoritative behavior and limitations are in [LIBRARY.md](LIBRARY.md). Server queries project metadata only; 100-row Library pages are virtualized; quick access is bounded at 12 per group. Search/pickers no longer rely on loading the whole workspace. Favorites persist locally in the database; archive organization support remains Sprint 4. Notes stay mounted when Library is shown.

Validation: frontend production build, targeted ESLint, three Library/hook tests, and one Spring/SQLite integration test with 205 disposable resources pass. No browser, live API smoke or Docker rebuild. Full Dashboard/theme/narrow-screen manual review is unperformed; broad scale coverage remains Sprint 6. Existing build warnings concern bundle size and Browserslist data. No blockers to implementation.

User decision pending: table edge handles remain unchanged; recommended hover/selection visibility preserves direct selection with less clutter. Do not start Sprint 4 automatically; discuss collections/membership and transfer first.

## Sprint 4 handoff — 2026-09-23

Implemented the authorized flat, multi-membership collection model. Library has searchable collection/tag management, membership counts, rename/color/favorite controls, non-destructive group deletion and page-scoped bulk add/remove. Sidebar shows bounded favorite collections. The metadata query API combines collection/type/all-selected-tag filters. Workspace archive version 2 preserves resource/collection favorites and membership; merge unifies collection names and remaps new resource IDs, replace restores organization, and failed commits roll back together.

Also resolved the table discussion: removed all repeated row/column edge buttons. Toolbar Row/Column operations already target the clicked cell/current range; opening menus preserves selection. Explicit Select row/Select column remains available and menu headings show affected indices. This applies in notes and expanded view.

Validation: one disposable Spring/SQLite organization/transfer integration test passes, including merge/replace, invalid membership archive rejection and injected late-commit rollback. Fifteen frontend cases pass (4 Library, 3 organization manager, 8 table controls). Frontend production build and targeted ESLint pass. No live API smoke, browser or Docker checks. Layout/native interaction is not manually verified; running deployment unchanged. No implementation blockers.

Authoritative behavior: [LIBRARY.md](LIBRARY.md), [API.md](API.md), [TABLES.md](TABLES.md). Remaining scope: note full-text search in Sprint 5, file search/broader scale checks in Sprint 6. Existing sidebar tag chips/pickers still fetch the tag list. Stop after this sprint; do not begin Sprint 5 automatically.

## Usability update — authorized sequence

Implement exactly one U sprint per call, then hand off. Preserve the visual style, saving and multi-collection model. Approved decisions: favorites become pinned shortcuts; Ctrl+K becomes search-first; saved-note full-text search is included in U3. File-content search remains the later Sprint 6.

### Sprint U1 — Stable navigation
- [x] Scope opened/metadata/organization/pins/workspace change notifications.
- [x] Keep cached rows and sidebar scroll during refresh; local retry instead of global recency errors.
- [x] Coalesce rapid activation recency updates; ignore stale reads; leave unrelated groups alone.
- [x] Mark-open writes only lastOpenedAt, never modification time or documents.
- [x] Focused validation and living-doc update.

### Sprint U2 — Organization where resources are used
- [ ] Membership chips on notes/previews (two plus overflow), shared searchable picker with immediate toggles and create-and-add.
- [ ] Atomic, retry-safe collection creation with initial membership; create/import resources into the current collection.
- [ ] Collections destination/header actions; reuse picker for Library rows and bulk operations; retain non-destructive deletion.
- [ ] Unified Pinned shortcuts, direct pin/unpin throughout, stable alphabetical order, 12 shortcuts plus searchable View all.
- [ ] Preserve current favorites; add batched membership summaries and paginated mixed pin API; preserve archive behavior.

### Sprint U3 — Search-first Ctrl+K and saved-note full-text search
- [ ] Deduplicated Open/Pinned/Recent empty state, grouped resource/collection results and explicit previews/actions.
- [ ] > or Commands mode; clear target and step labels, normal Tab, stable selection IDs, accessible listbox and Escape/focus.
- [ ] Retain input/errors through failed actions; prevent duplicate execution and close only after success/handoff.
- [ ] Rebuildable SQLite FTS5 using structured visible note text, title weighting, literal prefix terms, safe snippets and shared Library/palette filters.
- [ ] Transactional index updates across CRUD/import/replace links/merge/replace; bounded coordinated rebuild, status/rebuild diagnostics.
- [ ] Saved-content-only search label while drafts are pending; existing drafts survive opening results.

Validation remains minimal: compilation and focused tests, targeted visual checks only when needed, disposable mutation data, no routine Docker/API smoke. Keep guide/API/supporting docs synchronized and record actual results.

### Sprint U1 handoff — 2026-09-23

Implemented scoped notifications, a coalescing/serialized recency recorder and retained same-query results. Rapid navigation changes highlight immediately, records the final activation after 300 ms and reconciles only Recent after another 150 ms following the settled write. Favorite, tag and collection queries are not touched by note activation. Background failures retain usable rows with local retry and diagnostics; older responses cannot overwrite the newer view. The backend marks lastOpenedAt without changing modification time/content.

Checks: production frontend build and targeted ESLint pass; 12 relevant frontend cases pass (5 new navigation/diagnostics plus 7 Library/organization cases). One disposable backend integration test passes with timestamp/content preservation and browsing checks. No browser, live API smoke or Docker work. Existing bundle-size/Browserslist build warnings remain. No implementation blockers; manual/native visual verification remains outstanding, and the running container is unchanged.

Stop here. U2 is next: resource-local membership controls, easier collection creation and unified pins. U3 includes Ctrl+K and the former Sprint 5 full-text scope; file-content search remains later work.
