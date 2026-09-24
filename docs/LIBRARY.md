# Library and resource browsing

The Library is the main browsing surface. Sidebar navigation opens Library, Recent, Collections or Pinned; Search opens the command palette. Recent contains at most 12 resources; Pinned contains at most 12 mixed note/file/collection shortcuts in stable alphabetical order, with searchable, paginated View all. New collection, create/import, tag chips and utilities remain available. Collections remain accessible without being pinned.

## Behavior

Library opens at startup. Opening a note returns to the note workspace; opening a file shows its preview. Return to notes restores the active pane. Switching to Library hides, rather than unmounts, open editors: documents, selections and pending saves remain owned by the existing editor/save coordinator. Hidden editors do not receive active-editor focus or the close-note shortcut. Library titles represent saved metadata; unsaved drafts stay in their note panes.

Nonempty search uses saved-note text and resource titles through the shared FTS5 service, with safe excerpts and relevance ordering; the ordinary sort control is disabled while searching. Pending edits are explicitly excluded. See [SEARCH.md](SEARCH.md) for prefix terms, ranking, diagnostics and limits. Collection membership, type, all-selected-tag names, favorites and sorting are evaluated by the server. Recent sorts by last-opened time (new resources also initialize this timestamp); other sorts are recently updated and title A–Z. Type/sort controls live in Search options, and active criteria have removable chips. A select-page checkbox appears when rows exist; bulk actions appear only after selection. Resource counts reflect all matching results. Changing criteria resets pagination. Empty, pending, failure/retry and pin-update failure states are explicit.

A page contains at most 100 summaries. The list renders only fixed 64px rows around the viewport with overscan. Previous/Next selects server pages. Responses are cancelled or ignored when superseded; hidden Library requests stop. Same-query refreshes retain rows and show errors alongside them; only initial loads or changed criteria use loading placeholders. Workspace replacement clears cached results, including hidden views. Pagination uses an ID tie-breaker, but is not a snapshot: concurrent changes can move resources between pages. Refresh retrieves current state.

Pins persist in the existing favorite fields in the database and do not change modified timestamps. Version 2 workspace ZIPs preserve resource favorites, collections, collection favorites and memberships. See the organization rules below. Resource bodies and binary paths are absent from browsing responses. Opening a resource retrieves its full detail independently of sidebar contents. The palette searches saved note text and titles with bounded results and directs users to refine searches exceeding 50 matches. Link/replacement pickers retain bounded title search.

## Implementation

- `components/LibraryView.tsx`: Library filters, virtual rows, paging, pins and membership actions.
- `lib/resourceBrowse.ts` / `useResourcePage.ts`: shared query contract, cancellation, refresh event and retry.
- `lib/resourceKinds.ts`: centralized initial Note/File presentation and open mode, with an unknown-type fallback. Adding a type still requires its data contract and renderer.
- `pages/Dashboard.tsx`: bounded quick access, detail fetching and mounted note/Library switching.
- `ResourceBrowseService`: SQL metadata projection, page count, page-local batched tags/collection summaries, validated sorting and favorite mutations.

See [API.md](API.md) for the HTTP contract. Do not restore an eager loop over every resource page to populate a UI picker.

## Validation — 2026-09-23

Production frontend build, targeted ESLint and three Library/hook tests pass. A backend Spring/SQLite integration test passes using disposable storage with 205 resources: stable pages, summary shape, timestamps, literal wildcard search, type/tag intersections, favorite idempotence and validation. No browser, Docker or live API smoke checks were run. Theme/narrow-screen layout and full Dashboard navigation need manual review; component tests are not visual proof. Broader scale tests are scheduled for Sprint 6.

Table controls are documented in [TABLES.md](TABLES.md).

## Collections, tags and bulk organization

Collections are flat topic/project groups. A resource can belong to several collections; tags are independent and apply across them. Names trim surrounding whitespace, contain 1–100 characters and must be unique ignoring case. Collections retain display casing; tags normalize to lowercase. There are no nested folders or saved views.

Open **Collections** in the sidebar to browse topics, search, pin, or create a collection. Its header offers Pin, Add resource and More. More holds rename/delete, organization management and refresh. Resource counts describe the current result set. Breadcrumb navigation returns to Library. Management keeps rename and confirmed deletion secondary; deletion removes only the collection and memberships. New note/import actions inside the visible collection assign the destination automatically. File-import review names the captured destination and applies it to every successful row; a failed row retains its original ID and destination for retry. Ordinary note/slash imports do not inherit a hidden collection. Tags and the secondary Collections & tags manager remain available in Library. Rename collisions fail visibly instead of merging.

Use row checkboxes or **Select page**, then **Add to collection** to open the same membership picker used by individual Library rows, note headers and file previews. It searches collections, shows selected memberships first, and displays mixed bulk membership as “some”. Each checkbox immediately adds/removes only that collection, with independent pending, rollback and retry; the picker stays open for more changes. Inline **Create “name” and add** creates and assigns atomically. One request applies to at most 100 current-page resources; changing page or criteria clears selection. Tags / manage retains the tag bulk workflow. Add existing in a collection searches resource titles and adds up to 100 selected resources without replacing other memberships. No bulk resource deletion is exposed.

Note titles and file-preview headers show two collection chips, then +N; expanding reveals the other memberships. Clicking a chip opens that collection. Add to collection remains visible even with no memberships. Pin/Unpin is available on notes, previews, collection headers and Library rows. Membership/pin changes do not flush, replace, or modify note drafts.

Organization writes publish typed organization changes, while pin updates publish pin changes. Only affected query scopes refresh. Tag changes refresh affected open-note metadata while preserving the save coordinator’s latest document/title. Organization browsing uses abortable queries and retains existing rows on background failures. The existing sidebar tag chips and note tag pickers still load the tag list; replacing those with fully server-paged pickers remains scale work, while the management dialog is paginated.

### Persistence and transfer

The collections table has UUID id, display name, unique normalized_name, favorite flag and internal creation_fingerprint. resource_collections is a many-to-many join owned by Resource, so resource deletion removes its memberships. OrganizationService uses metadata-only SQL for counts, paging and membership updates, avoiding document hydration. Creation with PUT /collections/creations/{UUID} validates initial members and stores a fingerprint in the same transaction. Identical retries return the collection without reapplying memberships; changed requests conflict. Fingerprints are not portable archive data. Optional collectionId on note creation/import commits initial membership with the resource; import fingerprints include the destination. Bulk changes validate all IDs, then commit atomically; repeated add/remove calls are idempotent. Tag renaming preserves its ID, color and membership. Tag deletion now removes join rows directly rather than loading all resource documents.

Workspace ZIP version 2 adds workspace.organization containing collections ({id,name,favorite,resources:[resource IDs]}) and favorites ([resource IDs]). The existing workspace.json checksum covers this section. Preview validates collection identities, normalized names and membership/favorite references before mutation, and reports organization counts in review information.

Replace restores collection/resource favorites and memberships, retaining archived collection IDs. Merge allocates new resource IDs, rewrites memberships, unifies collections by normalized name and preserves existing collection favorites; newly created collections keep their imported favorite state. Imported resource favorites apply only to the newly created resources. Metadata, membership and favorite restoration share the existing import transaction and rollback/recovery boundary. Version 1 plain archives remain readable without organization; replacing with one yields no collections or favorites.

### Sprint 4 validation — 2026-09-23

One disposable SQLite/Spring integration test covers collection uniqueness/counts, bulk idempotence and validation, combined filtering, tag rename, organization/favorite merge and replacement, non-destructive collection deletion, resource deletion membership cleanup, malformed archive rejection, and rollback after an injected late collection-insert failure. Fifteen focused frontend tests pass across Library, organization manager and table controls. Production frontend compilation/build and targeted ESLint pass. No browser, live API smoke or Docker checks; visual/manual review remains outstanding.

## Navigation refresh behavior — Sprint U1

resourceEvents.ts defines one typed notification contract with opened, metadata, organization, pins and workspace categories. An opened notification invalidates only Recent requests; it never reloads favorites, collection shortcuts or tags. Metadata changes refresh resource summaries; create/import/delete also signal changed membership counts. Tag/collection organization changes identify their scope; resource and collection pin changes use separate targets. Workspace replacement invalidates every cache.

RecencyRecorder groups rapid activations over 300 ms and records only the final resource in each burst. This deliberately omits intermediate keyboard-switch visits from recency writes. Requests are serialized and consecutive activations of the same resource are deduplicated. The active highlight/focus changes immediately; saving and navigation never await the recorder. Once the final write settles, Recent reconciles after 150 ms. Starting another activation aborts/invalidates old list reads immediately. Recorder reset cancels pending work on unmount or workspace replacement.

Recent keeps its existing rows/order while switching, then updates keyed rows in place; the sidebar scroll region disables automatic scroll anchoring. useRetainedQuery keeps same-query data through pending/failed refreshes and exposes a separate refreshing state. Initial loads still show placeholders; changed criteria never show the previous query as matching results. Retry controls stay beside the retained list. Background API failures still log locally/to diagnostics with request IDs but do not trigger the global error banner. Failed recency writes expose Retry in Recent and do not affect drafts or saves.

POST /api/resources/{id}/open performs a metadata-only last_opened_at update. It does not modify title, content, updatedAt, tags, collections or favorites.

Validation: five navigation/diagnostics tests cover isolated/debounced Recent refresh, retained DOM/scroll during rapid activation, local retry after failed refresh, stale response rejection, serialized/coalesced recorder writes, cancellation/reset and diagnostic-only errors. Existing four Library and three organization-manager tests pass. One disposable Spring/SQLite integration case verifies unchanged modification timestamp/content/title/creation time and missing-ID handling through the controller's mark-open method. Frontend production build and targeted ESLint pass. No browser/manual visual checks, live API smoke or Docker rebuild. U2 is recorded below. U3 palette/full-text search is not yet implemented.

## U2 validation and remaining scope

Frontend production build and targeted ESLint pass. Eighteen distinct focused frontend cases pass (membership rollback/retry and stable creation IDs, pin synchronization, Library paging/filtering, navigation refresh stability, import destination/retries and organization management). Two disposable SQLite integration cases pass, covering atomic creation/import membership, retry fingerprints, mixed pin ordering, metadata summaries, and archive organization merge/replace/rollback. One isolated browser fixture checked the membership header/pinned list in both themes, a narrow note pane and picker/Escape dismissal; it was removed afterward. No broad API smoke or Docker work. Integrated Dashboard/file-preview layout has not had a full manual pass; deployment remains unchanged. Existing bundle-size/Browserslist warnings remain. Ctrl+K remains the existing palette until U3; note-body and file-content search are not added here.

## Create/rename keyboard behavior

Collection creation accepts Enter immediately after typing, including before the suggestion debounce finishes. Submission uses the current trimmed name and the same retry-safe UUID for a failed/uncertain attempt. Existing-name conflicts are visible; they do not discard the input. Collection/tag creation and rename forms suppress composition-confirmation submission, reject blank names, and prevent duplicate in-flight actions. Name fields stay focused and read-only while submitting. Collection rename initially focuses its name; the manager focuses search initially and moves focus to the name when Rename is selected. Escape uses the shared modal layer; Library restores focus to the invoking organization control.

The unified Add resource picker and simplified collection layout are implemented in K2. Title-only default search is planned in K3; current saved-text search remains unchanged.

## Add resource to a collection

Use Add resource to find existing notes/files by title. Click a result or select with arrows and press Enter to add immediately; the picker stays open. Added resources are marked and cannot be added twice. Each mutation has its own pending/error/retry state. Existing membership APIs preserve other collections.

For a nonempty title without an exact note match, Create note creates and opens a note in this collection. More → Create new note explicitly permits duplicate titles (or Untitled Note for empty input). A stable UUID and collectionId are sent through the existing multipart import API; retrying a lost response/open failure reuses that identity. A new title is a new creation intent. Exact-note checks cover all matching pages, requesting metadata in batches of 200; broad searches can require multiple requests, aborted when criteria change. Visible mixed results are paginated at 30.

Import files closes the picker before invoking the existing native file picker and review flow; the collection destination remains captured. Empty collections show an add-resource prompt; unmatched searches retain their distinct no-results state. Search options/More use shared positioning/Escape behavior, outside dismissal and trigger focus restoration.
