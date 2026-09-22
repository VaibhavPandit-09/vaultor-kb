# Agent and UI API guide

The application and agents use the same unauthenticated API. Default origin: http://127.0.0.1:8080. Machine-readable specification: GET /api/openapi.json. Discover build/features at GET /api/capabilities and available export formats at GET /api/export-formats. Only workspace ZIP is enabled.

## Request and response rules

Send Content-Type: application/json except multipart file uploads. Note content is a structured Tiptap doc object; supply both title and content for updates. Titles contain 1–500 characters; tags 1–100. URL-encode path/query values. Resource DTOs omit storage paths. List resources with page (zero-based), size (1–200), and optional tag name; response is {items,page,size,totalItems,totalPages}. Search returns up to 200 title matches.

Send an optional X-Request-ID (1–80 alphanumeric, underscore or hyphen characters). The server returns it on every response or creates a UUID. Problem errors contain status, code, detail, requestId and fieldErrors where applicable. Codes include INVALID_REQUEST (400), NOT_FOUND (404), CONFLICT/WORKSPACE_BUSY (409), UPLOAD_TOO_LARGE (413) and INTERNAL_ERROR (500). Retry a busy request after the operation finishes; avoid blindly retrying non-idempotent creation.

## Endpoints

| Method and path | Stable operation ID | Purpose |
| --- | --- | --- |
| GET /api/resources | listResources | List resources with pagination |
| POST /api/resources | createNote | createNote |
| GET /api/resources/search | searchResources | Title search; capped at 200 results |
| GET /api/resources/{id} | getResource | getResource |
| DELETE /api/resources/{id} | deleteResource | deleteResource |
| PUT /api/resources/{id}/note | updateNote | updateNote |
| POST /api/resources/{id}/open | markResourceOpened | markResourceOpened |
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
| PUT /api/settings | replaceSettings | replaceSettings |
| GET /api/settings/workspace | getWorkspaceSettings | getWorkspaceSettings |
| PUT /api/settings/workspace | updateWorkspaceSettings | updateWorkspaceSettings |
| DELETE /api/settings/workspace | resetWorkspaceSettings | resetWorkspaceSettings |
| POST /api/exports | startExport | startExport |
| POST /api/imports/{id}/commit | commitImport | Idempotent per import ID; replace requires confirmation=replace |
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

Use scripts/api-smoke.mjs against **empty disposable storage only**. It requires --disposable and refuses an existing resource collection. It verifies notes/files/links/tables/tags/settings and ZIP merge/replace. See [OPERATIONS.md](OPERATIONS.md) for exact commands. API checks establish data correctness; they cannot prove dropdown visibility, positioning or usability. Component tests and manual browser checks cover those separately.
