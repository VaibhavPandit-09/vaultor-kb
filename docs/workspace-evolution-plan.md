# Workspace evolution plan

Status: Sprints 1–4 and U1–U3 complete. Original Sprint 5 was delivered within U3; file-content search and broader scale work remain a separate future sprint. Implement exactly one sprint per authorized request; hand off and discuss before starting the next. Preserve unrelated work and existing workspace data.

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
- [x] Membership chips on notes/previews (two plus overflow), shared searchable picker with immediate toggles and create-and-add.
- [x] Atomic, retry-safe collection creation with initial membership; create/import resources into the current collection.
- [x] Collections destination/header actions; reuse picker for Library rows and bulk operations; retain non-destructive deletion.
- [x] Unified Pinned shortcuts, direct pin/unpin throughout, stable alphabetical order, 12 shortcuts plus searchable View all.
- [x] Preserve current favorites; add batched membership summaries and paginated mixed pin API; preserve archive behavior.

### Sprint U3 — Search-first Ctrl+K and saved-note full-text search
- [x] Deduplicated Open/Pinned/Recent empty state, grouped resource/collection results and explicit previews/actions.
- [x] > or Commands mode; clear target and step labels, normal Tab, stable selection IDs, accessible listbox and Escape/focus.
- [x] Retain input/errors through failed actions; prevent duplicate execution and close only after success/handoff.
- [x] Rebuildable SQLite FTS5 using structured visible note text, title weighting, literal prefix terms, safe snippets and shared Library/palette filters.
- [x] Transactional index updates across CRUD/import/replace links/merge/replace; bounded coordinated rebuild, status/rebuild diagnostics.
- [x] Saved-content-only search label while drafts are pending; existing drafts survive opening results.

Validation remains minimal: compilation and focused tests, targeted visual checks only when needed, disposable mutation data, no routine Docker/API smoke. Keep guide/API/supporting docs synchronized and record actual results.

### Sprint U1 handoff — 2026-09-23

Implemented scoped notifications, a coalescing/serialized recency recorder and retained same-query results. Rapid navigation changes highlight immediately, records the final activation after 300 ms and reconciles only Recent after another 150 ms following the settled write. Favorite, tag and collection queries are not touched by note activation. Background failures retain usable rows with local retry and diagnostics; older responses cannot overwrite the newer view. The backend marks lastOpenedAt without changing modification time/content.

Checks: production frontend build and targeted ESLint pass; 12 relevant frontend cases pass (5 new navigation/diagnostics plus 7 Library/organization cases). One disposable backend integration test passes with timestamp/content preservation and browsing checks. No browser, live API smoke or Docker work. Existing bundle-size/Browserslist build warnings remain. No implementation blockers; manual/native visual verification remains outstanding, and the running container is unchanged.

Stop here. U2 is next: resource-local membership controls, easier collection creation and unified pins. U3 includes Ctrl+K and the former Sprint 5 full-text scope; file-content search remains later work.

### U2 implementation session — 2026-09-23
Complete: resource membership chips and shared immediate-toggle picker; atomic retry-safe collection creation; visible Collections destination and collection header actions; initial destination on new notes/imports; unified mixed Pinned shortcuts and local Pin controls. Existing favorites and ZIP v2 organization remain intact.

Decisions: reuse the shared modal/Escape surface for a compact searchable picker; selected memberships appear first, mixed bulk memberships are explicit, and each failure rolls back only its own toggle. Creation fingerprints are stored internally and excluded from archives. Collection-list exactMatch prevents offering duplicate creation when the matching name is on another page. Initial import destinations are captured before opening the file picker.

Validation: frontend production build and targeted lint pass; 18 distinct focused frontend cases pass across membership/pins, Library, navigation refresh, file-import review/retry and organization management. Two disposable SQLite integration cases pass for creation/import atomicity and retry identity, mixed pin ordering, membership metadata, and archive merge/replace/rollback. An isolated browser fixture checked the new membership header and pinned list in both themes, including a narrow note pane and picker/Escape dismissal. The fixture and server were removed; no user workspace was mutated. No broad API smoke tests or Docker rebuild. Existing bundle-size/Browserslist warnings remain.

No implementation blockers. Integrated Dashboard/file-preview layout has not received a full manual pass; the isolated check is not end-to-end UI proof. Deployment is unchanged. Stop here: U3 (Ctrl+K and saved-note full-text search) requires a separate authorization.

### U3 implementation — 2026-09-24
Complete: search-first Ctrl+K with explicit Actions/Commands and captured resource targets, grouped saved-note/title/collection results, safe snippets, retained failed inputs, normal Tab and layered Escape. Library uses the same ranked saved-content service. SQLite FTS5 is derived from visible structured note text; transaction-local resource triggers cover CRUD, imports, link rewrites and archives. Startup and Diagnostics rebuild through one worker in gated batches of 100. API/OpenAPI, SEARCH.md, Library and living guide are synchronized.

Validation: production frontend build and targeted ESLint pass; 13 focused frontend cases pass (4 palette, 4 Library, 5 navigation refresh). Two disposable SQLite integration cases pass, including ranking/prefix/literal input, attribute exclusion, filters, transactional rollback, note import/edit/delete, rebuild with concurrent mutation, and archive search after merge/replace/rollback. OpenAPI JSON and operation IDs validated; git diff whitespace check passes. An isolated palette fixture checked light/dark themes, result grouping, snippet/selection contrast and Escape; contrast issues found there were corrected. Fixture/server removed. No broad live API smoke or Docker rebuild.

Limitations: file-content search remains future work; search is temporarily unavailable during rebuild. A complete integrated Dashboard/assistive-technology/scale pass was not performed. Shared dialogs/palette still lack a complete focus trap. Existing bundle-size/Browserslist warnings remain. Deployment unchanged. No implementation blockers. Stop after U3 and discuss the next sprint before implementation.

## Simpler organization — authorized sequence (2026-09-24)

One sprint per implementation call. Preserve the current visual style and resource model. Design rule: **Simplicity is sophisticated** — expose primary actions, group secondary actions, and retain discoverability and basic keyboard access.

### Sprint K1 — Restore basic keyboard behavior
- [x] Semantic collection-create submission with immediate Enter, current-name validation and stable retry identity.
- [x] Audit create/rename forms: focus, composition, Enter, Escape and duplicate-submission guards.
- [x] Palette Actions next in natural tab order; preserve result/query when returning.
- [x] Focused compilation/tests and documentation handoff.

### Sprint K2 — Consolidate collection organization (complete)
- [x] One Add resource picker: title search, immediate existing-resource membership, inline retry/Added states.
- [x] Create note from unmatched title and secondary duplicate-title creation; atomic initial membership, open editor.
- [x] Import handoff with captured destination; Pin and More in collection header.
- [x] Compact search/filter controls, breadcrumb navigation, contextual bulk actions and distinct empty states.

### Sprint K3 — Title-first search (not started)
- [ ] Titles-only defaults in Library and Ctrl+K; explicit Include saved note text and collection/global scope.
- [ ] Preserve query, reset page/disregard stale responses; expose active scope, never broaden silently.
- [ ] Frontend title/content mode routes to existing metadata/FTS APIs; no schema migration.
- [ ] Global palette includes collection results; scoped mode lists only member resources.

Validation: compilation and focused regressions per sprint; one narrow visual check when organization/search layout changes. No routine Docker rebuild or broad API smoke. Maintain CODEBASE, Library, search and API docs. Stop after each sprint for discussion.

### K1 handoff — 2026-09-24

Implemented semantic, composition-safe collection creation independent of debounced suggestions; current-name validation, retained failures, stable retry identity and in-flight guards. Audited collection/tag create/rename and inline note title handlers; added initial/rename focus, read-only pending inputs and visible focus rings. Library manager/palette organization handoffs restore invoking focus. Palette Actions is next after its input in native tab order, without custom Tab interception or positive tabindex. Escape restores the parent query/highlight. No backend/API/schema changes.

Validation: production frontend build passes; final TypeScript compilation, 16 focused component cases (5 collection/pin, 4 organization manager, 1 collection rename, 6 palette) and targeted ESLint pass. Tests cover form submission before debounce, composition guards, duplicate suppression, retry identity, focus, Escape, native focus order structure and preserved result/query. No browser/native tab simulation, live API smoke or Docker rebuild; visual/native interaction is not claimed as verified. Existing Browserslist/bundle-size warnings remain. The narrow visual check belongs to upcoming layout/search changes.

Stop here: K2 and K3 remain unstarted.

### K2 handoff — 2026-09-24

Completed unified Add resource: immediate existing-resource membership with local retry, paginated title lookup, exact-name-aware Create note, explicit duplicate-title creation and captured import destination. Creation/open retry retains its UUID and initial collection. Collection header now has Add resource/Pin/More; Library has breadcrumbs, search/options, removable criteria, contextual bulk actions and distinct empty collection/no-match states. No backend/API/schema changes.

Validation: production frontend build, final TypeScript and targeted lint pass. Nine focused cases pass (four picker, four Library, one popover), covering membership retry, create identity/destination, exact-title detection beyond the visible page, composition, import handoff, paging/selection and Escape/outside dismissal. One isolated fixture verified dark wide/light narrow layout, Add resource and options placement; fixture and server removed. No broad API smoke, Docker rebuild or user-data mutation. Native file selection and complete Dashboard navigation were not retested. Exact-title checks can require multiple metadata pages for broad queries; existing bundle/Browserslist warnings remain.

Stop here. K3 title-first search defaults and explicit content/global/collection scope require the next authorization.
