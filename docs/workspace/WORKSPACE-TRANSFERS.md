# Workspace ZIP transfers and independent desktop copies

Reviewed2026-10-14; implemented in0.10.0/W3. [WORKSPACES.md](../architecture/WORKSPACES.md) owns host isolation/selection; this document owns whole-workspace transfers. Individual note exports remain in NOTE-EXPORTS.md.

## User flows

Open the sidebar workspace selector. From an owner connection, choose a destination name and **Import ZIP as new workspace**, review counts/warnings, then **Create separate workspace**. The host publishes only the complete result. Existing workspaces stay intact. **Open workspace** uses the normal save/protection/scope-switch barrier. Import is the default Library import direction on capable owner hosts; **Modify current workspace…** explicitly retains legacy merge/replacement choices. Older hosts keep their existing import flow.

Desktop connected to an external server offers **Make local copy**. Saving/protection precedes capturing that selected workspace. Main streams its prepared ZIP through private disk, validates source identity/generation again, and uploads it to the owned This computer server for the same preview/commit review. The result has a new workspace identity and retains IDs *within that isolated destination*. It never synchronizes with the source. Source host/workspace/generation and preparation time are private provenance in the destination import receipt. They are excluded from portable exports. Returning to the source later does not merge either fork.

Browser owner clients can import to their authorized host and download host-prepared ZIPs. A browser does not run a local server or create an independent browser database. Android is unchanged by W3; reader retirement and full/offline companion exports remain later R sprints.

**Export this workspace** flushes/protects its current edits and exports one selected workspace. Download/status retry uses the same successful artifact. It includes active resources *and Trash*, original files, structured documents, tags, collections/pins/recency, portable review evidence/status and portable workspace settings. It excludes local appearance, keyboard bindings, sessions, drafts, credentials, host catalog/grants, routing identity/generation, copy/import receipts and private update backups. Finish pending permanent-deletion cleanup before a complete export. A prepared export is a fixed snapshot, not a live sync or private full-data-directory backup. Reload does not automatically download old exports.

R5/0.12.0 emits archive4 with a required review evidence section. Earlier supported archives1–3 import with no reviews; older hosts reject4. Synced review provenance is portable, while private validators/routing identity are omitted; [REVIEWS.md](REVIEWS.md) owns remapping and retention.

## Private staging and atomic publication

Host-private workspace-imports/UUID contains receipt.json, archive.zip and a staging workspace until completion. Catalog reservation is reconstructed from receipts before serving requests; pending imports consume the existing eight-workspace limit without appearing in lists or authorizing access. Only one unfinished import per host is admitted. Its independent domain context shares existing shutdown tracking; no global datasource is switched.

Validation reuses the strict archive parser: default512MiB compressed,2GiB expanded,20,000 entries,20MiB per JSON entry, safe/unique names, checksums/counts, structured-document/organization validation and supported archive versions1–4. Effective multipart request limits include overhead. Originals never convert. No raw live SQLite database is transferred over the network.

Commit imports into staging with preserved resource IDs, closes its context/database/workers, marks READY, atomically renames the workspace directory on the same filesystem and then atomically publishes its catalog entry. MOVED/READY receipts reconcile after interruption. The private fork-origin.json marker binds publication to the import UUID/archive SHA256. Existing destination storage is never overwritten. Successful receipts survive renaming of the new workspace. Duplicate names are permitted; UUIDs identify workspaces.

Source resources remain untouched on invalid ZIPs, disk failure, interrupted upload/commit, source-generation mismatch or lost responses. Validation/commit failures retain UUID/name/hash/origin for Retry or explicit uncommitted cancellation. Known interrupted validation becomes retryable rather than permanently busy. A successful committed import is not cancellable/deletable through this endpoint. Cancellation only closes/removes private staging and can retry incomplete cleanup. Success removes the extra uploaded ZIP; imported-operation artifacts retain the existing transfer-service policy.

Receipts are version1, bounded to128 retained identities; no automatic receipt eviction/reuse. At the bound new transfers are refused with existing identities intact. Desktop also bounds retained copy journals to128 and allows one unfinished local copy, with a512MiB ZIP stream limit and partial-file cleanup. Verified snapshots can resume upload while the source is offline. Pending copies are discoverable from the selector on This computer or another connection; retry preparation requires its original source, cancellation can release an uncommitted cached copy. The native journal never contains credentials, certificate keys or user-selected filesystem destinations.

An orderly owned-host shutdown/update waits for all workspace operations, including private fork work. Abrupt loss cannot guarantee a final storage flush. Preserve the entire stopped owned data tree for private recovery. Do not downgrade to a host that lacks W3 while an import is pending: older hosts do not understand reservations/receipts.

## API and compatibility

API/minimum client3/3, archive3, updater1 and resource schema remain unchanged. Capabilities adds workspaceImports:true. The following host-level routes require OWNER before multipart parsing and retain normal TLS/cookie/CSRF checks. X-Vaultor-Workspace does not redirect them.

| Route | Meaning |
| --- | --- |
| GET /api/workspace-imports | At most128 private receipt records |
| PUT /api/workspace-imports/{UUID} | Multipart name/file and optional JSON origin {hostId,workspaceId,generation}; bounded preview, identical name/origin/bytes retry |
| GET /api/workspace-imports/{UUID} | Current/reconciled receipt |
| POST /api/workspace-imports/{UUID}/commit | Idempotent asynchronous create/publication |
| DELETE /api/workspace-imports/{UUID} | Cancel uncommitted staging; repeated cleanup safe |

Receipt: {version,id,name,sha256,state,operationId,preview,origin,copiedAt,detail}; states VALIDATING,PREVIEW,COMMITTING,READY,MOVED,SUCCEEDED,FAILED,CANCELLED. Transfer details preserve operation IDs internally; UI uses compact status/Retry. Same UUID with different name/origin/hash conflicts. New workspaces have no implicit paired-device grants. Paired clients can export authorized workspaces but cannot create/manage host workspaces through these owner routes.

Existing /exports, /operations and scoped /imports APIs remain. On0.10.0, replacement of a populated workspace writes a consistent **replacement-before.zip** into its private operations/operationUUID directory before data mutation. Failure to create this checkpoint aborts replacement. The subsequent database transaction changes generation. Recovery is an explicit import of that ZIP through an owner flow; this is not a scheduled backup system or automatic rollback button. New empty staging imports need no previous-data checkpoint.

Future synced reviews and partial bundles require an explicitly versioned portable extension. Current parsers reject unsupported entries/versions rather than silently strip new sections. Unsynced queue/draft recovery is always separate; it must not be included or acknowledged merely by ordinary export/import.

## Verification boundary

Focused tests cover private previews, UUID/name/hash retries, original bytes/IDs, cancel/reservation cleanup, resumed READY publication, renamed completed receipts, owner multipart and paired denial, checkpoint/generation, stale source generation, cached offline upload retry and protected source switching. Disposable native/browser UI and two independent loopback-owned host copy tests exercise real services/streams. Versioned release notes own exact final package checks. These are not proof of Mac/Wi-Fi/Samsung hardware; no phone or personal workspace is accessed.
