# Multi-workspace Vaultor and the Android reading companion

Created 2026-10-13; reviewed 2026-10-15. **W1 complete/published Windows0.8.0 (2026-10-13); W2 complete/published Windows0.9.0 and Androidalpha.8; W3 complete/published Windows0.10.0; R1 complete/published Androidalpha.9.1; R2 complete/published Androidalpha.10; R3 complete/published Windows0.11.0 (Mac native gate pending); R4 complete/published Androidalpha.11; R5 complete/published Windows0.12.0 on ai/codex-current (Mac gate pending); R6–R10 unstarted.** This is the authoritative replacement execution tracker for shared multi-workspace support and Android's reading companion. It supersedes the remaining A8/A9 and editing-led direction in [the original Android tracker](android-plan.md), preserving its published A1–A7 evidence. Planning authorization does not start implementation. Deliver **one sprint per explicitly authorized implementation call**, then stop for discussion.

## Agreed product boundary

- Android is a beautiful reader, offline companion, review-item capture tool and resource import/export client. It does not edit original note bodies, titles, image placements or organization, and does not administer Trash, deletion or workspace replacement. Desktop/browser retain editing and administration. Default: pins and organization are read-only on Android too; revisit only through an explicit decision.
- Android holds downloaded content belonging to a source server/workspace, not an independently writable local workspace. It does not run the Java server. Multiple downloaded companions can coexist and be switched while offline.
- Offline review items and imports sync to their captured source workspace, never the currently focused destination. Reconnection does not replay legacy document writes. The host remains authoritative for original resources.
- Full workspace ZIP export is **connected-only and host-prepared**, even if the complete workspace is downloaded. Partial resource/download exports work online and offline, explicitly declare their scope and missing dependencies, and do not claim completeness.
- A server can host multiple workspaces. Windows/macOS desktop and browser can select them; Android selects an authorized connected or downloaded workspace. Desktop can make an independent local copy of a remote workspace. That is a fork, not bidirectional synchronization.
- Preserve structured Tiptap JSON, original files, resource IDs within a workspace, shared domain APIs, security, themes/accents, centralized focus/Back behavior and desktop save coordination. Images/PDFs remain File categories, not new resource kinds.
- Keep zero mandatory payments, original signing identities, Windows emulator testing and user-owned S24 Ultra/One UI 8.5–9 acceptance. Agents never access or ADB-pair the phone. Ubuntu packaging stays deferred; shared browser/API behavior must not depend on Windows.

## Verified starting point and architecture constraints

At plan drafting the shipped host/desktop was0.7.1/protocol3/archive3 and Androidalpha.7.2/versionCode10. After W2, Windows is0.9.0 and Androidalpha.8/versionCode11; protocol3/archive3 unchanged. Verify again at every implementation start. Current server uses a single configured SQLite datasource/file root, one workspace identity/generation, singleton workspace gate, indexes, transfer operations and change stream. Existing identity scoping is not multi-workspace hosting. Android has protected draft/operation journals and a small clean cache, not a complete offline store or sync engine. Existing Android editing and A7 mutations are still shipped; this plan does not pretend they have been removed.

Inspect WorkspaceIdentityService, WorkspaceGate, WorkspaceRequestFilter, TransferService, datasource configuration, host approval, native allowlists, SSE, desktop connections and mobile workspace/storage code before changing contracts. Do not swap a global active database when a client switches workspace: concurrent clients must target different workspaces safely. Choose and document a bounded workspace-context architecture in W1; physical database/file isolation per workspace is the preferred starting direction, subject to a concrete JPA/transaction/worker feasibility check. Avoid both one JVM per workspace as an assumed default and a speculative rewrite.

## Proposed contracts and invariants — not implemented

W1 owns the exact routes, schema, limits, capability/protocol versions and migration ADR. The following requirements are binding; route spellings are deliberately not invented here.

1. **Identity/routing:** host identity, workspace ID, replacement generation and resource ID are separate. Capture workspace explicitly in every resource request, upload, export, operation, notification subscription and background job. Resolve authorization before opening its storage context. Missing/unknown scope fails safely; legacy clients can address only a fixed legacy/default workspace, never whichever workspace another client selected.
2. **Access:** pairing remains host-level with explicit workspace grants. Existing approval migrates to the existing workspace only; creating a workspace does not silently grant all paired devices access. Owners manage grants. Listing, bytes, thumbnails, operations, references, search and SSE enforce the same grant. Revocation stops network work and locks a retained offline copy on next verified revocation; already downloaded/exported bytes cannot be remotely recalled. Offer explicit local removal without silently deleting unsynced work. Offline lock/removal behavior must be disclosed before download.
3. **Isolation:** workspace settings, collections, tags, pins, recency, FTS, file extraction, usage, Trash, lifecycle receipts, operations and streams are scoped. Device appearance remains device-local; sessions/download choices are per workspace. No cross-workspace links/search in this milestone. Copy/import remaps portable references as needed without transferring credentials, device state, sessions or local journals.
4. **Consistent downloads:** host provides a resumable, authorized reading snapshot manifest with generation, schema, revisions, inventory/hash/size and an opaque cursor or snapshot identity. A client verifies required files and publishes a complete checkpoint atomically; a failed refresh retains the old checkpoint. Pending/deleted references are explicit, not silently blank. Immutable snapshot lifetime/expiry and change-gap handling are bounded and documented. Resume does not depend on unbounded historical changes.
5. **Durable queues:** native durable transactional metadata plus app-private files; selected SQLite/native implementation decided by a small crash-safety spike, not by reusing the 24MiB draft blob for entire workspaces. Record UUID, captured host/workspace/generation, exact request, local file hash and state before dispatch. Separate prepared/sending/unknown/acknowledged/retryable/needs-attention. Preserve original identities after uncertain outcomes; acknowledge exact items only. No automatic queue eviction or redirection.
6. **Review items:** separate domain entity, not Tiptap nodes, note edits or comments written into original files. Store author/device display identity, timestamps, target, optional bounded quote/context/locator and base revision; status open/resolved/dismissed. Creation is idempotent; status changes are revision-checked. A missing or changed passage retains the original evidence. No automatic resolving when a note is edited. Review text is plain safe content; quotas/paging apply.
7. **Transfers:** host snapshot export and import preview/commit remain authoritative. Import-as-new is default; replacement is a separate desktop/admin action. Review inbox data needs an explicit versioned portable representation; full exports preserve synced reviews, partial exports disclose scope and map included targets. Unsynced review/import journals never silently enter ordinary archives or become acknowledged. Separate queue recovery/export is offered if needed. Portable archives exclude host trust, workspace routing identity/generation and device preferences.
8. **Compatibility:** advertise capabilities and reject unsupported operations before mounting the relevant experience. Protocol changes follow actual breaks, independent of release/archive versions. Version new portable sections deliberately; old readers must reject unsupported versions rather than strip reviews/content. Keep legacy archives importable with fixtures. No silent data migration from a different workspace.

## Execution sequence

| Sprint | Deliverable | Primary targets | Dependency |
| --- | --- | --- | --- |
| W1 | Isolated host workspace foundation and migration | Host/API | None |
| W2 | Workspace selection and grants across devices | Desktop/browser/Android | W1 |
| W3 | Workspace transfer and independent desktop copy | Host/desktop/browser | W2 |
| R1 | Retire Android editing safely; reader shell | Android | W2; execute after W3 |
| R2 | Beautiful reading and media exploration | Android | R1 |
| R3 | Consistent companion snapshot/delta service | Host | W1, R2 |
| R4 | Durable offline workspace reading | Android | R3 |
| R5 | Review domain and desktop/browser inbox | Host/desktop/browser | W2 |
| R6 | Offline annotations and review synchronization | Android | R4, R5 |
| R7 | Offline collection/import queue | Android/host as needed | R4, W3 |
| R8 | Connected full export and online/offline partial export | Android/host | R4, R6, R7 |
| R9 | Companion settings, discovery and verified updates | Android | R8 |
| R10 | Integration, scale, upgrade and release handoff | All affected targets | All preceding gates |

This table is sequential delivery, not permission to run dependency-independent sprints in parallel. Each remains **Not started** until separately authorized. Version numbers are assigned at implementation from actual compatibility, not promised here. Every shipped sprint needs usable verified artifacts; documentation-only work does not.

## W1 — Isolated host workspace foundation

Status: **Complete — Windows0.8.0 published 2026-10-13; Mac native gate pending**.

- Write an ADR for workspace catalog, per-workspace storage/transactions, explicit request routing and bounded open contexts. Include scheduled jobs, SSE lifetime, file/extraction paths, operation registries, locks and graceful stop/backup scope. A workspace replacement must not quiesce unrelated workspaces unnecessarily.
- Introduce persistent catalog and owner workspace list/create/rename with explicit limits. Adopt the existing workspace and retain its identity/data/approvals; restart-safe migration and rollback checkpoint precede schema/storage changes. Never move a live database with an active writer.
- Scope all domain services, background execution and diagnostics; prohibit client-selected filesystem paths. Define fixed-default legacy behavior or clearly reject incompatible clients. Check owner and paired grants throughout the request lifecycle, including background operation status/download.
- Add per-workspace identity/generation/capabilities and bounded summaries. No cross-workspace search or links. Unknown identifiers return no other workspace's data.
- Validate two clients using two workspaces concurrently, equal resource IDs across isolated workspaces, missing scope, delayed callbacks, deletion/replacement, startup/interrupted migration, indexing/search/lifecycle/transfer isolation and grant denial. Use disposable storage.

**Acceptance:** independent clients can address independent workspaces without mutable-global routing, data leakage or migration loss. Publish a compatible host/desktop release or explicitly gated breaking upgrade with precise client matrix. Native Mac checks require access or exact same-tag handoff.

## W2 — Workspace switching and access on every client

Status: **Complete — Windows0.9.0 and Android0.1.0-alpha.8 published2026-10-13; Mac native gate pending**.

- Distinguish server connection from workspace in selectors: server name plus workspace name, connected/offline status when relevant. Desktop/browser owner can create/rename workspaces and manage paired-device grants. Android discovers/selects authorized workspaces; no workspace administration UI.
- One active workspace per window. Preserve each workspace's browsing query/scope/filters/sort, panes/journeys/reading positions and desktop drafts. Device appearance persists globally; workspace preferences stay scoped. Clear transient surfaces and stale bulk selection when switching.
- Save/protect desktop edits before switching; an unreachable old host must not prevent Keep protected drafts and switch. Invalidate epochs, requests, media handles and subscriptions. Existing Android editors remain transitional until R1, with the same protection requirement.
- Multiple windows/tabs may choose different workspaces. Do not let localStorage/session or connection-global selection redirect another window. Updating/hosting/quit tracks every owned context and outstanding protected operation.
- Verify pairing grant migration, hidden workspace listing/bytes/SSE, revocation, unavailable source, switch during delayed requests, restart restoration and unchanged workspace identities.

**Acceptance:** Windows/Mac/browser and Android share the workspace model without crossing data or credentials. Publish host/desktop and separately signed Android artifacts as required; unavailable platform checks are explicit.

W2 actual results: desktop/browser/Android selectors, owner create/rename/effective grants, main/native JSON/files/SSE scope, checked activation, source-epoch queued writes, separate sessions and local appearance cache. Frontend22+desktop14/Node2/backend7/mobile37 focused checks passed; scoped lint frontend clean/mobile0errors22warnings. Windows packaged isolation/private-stop/restart/edit-save/PDF/relaunch and browser/native selector/refresh/narrow checks passed. Final Android APK native equal-ID note/file/stale/generation/persistence and selector UI passed on API36/API37 (16KiB). Native Mac/Wi-Fi/Samsung pending; exact v0.9.0 Mac handoff prepared. Android remains transitional editing untilR1. Published Windows0.9.0/Androidalpha.8 from immutable 74f628b53d5516d4def9e796f03d30abccce8cd8; original signing identities and downloaded asset hashes verified. Clean tagged Android rebuild byte-identical. All disposable hosts/emulators stopped. No W3 work performed.

## W3 — Workspace import, export and desktop local copies

Status: **Complete — Windows0.10.0 published2026-10-14; native Mac gate pending**.

- Add import ZIP **as a new workspace** with preview, name/conflict handling, bounded archive validation, atomic commit and retry identity. Keep desktop replacement explicitly separate with generation change and recovery checkpoint.
- Export one selected workspace from a consistent host snapshot; make active-resource/Trash and portable settings semantics explicit. Global host catalog/trust must never enter the ZIP. Do not copy raw running SQLite files over the network.
- **Make local copy** on desktop prepares/downloads a remote snapshot, validates it, then commits a new local workspace with new identity and provenance/copy time. Preserve IDs inside that isolated workspace or remap consistently. Never create links back to the remote source accidentally. No automatic synchronization between forks.
- Handle interruption, storage exhaustion, snapshot expiry, duplicate retry, host shutdown and mismatched generation. Preserve source and leave no apparently complete half-copy. Browser can download/import through an authorized host; it does not become a local server.
- Prepare versioned transfer extension points for reviews and partial bundles; freeze exact archive compatibility only after W1/W3 design. Future reviewers must not interpret an ordinary archive as a private backup of credentials or pending queues.

**Acceptance:** create/import/export/copy works without overwriting an existing workspace by default. Publish and document platform availability; Ubuntu installers remain out of scope.

W3 actual results: private owner ZIP preview/commit/atomic publication, durable identical retries and slot reservation, interrupted dispatch/READY reconciliation, independent main-owned snapshot copies with source generation checks and cached offline retry, preserved IDs/originals/Trash and private provenance, replacement ZIP checkpoint. Frontend21/backend15/Node1 checks and compilation/scoped lint passed; packaged two-host copy/restart and actual executable save/PDF/relaunch/native/browser transfer interactions passed. Native Light/Dark/minimum-width frames inspected; browser functional checks passed. Windows0.10.0 original-key installer/sidecar downloaded/verified and published from immutable b96006b0f43f46934f2d3cf5b41ac9078a0a8705/v0.10.0. Both public GitHub asset sizes/digests match; global latest retained for honest platform availability. Mac exact-tag handoff prepared; physical Mac/Wi-Fi unverified. No Android changes/emulator rebuild/phone access. All disposable hosts stopped; R1 remains unstarted.

## R1 — Safe retirement of Android editing and new reader shell

Status: **Complete — published (2026-10-14)**. Android alpha.9.1/versionCode13, original signer and protocol3. Reader DOM/shell, native mutation retirement and private legacy ZIP recovery implemented.26 focused Jest/DOM/compilation/lint checks and installed upgrade/reader cases passed; final tagged-byte platform checks/publication passed; see the R1 ledger below. R2–R10 unstarted.

- Inventory existing drafts, uncertain save receipts, creation/lifecycle identities and image-placement uploads before disabling any code. Preserve encrypted records through upgrade; do not clear app data or retire keys. Provide a dedicated Legacy recovery area with human-readable recovery export and original structured JSON/media where available.
- Freeze automatic legacy note writes, creation and destructive retries. Reconcile uncertain requests using read-only status first. No replay merely on reconnect. If recovery to a host is offered, make it an explicit new recovered resource after target/identity review, never an overwrite; otherwise export for desktop recovery. Uploaded orphan files remain host resources; unfinished placement bytes remain separately recoverable.
- Remove Edit/Done, Save, Format/Undo/Redo, New note, inline insertion/replacement/resize tools, rename/membership/tag/pin writes, collection administration and Trash/purge from ordinary Android flows. Remove corresponding mutation bridge/native allowlist paths once recovery requirements are accounted for. Import is a separate explicit capability, not editor insertion.
- Build a real read-only document renderer with schema-aware layout and selection/copy. Reuse safe structured rendering where appropriate, without an editable Tiptap engine hidden underneath. Treat stored documents as untrusted: restrictive CSP/navigation bridge, no arbitrary scripts/HTML or automatic remote fetching. Unknown blocks show an explanatory fallback and retain original JSON.
- Deliver compact reader top bar (Back/title/contextual More), drawer/workspace selector, Home resume/recent/pinned, mixed Library/search/collections and temporary file previews. One reading surface, no desktop panes. Capture representative design frames before polishing; explain reading-area/action tradeoffs.
- Verify install-over alpha.7.2 with pending/failed/unknown drafts/uploads and operations, source removal, storage failure and host absence. Reading must not dispatch document or lifecycle mutations. Recovery cannot gate all reading indefinitely.

**Acceptance:** a signed upgrade APK reads comfortably, no longer edits originals, and makes every legacy pending item recoverable without accidental replay. Publish and stop for design discussion.

## R2 — Beautiful reading, links and media

Status: **Complete — published 2026-10-14**. Android alpha.10/versionCode14 implements reading controls/outline/find, source-bound links/history and full-screen image/PDF viewing; original mutations remain refused. Original-key APK and installed API36/37 acceptance passed. R3–R10 remain unstarted.

Implementation and publication are complete. Device-only presentation, bounded safe DOM/outline/find, revision anchors, distinct journey visits, native full-screen image/PDF controls and scoped media positions are implemented. TypeScript/native compilation,22 focused Jest cases, DOM/runtime checks and scoped lint0errors/32warnings passed. API36 installed services/reading/media/journeys/cold restore/OS+motion/legacy upgrade passed. API37 normal approved pairing and all six installed cases passed; the fixed-viewport candidate also passed all six on API36, including selection/copy/pinch/swipe. Clean tagged rebuild produced identical APK bytes to both installed candidates; publication and public assets verified. [Alpha.10 release notes](../android/releases/0.1.0-alpha.10.md) record exact evidence and limitations. R3–R10 have not started.

- Create intentional phone typography: adjustable reading size/line spacing/comfortable measure, heading hierarchy, lists/tasks, quotes, tables and code. Preserve document meaning/marks; tasks are read-only. Tables/code can scroll horizontally without trapping page scroll or system Back. No nested-card note layout.
- Heading outline, find within note, text selection/copy and selectable link labels; accessible links and external-link confirmation/opening. Default title search, explicit content mode and scope persist. Relevant saved search occurrences locate the passage only when revision/locator checks pass.
- Linked notes replace the active reader; distinct cycles/branching, bounded 200-visit history and exact scroll restoration. Direct opens start a trail. Back dismisses sheet/media/outline/drawer first, then reading history/origin. No editing/IME layer. Preserve position when backgrounded or switching workspace.
- Images use full-screen fit/actual-size/zoom and bounded swipe through images in the source note, without modifying placements. PDF reading needs in-app page navigation, zoom, position restore and safe handling of large/password-protected/unsupported files; external opening is an explicit fallback, not the only normal PDF experience. Keep original pixels/bytes/colors.
- Preview files without advancing note journey; restore source focus/position. Distinguish unavailable, not downloaded, removed and unsupported. Explicit download/network choice for missing linked content, never an infinite loading placeholder.
- OS/Light/Dark/OLED and accents, large fonts, selectable content, TalkBack labels/order, system bars, narrow/landscape/split-screen and reduced motion. Smooth should improve transitions without moving reading text on refresh. No decorative persistent motion.

**Acceptance:** one focused installed-APK session demonstrates rich notes, images/PDFs, long tables/code, link cycles, heading jumps and reading restoration in both emulator generations. Physical OLED/Samsung acceptance remains user-owned.

## R3 — Host companion snapshots and refresh contracts

Status: **Complete — published 2026-10-14**. Windows0.11.0 publishes companion snapshot schema1 at protocol3; Android alpha.10 remains unchanged. Immutable scoped checkpoints, paged metadata/coverage/comparison, hashes/range resume and access/generation checks verified. Original-key Windows pair published; native Mac gate/handoff remains explicit. R4–R10 remain unstarted.

- Implement authorized paginated metadata and snapshot inventory/checkpoints for complete workspace, selected collections and selected resources plus explicit dependency options. Estimate bytes/counts before download. Download policy can include originals or readable content only; disclose omitted media and link destinations.
- Capture coherent saved documents, revisions, resource metadata, referenced files and scoped organization. Snapshot revision/hash manifests prevent mixes of old notes and new bytes. Streams are hints; cursor gaps require scoped reconciliation/full manifest, not trusting missed events.
- Support bounded resume, cancellation, snapshot expiry and unavailable resources, with checksums and resource/format limits. An expired snapshot restarts safely without claiming completion; downloads/operations remain bound to generation/grant.
- Design deletions/tombstones and replacement/revocation signals. Old offline content is clearly stale, while review/import queues remain protected independently. No note-writing endpoint is needed for this service.
- Validate concurrent edits/Trash/Restore during snapshot, missing assets, duplicate IDs across workspaces, grant loss, malicious inventory paths/sizes and interrupted byte streams.

**Acceptance:** a companion client can obtain and verify a coherent resumable reading dataset. Publish the host capability before claiming Android offline support.

R3 delivery: [Windows0.11.0](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/v0.11.0), published2026-10-14T11:20:55Z, stable/non-draft and explicitly Windows-only/non-latest. Immutable source/tag8abd3fe6016475f9a37b7e199007ca729be88f50/v0.11.0. Installer245,639,499bytes/SHA256937c1677ac4dea369c0d09a421de118164d6153c732740000fabd966c1bff692 plus400-byte original-key sidecar; downloaded pair signature/exact bytes and public sizes/digests verified. Fresh UI/embedded server,24 focused cases (companion13, protocol4, multi-workspace7), frozen packaged checkpoint/whole-workspace/range/hash/restart and native first/save/PDF/relaunch checks passed. Read leases prevent search-index maintenance truncating admitted streams; optional storage failure returns503 without disabling originals. Explicit image-only scope and pre-parse note limits are covered. No new Android APK/schema/protocol/archive change. Mac native gate remains unavailable with exact same-tag MAC-HANDOFF.md; no phone/real-Wi-Fi or personal installer mutation. Owned disposable hosts exited. Documentation-only publication follow-up preserves source tag/bytes. **R3 complete; stop here. R4–R10 remain unstarted.**

## R4 — Durable offline companions and local search

Status: **Complete — Android alpha.11 published 2026-10-14**. Android alpha.11/versionCode15, original signer; no desktop rebuild. Includes globally discoverable R2 appearance, long-code containment and independent quick-access requests. [OFFLINE.md](../android/OFFLINE.md) owns storage/search/security bounds; [release ledger](../android/releases/0.1.0-alpha.11.md) records actual evidence. R5–R10 remain unstarted.

- Implement app-private durable database/file store with crash-safe migrations, verified checkpoint activation and bounded memory. Credentials stay AndroidKeyStore-protected and separate; document local-content threat model/encryption and key-loss behavior before first download. Android private storage is not a claim of encrypted portable archives.
- Offer Download for offline for workspace/collection/resources, size/coverage/progress, last successful refresh and manual Refresh. Resume partial downloads without marking incomplete datasets complete. Reconnecting can refresh opted-in content, but should not start a large first download silently. Respect explicit metered/battery settings.
- Read/browse/search downloaded metadata and saved note text offline, including collection/type scope, links, images/PDFs and journeys. Show local availability/coverage and whether results are downloaded-only. Do not silently broaden scope or claim host file-text index coverage is available locally. Local PDF/text extraction can wait; downloaded host extraction requires a capability and privacy/budget review.
- Separate evictable media cache, retained downloads, legacy recovery and unsynced queues. Storage budget/removal preview cannot automatically delete unsynced items. No-space failure preserves last readable checkpoint. Removing a companion explains pending work and offers retention/export before removal.
- Workspace replacement starts a new generation; retain old unsynced items in Needs attention, never post them to the replacement. Revoked companions lock when verified online; offline grants cannot guarantee remote erasure. Forgotten host does not silently erase pending work.
- Test real network-off cold start, force-stop mid-download/refresh, reboot/process death, concurrent local writes, hash mismatch, disk full, large manifests, changed grants/generation and multiple companions.

**Acceptance:** selected content remains readable/searchable after leaving the LAN; failed refresh cannot destroy the prior download or queued work. Publish an offline-capable APK.

R4 delivery: [Android alpha.11](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/android/v0.1.0-alpha.11), published2026-10-14T16:52:51Z; immutable source/tag f140b9de8f693d396dc2ba3f93a7e9bfd7b57dab / android/v0.1.0-alpha.11. Original-key APK39,918,829bytes/SHA2562260d559695d53a87f638361d54aec0a7b21f49f9ce022c26bef16d4f0ded63f; clean tagged rebuild matches installed bytes. API36/37 pinned download, source isolation, local search/media/journeys, process-death resume/reboot restoration, appearance/recovery and real revocation passed;33 focused Jest cases, four native store cases per target, reader/runtime checks and lint0errors/41warnings passed. Three GitHub assets downloaded/compared before publishing; public status/sizes/digests verified. No phone/Samsung/realWi-Fi/physical-power-loss/full10k/actualOS-disk-full certification. Host0.11+ required for downloads; no desktop rebuild. Current fixture53543/emulators stopped; old fixture51106 stop blocked by automatic approval review, reported without bypass. Documentation-only publication follow-up preserves immutable source/tag. **Stop after R4; R5–R10 remain unstarted.**

## R5 — Review items and desktop/browser Review inbox

Status: **Complete — Windows0.12.0 published2026-10-15, branch ai/codex-current; Mac native gate pending**. Preserves the R4 baseline, original signing identity and exact-tag Mac handoff. Android alpha.11 stays unchanged; R6–R10 remain separately authorized. No ai/gemini-ui integration.

- Add separate workspace-scoped review records: stable UUID, resource target, bounded comment, optional quote/context/locator/base revision, author/device label, created/updated times and revision-checked open/resolved/dismissed status. Escape user content; enforce limits and pagination. Original resource revisions/JSON remain unchanged.
- Expose idempotent creation/status lookup and conditional status actions with change notifications. Retries with the same ID/body reconcile; differing payloads cannot silently overwrite. Multiple devices resolving one item produce explicit conflict/reconciliation.
- Add global-within-workspace Review inbox on desktop/browser, filters/status/counts and jump-to-resource. Note/resource shows a restrained pending-review indicator and optional side panel; no compulsory popup. Passage attachment is checked against revision/context; changed/missing passages show original evidence. Files get resource-level review initially, with page number/context where safely available; precise PDF rectangle annotations are deferred.
- Preserve items for deleted/trashed resources, identify unavailable targets, and define restoration/purge retention. Comments are never automatically resolved by edits. Include synced reviews in versioned full portable transfers and scoped partial exports with reference remapping; older unsupported archives fail safely. Independent copy keeps review provenance without old credentials/routing IDs.
- Test duplicate/unknown creation, stale status updates, target edits/deletion/replacement, author safety, export/import/copy and per-workspace authorization.

**Acceptance:** desktop/browser can triage and resolve concerns without changing note content as a side effect. Publish the host/UI capability with explicit archive/client compatibility.

R5 delivery: [Windows0.12.0](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/v0.12.0), immutable source/tag4e2f71394547bf87422ac751793f56013bd7d043/v0.12.0, published2026-10-14T20:50:06Z (2026-10-15 IST). Original-key EXE245,671,099bytes/SHA2566db136acdc5f31110fdc593c24f20db3d15f61403201e73ea30bb1c4a0b79bd6 and400-byte sidecar; pair downloaded/compared, public stable/non-draft metadata/digests verified.13 review tests,4 compatibility cases,1 graph case and13 frontend cases passed; TypeScript/backend compilation and scoped lint0errors/0warnings passed. Final packaged native/browser54 mixed reviews, status/paging, unchanged originals, note/file entry, preview dismissal, long-title containment, owner handoff/Escape and themes/narrow layout passed. All five UI assets match fresh/embedded/packaged copies. No original-resource schema/protocol/Android bump; additive scoped review table and archive4 with imports1–3. Minimum functional presentation; Dashboard/PreviewLayer/transfer hooks documented for later UI integration. Mac same-tag handoff remains; no phone/realWi-Fi/install-over/full10k claims. **Stop after R5; R6–R10 unstarted.**

## R6 — Android offline review capture and synchronization

Status: **Not started**.

- Selection offers Flag for review; resource More offers Add review item. Capture comment, source resource/revision, original quote/context and optional validated locator. The reader remains immutable. Preview the target and allow local editing/removal before sending; editing an already synced comment requires an explicit conditional API, otherwise add a follow-up.
- Persist before showing success; distinguish On this phone, Sending, Synced and Needs attention. Pending review inbox is usable offline across companions. Resource-level reviews cover notes/PDFs/images; no unsupported precision promises.
- Sync only with matching approved host/workspace/generation, using stable UUID/body and exact acknowledgments. Resume foreground reliably with Sync now; background scheduling is best-effort. Single queue owner prevents duplicate foreground/background workers. Device clocks are display hints, not conflict ordering.
- Download status resolution updates; never auto-resolve on local reading/editing. Source changes retain evidence; source missing/revocation/replacement keeps the item recoverable. No redirects to an identically named workspace. Pending comments remain independent of evicted content.
- Validate process death at every receipt transition, host acknowledgment lost, two devices/status conflict, mixed batch failures, offline target edits, changed locators, storage failure and accessibility/Back.

**Acceptance:** flag a discrepancy offline, reconnect, see exactly one item beside the correct desktop note, edit on desktop and explicitly resolve it; Android sees that resolution without modifying the note.

## R7 — Offline imports and durable collection queue

Status: **Not started**.

- Android file/photo picker and Share receiver collect supported text, Markdown, PDFs, images and other host-supported files. Text/Markdown become imported notes through host conversion, not mobile editing. Keep original bytes; show unsupported input before dispatch and safe host-preview errors after connection. ZIP workspace imports are queued for **import-as-new** when authorized; no Android replacement/admin flow.
- Immediately copy permitted content-URI bytes into app-private staging before temporary grants expire; stream large files, enforce advertised/current size limits and a storage budget, reject dangerous archives through host preview. Capture filename/MIME/hash, stable operation identity, source workspace/generation and destination collection before sending. Cold Share without a destination enters a local inbox and asks explicitly; never infer from the next connected host.
- Show Pending uploads with review/cancel/retry/remove and aggregate progress; local inspection without pretending resources already exist on host. Optional collection choice uses cached identities; missing collections require a new choice or explicit workspace root. Destination changes after uncertain dispatch require reconciliation, not a fresh duplicate request.
- Use existing retry-safe imports where sufficient; extend capabilities for large/resumable transfers only if current limits require it. Unknown results retain UUID/exact payload until reconciled. Multi-file order/partial success are explicit. Delete staging only after exact acknowledgment and required local availability; cancelling unknown work may not undo a host commit.
- New import appears on host and in companion refresh without auto-inserting into a note. Document that all export/import formats are capability-driven; no promise of every platform conversion before tested. Full workspace import needs connectivity/host approval and explicit new-workspace destination.
- Verify disconnected Share/cold start, URI grant loss, process death, disk full, uncertain commit, unsupported format, changed collection, grant revocation, duplicate names, workspace replacement and switch while upload runs.

**Acceptance:** collect text/MD/PDF/media offline and later create exactly one correct host resource per confirmed item, with local retryable failures and no wrong-workspace uploads.

## R8 — Android resource and workspace exports

Status: **Not started**.

- Full workspace ZIP is available only while connected to that workspace's server. Host prepares the authoritative snapshot and Android downloads/verifies/saves/shares it. Offline full export stays disabled with a short explanation even with all content downloaded.
- Partial export works online/offline for selected/downloaded resources, with clear inventory, included linked-note depth/dependencies, missing originals/targets, review coverage and last-refresh information. Use a versioned portable partial package that desktop import understands; never label it a complete workspace. Cycles/dedup/count/byte/depth limits apply.
- Preserve original bytes and meaningful resource links. Resource download-original works offline only for downloaded originals. Connected note-format export reuses server conversions; offline note export initially supports structured portable package/Markdown with available assets. PDF/Word offline generation is not promised without a tested local renderer. Explain unavailable formats, not a generic failure.
- Android Storage Access Framework Save and Share use safe filenames/MIME/temporary grants, cancellation and no-compatible-app handling. Operation tracking outlives a picker, retries reuse the existing export, and browser/OS handoff is not a guarantee of a completed recipient save.
- Exclude credentials, local session state and unsynced queues from ordinary exports. Offer separate recoverable queue/legacy-draft export when needed; neither export marks anything synced. Verify reimport on desktop with scoped links/reviews/images and original checksums.

**Acceptance:** connected full ZIP and clearly partial offline bundles transfer correctly to another device; missing content and format limits are visible before export.

## R9 — Settings, discovery and safe Android updates

Status: **Not started**. Replaces relevant old A8 work; do not resume its editor-related scope.

- Flat mobile settings for OS/Light/Dark/OLED, accents, reading size/spacing, Smooth/Snappy/reduced motion, download/storage budgets, sync on metered networks and queue controls. Show This device once; host administration stays desktop. Applicable settings save/retry without nested desktop cards.
- Workspace selector integrates connected and downloaded companions, explicit manual host address and optional permission-aware discovery. Changed addresses still verify pinned host identity/TLS; changed trust needs enrollment. No automatic public hosting/cloud service.
- Verified in-app Android prerelease discovery/download/install consent with original package/signer, increasing versionCode, host capability checks and advanced manual fallback. One update action hands off to Android's required consent; no silent installation claim. Downloads and pending queues survive update.
- Validate wrong signer/package, downgrade/tamper, interrupted download, storage/installation permission denial, incompatible host, grant loss, background scheduling limits and settings/queue retention. Test explicit foreground catch-up even when background work is prevented.

**Acceptance:** companion appearance, connections, storage and updates are understandable and durable, with a verified upgrade APK and no editor controls reintroduced.

## R10 — Integration, performance and release handoff

Status: **Not started**.

- End-to-end: desktop multi-workspace editing, Android connected download, leave LAN/read/search/flag/import, process death, reconnect, exactly-once host outcomes, desktop review resolution, Android refresh, ZIP/partial round trips and independent desktop copy. Include equal IDs across workspaces, grants, replacement, Trash/Restore, missing targets, snapshot expiry and queue cancellation races.
- Upgrade alpha.7.2 through new milestones without losing approvals, legacy drafts, pending operations or downloaded queues. Test reader rejection/fallback for unsupported structured content; assert there is no general Android note/lifecycle write surface. Refresh cannot clobber local review/import records.
- Use Small then Atlas (5,000 resources) plus controlled fault fixtures. Record first usable cold/offline startup, scrolling/frame observations, search latency, memory/disk, checkpoint/transfer time and storage bounds. Budget implementation defaults from measurements; do not claim speed or battery reliability from screenshots.
- One focused final visual/interaction session: themes/OLED, accents, typography, long content, PDF/images/tables/code, font scaling, narrow/landscape/split screen, TalkBack semantics, Back/predictive Back, reduced motion and interrupted transitions. No animation on background refresh or changing text under the reader.
- Agent runs signed installed APKs on Windows Android16/17 emulators with explicit serials and disposable hosts. Samsung S24 Ultra, One UI8.5/9, physical OLED, OEM background behavior, actual Android file providers and real Mac/Wi-Fi checks remain user-owned or exact Mac AI handoffs. No phone access; no fake physical certification.
- Publish verified supported-platform release artifacts, final compatibility/update/recovery instructions and measured limits. Review all current guides and retire obsolete Android editing guidance from active entry points while retaining historical release evidence. Future priorities remain separately authorized.

**Acceptance:** reader companion and multi-workspace workflows pass installed end-to-end gates with a usable release and honest unavailable-platform status. Stop; no ongoing implementation implied.

## Every sprint: verification, documentation and release gate

At start inspect working tree, guide, versions and relevant implementation; preserve unrelated changes and mark only the authorized sprint in progress. Recheck current platform requirements when adopting dependencies/permissions/background APIs. Keep checks minimal: changed-target compilation, scoped lint and focused failure-prone tests. No routine Docker rebuild, broad API smoke or repeated full suites. API checks are appropriate for new isolation/sync/transfer contracts. Use disposable hosts/data and explicit emulator serials only.

Every handoff records date/source, what actually changed, test commands/results, failed attempts/corrections, fixture counts, inspected visuals/measurements, blocked platforms, migrations/rollback limits, release URLs/version/hash/signer and next authorization. Never count a retry as proof a reproduced product failure is fixed. Preserve original APK and desktop signing identities; never publish credentials, keys, private workspaces or recovery data.

Host/frontend changes follow [desktop release process](../desktop/RELEASE-PROCESS.md), fresh UI/embedded server and immutable source tags; Windows first with explicit same-tag Mac handoff if native Mac access is unavailable. Browser users receive the updated host assets. Android-only changes follow [ANDROID.md](../android/ANDROID.md), increment versionCode from the latest published version, package/lock/Gradle agreement, original signer and installed API36/37 checks, then publish immutable Android-only prerelease. Cross-platform sprints provide both artifact families and an update order/compatibility matrix; do not assume matching version strings mean compatible protocols. No mandatory payment, CI key upload or unsupported Linux artifact.

Maintain CODEBASE, docs index and this tracker; update authoritative topic guides rather than duplicating runtime descriptions. Planned additions: workspace hosting/identity/access/migrations; companion storage/download/sync; reviews; import/export/partial portability. Current API/search/session/security/export/appearance guides must change in the sprint that changes their behavior. Documentation-only planning needs no installer or version bump.

## Decisions to settle during their owning sprint

- W1: physical context implementation/resource limits, routing/protocol/legacy-client policy and owner/grant migration; verify feasibility before schema changes.
- W3/R5: versioned archive extensions, inclusion of synced review states and import remapping, explicit Trash policy. No forced assumption that format3 can carry every new domain safely.
- R1/R4: read-only rendering implementation and local transactional store/security; legacy recovery UX must precede deletion of its machinery.
- R3/R4: snapshot lifetime, download dependency/default scope, disk budget, refresh/metered defaults and offline file-text coverage based on measured fixtures.
- R6: bounded review text/quote limits and status notification cadence; no interrupting popups by default.
- R7/R8: supported import/export capability matrix and resumability under actual host transfer bounds; no unsupported offline converter promises.

## Explicitly deferred

General Android editing, live collaborative document editing, independently writable Android workspaces, two-way fork sync, cross-workspace links/global search, cloud/internet hosting, iOS, OCR, handwriting, precise PDF ink/rectangle annotation, tablets/DeX parity, Play Store enrollment, Ubuntu packaging and scheduled backups. [Future roadmap](future-roadmap.md) retains later work. Review items are not a general task-management system; no due dates/boards/reminders in this milestone.

## Execution ledger

2026-10-13: plan created from inspected single-datasource host, gate/identity/archive implementation and Android published baseline. Existing A8/A9 superseded; no app/schema/protocol/version changes, no new test or hardware claims. W1–W3 and R1–R10 all unstarted. Implementation requires the next authorization.

### W1 implementation and candidate verification — 2026-10-13

Implemented the ADR in [WORKSPACES.md](../architecture/WORKSPACES.md): eight bounded independent Spring domain/JPA contexts inside one JVM/listener, adopted legacy storage in place, atomic private catalog/grants and verified SQLite metadata checkpoint. Added authorized explicit header routing, fixed-default legacy behavior, owner UUID creation/rename/grants and selected-context files/indexes/gates/feeds/transfers. Desktop private stop drains every opened context. Existing schema/protocol3/archive3 and Android alpha.7.2 remain unchanged; no client selectors or offline reader yet.

Backend compilation and 19 focused cases passed (MultiWorkspace7, DesktopContract4, WorkspaceApi6, WorkspaceGate2), including actual CA-verified HTTPS grants/revocation and child streams, equal IDs/original bytes, concurrent requests, multipart/Trash, isolated export status/search/generation, corrupted/reopened catalog and child restart/limits. Corrected child lazy-association context and notification publication; corrected the old contract test expecting2 though production was already3. Initial test author error checked a nonexistent lifecycle success field and was corrected to the actual trashed status, not waived.

Fresh UI/embedded JAR/runtime bundle and Windows package compiled. Both bundled and packaged disposable isolation/export/private-stop/restart checks passed. Packaged Vaultor.exe native first/relaunch, note save and PDF preview passed with installed Java absent from PATH. Original-key EXE/sidecar preflight passed; candidate245560929bytes/SHA2561d117c3cde5d0c5966011f46f7932164093a037c0d6ec40f37951352d8a69b9d. No new UI layout/Android/phone/Docker/broad API/Mac-native claims. New declared OpenAPI IDs are unique; two pre-existing operations lack IDs and were not expanded in this sprint. Local docs/whitespace checks pass. Final source/tag/GitHub asset verification follows. W2–W3 and R1–R10 remain unstarted.

### W1 published release — 2026-10-13

[Windows0.8.0](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/v0.8.0) published at 2026-10-13T14:30:53Z; immutable tag/source `v0.8.0` / `8d2b9c72dbcdf3a9907a8b2c20d01f136c5d3352`. Original-key installer245560929bytes/SHA-256 `1d117c3cde5d0c5966011f46f7932164093a037c0d6ec40f37951352d8a69b9d`; signed sidecar398bytes. Downloaded pair verified before publication; public size/digests and non-draft/stable status checked after publication. Five UI assets identical across fresh UI/embedded browser/packaged native copies. Native unpacked executable and packaged bundle checks passed; no new installer install-over/uninstall test or native Mac check claimed. Owned disposable hosts stopped. Documentation-only publication follow-up; no source tag/runtime movement. In installed Windows: Updates → Check for updates → Update and restart. Mac remains0.7.1 until exact-tag native handoff; Android alpha.7.2 remains compatible with default workspace. W2 and all companion sprints unstarted.

### R1 implemented and published — 2026-10-14

[Android alpha.9.1](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/android/v0.1.0-alpha.9.1), versionCode13/protocol3, published2026-10-14T04:45:47Z from immutable ecfc423f9a0014599cfc6c812e08213538a21567. Restricted structured reader replaces editable Tiptap UI; compact drawer/Home, native original-write refusals and private legacy recovery ZIP retain protected drafts, uncertain identities and pending original file bytes without replay or acknowledgement. ReaderFeed avoids notification reconnect loops; hidden-note refresh retains Library.

TypeScript/native release and test compilation,26 focused Jest cases, restricted-reader DOM checks and scoped lint0errors/28warnings passed. Paired scope tests passed on API36/API37; separate genuine alpha.7.2 install-over/hostless recovery candidate checks preserved unknown JSON/original bytes. Alpha.9 final API37 list test failed, so its source tag remains immutable/unpublished. Alpha.9.1 bounds restoration after measured layout. Exact final staged APK installed on API36/API37: native recovery/refusals, huge saved-offset seed, direct cold list restoration without scrolling, reader UI and actual SAF ZIP destination write passed on each. Light/Dark final frames inspected. No phone/OneUI/physicalOLED/realMac Wi-Fi or full offline/rich-media acceptance claimed.

APK39,795,043bytes/SHA256d98566c924cf7adff9353f5319a47c7734ee8043cc75ecfa2bb4705d8e7e8b5f; original signer retained. All three GitHub assets downloaded/compared before publication; public non-draft/prerelease sizes/digests confirmed. Exact artifact/signature/install details are in [release notes](../android/releases/0.1.0-alpha.9.1.md). Disposable host/emulators stopped; personal app untouched. No desktop bump/schema/protocol/archive change. Documentation-only publication follow-up; no tag movement. Stop after R1: R2–R10 remain unstarted.

### R2 implemented and published — 2026-10-14

[Android alpha.10](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/android/v0.1.0-alpha.10), versionCode14/protocol3, published2026-10-14T10:08:42Z. Immutable source/tag2d7b406f0de71713fefd4c323f5f37a78f34e3fb/android/v0.1.0-alpha.10. Original-key APK39,842,389bytes/SHA2567ff64c6902a8de3bfe17f5c478fefe7d56ab1b7017c0f6f60570aad43bc0a8d1; all three assets downloaded/compared before publication, public sizes/digests/status checked afterward.

Implemented flat reading appearance, outline/literal find, safe confirmed external links, revision/block restoration, distinct link cycles and full-screen bounded image/PDF exploration with encrypted scoped viewing positions. Original mutations/recovery replay remain refused. Fixed native label hit targets and an Android17 viewport-expansion/pinch defect; added runtime regression and fail-fast native helper. TypeScript/native original-key compilation,22 focused Jest cases, reader/media DOM/runtime and scoped lint0errors/32warnings passed. Final candidate passed six native cases on each API36/API37, including real selection/Copy, pinch/swipe, PDF pages/limits/password errors, journey/Back, background/cold restore, all themes/OS/reduced motion and retained upgrade recovery. Clean tagged rebuild is byte-identical to both installed/tested candidates; installed API36 base APK also checksum-compared. OLED/Light/Dark/image/landscape frames inspected; API36 retains130% font. Failed harness attempts are not passes.

No host/desktop/API/schema/protocol/archive change or phone access. Owned emulators/disposable host stopped; personal app untouched. Physical OLED/Samsung/OneUI/TalkBack/realLAN and large-workspace/OOM certification remain explicit later/user checks. [Release notes](../android/releases/0.1.0-alpha.10.md) provide installation and limits. Documentation-only publication follow-up does not move the source tag. **Stop after R2; R3–R10 remain unstarted.**


## 2026-10-15 — R5 integration with current desktop redesign

The authorized integration branch combines master cf953fe presentation and ai/codex-current68dcca8 R5 semantics from common base11b09aa. Desktop0.14.0 is an unpublished integration candidate; historical Windows0.12.0/Mac0.13.0 releases stay immutable. Domain/archive4 and redesigned UI/focus/native validation are recorded in [R5/redesign integration](R5-REDESIGN-INTEGRATION.md). Android alpha.11 is unchanged. Stop after the integration branch push; R6–R10 remain unstarted.
