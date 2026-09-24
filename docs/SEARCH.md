# Saved-resource search and Ctrl+K

## Palette

Ctrl+K opens search. Empty input groups deduplicated Open, Pinned and Recent items. Typing searches resource titles and saved note text, with collections grouped separately by name. Results show type icons and plain-text note excerpts. Enter opens the highlighted result; Arrow keys change the highlight, Tab focuses the highlighted resource’s Actions button, Enter/Space opens it, and Shift+Tab returns to input using native tab order. Escape returns one step before closing and restores the parent result identity/query. Highlighting a file never opens a preview.

The Actions button names its highlighted resource. It fetches fresh metadata before offering collections, pins, tags, applicable rename/export, explicit file preview/download and confirmed deletion. Commands or a leading > switches modes. Commands include the existing note/upload/settings/navigation actions plus Library, collections, organization, pins, exports and Diagnostics. Targeted commands capture the focused resource or explicit Library selection when the palette opens; hidden notes are not implicit targets. Step titles, Back and target labels remain visible. Failures retain input and prevent duplicate in-flight execution. IME confirmation does not execute a result. Organization handoffs restore the captured workspace focus on dismissal. Organization/export/delete may deliberately hand off to their existing dialogs.

Opening an existing note uses the existing pane and save coordinator, retaining its draft. Search always reflects saved content; pending edits trigger an explicit reminder. New-note creation uses the retry-safe import contract and retains the same UUID across retry within a palette session. Closing/replacing a pane still passes through the save barrier.

Search is debounced 150 ms. The palette displays at most 50 resource and 20 collection matches, with a refinement/Library hint for more. Empty state fetches up to 30 mixed pins and shows up to 20 recent resources after deduplication. Library provides full pagination. Collection names use the collection service; file bytes are not searched.

## Search contract and ranking

GET /api/resources/query accepts q (required, up to 500 characters/30 terms), page (zero-based), size (1–100, default 50), type, repeated tag names (all required), collection ID and favorites. Unicode letters/numbers/underscore become literal prefix terms joined with AND. Punctuation does not expose FTS operators; an input without terms returns no matches. Matching is accent/case insensitive using SQLite unicode61. This is token-prefix search, not arbitrary substring matching.

Results are {items:[{resource,snippet}],page,size,totalItems,totalPages}. Resource is the existing metadata summary, enriched with tags/collections in batches without hydrating note bodies. Ranking uses BM25 with title weight 10 and body weight 1, then lowercase title and ID. Snippet text is bounded to 600 UTF-16 units with half-open {start,end} highlight offsets; clients render text and mark elements, never HTML. File/title-only matches may have no highlighted body excerpt.

Library uses this service for nonempty queries. The collection Add resource picker deliberately uses metadata title search to find existing resources and offer note creation. Library disables its ordinary sort during relevance search. Empty-query browsing retains the existing recent/updated/title sorts. GET /api/resources and legacy /api/resources/search retain their documented title-substring contracts for other callers. GET /api/resources/{id}/summary supplies fresh metadata for palette actions.

## Derived index and diagnostics

ResourceSearchService owns resource_fts, an FTS5 table containing resource ID, title and derived body. Recursive traversal follows document content arrays in order and extracts text nodes plus resourceLink labels. Headings, lists, code and table cells are included through that traversal. Arbitrary attributes, resource IDs, raw JSON and binary file contents are excluded.

SQLite insert/update/delete triggers maintain the index in the same resource transaction, including rename/edit, file-to-note import, link replacement and archive merge/replace. A rollback rolls back index changes. The index is disposable derived data and is not exported in logical workspace archives.

Startup rebuilds asynchronously. GET /api/diagnostics/search returns rebuilding, processed, resources, indexed, invalidDocuments, complete, failure and originating requestId. POST /api/diagnostics/search/rebuild starts a single worker or returns the current run; poll status for completion. Diagnostics exposes status, refresh and rebuild controls and includes status in downloaded reports.

Rebuild clears the index then rebuilds batches of 100 IDs, taking the shared workspace mutation gate exclusively per batch and committing each batch transactionally. Normal mutations resume between batches and triggers cover changes concurrent with the rebuild. Resource operations may briefly return WORKSPACE_BUSY (409); search returns 503 during rebuild/failure. Failure is visible with correlated backend logs; restart starts rebuilding again. Invalid stored note JSON yields an empty body and incomplete coverage in status. Correct source data before expecting complete coverage. This gate is process-local: use one backend per database.

## Validation and limits

Focused tests cover palette deduplication, normal Tab, explicit targeting, safe snippets, Escape, failed rename/retry; service tests cover ranking/prefix/literal input, attribute exclusion, filters, CRUD/import/rollback, rebuild with concurrent mutation and archive search after merge/replace/rollback. The isolated palette fixture was visually checked in light/dark themes, including highlighted snippets and selected-result contrast. It was removed afterward. This is not a full integrated Dashboard or assistive-technology pass. No routine live API smoke or Docker verification was performed.

File-content extraction, fuzzy matching, synonym expansion and broader scale/performance verification remain future work. Rebuilding temporarily makes full-text search unavailable; ordinary browsing remains usable between gated batches. Palette and shared dialogs do not yet implement a complete focus trap.
