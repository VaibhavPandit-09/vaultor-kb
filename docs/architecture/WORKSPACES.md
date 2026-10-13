# Host workspaces and client selection

Reviewed2026-10-14. W1 implements server-side isolation; W2 adds desktop/browser/Android selection and owner grant management. W3 adds import-as-new and independent desktop snapshot copies; WORKSPACE-TRANSFERS.md owns their workflow. [The execution tracker](../plans/workspace-companion-plan.md) owns sequence and actual release evidence.

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
| GET /api/owner/workspaces/{id}/grants | Owner lists paired client devices as `{deviceId,name,allowed}` using effective permission |
| PUT /api/owner/workspaces/{id}/grants | Owner sets `{deviceId,allowed}` for an already approved device |

Creating a workspace grants no paired device access. Existing and subsequent normal host approvals receive only the fixed default workspace unless explicitly denied there. Owner is always authorized. Explicit true/false grants survive restart; false overrides default inheritance. Granting access does not pair an unapproved device. Owner management requests retain existing 16KiB/rate/CSRF limits. No per-resource permission model is introduced.

Grant revocation closes the workspace's streams immediately. Delivery/heartbeat also recheck workspace grants and global device approval. Global revocation stops streams on the next check in additional contexts and immediately on the main event listener. A queued transfer captures its admitting device and checks access again before execution. Already executing authorized operations and ordinary requests are not retroactively rolled back; operation inspection/download still require current grants. These guarantees do not imply remote erasure of previously downloaded bytes.

## Shutdown and compatibility

Desktop's private stop channel quiesces all opened contexts, emits restart notices and waits for admitted requests/transfers across all workspaces before closing. Failed orderly stop resumes every gate. Child transfer shutdown waits a bounded time before interruption; interrupted transfers retain their existing restart/retry semantics. Abrupt process termination is never a guaranteed final flush.

Existing clients continue to use the default workspace with existing save/revision rules. W2 clients carry explicit scope across JSON, streaming, binary, native files and sessions. Android full offline companions remain R3/R4; the existing clean cache is not a workspace download.

## Verification boundary

Use disposable SQLite/file roots. Focused tests cover adoption, identity/corruption/restart, UUID retries/limits, concurrent requests with equal resource IDs, original-byte isolation, separate gates/search/transfer status, multipart upload, Trash, actual scoped SSE and approved HTTPS grant/revocation. A stale existing contract test expecting protocol2 was corrected to the already-shipped protocol3; production protocol was not advanced. Initial child lazy-association failure required the existing request entity-manager configuration; missing child notification filtering was corrected with selected-feed publication. Release notes/tracker record actual final counts and packaged results. No new visual layout or phone access is needed for W1.

## Client selection — W2

The sidebar workspace name opens a bounded searchable selector; the adjacent desktop ellipsis opens server connections/hosting. These are separate choices. Owners can create with a persisted caller UUID, rename, and explicitly change each paired device grant. Android lists only approved workspaces and offers no owner administration. Existing hosts without multiWorkspace retain their single-workspace experience.

Desktop main owns selectedWorkspaceId per remembered server, independently of legacy workspaceId identity metadata. Probes use global capabilities, then explicitly scoped identity; activation rechecks destination before committing the profile, resetting native files/streams and rotating the transport token. A revoked saved selection can be changed through Connections → Workspaces without opening that workspace. The desktop currently enforces one application window; independent browser tabs use sessionStorage selection and do not redirect one another.

Browser selection first probes the destination, runs the existing save/recovery/settings barrier, rechecks generation and commits the tab selection. Failed probes/save protection retain the mounted source and offer Retry/Keep drafts when safe. Scoped App remount restores that workspace's IndexedDB session (panes, journeys, Library context and reading positions), closing transient surfaces. Note/settings writes queued before switching retain their source epoch and are rejected after a switch. Browser JSON/blob requests and SSE use the same selected header. Workspace identity/grants are never guessed from a name.

Device presentation is cached in vaultor-device-presentation-v1 in device-local browser storage, applied before settings load, and overlaid on the selected workspace settings document. Local patches still use the existing scoped API; workspace/keybinding patch boundaries remain unchanged. The cache is outside portable archives. Blocked local storage falls back to host preferences; browser tab selection requires working session storage to persist a switch.

Android selects through the epoch-bound native bridge. It verifies pinned host/capabilities and destination identity/generation before atomically persisting selection and cancelling previous requests/media/SSE. Legacy unscoped bridge mutations are refused. Sessions/recovery/cache remain host/workspace/generation scoped; equal resource IDs are independent. Switching protects the source draft and saves by default; explicit Keep drafts retains its encrypted recovery record. Re-pairing the same host preserves explicit selection. Offline restore refuses an ambiguous collection of cached workspace scopes; complete offline workspace selection is not yet delivered. Android editing remains transitional until R1.

Grant revocation must never trigger fallback to the default. Lists remain host-level so another authorized destination can be selected. Already cached files cannot be remotely recalled. Multi-window desktop selection and downloaded offline companions are not claimed.

## W3 publication and staging

WorkspaceImports privately reserves one unfinished import within the eight-workspace bound; reservation is reconstructed from durable receipts. Registry.prepare opens its isolated staging context without publishing/authorizing a catalog entry. READY/MOVED publication closes storage before atomic directory rename/catalog publication; published forks preserve resource IDs in their new identity. Registry host-work admission participates in private stop/drain. Workspace ZIP transfer/copy contracts,128 receipt bounds, original bytes, provenance, replacement checkpoints and future portable extension rules are authoritative in [WORKSPACE-TRANSFERS.md](../workspace/WORKSPACE-TRANSFERS.md). No datasource switch, Android mutation or protocol/archive migration.
