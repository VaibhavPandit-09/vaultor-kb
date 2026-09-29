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

### Sprint K3 — Title-first search (complete)
- [x] Titles-only defaults in Library and Ctrl+K; explicit Include saved note text and collection/global scope.
- [x] Preserve query, reset page/disregard stale responses; expose active scope, never broaden silently.
- [x] Frontend title/content mode routes to existing metadata/FTS APIs; no schema migration.
- [x] Global palette includes collection results; scoped mode lists only member resources.

Validation: compilation and focused regressions per sprint; one narrow visual check when organization/search layout changes. No routine Docker rebuild or broad API smoke. Maintain CODEBASE, Library, search and API docs. Stop after each sprint for discussion.

### K1 handoff — 2026-09-24

Implemented semantic, composition-safe collection creation independent of debounced suggestions; current-name validation, retained failures, stable retry identity and in-flight guards. Audited collection/tag create/rename and inline note title handlers; added initial/rename focus, read-only pending inputs and visible focus rings. Library manager/palette organization handoffs restore invoking focus. Palette Actions is next after its input in native tab order, without custom Tab interception or positive tabindex. Escape restores the parent query/highlight. No backend/API/schema changes.

Validation: production frontend build passes; final TypeScript compilation, 16 focused component cases (5 collection/pin, 4 organization manager, 1 collection rename, 6 palette) and targeted ESLint pass. Tests cover form submission before debounce, composition guards, duplicate suppression, retry identity, focus, Escape, native focus order structure and preserved result/query. No browser/native tab simulation, live API smoke or Docker rebuild; visual/native interaction is not claimed as verified. Existing Browserslist/bundle-size warnings remain. The narrow visual check belongs to upcoming layout/search changes.

Stop here: K2 and K3 remain unstarted.

### K2 handoff — 2026-09-24

Completed unified Add resource: immediate existing-resource membership with local retry, paginated title lookup, exact-name-aware Create note, explicit duplicate-title creation and captured import destination. Creation/open retry retains its UUID and initial collection. Collection header now has Add resource/Pin/More; Library has breadcrumbs, search/options, removable criteria, contextual bulk actions and distinct empty collection/no-match states. No backend/API/schema changes.

Validation: production frontend build, final TypeScript and targeted lint pass. Nine focused cases pass (four picker, four Library, one popover), covering membership retry, create identity/destination, exact-title detection beyond the visible page, composition, import handoff, paging/selection and Escape/outside dismissal. One isolated fixture verified dark wide/light narrow layout, Add resource and options placement; fixture and server removed. No broad API smoke, Docker rebuild or user-data mutation. Native file selection and complete Dashboard navigation were not retested. Exact-title checks can require multiple metadata pages for broad queries; existing bundle/Browserslist warnings remain.

Stop here. K3 title-first search defaults and explicit content/global/collection scope require the next authorization.

### K3 handoff — 2026-09-24

Implemented title-only initial defaults in Library and every new Ctrl+K session, explicit Include saved note text, and searchable Entire workspace/collection scopes. Library scope changes update its destination/breadcrumb while retaining query text. Resource query mode is typed and stripped from wire parameters, selecting the existing metadata or FTS endpoint. Changed mode/scope invalidates stale requests; scoped palette empty queries cannot leak global Open/Pinned suggestions. Global title results include collection names. Content-only snippets and saved-draft reminders remain explicit, and palette Actions/focus behavior is preserved. No backend/API/schema changes.

Validation: production frontend build, final TypeScript and targeted ESLint pass. Fifteen distinct focused cases pass across palette (7), Library (5), mode routing/stale scope (2), and popover dismissal (1). No repeated browser exploration, live API smoke or Docker rebuild. K2 supplied the narrow visual review; K3's new scope controls have component coverage but no new visual pass. Existing bundle-size/Browserslist warnings remain. File-content indexing remains future work.

K1–K3 are complete. Stop for discussion before any further sprint.

### Post-sprint startup correction — 2026-09-24

User-reported container crash reproduced using an existing FTS5 index before Hibernate startup. Individual JDBC metadata extraction fixes the grouped extractor exception without deleting data or disabling schema updates. Focused regression passed after reproducing the original failure. Docker rebuild, normal-volume startup and second restart succeeded; read-only health/search diagnostics show ready and complete coverage (5/5). No user resources were edited or reset.

## Navigation, sessions and exports — 2026-09-29

Deliver exactly one sprint per authorization. Current authorization: N5 linked-resource exports (complete, 2026-09-30; stopped for discussion). Preserve structured documents, the save coordinator and existing visual tokens.

- [x] N1: direct export format actions, note save barrier, automatic download, dialog-independent tracking, bounded status retries, existing-operation download retry, compact feedback and Details. Backend snapshot/API unchanged.
- [x] N2: stable pane IDs, source-aware link intents, source-only save/navigation barrier, duplicate views sharing document/title/undo/save with independent selections, stale-request guards and accessible links. Files remain temporary previews; pane limits never evict silently.
- [x] N3: shared focused-pane journey bar, distinct visits/branching, Back/Forward and restored positions, bounded 200 visits per pane, restrained reduced-motion-aware transitions. Direct opens start trails; linked opens extend; Alt+Arrows only switches panes.
- [x] N4: IndexedDB per-tab sessions and revision-aware draft recovery, Library context and lazy journey restoration, workspace identity/generation isolation, atomic If-Match updates. No silent conflict overwrite or transient UI restoration.
- [x] N5: linked-resource export and readable references, as specified below.
- [ ] N6 (formerly N5): integration edge checks and one focused visual review, complete navigation/session/export/API/operations documentation. No routine Docker rebuild or broad API smoke.

Decisions: a new pane copies the source journey then evolves independently; duplicate notes share one live document; Ctrl/Cmd-click at capacity offers Open here without changing panes; refresh recovery must retain failed drafts. Each sprint stops for discussion. Compilation and focused failure-path checks only; actual results recorded below. No current blocker.

### N1 handoff — 2026-09-29

Implemented direct format actions and automatic download after the target-note save barrier. An always-mounted frontend controller continues after picker dismissal and exposes a compact status card, Details, relevant conversion warnings and Download again. A synchronous execution guard prevents duplicate starts. Three consecutive polling failures pause tracking; Retry status/download keeps the same operation. Only confirmed preparation failure retries a new snapshot; an ambiguous non-idempotent POST failure requires inspection before explicitly starting over. Retry reads the current note save/title handler. Backend contracts, document formats and snapshot semantics are unchanged.

Validation: production frontend build, final TypeScript compilation, targeted ESLint and seven focused tests passed (save failure/retry, automatic download, dismissal during saving, duplicate choices, bounded status retries, existing-artifact download retry, confirmed preparation failure, ambiguous creation and unmount cancellation). Git whitespace check passed. Existing large-bundle/outdated Browserslist warnings remain; build also emitted plugin timing advice. No browser, API smoke or Docker verification. Native browser download permission/destination and visual layout are not verified here. Full reload stops client tracking; backend operations remain retrievable by ID. One active/unresolved export is retained at a time; no local export persistence.

Stop after N1. N2–N5 remain unstarted and require separate authorization.

### Added export scope — N5 (implemented 2026-09-30)

The user requested export of the outgoing linking chain and readable PDF references. This is a separate export sprint before final integration, expanding the sequence to six sprints; N3 journeys and N4 recovery retain their order. N2 also closes the export picker automatically after browser download handoff; browser disk-save completion is not observable.

- Add an explicit This note / Include linked resources choice, defaulting to This note. Show concise reachable note/file counts before a graph export, preserving one-action format/download behavior.
- Traverse outgoing structured references recursively, including local file/image/table-source assets; exclude backlinks and remote network fetching. Deduplicate by resource ID, detect cycles and use deterministic ordering. Title collisions must never overwrite package files.
- Bound graph nodes, depth and total bytes with configurable limits. Report limit failures, missing targets and missing binaries; never silently truncate the requested graph. Cancel before snapshot/preparation where supported.
- Save pending edits only for participating open notes, then take one consistent immutable graph snapshot under the workspace gate. Continued edits cannot change the prepared output. Preserve the existing operation diagnostics/retry model.
- PDF: combined note sections with readable titles, a compact contents list, bookmarks and clickable internal destinations. DOCX: named sections/bookmarks and internal links. Markdown bundle: separate note files with rewritten relative links.
- Include reachable uploaded files as original bytes in a ZIP package alongside rendered notes when the chosen document format cannot contain them naturally. Clearly identify ZIP output before starting; reference attachments by readable filename. Preserve image/render fidelity rules.
- For standalone This note exports, show readable linked titles; an optional references section identifies omitted/missing targets. No raw UUID strings in the main document body, and no invented links to nonexistent exported pages. Internal IDs, if needed for traceability, belong in package metadata rather than reading content.
- Verify cyclic/diamond graphs, duplicate titles, missing resources, limit failures, consistent snapshots and working cross-links. Use representative PDF/DOCX visual checks in this export sprint, not routine navigation work. Current renderer behavior remains documented in NOTE-EXPORTS until implementation.

### N2 handoff — 2026-09-29

Completed stable pane identities and source-aware inline/backlink opening. Ordinary links replace only their source; Ctrl/Cmd-click adds without eviction, with Open here at capacity. Direct opens retain replace/split preference, and existing direct targets focus their existing view with a fresh trail. File previews retain source ownership and the side/modal preference, never becoming history. Lowering capacity preserves already-open panes.

Removed Redux/global opening-history ownership and competing navigation effects. Source-note save/load barriers, per-source request tokens, resource-load versions/workspace epochs and focused-note backlink guards preserve panes on failure and discard superseded work. Pending navigation cannot steal focus after an explicit pane switch. Close failures retain the pane and have a dedicated retry. Alt+Arrows only switches panes; existing distinct history shortcuts use the focused pane. The N3 journey presentation/reading-position work remains pending.

SharedNoteDocuments synchronizes steps/appended transactions and history across duplicate views using one schema instance; document/title/save state is shared, selections/scroll/filter/fullscreen state stay per view. Focused checks exposed and fixed cross-schema node identity problems and initial trailing-paragraph normalization. Remote table changes cannot be rejected by another view's filter; structural changes clear affected filters. Authoritative external document replacement clears obsolete undo. Resource links are focusable buttons and both link opening and picker arrows route by editor/source pane.

Also applied the requested N1 correction: the export dialog closes after browser download handoff, retaining the compact Download again card. Graph export/readable PDF references are specified in N5 above, not claimed as implemented. Added authoritative NAVIGATION.md and synchronized CODEBASE, index, table, export, API and operations guidance.

Validation: production frontend build passed; final TypeScript compilation and targeted ESLint passed. Across focused runs, 31 distinct tests passed: 9 navigation, 5 shared-document/history, 1 shared filtered-table, 4 editor regression/React integration, 5 existing table workflow cases, and 7 export cases including auto-close assertions. No browser, live API, Docker or user-data mutation checks. Existing bundle-size/Browserslist warnings remain. Native keyboard/focus visuals and full Dashboard visual integration remain for the focused integration review. Per-visit reading positions, shared journey UI, persistence and cross-tab conflict protection are not delivered in N2.

Stop here for discussion. N3 is the next implementation sprint; N4 recovery, N5 linked-resource exports and N6 integration follow separately.


### N3 handoff — 2026-09-29

Implemented the shared focused-pane journey bar, nearby visits and full-path overflow, distinct cycle visits, branching, independent copied paths, 200-visit bound, scroll/caret restoration, current titles, unavailable destinations and restrained motion. Alt+Arrows remains pane switching only. Library hides the bar and closes its portal. Reading positions are in memory and numeric/clamped; session persistence remains N4.

Validation: production frontend build and targeted ESLint pass; 22 focused navigation, journey and editor tests pass, covering branches, copied positions, missing/transient errors, limits, dismissal, stable typing/title updates and same-editor caret restoration. One isolated fixture visual session checked dark wide and light 320px layouts, full-path overflow and Escape. Full Dashboard integration/reduced-motion visual review remains N6. Existing bundle-size/Browserslist warnings remain; no API/Docker checks or user workspace mutation.

Stop after N3 for discussion. N4 persistent sessions/recovery is next; N5 linked-resource exports and N6 integration remain separately authorized work.


### N4 handoff — 2026-09-29

Implemented per-tab IndexedDB sessions and versioned recovery journals, restored focused panes/journeys/positions and Library context, missing-current fallback and lazy older visits. Fresh tabs seed independent layouts; Web Locks protect cloned tab tokens. Restore does not reopen transient UI or run exports/commands. Current pane limits do not delete recovery drafts. Pending content and unsubmitted title edits are journaled, and acknowledgements only remove matching edits. Same-revision drafts recover automatically for their owning tab; conflicts, other sessions and former generations offer recovered copies. Storage/save failures retain visible retry paths.

Backend: resource revision_number/revision_seed with tested existing-schema upgrade, opaque DTO revision, conditional If-Match note writes with structured 412 conflicts, and persistent workspace identity/generation. Replacement changes generation transactionally and assigns new resource revision seeds; merge preserves generation. Internal identifiers stay out of portable archives. Late responses cannot rebase replacement drafts or restore stale layouts.

Validation: production frontend build, final TypeScript compilation and targeted lint passed; 36 focused frontend tests passed. One disposable SQLite HTTP/transfer regression passed for old-schema startup, revision updates/conflicts, identity rollback and archive replacement isolation. OpenAPI structure/operation IDs and whitespace checked. No browser/native lifecycle check, Docker rebuild, broad API smoke or real workspace mutation. Existing bundle-size/Browserslist warnings remain. Details and limits are authoritative in SESSIONS.md: origin-specific best-effort storage, 500 ms snapshot interval, no persisted undo or automatic age-based pruning, and separate-copy handling for other tabs.

Stop after N4. N5 linked-resource export chains/readable PDF references and N6 integration require separate authorization.

### Corrective handoff before N5 — 2026-09-29

- [x] Remove the automatically opened Linked from column. Backlinks now open explicitly in the shared journey bar and retain source-aware navigation.
- [x] Refine inline resource references with soft theme surfaces, small icons, restrained underlines and visible keyboard focus.
- [x] Display complete short journeys; longer paths scroll horizontally with the current visit revealed, and retain the full-path overflow.

Validation: production build, final TypeScript compilation, targeted ESLint and 10 focused journey/popover/editor tests passed. One isolated real-component browser fixture checked dark/wide and light/360px layouts plus backlinks opening, Escape and focus restoration. Full Dashboard integration was not visually exercised. No API/Docker checks or user-data mutation; existing build warnings remain. No API/schema/session changes. N5 linked-chain exports is still pending and requires the next sprint authorization.

### N5 handoff — 2026-09-30

Implemented This note / Include linked resources, saved counts and package labels, optional references and cancellation before preparation. Participant-only saving rechecks graph membership; changed scope requires review, and server fingerprints prevent stale snapshots. Bounded deterministic graph traversal includes outgoing note/file/image/table-source references, deduplicates cycles/diamonds and reports missing targets/limits. Immutable snapshots render relative-linked Markdown bundles, combined PDF contents/bookmarks/destinations and Word bookmarks; original files are packaged when needed. UUIDs move out of reading content into package metadata. Workspace archives, session schema and document format are unchanged.

Validation: production frontend build, final TypeScript and targeted ESLint passed; 11 frontend export tests and 6 backend renderer/graph/service tests passed on disposable fixtures. Checked graph PDF pages 1–3 visually. DOCX rendering attempted but blocked by missing LibreOffice; bookmark structure is verified, pagination remains unverified. No browser/Docker/broad API smoke or user-data mutation. Existing build warnings remain. N6 integration remains pending and requires its own authorization.
