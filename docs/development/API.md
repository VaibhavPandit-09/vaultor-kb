# Agent and UI API guide

## Host access (D5)

[HOST-ACCESS.md](../security/HOST-ACCESS.md) owns authorization and its examples. Public GET /api/capabilities and /api/access/host expose bounded build/trust information. Everything else requires the owner HTTP connector or an approved HTTPS device/browser session; X-Vaultor-Owner is main/private-local only, Authorization: Bearer is HTTPS client only, browser mutations require X-Vaultor-CSRF. Never strip If-Match, disable TLS checking, forward credentials to another origin or bypass approval to debug. OpenAPI 1.2.0 documents global security schemes, public exceptions and owner-only operations. HOST_ACCESS_PATH is excluded from archives and workspace replacement.

## Client compatibility

Before opening a workspace or sending application requests, clients inspect `GET /api/capabilities` (`getCapabilities`). The explicit DTO includes `serverBuild`, `apiProtocolVersion` and `minimumClientProtocolVersion`, plus existing transfer/export/diagnostic metadata; `build` is the server-build alias. Current client/server protocol is 1. Accept only a protocol inside the server's inclusive supported range. Build strings identify releases, not compatibility. Missing metadata or an older protocol requires updating the server; a higher minimum requires updating the client. Frontend/backend must be deployed together. See [PLATFORM.md](../architecture/PLATFORM.md) for handshake caching, cancellation and platform ownership.

Frontend diagnostic events retain `build` (client build), optional `serverBuild`, `apiProtocolVersion` (client protocol) and `connectionEpoch` (ephemeral delivery ownership), alongside existing bounded fields. All requests, including bootstrap and diagnostic batches, carry `X-Request-ID`. Failed binary downloads preserve bounded JSON problem details rather than treating the problem as a downloaded file. Capabilities report authentication=true, changeFeed=true and scopedSettings=true; protocol remains 1. Bounded capabilities/host identity are public; workspace/diagnostic/OpenAPI/stream access requires approval. D7 contracts are detailed in [MULTI-DEVICE.md](../architecture/MULTI-DEVICE.md); deploy current frontend/backend together.

## Ordinary file import

`PUT /api/resources/imports/{id}` accepts a canonical client-generated UUID and multipart `title` plus exactly one of `file` or `content`. Content is a serialized structured Tiptap JSON document. Retry with the same UUID and identical payload to retrieve the same resource without duplicate creation. Different payloads or occupied non-import IDs return 409. This endpoint never replaces by title. Metadata/backlinks commit together, with file bytes staged first. This is separate from workspace ZIP import. OpenAPI operation ID: `importFileResource`.

`scripts/file-import-smoke.mjs` tests this flow against disposable storage, including byte preservation and retries. Frontend conversion choices/limits are in CODEBASE.md.

The application and approved agents use the same APIs, protected by local owner access or paired LAN credentials. See [HOST-ACCESS.md](../security/HOST-ACCESS.md) for enrollment, browser CSRF, owner bootstrap and agent authorization. Default origin: http://127.0.0.1:8080. Machine-readable specification: GET /api/openapi.json. Discover build/features at GET /api/capabilities and available export formats at GET /api/export-formats. Workspace ZIP and individual note Markdown/ZIP/PDF/DOCX exports are enabled; see NOTE-EXPORTS.md.

The owned desktop server uses an OS-assigned 127.0.0.1 port; find its current browser address in the desktop connection bar/Details. Ordinary API contracts/protocol are unchanged. Its lifecycle control is private stdio, not an API endpoint or an agent bypass. Diagnostics in desktop also includes bounded local startup/crash logs obtained through validated main/preload IPC. Standalone/Docker port defaults remain unchanged; see [DESKTOP.md](../desktop/DESKTOP.md).

## Request and response rules

Send Content-Type: application/json except multipart file uploads. Note content is a structured Tiptap doc object; supply both title and content for updates. Titles contain 1–500 characters; tags 1–100. URL-encode path/query values. Resource DTOs omit storage paths. List resources with page (zero-based), size (1–200), q (literal title substring), type, repeated tag names (all required), favorites=true, collection (ID), and sort=recent|updated|title; response is {items,page,size,totalItems,totalPages}. Lists contain metadata only (no content/filePath); GET /resources/{id} retrieves the document. Legacy /resources/search returns up to 50 metadata-only title matches. Saved-note search uses the separate paginated /resources/query contract described in SEARCH.md. Stable ordering uses resource ID as a tie-breaker; pagination is not a concurrent snapshot.

Send an optional X-Request-ID (1–80 alphanumeric, underscore or hyphen characters). The server returns it on every response or creates a UUID. Problem errors contain status, code, detail, requestId and fieldErrors where applicable. Codes include NOTE_REVISION_CONFLICT (412), INVALID_REQUEST (400), NOT_FOUND (404), CONFLICT/WORKSPACE_BUSY (409), UPLOAD_TOO_LARGE (413) and INTERNAL_ERROR (500). Retry a busy request after the operation finishes; avoid blindly retrying non-idempotent creation.

## Conditional note saves and workspace identity

Read a resource detail's opaque revision and send it quoted as an If-Match header on PUT /resources/{id}/note, alongside the complete title/content. Success returns the new revision. A 412 NOTE_REVISION_CONFLICT leaves the saved note unchanged: retain your draft, fetch fresh detail and resolve explicitly. Do not automatically retry with the newly fetched revision over someone else's content. The UI always uses conditional note saves. HTTPS callers omitting If-Match receive 428 NOTE_REVISION_REQUIRED; local legacy callers may explicitly update unconditionally. Revisions can also change on JPA metadata updates; they are not timestamps or portable identifiers.

GET /workspace/identity returns {id,generation}. Identity persists for this storage directory; workspace replace changes generation transactionally, while merge preserves it. Resource replacement also creates fresh opaque revisions. Neither identity/generation nor resource revision internals appear in portable ZIP archives. See [SESSIONS.md](../workspace/SESSIONS.md) for browser restoration and recovery.

## Endpoints

| Method and path | Stable operation ID | Purpose |
| --- | --- | --- |
| GET /api/workspace/identity | getWorkspaceIdentity | Persistent identity and replacement generation |
| GET /api/resources | listResources | List resources with pagination |
| POST /api/resources | createNote | createNote |
| GET /api/resources/search | searchResources | Title search; capped at 50 metadata summaries |
| GET /api/resources/query | searchSavedResources | Paginated saved-note/title search with safe snippets |
| GET /api/resources/{id}/summary | getResourceSummary | Fresh metadata without note content |
| GET /api/diagnostics/search | getSearchIndexStatus | Index coverage, failure and rebuild status |
| POST /api/diagnostics/search/rebuild | rebuildSearchIndex | Start a bounded asynchronous rebuild; return existing run when busy |
| GET /api/resources/{id} | getResource | getResource |
| DELETE /api/resources/{id} | deleteResource | deleteResource |
| PUT /api/resources/{id}/note | updateNote | updateNote |
| PUT /api/resources/{id}/favorite | setResourceFavorite | Persist favorite boolean without changing modified time |
| POST /api/resources/{id}/open | markResourceOpened | Update lastOpenedAt only; preserve modified time/content/organization |
| GET /api/resources/{id}/backlinks | getBacklinks | getBacklinks |
| POST /api/resources/{id}/replace-links | replaceResourceLinks | replaceResourceLinks |
| POST /api/resources/{id}/tags/{name} | attachTag | attachTag |
| DELETE /api/resources/{id}/tags/{name} | detachTag | detachTag |
| GET /api/tags | listTags | listTags |
| PUT /api/tags/{id}/color | setTagColor | setTagColor |
| DELETE /api/tags/{id} | deleteTag | deleteTag |
| POST /api/resources/file | uploadFile | uploadFile |
| POST /api/imports/preview | previewImport | previewImport |
| GET /api/resources/{id}/raw | readFile | readFile |
| GET /api/resources/{id}/download | downloadFile | downloadFile |
| GET /api/exports/{id}/download | downloadExport | downloadExport |
| GET /api/settings | getSettings | getSettings |
| PATCH /api/settings | patchSettings | Atomic changed-leaf settings merge; null removes a leaf |
| PUT /api/settings | replaceSettings | Local legacy replacement; rejected on HTTPS |
| GET /api/changes | watchWorkspaceChanges | Approved metadata-only SSE with cursor replay/reset |
| GET /api/settings/workspace | getWorkspaceSettings | getWorkspaceSettings |
| PUT /api/settings/workspace | updateWorkspaceSettings | updateWorkspaceSettings |
| DELETE /api/settings/workspace | resetWorkspaceSettings | resetWorkspaceSettings |
| POST /api/exports | startExport | startExport |
| POST /api/imports/{id}/commit | commitImport | Idempotent per import ID; replace requires confirmation=replace |
| GET /api/operations/activity | getOperationActivity | Count queued/running/cleanup transfers for lifecycle barriers |
| GET /api/operations/{id} | getOperation | getOperation |
| POST /api/operations/{id}/cancel | cancelOperation | cancelOperation |
| GET /api/export-formats | listExportFormats | listExportFormats |
| GET /api/health | getHealth | getHealth |
| GET /api/capabilities | getCapabilities | getCapabilities |
| GET /api/diagnostics/events | listDiagnosticEvents | listDiagnosticEvents |
| POST /api/diagnostics/events | recordDiagnosticEvents | recordDiagnosticEvents |
| GET /api/diagnostics/integrity | checkWorkspaceIntegrity | checkWorkspaceIntegrity |
| GET /api/openapi.json | getOpenApi | getOpenApi |

## Minimal note flow

Example JSON for POST /api/resources:

~~~json
{"type":"note","title":"Agent check","content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}}
~~~

Read the returned id, GET /api/resources/{id}, then PUT /api/resources/{id}/note with a complete title/content pair. A resource link is {"type":"resourceLink","attrs":{"resourceId":"target-id","label":"Target","type":"note"}} inside a paragraph. Saving rebuilds backlinks; GET the target's /backlinks to verify. Table attrs.sourceResourceId tracks the source asset and is remapped during import but is not a backlink edge. POST /resources/{old}/replace-links with {"newResourceId":"target-id"} rewrites stored documents and deletes the old resource; the IDs must differ.

Attach a tag with POST /resources/{id}/tags/{name}, list /tags, update its /color with {"color":"#336699"}, remove an association with DELETE on the same resource/tag route. Global tag deletion is separate. GET /settings before PUTting the complete document; retain local device entries and keybindings when editing workspace values. The /settings/workspace endpoints update only that section.

## Transfers

1. POST /exports with {"scope":"workspace","format":"zip"}. Poll GET /operations/{id} until SUCCEEDED or FAILED. Retrieve GET /exports/{id}/download only after success.
2. POST /imports/preview with multipart field file. Review resources/files/notes/tags counts and warnings. This stages data without replacing resources.
3. POST /imports/{id}/commit with {"mode":"merge"}, or {"mode":"replace","confirmation":"replace"}. Replacement is destructive and must be intentionally selected. Repeated commit requests return the same operation; a different mode is rejected.
4. Poll the operation. Refresh resources, tags and settings after success. Do not restart the backend. A failed commit is retried by uploading/previewing again.

Operation responses contain id, kind, status, phase, progress, mode, detail, requestId and counts. Statuses: QUEUED, RUNNING, PREVIEW, CLEANUP, SUCCEEDED, FAILED, CANCELLED. Counts are zero until known; progress reports phases. POST /operations/{id}/cancel cancels previews/queued work and requests cancellation during import preparation. Once committing begins, cancellation returns conflict. CLEANUP means metadata committed and old-file cleanup remains; restart retries cleanup if its detail reports failure.

Merge assigns new resource IDs, rewrites links/table source IDs, unifies normalized tags and retains existing settings/colors. Replace restores archived resource IDs and workspace settings while preserving device appearance/keybindings. Archives contain manifest/workspace JSON and binaries, never a live DB or passwords. Old encrypted archives are unsupported.

## Diagnostics and verification

GET /health checks database availability and reports ready/workspaceBusy. GET /diagnostics/integrity reports missing binaries, dangling references, invalid documents and document/backlink disagreement without repairs. POST /diagnostics/events accepts at most 20 events with id,timestamp,action,route,message,stack,requestId,build; fields are bounded and server receipt time controls retention. GET returns at most 200 events from the last 24 hours of this process. Do not put note bodies, files, secrets, or whole request payloads into diagnostic messages.

Run API smoke only for specific debugging or explicit requests, not every development change. Use scripts/api-smoke.mjs against **empty disposable storage only**. It requires --disposable and refuses an existing resource collection. It verifies notes/files/links/tables/tags/settings and ZIP merge/replace. See [OPERATIONS.md](OPERATIONS.md) for exact commands. API checks establish data correctness; they cannot prove dropdown visibility, positioning or usability. Component tests and manual browser checks cover those separately.

## Individual note exports

The note UI automatically requests the download after success. N5 adds optional graph scope and preview contracts. Status and download retries reuse the operation ID; POST creation is not idempotent and must not be blindly retried after an ambiguous network failure. See NOTE-EXPORTS.md for frontend lifecycle.

POST `/api/exports` with `{ "scope": "notes", "noteId": "<id>", "format": "md" }`. Formats: md, md-assets (ZIP), pdf, docx, discoverable from `/api/export-formats`. The operation snapshots the saved note and local assets before returning. UI callers must flush pending saves first. Poll `/api/operations/{id}`; after SUCCEEDED download `/api/exports/{id}/download`. Operation fields `filename`, `mediaType`, `warnings` describe the output; Content-Disposition/Content-Type match it. Read [NOTE-EXPORTS.md](../workspace/NOTE-EXPORTS.md) for fidelity, limits and retry behavior. HTTP errors retain problem details/request IDs; asynchronous rendering failures appear in operation detail with the originating request ID.

GET `/api/exports/notes/{id}/preview` (`previewNoteExportGraph`) returns saved outgoing graph counts, `noteIds`, `resourceIds`, warnings and `fingerprint`. Save participating notes and refresh preview, then POST `{ "scope":"notes", "noteId":"<id>", "format":"pdf", "links":"linked", "fingerprint":"<preview fingerprint>", "references":"true" }`. `links` defaults to `single`; references defaults to false. Changed graph returns 409 before creating an operation. Nodes/depth/byte-limit failures return 400; missing root returns 404. Missing downstream references are warnings. Graph Markdown always downloads a ZIP; PDF/DOCX with files also download ZIP, as reflected by operation filename/mediaType. The opaque fingerprint is a consistency validator, not an authorization token. API clients must not retry ambiguous POST failures blindly. Detailed traversal, output and limits: [Note exports](../workspace/NOTE-EXPORTS.md).

## Library browsing examples

`GET /api/resources?page=0&size=100&q=meeting&type=note&tag=backend&tag=project&sort=updated` returns summaries matching both tag names. `GET /api/resources?favorites=true&sort=title&size=12` filters pinned resources only; mixed sidebar shortcuts use `GET /api/organization/pins?size=12`. Details and resource summaries include `collections:[{id,name}]`, batched for lists without hydrating note bodies. `PUT /api/resources/{id}/favorite` with `{ "favorite": true }` returns 204; repeating it is safe. Version 2 workspace archives include resource and collection favorites plus memberships; merge remaps organization to new resources.

## Collections and tags

All routes participate in the workspace mutation gate, return X-Request-ID and use the same problem details as resource routes.

| Method and path | Operation ID | Contract |
| --- | --- | --- |
| GET /api/collections | listCollections | q, page, size (1–100), favorites; metadata page with id/name/favorite/count and exactMatch (query name exists regardless of page) |
| GET /api/collections/{id} | getCollection | name, pin state and membership count |
| PUT /api/collections/creations/{id} | createCollectionOnce | canonical client UUID; {name,resourceIds:[]}; atomic retry-safe creation and initial membership |
| PUT /api/collections/{id}/favorite | setCollectionPin | {favorite:boolean}; 204; preserves collection name |
| GET /api/organization/pins | listPinnedItems | q/page/size (1–100); mixed {id,kind,name,count} page, alphabetical name/kind/id |
| POST /api/organization/selection | getSelectedResourceMemberships | read-only {resourceIds:[1–100 IDs]}; [{id,name,selectedCount}], selected collections only |
| POST /api/collections | createCollection | {name,favorite?}; 201; unique normalized name |
| PUT /api/collections/{id} | updateCollection | {name,favorite?}; omitted favorite preserves current value |
| DELETE /api/collections/{id} | deleteCollection | 204; removes only collection/memberships, never resources |
| GET /api/tags/browse | browseTags | q/page/size (1–100); metadata page with id/name/color/count |
| POST /api/tags | createTag | {name}; 201; returns existing normalized tag if present |
| PUT /api/tags/{id}/name | renameTag | {name}; preserves memberships/color; duplicate name returns 409 |
| POST /api/organization/memberships | changeMemberships | {resourceIds,kind,targetId,action}; 204; atomic, idempotent add/remove |

Collection and tag names contain 1–100 trimmed characters. Collections preserve display casing; tag names normalize to lowercase. Collection/tag browsing is case-insensitive literal substring search, ordered by name then ID. Existing tag color/delete routes remain available.

Membership example:

~~~json
{"resourceIds":["note-id","file-id"],"kind":"collection","targetId":"collection-id","action":"add"}
~~~

kind is collection or tag; action is add or remove. Select 1–100 IDs; every resource and the target must exist before any changes apply. Other memberships are untouched. Use GET /api/resources?collection=collection-id&tag=meeting to verify the combined resulting membership. Collection deletion keeps notes/files. There is no bulk resource deletion API.

Archive version 2 includes workspace.organization.collections and workspace.organization.favorites, covered by the workspace JSON checksum. Preview reports organization counts and rejects invalid membership references. See [Library transfer rules](../workspace/LIBRARY.md) for merge/replace semantics.

U2 creation semantics: use a stable UUID for PUT /collections/creations/{id}. The name and sorted initial IDs define the request fingerprint. Identical retries return the current collection without reapplying initial memberships; a changed request or normalized-name collision returns 409. Initial resource IDs may be empty, at most 100. The older POST /collections remains a non-idempotent convenience API.

POST /resources accepts optional collectionId on creation. PUT /resources/imports/{id} accepts optional multipart collectionId; the destination participates in its immutable retry fingerprint. Missing collections fail before import file staging; membership and resource metadata commit in one transaction. Retry-safe file imports return an already-created resource even if its memberships were subsequently edited. Favorite fields and workspace ZIP v2 remain unchanged; the UI calls them pins.

## Saved-note search

GET /api/resources/query?q=worker%20allocation&type=note&page=0&size=50 returns ranked {resource,snippet} items and standard pagination. Optional collection, repeated tag and favorites filters match Library. q allows 500 characters/30 literal prefix terms; size is at most 100. Snippet text and UTF-16 highlight ranges are data, never HTML. No file bytes or unsaved drafts are indexed. See [SEARCH.md](../workspace/SEARCH.md) for ranking and lifecycle.

GET /api/diagnostics/search inspects coverage. POST /api/diagnostics/search/rebuild starts one asynchronous rebuild, then poll GET status until rebuilding=false and inspect complete/failure/invalidDocuments. Repeated POST while running returns that run. Search returns 503 while rebuilding/unavailable; resource calls may return 409 WORKSPACE_BUSY during individual batches. Request IDs correlate rebuild logs. These are ordinary shared APIs; no privileged execution endpoint is added.

K1 keyboard update does not change API contracts: native form submission uses the existing collection-creation UUID endpoint and rename endpoints. Collection suggestions are not a submission prerequisite; server uniqueness validation and retry fingerprints remain authoritative.

K2 collection add flow also reuses existing contracts: title-paginated GET /resources for selection/exact-name detection, POST /organization/memberships for each immediate add, and PUT /resources/imports/{id} with title/content/collectionId for atomic, retry-safe note creation. No new API or schema is introduced.

K3 frontend search mode is explicit: title (default) uses GET /resources?q=...; content uses GET /resources/query?q=.... Both receive the same optional collection/type/tag/favorites filters. The searchMode field is frontend-only and is never sent as an HTTP parameter. Empty-query content mode uses ordinary browsing within the selected scope. Endpoint defaults/contracts, FTS indexing and database schema are unchanged.

N2 navigation/shared editing changes use existing resource/save/preview APIs; no endpoint or revision contract changed. Pane/history state is frontend-only. N4 conditional revisions and N5 graph-export parameters are now available; see their authoritative sections. See [NAVIGATION.md](../workspace/NAVIGATION.md) and the workspace tracker.

N6 retains the existing API contracts. Concurrent application transactions serialize through the SQLite connection pool; conditional note updates still reject stale revisions with 412. See [INTEGRATION.md](../workspace/INTEGRATION.md) for disposable concurrency/replacement verification.

Desktop lifecycle checks GET /api/operations/activity, returning `{ "active": 0 }`. It counts persisted QUEUED, RUNNING and CLEANUP transfers, excluding PREVIEW and completed results. It is a read-only ordinary application API, not an HTTP server shutdown/control endpoint. The private desktop owner channel separately quiesces mutations and drains active work before shutdown.

D6 uses the existing host access/approval/sharing contracts; no workspace DTO, document format, database schema or endpoint changed. Main injects approved device credentials for paired HTTPS; JSON and native file requests verify the same host pin. Browser approval retry changes are UI-only. Discovery/window/profile operations are narrow Electron IPC, not privileged debug APIs. HOST-ACCESS.md owns current contracts and limits.

## D7 settings and saved-change contracts

OpenAPI 1.3.0 documents `patchSettings` and `watchWorkspaceChanges`. `PATCH /settings` atomically merges changed scalar leaves under workspace/local/keybindings; null removes a leaf. Different fields survive concurrent clients, while same-field edits are last committed wins. Full PUT remains local legacy only; HTTPS callers use PATCH. `GET /changes?cursor=...` is approved metadata-only SSE with bounded replay and reset on gaps/restart. Both browser and desktop use the ordinary approved application services. MULTI-DEVICE.md owns examples, bounds, revision requirements and reconciliation; no privileged debug execution endpoint exists.

D8 adds no backend update/schema endpoints. Installer/update orchestration is native main-only IPC, not an agent execution API. Compatibility requires protocol 1 and changeFeed/scopedSettings. Existing-server onboarding verifies /workspace/identity using an explicitly selected owner key or paired HTTPS; archives still use the same reviewed transfer APIs. See UPDATES.md for package manifests and local recovery.


## Device sidebar presentation — 0.3.0

Existing GET/PATCH /settings persists `local[deviceId].sidebarSections`, with known `pinned`, `recent`, `tags` entries, each `{visible:boolean,collapsed:boolean}`. Omitted/null entries normalize to visible/expanded; unknown section names are ignored. Scalar leaf patches preserve unrelated fields. There are no new endpoints, database migrations or portable archive fields. Update the host to 0.3.0 before relying on these fields: previous hosts discard them during normalization.

Browsing groups independently call GET /resources with type and size=12 (overview) or size=100 (selected type), q/title mode, collection/tag/favorites and sort; counts come from each filtered response. Pinned collections use GET /collections?favorites=true with the same sizes. Sidebar uses size=4 pinned and size=6 recent per type. Content opt-in continues through /resources/query with the existing collection scope and bounded snippets.
