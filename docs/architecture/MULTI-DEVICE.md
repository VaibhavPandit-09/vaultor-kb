# Saved changes across devices

Reviewed 2026-10-04, desktop D7. Browser and desktop clients reconcile saved state from the selected host. This is saved-change notification, not collaborative typing or offline synchronization. Note JSON, archives and workspace ownership are unchanged. [HOST-ACCESS.md](../security/HOST-ACCESS.md) owns approval/trust; [SESSIONS.md](../workspace/SESSIONS.md) owns draft recovery.

## Feed and ownership

Approved clients open `GET /api/changes?cursor=<last cursor>`. SSE data contains only `cursor`, `kind`, `ids`, `requestId`, `at` and workspace `generation`. Kinds are reset, resources, tags, settings, organization, workspace, operation and host-restart. Bodies, titles, files, commands and credentials never travel in notifications. Ordinary synchronous mutations publish after successful service completion; transfer metadata publishes after its transaction commits, followed by reconciliation after the mutation gate opens. Rollbacks, failed writes, recency updates and read-only membership queries do not publish mutations.

The process retains at most 1,000 events for ten minutes. Cursors combine a process UUID and sequence; restart, invalid/outdated cursor or a replay gap exceeding 64 events yields reset. There are at most 64 streams, five-second heartbeats and a two-minute stream lifetime. Delivery uses one daemon worker and a bounded 128-task queue; saturation disconnects clients instead of blocking commits. Device revocation closes its streams immediately, with active-device checks on delivery/heartbeat. Streams hold no request EntityManager/SQLite connection; ordinary MVC still supports lazy DTO associations through `RequestEntityManager`.

Browser streams use approved same-origin cookies. Desktop `change-stream.mjs` uses the same pinned connection/credential as JSON, forwards bounded metadata through narrow IPC and cancels on profile activation. Credentials stay in main. Parsers bound incomplete frames to 32 KiB. Frontend reconnect backs off from about one second to 30 seconds with jitter, remembers its cursor and coalesces refreshes for 250 ms. Batches retain at most eight categories/100 IDs; larger ID unions broaden to full invalidation rather than dropping resources. Known local request IDs are bounded to 256/ten minutes and suppress duplicate self-refresh, except workspace notifications. Focus reconciles even after missing events. No mutation, command, import or download is replayed.

## Reconciliation and recovery

Sidebar/Library keep existing rows mounted. Scoped notifications refresh affected metadata, tags, collections, pins and backlinks. Only clean open notes accept authoritative saved content/title/revision. Mounted views receive a mirror transaction with selection clamped to the new document and obsolete shared undo history cleared; this does not enqueue another save. Dirty title/content/undo and their base revision remain local. A changed server revision prompts Review drafts; normal conditional saving also rejects stale edits.

A remotely deleted open note stays displayed and is marked unavailable. Its content remains in the recovery journal and can become a recovered copy. Workspace-generation changes invalidate the former layout/dialogs/previews, retain old drafts as separate copies and return to Library. No former command or export is resumed automatically. Transfer notifications reconcile again after the gate releases so temporary busy responses cannot leave clients permanently stale. Offline or background read failures remain diagnostic/local feedback rather than a global save error; edits remain usable.

## Mutation contracts

Use `PATCH /api/settings` with changed leaves only, for example:

```json
{"workspace":{"maxOpenNotes":3},"local":{"device-id":{"theme":"os"}}}
```

The server transaction merges into the latest document, normalizes and saves atomically. Roots are workspace/local/keybindings, input is at most 64 KiB, object nesting at most four, and keys at most 100 characters. Null removes/reset-defaults a leaf. Different fields survive concurrent clients; edits to the same leaf are last committed wins. Frontend serializes patches, retains failed leaves for retry, defers refresh while writes are pending and rejects stale read/write responses. `PUT /api/settings` remains local legacy only; HTTPS callers must use PATCH. `/settings/workspace` also merges atomically. Upgrade frontend and backend together; protocol 1 alone does not establish availability of these D7 endpoints. Capabilities advertise `changeFeed` and `scopedSettings`.

HTTPS note updates require `If-Match` with the opaque revision: missing is 428 NOTE_REVISION_REQUIRED, stale is 412 NOTE_REVISION_CONFLICT. Local legacy unconditional writes remain allowed; the current UI sends revisions on every note save. Tag association mutations are transactional. Pins and collection membership use existing APIs and archive representation.

## Actual checks and limits

D7 production frontend/desktop build, Java main/test compilation/JAR staging, syntax and targeted lint passed. Twenty-nine focused frontend cases, one native stream Node case and one real disposable owner/approved-HTTPS integration case passed. The backend case covers concurrent scoped settings, stale/missing revisions, metadata-only events, membership/tags/pins, archive merge/replacement, rollback/no-event, replay/gap bounds and revocation. A targeted Windows native session checked actual OS pointer hits for menu/minimize/maximize/restore/close in Library and notes, OS theme changes, saved remote editing without echo saves, and remote deletion recovery. Dark/light/narrow frames were inspected. Earlier checks found and fixed SQLite connection retention by SSE and a native stream incorrectly using browser fallback.

No Docker rebuild, broad API smoke, user-workspace mutation or OS trust/firewall/login changes. Real Windows–Mac discovery/browser trust, Mac native behavior and prolonged fault/load testing remain D9. Remote draft conflict recovery reuses existing revision tests; it is not real-time document merging. Do not open multiple backend processes against one SQLite database. File contents are not searched or synchronized offline. Native icon branding is configured, but existing Electron executable/pinned shortcut branding awaits D8 installers.
