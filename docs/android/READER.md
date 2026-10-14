# Android reader and legacy recovery

Reviewed 2026-10-14. R2 alpha.10 reading refinement is published; see [ANDROID.md](ANDROID.md) for delivery/transport/storage and [tracker](../plans/workspace-companion-plan.md) for remaining work.

## Source map

- mobile/src/WorkspaceScreen.tsx: compact reader shell, approved workspace switching, Home/drawer/search, centralized Back and recovery destination.
- mobile/src/readerFeed.ts: normal events reconcile without reopening streams; closure resumes from the retained cursor, bounded backoff/background cancellation.
- mobile/src/ReaderView.tsx: typed source-bound read-only commands; no editing/save handler.
- mobile/reader/render.js: safe schema-aware DOM,20,000node traversal/64depth limits, explicit unknown/limit placeholders. Stored JSON never becomes HTML/script/style.
- mobile/reader/index.js: outline/find, load tickets, revision-checked positions, lazy native thumbnails and confirmed link requests. No transport/credentials.
- mobile/src/reading.ts, ui.ts, ReadingControls.tsx: normalized device preferences, semantic colors and flat reading controls.
- mobile/src/workspace.ts: saved-note cache/journeys/sessions; retired edit/create/recovered-copy paths refuse dispatch.
- VaultorModule.kt: GET/recency-only policy, device reading metadata and encrypted recovery inventory/export. VaultorMedia.kt/ResourcePreview.tsx/reader/media.*: authenticated full-screen previews and original-file output.

## Recovery contents and meaning

Private Legacy recovery ZIP retains all draft versions, exact uncertain sent payloads/base revisions, creation/lifecycle identities in recovery.json. notes/*.md provides readable text; uploads.json records source binding/acknowledged resourceId; uploads/{uuid}/original-name retains pending original bytes. A resourceId does not prove note placement succeeded. Unknown writes are never replayed or treated as rejected. Compare host resources/status before manually recovering; no record is automatically cleared, including drafts matching saved notes. Inventory displays50entries with total counts; ZIP includes all records.

Removed hosts, old generations, missing originals and absent network do not erase recovery. Export has no required server request. The private plaintext ZIP contains no credentials and never overwrites originals; protect it like notes, never commit/log/publish it. It is not an encrypted workspace archive/import input. Source creation/recovery as new host resources remains unavailable until separately authorized imports. Recovery is independent of reading and cannot force resolution before reading.

## Reading presentation and controls

One compact topbar gives space to content. Reading options exposes Outline, Find within note, Reading appearance and Journey; no permanent editing toolbar/nested-card note layout. Headings, lists, quotes, marks, tables/code and read-only tasks preserve meaning. Tables/code scroll horizontally within blocks; pages stay vertical. Text/link labels use native WebView selection/copy.

Outline lists256headings maximum without recording visits. Find accepts200characters, literal case-insensitive matching across inline marks within blocks, max500matches, Previous/Next. CSS Highlights preserves document text nodes/selection. It searches saved note content only. Search snippets are not guessed into locators; explicit reference occurrences jump only with matching source revision, valid structured path and target ID. Drift leaves reading intact.

Reading appearance is device-local: OS(default), Light, Dark, OLED; Blue/Violet/Mint/Amber; text14–28px, spacing1.4–2.2, measure320–800CSSpx, Snappy/Smooth. System font scaling is additional. OS follows Light/Dark; OLED is opaque black, Dark neutral#101114. Changes update tokens without replacing DOM. Separate native SharedPreferences remain outside archives/recovery; failures retain values with Retry. Smooth fades only new note visits for200ms; preferences/find/refresh do not animate text. OS reduced motion overrides it.

Selectable resource anchors have focus/accessibility labels. Links replace the reader; direct opens start a trail. Cycles/branches retain distinct visits bounded200. Earlier visits of the same resource restore their own positions. Positions contain scroll, structured block path/offset and source revision; anchors restore only with matching revision, otherwise bounded scroll. User gestures cancel delayed restoration. Navigation failures keep source/trail; explicit Library navigation supersedes pending linked requests. Hidden readers cannot journal clamped positions. Backgrounding flushes position without modifying JSON/recovery.

Back dismisses previews/pickers/find/drawer before history/origin. Files never advance journeys. Native preview dismissal returns to the mounted source and its position; reading sheets own native focus. External HTTP(S) requires confirmation showing destination. Embedded credentials/control/whitespace and file/javascript/intent/unknown schemes are refused by renderer and native bridge. Remote images are never fetched automatically. Offline links outside the limited saved copy offer Connect and open / Keep reading; complete offline downloads awaitR3/R4.

Full-screen image/PDF behavior, limits, scoped positions and original-file output are authoritative in [MEDIA.md](MEDIA.md). Unknown content is retained, never stripped/autosaved. Larger stress/OOM verification remainsR10; physical Samsung/OneUI/OLED/TalkBack acceptance is user-owned.

Library restoration waits for native content/viewport measurements, bounds offsets and ignores premature events. Query/scope/filters and cached rows survive refreshes. ReaderListRestoreTest covers oversized legacy positions fromR1. R2 native acceptance and actual release bytes are recorded in [alpha.10 notes](releases/0.1.0-alpha.10.md).
