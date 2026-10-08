# Resource lifecycle, discovery and Android readiness

Created/reviewed 2026-10-08. Planning only; no runtime changes or test workspace has been generated. This is the execution tracker for the user's approved direction after 0.4.1. Historical Library/navigation/editor trackers remain evidence of earlier work, not competing specifications.

## Delivery and decisions

Deliver **five sequential sprints, one per authorized implementation call**. Stop after each with actual changes, focused checks, release status and limitations. Do not start Android implementation or deferred backups implicitly. Update CODEBASE and the authoritative topic guides after every sprint; replace outdated descriptions rather than append contradictions.

- Complete consistent resource actions, Trash/Restore and usage visibility.
- Keep Notes and Files as storage kinds. Images/PDFs are discoverable file categories, not new resource entities. Collections/Tags remain organization concepts. Use one mixed list and one searchable Type filter.
- Keep title search the default. Explicit saved-content search gains bounded PDF/text extraction; OCR is deferred.
- Generate the primary synthetic workspace in Sprint 1 using [the fixture specification](../development/PRIMARY-TEST-WORKSPACE.md). Keep focused tests small and disposable; the large workspace is the primary manual/performance baseline, not a reason to rerun every suite.
- Backups belong to [the deferred roadmap](future-roadmap.md), not this release scope. Android preparation follows [ANDROID-READINESS.md](../architecture/ANDROID-READINESS.md), without shipping a client yet.
- Each sprint that changes shipped behavior follows the standing [release process](../desktop/RELEASE-PROCESS.md): fresh UI/embedded host, higher package/lock version, original-key artifacts, focused/native checks, immutable source and usable publication. Assign versions at implementation start against the latest actual release; API/archive versions are separate. Sprint 1 needs no app release if limited to fixtures/tests/docs. Windows-first remains allowed with an exact same-tag Mac handoff; do not claim Android/Mac binaries without native verification.

## Verified starting point

At planning, Library row Actions only offers Add to collection; Ctrl+K has deletion. ResourceService.deleteResource physically deletes file bytes and metadata, removes relationships, and ignores file-delete IO failures. No Trash model exists. Removing an inline image placement already leaves its File resource intact. File · Image/PDF labels exist, but icons and type filtering are storage-kind based. GET /resources/{id}/backlinks returns an unpaged DTO list. Saved-content FTS derives note text/captions/alt; it does not extract file bodies. API protocol is 2. Check all these facts again before implementation.

## Sprint 1 — Primary test workspace and baseline

Status: **Not started**.

- [ ] Implement a deterministic, resumable generator and verifier from the fixture specification; generate a real reusable workspace for the user and a clean baseline copy/archive. No changes to the personal workspace or default connection.
- [ ] Use a dedicated host/profile and clearly named connection, separate local data/credentials and dynamic loopback port. Build through existing application import/create APIs where practical; never write raw note rows that bypass indexes/references/retry contracts.
- [ ] Record resource/format counts, bytes, seed/schema version, archive hash, expected search/usage results and launch/reset instructions. Supply a usable way to open this workspace, rather than only a generator script.
- [ ] Capture baseline timings/memory on documented hardware for startup, mixed/type/collection browsing, title/content search, large tags, image-heavy shared panes and long journeys. Distinguish cold/warm and median/tail measurements from estimates.
- [ ] Establish small fixture subsets for focused failure tests and Android-sized viewport/slow-network cases. Current unsupported features are labelled future expectations, not claimed generator results.
- [ ] Update fixture guide, OPERATIONS, CODEBASE and this tracker. No broad API/Docker run; narrowly scoped fixture creation/verification is intentional.

Acceptance: the user can open the synthetic workspace independently, return to their own connection, and reset only generated data using a verified ownership marker. Generation retry cannot duplicate resources. Report actual disk/time budget and expected-results manifest.

## Sprint 2 — Safe lifecycle and consistent actions

Status: **Not started**. Depends on Sprint 1 baseline; isolated lifecycle fixtures are sufficient for mutation tests.

- [ ] Add persistent resource lifecycle state and Trash listing/restore/purge contracts with bounded paging and metadata-only summaries. Design the additive migration and restart/rollback checks before changing the existing schema. Trash is workspace data shared across devices.
- [ ] Retain original bytes, stable IDs, structured documents, tags, memberships and pin state in Trash. Exclude trashed resources from normal browsing/search/pins/Recent/pickers/counts. No automatic purge in this update.
- [ ] Make trash and restore idempotent, conditional on resource revision where applicable; return structured per-item results for bounded bulk actions and retain selection/errors for failed items. Ambiguous retries reuse operation identities rather than repeat permanent deletion.
- [ ] Restore the same resource ID and its surviving organization state. Duplicate note titles remain supported; deleted collections/tags are not silently recreated. Explain unavailable organization memberships. A repeat restore does not duplicate the resource.
- [ ] Centralize core resource actions across Library, Recent, Pinned, collection contents, Ctrl+K, headers and previews: Open/Preview, Rename, Organize, Pin, applicable Export/Download, Move to Trash. Unknown kinds expose only verified capabilities. Support bulk Move to Trash and keyboard/touch menus; avoid a new permanent row-button strip.
- [ ] Keep Remove from collection, Remove image placement, Unpin and Move to Trash explicitly distinct. Trash confirmation names the target(s), saved usage count and consequences. Collection deletion continues to preserve its resources.
- [ ] Reconcile mounted/shared note views and previews when another device trashes/restores a resource. Save only relevant local drafts before a user-initiated trash; failed saves retain drafts and require an explicit decision before trashing the saved version. Never autosave a deleted/trashed note back into existence. Journeys retain identifiable unavailable visits; restoration can resolve them again.
- [ ] Permanent deletion is only in Trash, with explicit confirmation and reference warnings. Retain broken link/image placements and their labels; never silently rewrite referring notes. Handle binary-delete failures through a retryable cleanup state, not ignored IO exceptions. Gate purge against active relevant operations and document cross-device races.
- [ ] Define archive portability for lifecycle state/deleted timestamps. A versioned manifest must preserve Trash and restore metadata on complete workspace export/merge/replace; older archives default resources to active. Active-only export must explicitly state exclusions. Validate/remap references and keep rollback/replacement-generation behavior.
- [ ] Compatibility gate: old clients must not retain access to the former destructive DELETE behavior on a lifecycle-enabled host. Assess and, if needed, advance minimum API client protocol before permitting mutation; reject incompatible calls before editors mount. Document endpoint semantics and host-first update order, with no silent hard-delete fallback.
- [ ] Test revision conflicts, repeated/uncertain operations, partial bulk failures, shared drafts, foreign-device deletion, file cleanup, archive merge/replace/rollback and restart. Use disposable storage. Publish the verified shipped update and record the real migration/protocol/archive results.

Acceptance: resources can be managed from browsing without Ctrl+K workarounds; Trash/Restore preserves identity and references; accidental removal is recoverable; failed writes do not claim success or lose drafts.

## Sprint 3 — Image discovery and useful reference views

Status: **Not started**. Builds on lifecycle semantics and shared actions.

- [ ] Extend the authoritative kind/capability registry with file-category descriptors and shared labels/icons. Expose Images, PDFs, Audio, Video, Text and Other files through the single searchable Type filter, while Files remains an umbrella. No permanent stacked groups or query per descriptor. Use verified MIME metadata; unknown formats remain explicit.
- [ ] Add server-side category filtering to metadata/title/content/pin queries so paging and totals describe the selected category. Keep existing type fields backward compatible and preserve query/scope/type preferences. No filtering only the current page.
- [ ] Show Image/PDF etc. as the concise primary display label and format as secondary metadata. Images get a consistent icon and a compact optional thumbnail; use the same descriptors across sidebar, browsing, Ctrl+K, resource pickers, inline links and previews. Collection shortcuts remain separately normalized organization entries.
- [ ] Implement authenticated, lazy, cancellable thumbnails with dimension/byte bounds, bounded cache and connection/workspace-generation isolation. Avoid loading original 20 MiB images for every row or persisting authenticated/transient URLs. GIF/video thumbnails must not play continuously. Thumbnails never alter original bytes.
- [ ] Introduce paginated metadata-only Used in/backlinks and outgoing-reference contracts. Count distinct source notes separately from occurrences; distinguish note links, file links and image placements. Cover link cycles, repeated placements, missing/trashed targets and notes without titles. Resolve current titles without replacing stored link labels.
- [ ] Provide a compact reference view available from resource Actions, image tools and note/file headers. Source rows open with existing pane/preview rules; where feasible navigate to a stable occurrence and clearly fall back to opening the note when anchors changed. Source notes with locally unsaved references are explicitly marked; server counts describe saved content and cannot claim knowledge of other devices' drafts.
- [ ] Surface relevant usage in Trash/purge confirmations and Replace tools. Replacing one image placement remains local; replacing references across notes is a separately explicit operation with save/revision safeguards, not a side effect of previewing or deleting.
- [ ] Verify mixed filtering/totals, category extension, stale response/cache release, draft-only references, restored targets and keyboard/touch menus. Perform one focused image/usage visual session in all themes and narrow layouts. Publish and update Library/images/search/API guides and actual results.

Acceptance: users can find images as images, understand where any resource is used, and distinguish placement changes from original-resource changes without fragmenting the Library model.

## Sprint 4 — Explicit saved file-content search

Status: **Not started**. Depends on category/scoping contracts; OCR and additional office extractors are deferred.

- [ ] Extend content mode to supported text-bearing PDFs and plain-text formats (text/Markdown/CSV/JSON/code), using a vetted, pinned extractor and explicit byte/page/output/time limits decided from fixture results. Audit licensing/dependency footprint. Never fetch external links, run code/macros, or render executable snippets.
- [ ] Keep title-only as default in Library/Ctrl+K. Rename the opt-in appropriately to Include saved content, explain supported formats, and preserve global/collection/tag/category/pin isolation. File results must not imply scanning unsaved editor text or other workspaces.
- [ ] Build a derived, rebuildable file-text index with bounded background jobs outside long SQLite transactions. Use resource version/content hash and workspace generation to discard stale extraction after rename/replacement/trash/purge/workspace replacement. Concurrent mutation/rebuild cannot resurrect removed results.
- [ ] Use one search service with title-weighted ranking, deterministic ties, bounded snippets and text highlight ranges. PDF results may include a page number; opening safely falls back if preview/page navigation is unsupported. Normal browsing remains independent of index availability.
- [ ] Expose coverage/job state and reindex/retry diagnostics: queued, indexing, indexed, unsupported, limit-exceeded, encrypted/invalid, failed. Image-only PDFs clearly report no extracted text; OCR is not implied. Incomplete coverage is visible rather than presented as no matching resources.
- [ ] Preserve original files. Extraction caches/indexes stay outside portable archives and are rebuilt after import/replace. Cancellation, disk/storage failure and host restart have bounded recoverable behavior. No shared Hikari connection held during decoding.
- [ ] Test literal input, Unicode, title-vs-body ranking, bounded PDF/text fixtures, malicious/invalid/encrypted content, limits, partial coverage, mutation races, archive consistency and scope isolation. Measure the large-workspace impact. Publish and document supported formats, exact limits and actual coverage.

Acceptance: opt-in content search finds words inside supported saved files, remains honestly scoped and explains incomplete coverage without stalling editing or browsing.

## Sprint 5 — Measured scale, multi-device integration and Android gate

Status: **Not started**. Integration only; new features require a separately recorded scope decision.

- [ ] Compare baseline on the same seed/device and record reproducible cold/warm timings, tail latency, memory, request counts and cache growth. Address measured bottlenecks: paging/indexes, full-tag enumeration, oversized client bundle, image cache, references and file extraction. Do not promise an arbitrary speedup without evidence.
- [ ] Exercise the large workspace and small fault subsets: shared note views/undo/drafts, long/cyclic journeys, preview dismissal, delayed/out-of-order requests, Trash/Restore/purge, failed uploads/saves, search rebuild, refresh/session recovery and update during continued editing.
- [ ] Run one bounded real Windows/Mac session if access is available: paired-host credentials, saved-change streams, conflict recovery, host shutdown, switching to This computer, sleep/resume and content/lifecycle notifications. Record blockers instead of claiming simulations verify native devices.
- [ ] Check touch-sized controls, single-column layouts, keyboard focus, reduced motion and loading/error behavior. These are readiness checks, not an Android browser/native certification.
- [ ] Finalize the Android API/editor/security capability matrix, publish migration/update guidance and unresolved decisions in ANDROID-READINESS. Define a separately authorized Android prototype milestone; do not create an APK/store account or enable offline sync implicitly.
- [ ] Complete verified platform release/handoff for shipped fixes, CODEBASE/tracker/topic docs, real performance report and known limits. If measurements show no code change is needed, a docs/test-only handoff does not need another installer.

Acceptance: a reproducible scale report identifies observed limits, core lifecycle/search flows survive fault tests, and an Android agent has accurate contracts and a small prototype scope rather than assuming Electron can be ported directly.

## Handoff record (fill after each sprint)

For each sprint record: source/version/tag/release URL where applicable; migration/protocol/archive changes; focused test commands/results; fixture seed/counts/hash; measured hardware/timings; actual visual/native coverage; unsupported platforms; remaining defects and next authorized scope. All implementation checkboxes above remain pending at planning.
