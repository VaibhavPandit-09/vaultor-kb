# R7 handoff after completed R6

Reviewed2026-10-22. R6 is complete as a development milestone. This post-release documentation handoff does not implement or authorize R7 work in the release task.

## 1. Authoritative source and product state

R6 master merge: **5b0b63981a3ed2cfa83981ca9e8148f7067ceb30**, preserving validated integration21ac91a. Authoritative product/release master commit: **7b5baf5f0b732a85e2d152296de69c405bfd4c67**; immutable tag **android/v0.1.0-alpha.23**. This handoff is an explicitly documented later documentation-only master commit; never move the source tag. Fetch current master before starting new work.

[Official R6 Android alpha.23/code27](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/android/v0.1.0-alpha.23) is a production prerelease with diagnostics disabled. Package remains com.vaultor.app, original signer, min36/target37, arm64-v8a/x86_64 and16KiB packaging. Install over existing alphas without uninstalling or clearing data. R6 is not an Android1.0/stable declaration.

## 2. Desktop and Android compatibility

Use published [Windows0.14.0](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/v0.14.0) for the integrated redesign and R5 Review Inbox. Minimum Review host is0.12.0/reviews:1; download preparation needs0.11.0/companionSnapshots:1. Protocol3/archive4 remain. Desktop/frontend/backend production matches public0.14.0; no new desktop package was required. Mac0.13.0 lacks Review capability; integrated Mac verification remains pending.

## 3. Completed capabilities and contracts

R5 supplies immutable generation-scoped Review evidence, idempotent UUID/body creation, conditional desktop triage, archive4 portability and original-resource isolation. R6 supplies source-bound offline reading/search/media, protected draft/queue journals, one-action completion, automatic foreground/reconnect delivery, exact uncertain retries, desktop status reconciliation, source/grant/revocation locks, reader-first navigation/resource motion and contextual settings.

Preserve resource-based originals, structured Tiptap JSON, shared API/design tokens, centralized Escape/Back/focus and exact host/workspace/generation/resource/revision. Native owns narrow write admission, pinned TLS and protected journals. Queued evidence never retargets or shares download eviction. React Native owns UI/motion; thin Kotlin owns platform capabilities and semantic haptics. Do not restore general Android editing/lifecycle writes.

## 4. Next roadmap scope and authorization

Existing [R7 roadmap](workspace-companion-plan.md#r7--offline-imports-and-durable-collection-queue): **Offline imports and durable collection queue**. It is defined, not started. The next chat must receive implementation/sprint authorization and audit the current implementation first; do not invent another roadmap.

Scope: picker/Share inputs; promptly retain expiring URI bytes in bounded private staging; frozen source/destination/generation/collection, filename/MIME/hash and stable UUID; explicit destination on cold Share; exact retry/uncertain-outcome reconciliation and visible partial success; host conversion for text/Markdown. Workspace ZIP is import-as-new only when authorized, with no mobile replacement/admin surface. Delete staging only after exact acknowledgment; cancellation cannot promise to undo an uncertain commit. R8 exports/R9 updater remain later work.

## 5. Source and architectural entry points

Read [CODEBASE](../CODEBASE.md), [Reviews](../workspace/REVIEWS.md), [Review sync](../android/REVIEW-SYNC.md), [offline storage](../android/OFFLINE.md), [host security](../security/HOST-ACCESS.md) and [API](../development/API.md).

Inspect mobile/src/WorkspaceScreen.tsx, ReviewCapture.tsx, ReviewDestination.tsx, useReviewSync.ts, reviewSyncRunner.ts, ReaderView.tsx and ResourceMotion.tsx. Native entry points are VaultorModule.kt, VaultorReviews.kt, VaultorReviewSync.kt and VaultorCompanions.kt under mobile/android/app/src/main/java/com/vaultorandroid. Inventory retained legacy upload/media recovery before designing new queues; never replay it as new authorized work. Host entry points are FileImportService, ReviewService/Controller, CompanionSnapshots, TransferService and workspace/access gates.

## 6. Evidence and technical debt

[Alpha.23 ledger](../android/releases/0.1.0-alpha.23.md) owns final source/checksum/install-over and publication evidence. Fresh checks include backend19, frontend321, mobile104Jest/TypeScript/reader, Electron compatibility and44native cases on each API36/37 with2deliberate death/recovery checkpoints each. Broader integration backend53/desktop43 evidence is retained separately. Both actual alpha.22→23 upgrades retain protected identity/state; final installed/tagged/staged/public bytes match.

Maintenance refusal timing exposed test-fixture races; helpers retry only bounded explicit pre-mutation WORKSPACE_BUSY, not arbitrary failures or uncertain writes. Existing framework/dependency deprecations, bounded store/preview limits and broader stress/performance coverage remain debt. No dependency upgrade occurred.

## 7. Physical acceptance and known limits

Samsung S24 Ultra subjective motion/haptics, spoken TalkBack, Samsung keyboard/One UI/OLED, actual Wi-Fi, OEM lifecycle/battery, sustained hardware performance and integrated Mac native verification remain unclaimed, nonblocking follow-ups. Delivery while suspended/force-stopped is not guaranteed. Permission/reapproval may need explicit action. Generation/UUID conflicts retain evidence for investigation. Reading files rely on sandbox/device encryption; protected journals use separate encryption. No phone access occurred.

## 8. Testing rules

Use disposable hosts/workspaces/emulators and explicit emulator serials, normal owner approval, TLS pins and revision/generation checks. Never access/pair the user's phone or log/export credentials/private keys. Validate R7 cold/offline Share, URI loss, disk full, process death, uncertain commit, duplicate names, collection change, grants/replacement/source switches and exactly one correct host outcome. Run focused compilation/domain/native checks; broaden only for affected behavior. Screenshots/emulators do not certify hardware motion/haptics.

## 9. Release and documentation rules

Update CODEBASE/index/topic guides in each change. Retain original signer/application ID and monotonic versionCode; production diagnostics stay off. Build from clean pushed immutable source, verify final APK/sidecars, install alpha.23→next on both APIs and publish immutable verified GitHub assets. Ship a compatible desktop update only if R7 changes host contracts. Preserve protected capture, offline and legacy recovery data. Stop at authorized sprint boundaries.

## 10. Fresh branch/worktree

Read AGENTS, AI_DEVELOPMENT_WORKFLOW and both UI philosophy documents. Fetch and inspect current master/clean trees; start an isolated branch/worktree from latest verified origin/master, for example codex/r7-offline-imports. Do not begin from an old Android feature branch. C:/GitDev/vaultor-r6-integration is the master/release checkout; C:/GitDev/vaultor-kb remains historical ai/codex-r6-android. All three historical R6 branches are retained for later retirement. No R7 feature was implemented during release closure.
