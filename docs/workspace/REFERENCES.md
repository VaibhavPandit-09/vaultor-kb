# Saved references and resource discovery

Reviewed 2026-10-08; implemented in 0.6.0. Images, PDFs, Audio, Video, Text and Other files are **file categories**, not new resource types. Notes and Files remain the domain model; Collections and Tags remain organization. See [LIBRARY.md](LIBRARY.md), [IMAGES.md](IMAGES.md) and [API.md](../development/API.md).

## Discovery and thumbnails

The single searchable Type filter includes Files as an umbrella plus the file categories. Library/Recent/collection pages and pins intersect category with title/content mode, collection, tags and pins **before** server totals/paging. One mixed query remains one mixed query; no query or sidebar block per descriptor. Type changes retain query/mode/scope, reset page/selection and discard superseded responses. Missing `appliedCategory` acknowledgment on older hosts gives an update explanation instead of silently displaying all files.

`resourceKinds.ts` owns labels/icons/opening capabilities. Image/PDF/etc. is the concise primary label, with format metadata where useful. Inline links load shared bounded metadata (200 entries, 30-second reuse) to identify the current category; stored labels are unchanged. Unknown domain kinds use a neutral icon and cannot be guessed into file previews.

New imports/uploads and archive binary copies use bounded 8 KiB signature/UTF-8 inspection, outside metadata transactions, to classify recognized formats rather than trusting filenames or image MIME claims. Signatures cover PNG/JPEG/GIF/WebP/PDF/WAV/FLAC/ID3 audio/Ogg audio/MP4/WebM. A UTF-8 text prefix supports text and declared JSON/XML/JavaScript; this is bounded classification, **not** full-file validation or file-content indexing. Unrecognized binaries are Other files. Historical resources retain their prior MIME metadata until reimport; there is no eager migration of all stored binaries. Inline image-info still performs strict format/dimension/byte validation.

Browsing image rows and existing-image picker results lazily request authenticated `/resources/{id}/thumbnail`, never `/raw` originals. The server returns a static first-frame PNG at most 320×320 pixels and 384 KiB, inspecting the existing 20 MiB/40 MP bounds before sampled decoding. GIF thumbnails do not animate; there are no video thumbnails. No thumbnail alters original bytes. The renderer cache retains at most 48 entries/8 MiB, releasing object URLs on eviction, metadata invalidation or connection/workspace change. Requests are cancellable and late completion cannot repopulate invalidated entries. Unsupported/oversized originals keep an icon and local Retry; original download remains available. Thumbnails and transient URLs are outside sessions and archives.

## Used in and Links out

Open **Used in / links…** from shared resource Actions, file previews, image More or lifecycle usage confirmations; the focused note's workspace header has **References**. The same compact dialog provides Used in and Links out. No automatic references column appears and opening/switching notes does not request backlink bodies.

`GET /resources/{id}/references?direction=incoming|outgoing&page=0&size=30` is metadata-only. Page bounds are 1–100 entries; the UI uses 30. Incoming totals count distinct **active saved source notes**, separately from occurrence totals. Outgoing totals count distinct destinations. A row distinguishes note links, file links, image placements and unknown resource links. The first 20 occurrence locators are exposed per row while counts include every occurrence. SQL traverses structured document content, not raw attributes or table provenance; the existing relationship index bounds incoming candidate notes. Current resource titles are displayed without rewriting saved labels. Repeated placements and A→B→A cycles are not recursively expanded. Missing/trashed outgoing destinations stay identifiable and cannot be opened; restored originals become available again. Trashed source notes are excluded from incoming counts, but their own outgoing references can still be inspected.

Counts and locators describe a read transaction's saved content, not a persistent snapshot across requests. Unsaved references in local open notes are marked separately; other devices' drafts are unknown. A locally removed reference can still occur in the saved counts. Metadata pages are bounded; SQL occurrence scans still depend on the referring documents' size. Large-workspace latency and the per-page bounded occurrence reads remain Sprint 5 measurement work. The old unpaged `/backlinks` route remains for older clients, but the current UI never uses it.

## Opening an occurrence

A source row opens with existing direct-open pane preferences. An occurrence opens its source note, then selects the referenced block/link only when the fresh saved revision matches, no pending/recovered local draft intervenes, and the child-index path still resolves to the expected resource ID. Selection uses existing shared editor state without content replacement. If validation fails, open the source safely and explain that the occurrence may have moved. Files continue to use temporary preview preferences. Missing/trashed targets are never silently substituted.

The dialog focuses its direction control, contains Tab/Shift+Tab, uses centralized Escape and restores the captured trigger on dismissal. Successful source navigation hands focus to its editor. Opening is duplicate-guarded; failures retain rows and retry. Changing direction/page discards stale results; same-query background failures retain useful rows.

## Placement, original and membership

Replace changes only the selected placement and retains the original and other placements; its picker explains this and offers original usage. Remove from note removes one placement, removing membership changes organization, and Trash affects the original resource. Usage is available from confirmations before Trash/purge. Cross-note reference rewriting is still a separate deferred operation, not implied by Replace, deletion or preview.

No database migration, new domain type, protocol bump or archive change is introduced: API/minimum client 3 and archive 3 remain. Clients and hosts need 0.6.0 for these new optional discovery endpoints/categories. Protocol-3 older hosts can still serve base features, but category acknowledgment prevents broadening; an absent references/thumbnail route fails visibly. Android should implement the same category/page/locator/cache contracts through its own adapter rather than copying Electron IPC or blob URLs.
