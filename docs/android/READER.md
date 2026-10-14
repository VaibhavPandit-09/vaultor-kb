# Android reader and legacy recovery

Reviewed 2026-10-14. R1 alpha.9.1 implementation; see [ANDROID.md](ANDROID.md) for the authoritative delivery/transport/storage boundary and [tracker](../plans/workspace-companion-plan.md) for remaining work.

## Source map

- mobile/src/WorkspaceScreen.tsx: compact reader shell, approved workspace switching, Home/drawer/search, centralized Back and recovery destination.
- mobile/src/readerFeed.ts: normal events reconcile without reopening streams; closure resumes from the retained cursor, with bounded backoff and background cancellation.
- mobile/src/ReaderView.tsx: bounded typed read-only bridge; no changed/command/save handler.
- mobile/reader/render.js: schema-aware DOM construction. Stored JSON never becomes HTML/script/style; unknown nodes are visible placeholders. Rendering uses a 20,000 structured-node traversal budget and 64-depth guard; stress/OOM recovery remains an R2/R10 verification item.
- mobile/reader/index.js: load IDs, restored scroll, visible-image requests and link activation. No server transport/credentials.
- mobile/src/workspace.ts: saved-note loading/cache/journey/session state; retired edit/create/recovered-copy paths refuse dispatch.
- VaultorModule.kt: GET and recency-only API policy, encrypted recovery inventory/export. VaultorMedia.kt: authenticated previews, original media bytes and private legacy ZIP/SAF destination.

## Recovery contents and meaning

The private ZIP is a manual recovery handoff. recovery.json retains all draft versions, exact uncertain sent payloads/base revisions, creation and lifecycle identities. notes/*.md makes text readable without the old editor. uploads.json retains source binding and any acknowledged resourceId; uploads/{uuid}/original-name contains original retained bytes. An acknowledged resourceId is not proof that the original note placement succeeded. Unknown requests are not replayed or treated as rejected; compare host resources/status before manually recovering. No local item is cleared automatically, including a draft matching a later saved note. The on-screen inventory shows at most 50 entries with total counts; the ZIP includes every retained record.

A removed host, old replacement generation, missing original or absent network does not erase these records. Recovery/export has no required server request and cannot force the user to resolve every old item before reading. No new host resource creation is offered in R1: this avoids redirecting uncertain identities or recovered edits into the wrong workspace. Export's generated plaintext ZIP is user-requested recovery material in private cache/selected destination; protect it like the note originals. It is not encrypted and must never be committed, logged or uploaded as a release asset.

## Reading design gate

Reserve one compact topbar and give the rest to content; drawer and contextual sheets appear only on demand. Flat rows and type metadata retain the mixed-list direction. Tables/code have local horizontal overflow rather than widening the page. Linked notes use one reading surface; file previews are transient. Native frames are captured during installed-APK checks before any subsequent R2 polish. R2 must discuss the actual frames with the user, and must not reintroduce editing controls.

## Remaining boundaries

Explicit local reading preferences, outline/find and polished rich media are R2/R9 work. Current saved cache is not a downloaded workspace. Offline snapshots/reviews/import queues and exports have separate later gates. External text links remain readable text in R1 rather than arbitrary navigation. Unknown JSON can be retrieved in legacy recovery when locally retained; it is never stripped and saved back. Physical OLED, Samsung gestures and TalkBack on the user's phone remain user checks.

Library restoration waits for native content and viewport measurements, clamps to the current scroll range, and ignores premature offset events. Queries/scope/filters remain unchanged; same-query refreshes retain rows. Oversized legacy positions must be covered by the native ReaderListRestoreTest before publication.
