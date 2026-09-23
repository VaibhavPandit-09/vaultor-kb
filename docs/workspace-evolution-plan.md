# Workspace evolution plan

Status: Sprint 2 in progress; Sprint 1 complete. Implement exactly one sprint per authorized request; hand off and discuss before starting the next. Preserve unrelated work and existing workspace data.

## Sprint 1 — Close empty notes reliably
- [x] Reproduce editor consumption of the close-note shortcut.
- [x] Fix shortcut ownership, preserving custom bindings, ordinary Backspace, dialog/fullscreen restrictions and save-before-close.
- [x] Focused regression checks for empty/populated/emptied notes, pane ownership and failed saves.
- [x] Update the living guide and record actual results.

## Sprint 2 — Dedicated expanded-table workspace
- [ ] Fixed note/table header, save status/retry and Return to note.
- [ ] Grouped editing bar; scrolling table canvas without controls covering headers.
- [ ] Collapsible filter panel; retain mouse-first row/column handles.
- [ ] Same editor, document, undo history and saves; preserve column widths and offer explicit Fit width.
- [ ] In-note floating controls remain separate. Check themes and smaller windows.

## Sprint 3 — Scalable Library and sidebar
- [ ] Sidebar quick navigation: Search, Library, Recent, Favorites, bounded favorite items, create/import and utilities.
- [ ] Library view preserves open notes/drafts; virtualized, paginated summaries, title search, type filters, sorting and error/retry states.
- [ ] Server-side queries with stable pagination; bodies fetched on opening; remove eager loading dependencies in palette/pickers.
- [ ] Central resource-type presentation/actions, initially Notes and Files.

## Sprint 4 — Collections and tag management
Proposed direction to discuss before authorization: flat collections plus tags; a resource can belong to multiple collections. No folders, nesting or saved views in this release.
- [ ] Collection CRUD/favorites; deleting a collection never deletes its resources.
- [ ] Searchable tag navigation/management; Library collection/type/all-selected-tags filters.
- [ ] Bulk membership and tag changes; no bulk deletion.
- [ ] Collection/membership APIs and persisted favorites; workspace transfer preserves/remaps organization transactionally.

## Sprint 5 — Note content search
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
