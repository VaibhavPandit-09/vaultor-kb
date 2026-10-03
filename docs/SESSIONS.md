# Working sessions and draft recovery

Implemented in N4; reviewed through N6, 2026-09-30. Navigation/journey behavior is described in [NAVIGATION.md](NAVIGATION.md); this document owns persistence and recovery behavior.

## Session restoration

`sessionStore.ts` uses IndexedDB database `vaultor-working-sessions`, version 1, object store `records`. Session snapshots include version, workspace identity/generation, pane order and IDs, focused pane, journeys/cursors, per-visit scroll/caret positions, and the last Library destination, collection, query, title/content mode, type, tags and sort. Bulk selection, preview state, fullscreen tables, menus, dialogs, export operations and download prompts are not restored. Restoration never replays navigation commands, recency writes or exports.

Snapshots are written on changed-state polling every 500 ms, with a best-effort pagehide write. These are layout snapshots, not editor documents. Current notes load first. Older visits are validated only if needed for missing-current fallback or subsequent navigation. A missing current note falls back to the nearest valid journey visit, preferring the previous step on equal distance, with visible explanation. Network errors retain the snapshot and offer Retry rather than treating notes as deleted. The current pane limit bounds restoration; extra panes' recovery records remain available. Library context survives visits to Collections/Pinned too. Missing collections remain scoped with the existing collection error/breadcrumb rather than silently widening search.

A sessionStorage tab token identifies refreshes. Web Locks prevent duplicated tabs (which can inherit sessionStorage) from claiming the same session record. A fresh tab seeds its own layout from the last saved session; the shared latest pointer does not modify other tabs' snapshots. Without Web Locks, each load claims a new independent token and seeds from the previous record. Tab recovery journals are separate. Drafts from another tab are offered as separate copies, never automatically written to their originals or deleted by this tab.

## Durable drafts and conflicts

`NoteRecovery` journals each pending title/content edit with an edit UUID, save version, original server revision, workspace generation and retry-safe recovered-copy ID. It also journals title text before Enter/blur submission; Escape cancels that staged title while preserving pending body edits. `SaveCoordinator` still debounces and serializes server writes. Successful responses acknowledge exactly the version written; newer pending edits remain journaled and receive the returned base revision. An older response cannot clear newer edits or rebase a replaced workspace. A cleared coordinator stops subsequent queued writes.

On startup, this tab's draft automatically recovers only when workspace generation and saved-note revision still match. Its normal save path uses the same conditional update, so a concurrent change between reading and saving still produces a conflict. Other-generation, other-tab, missing-note or conflicting drafts remain separate recovery entries. Startup conflicts are stored under independent keys so editing the saved note cannot replace the retained draft. Storage records are not purged merely because no pane can be restored.

The recovery banner opens Review drafts. Open recovered copy uses the existing retry-safe multipart creation contract and a stable ID for that edit, then opens the created note through normal pane navigation. Use saved version discards this tab's selected recovery draft and restores saved content when resolving a live conflict. It does not discard another tab's journal. Failed saves retain Retry save where applicable. Failures stay in the recovery dialog; duplicate actions are guarded. Other-tab copies remain in their owning journal even after this tab dismisses them, so they can be offered again on reopening.

## Server isolation

`GET /api/workspace/identity` returns opaque `id` and `generation`. Internal settings keys `workspace_identity` and `workspace_generation` persist across restart. A replacement import changes generation inside the same transaction as resource replacement; rollback preserves it. Merge keeps it. These keys and all browser sessions/drafts are excluded from portable archives.

Resource details include an opaque `revision`, derived from an internal random seed and JPA optimistic version. Existing databases gain `revision_number` with default zero and nullable `revision_seed`; new/imported resources receive new seeds. Even replacement with identical resource IDs/content invalidates old validators. Ordinary note saves send quoted `If-Match`; mismatch/optimistic-lock rejection returns 412 `NOTE_REVISION_CONFLICT`. Metadata updates through JPA can also invalidate revisions conservatively. Opening a note/pinning through direct SQL does not change the validator. Read fresh detail after other metadata operations. API clients may explicitly omit the precondition for unconditional writes; the application never does so for note saves.

The app checks workspace identity on focus and every 15 seconds. A changed identity/generation clears the former layout and shows previous drafts as recovery copies. Revision validation protects edits before that check completes. Transfers initiated in this tab refresh identity immediately. Neither sessions nor revisions implement live collaboration between browser tabs.

## Limits and failure handling

Storage errors are visible and retryable without disabling editing or successful server saves. Exit warnings remain while saves, staged drafts or journal writes are outstanding. IndexedDB, pagehide writes and unload handlers cannot guarantee survival of every abrupt termination. Recently changed layout/reading position can lag up to the snapshot interval. Browser storage is origin-specific: switching hostname, port or browser profile creates a different store; clearing site data removes it. Sessions/journals have no automatic age-based pruning in this sprint.

Caret positions are numeric and clamped to the restored document; there is no semantic anchoring across server edits while away. The shared editor undo history is not persisted. Recovering a copy does not duplicate its linked resource graph (linked-graph export is a separate export operation).

Validation: frontend compilation, focused IndexedDB/tab identity/journal/restore/Library/recovery component tests, and a disposable SQLite HTTP/transfer test covering existing-schema upgrade, conditional updates, stale rejection, generation rollback and replacement. N6 added malformed-record validation and checked real Dashboard refresh restoration using disposable storage; see [INTEGRATION.md](INTEGRATION.md). Invalid layouts are discarded with an explanation while recovery journals remain readable. No production data or Docker rebuild.
