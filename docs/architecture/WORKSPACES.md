# Host workspace foundation

Reviewed 2026-10-13. W1 implements server-side workspace isolation. Workspace selectors, import-as-new and desktop copy UI belong to W2/W3 and are not shipped here. [The execution tracker](../plans/workspace-companion-plan.md) owns sequence and actual release evidence.

## Architecture decision — W1

Use an independent Spring domain/JPA context per workspace inside the existing JVM/listener. The existing application context continues to serve the adopted default workspace. Additional contexts have their own SQLite datasource/entity manager/transaction manager, repositories, settings, files, FTS/file-index workers, image services, transfer operations, lifecycle receipts, maintenance gate and change feed. They share only the existing host approval service and servlet container/configuration. No mutable global active datasource, thread-local workspace routing, additional server port or JVM per workspace is introduced.

`WorkspaceRegistry` opens contexts on demand and retains them until host shutdown. The catalog is limited to eight workspaces total, so at most seven additional contexts exist. This conservative bound prevents unbounded threads/connections/metadata; it is not evidence of eight-workspace performance. A context's services capture immutable dependencies, so a delayed transfer/search job cannot change storage when another client selects a workspace. Request JPA association loading and change notifications apply to the selected context; SSE excludes request entity-manager ownership.

## Storage and adoption

The existing configured database and file paths remain unchanged. The existing workspace ID/generation and host/device approvals remain intact. The catalog lives at the sibling `workspaces/` of the configured host-access directory:

```text
workspaces/
  catalog.json                  private version1 catalog, names and per-device grants
  legacy-adoption.db            consistent SQLite checkpoint before catalog adoption
  <workspace UUID>/
    app.db                      independent workspace metadata
    files/                      original files, derived bounded caches/scratch
    operations/                 workspace-specific transfer staging/artifacts
```

Before initial catalog publication, SQLite VACUUM INTO writes a temporary checkpoint, atomically renames it and quick-checks it; catalog publication uses forced private temporary-file/atomic replacement. Live files never move. A crash before publication permits retry; incomplete temporary checkpoints are not accepted as completion. The checkpoint is metadata recovery, not a complete backup of original files. Protect the existing database/files and host directory together before manual recovery. Do not roll back a live database blindly.

Malformed/oversized catalogs, identity mismatch, invalid UUIDs, symbolic-link catalog/storage paths, damaged checkpoints or a missing catalog alongside existing workspace UUID directories fail rather than reset. A persisted creation whose context failed can be retried with the same UUID/name. Creation does not delete its files on failure. Files must stay under server-owned UUID paths; no client path input exists. Names contain 1–100 non-control characters; duplicate display names are permitted because UUIDs identify destinations.

The host owns this catalog; workspace portable exports never contain it, grants, host identities/credentials or generation. Archives remain format3. Current replacement changes only that workspace's generation. There is no workspace deletion/catalog-recovery UI in W1. Existing updater private recovery inventory copies the entire stopped owned data tree, including the new directories; private backups must not be shared as portable archives.

## HTTP contract

API protocol/minimum client remain **3/3**: this is additive. Archive3 and updater1 remain unchanged. `GET /api/capabilities` adds `multiWorkspace:true`, `workspaceHeader:"X-Vaultor-Workspace"`, `workspaceLimit:8`. Unauthenticated capabilities exposes features only; it cannot select or inspect a workspace.

For workspace-domain APIs, send the canonical UUID header **X-Vaultor-Workspace**. It applies to resources/bytes/previews, collections/tags/organization/settings, workspace identity, search/index diagnostics, health, changes, imports/exports/operations and export formats. The response echoes the selected ID. Omitting it always targets the fixed adopted default workspace, preserving existing desktop/browser/Android clients. It never means another client's most recent selection. No selected-workspace state lives on the connection or host.

Host approval, pairing and owner controls remain host-level. Workspace catalog/list endpoints explicitly identify destinations and do not accept the header as a global switch. Authentication/CSRF/canonical path/TLS checks precede workspace resolution, then grants are checked before opening a context and before dispatch. Unauthorized and absent workspace IDs both yield 404 WORKSPACE_UNAVAILABLE; malformed IDs yield 400 INVALID_WORKSPACE. Workspace maintenance remains 409 WORKSPACE_BUSY and does not gate other workspaces. Internal context failures preserve data and report server failure, not fallback to default.

| Method/path | Result/authority |
| --- | --- |
| GET /api/workspaces | Bounded array of authorized `{id,name}` summaries; owner sees all |
| GET /api/workspaces/{id} | Authorized `{id,name,generation,legacyDefault}` |
| PUT /api/owner/workspaces/{id} | Owner creates/initializes with `{name}`; caller-generated UUID makes identical retries safe; differing name conflicts |
| PATCH /api/owner/workspaces/{id} | Owner renames with `{name}`; workspace identity stays unchanged |
| PUT /api/owner/workspaces/{id}/grants | Owner sets `{deviceId,allowed}` for an already approved device |

Creating a workspace grants no paired device access. Existing and subsequent normal host approvals receive only the fixed default workspace unless explicitly denied there. Owner is always authorized. Explicit true/false grants survive restart; false overrides default inheritance. Granting access does not pair an unapproved device. Owner management requests retain existing 16KiB/rate/CSRF limits. No per-resource permission model is introduced.

Grant revocation closes the workspace's streams immediately. Delivery/heartbeat also recheck workspace grants and global device approval. Global revocation stops streams on the next check in additional contexts and immediately on the main event listener. A queued transfer captures its admitting device and checks access again before execution. Already executing authorized operations and ordinary requests are not retroactively rolled back; operation inspection/download still require current grants. These guarantees do not imply remote erasure of previously downloaded bytes.

## Shutdown and compatibility

Desktop's private stop channel quiesces all opened contexts, emits restart notices and waits for admitted requests/transfers across all workspaces before closing. Failed orderly stop resumes every gate. Child transfer shutdown waits a bounded time before interruption; interrupted transfers retain their existing restart/retry semantics. Abrupt process termination is never a guaranteed final flush.

Existing clients continue to use the default workspace with existing save/revision rules. W1 does not provide workspace selection in renderer/native clients or new Android offline capabilities. W2 must carry explicit scope across JSON, streaming, binary, native files, windows/tabs and sessions before exposing selectors. Do not add a selector that only changes JSON requests.

## Verification boundary

Use disposable SQLite/file roots. Focused tests cover adoption, identity/corruption/restart, UUID retries/limits, concurrent requests with equal resource IDs, original-byte isolation, separate gates/search/transfer status, multipart upload, Trash, actual scoped SSE and approved HTTPS grant/revocation. A stale existing contract test expecting protocol2 was corrected to the already-shipped protocol3; production protocol was not advanced. Initial child lazy-association failure required the existing request entity-manager configuration; missing child notification filtering was corrected with selected-feed publication. Release notes/tracker record actual final counts and packaged results. No new visual layout or phone access is needed for W1.
