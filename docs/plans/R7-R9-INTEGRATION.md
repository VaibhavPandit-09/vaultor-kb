# R7–R9 master consolidation audit

Reviewed 2026-10-22. **STOPPED: confirmed source-security blocker; master and releases unchanged.** Integration/release authorization is explicit in this chat. R10 is not authorized or started. This record supersedes earlier candidate documents' statements that integration/publication lacks authorization; all correctness and release gates still apply.

## Fetched ancestry and strategy

Fetched origin with pruning before creating the isolated worktree. Actual remote tips:

| Ref | Commit |
| --- | --- |
| master | 31d80113cbfeea1576d85cf47ecf422fc276ea30 |
| ai/codex-r7-android | c55a833532ddfe3f59519f2c1d0f2a1780f3bff9 |
| ai/codex-r8-r9-android | c97a73c375f69a3ee232f2d6ccc4e504e9ef8068 |

Master is the master/R7 merge base; R7 tip is the R7/R8–R9 merge base. R7 has five commits after master: roadmap reconciliation, host imports/provenance, Android imports, refusal/recovery corrections and acceptance documentation. R8–R9 has four further commits: host exports/partial packages, Android exports/discovery/updates, interrupted-export derivative correction and acceptance documentation. There are no R7-only commits absent from R8–R9. These are sequential descendants, not divergent implementations.

Created `integration/r7-r9` at fetched master in `C:/GitDev/vaultor-r7-r9-integration`. Merged R8–R9 with `--no-ff --no-commit`, retaining all nine commits and applying R7 once. The merge has no textual conflicts; product review remains necessary. No feature branch or published tag was rewritten/deleted. Master worktree is `C:/GitDev/vaultor-r6-integration`.

## Combined contract audit

The 73-file source diff preserves R6's Home/Library/Review, reader, Aa, themes, semantic haptics and automatic Review delivery. Existing WorkspaceScreen/NavigationSurface changes add utilities rather than replacing the approved presentation architecture. Desktop changes add owner ZIP approvals and partial-import disclosure through the existing transfer/dialog controls. Shared client, focus/Escape, settings and design primitives remain.

R7 adds CompanionImports/ImportMarkdown, owner-approved CollectedZips and durable source/device/generation-bound receipt/rejection stores. Resource adds nullable original filename/MIME/hash/size/path provenance; purge/transfer/export logic carries these originals. Hibernate retains its additive schema update; receipt tables use CREATE TABLE IF NOT EXISTS. Android import queue schema1 is separate from companion schema3 and protected Review/legacy journals, with Keystore encrypted metadata/chunked originals. Share/pickers and destination confirmation feed captured-source transport without editor writes.

R8 adds companion export capability/preparation/status/download APIs and durable export claims in TransferService. Full ZIP becomes archive5 for provenance; partial6 is explicitly incomplete, merges or imports into an empty new workspace and cannot replace populated content. Existing archive1–5 reads and protocol3 remain. Offline exports use verified retained checkpoints with explicit missing provenance/host Review coverage; native exports have separate derivative storage and SAF/FileProvider handoff.

R9 adds bounded optional native NSD, existing pinned connection recovery, apksig verification of original APK signer/package/increasing code/ABI/API/signed protocol declaration, private update staging and explicit Android install consent. Dependencies added are host CommonMark0.30.0 and Android apksig9.2.1. Original desktop/Android trust policy files are unchanged. Candidate metadata is Windows0.16.0 and Android0.1.0-alpha.27/code31; neither is published by this audit. Earlier Windows0.15.0/Androidalpha.24 candidates remain historical.

## Release-blocking source-lock gap

The new export response handler handles 401/403 but omits authoritative workspace-grant refusal `404 WORKSPACE_UNAVAILABLE` and replacement `409 EXPORT_GENERATION_CHANGED`. WorkspaceRequestFilter intentionally returns that404 after a scoped grant is removed. The existing R6 ordinary/Review paths observe verified refusals and lock retained copies. Export's localIdentity callback merely checks the remembered host profile; it does not check workspace generation/grant. Its guards consult the companion lock, so failing to set it permits subsequent local reads/offline export after the refusal has already been observed.

The R7 import response handler also omits404 observation, although importAdmission correctly checks identity and observes generation changes. This is a related source-security gap requiring the same audit; no claim of native import reproduction is made here.

`ExportSourceBoundaryTest` adds two release-gate regressions using the real native SQLite/file companion and export worker with deterministic authoritative host responses. Both **failed on API36/emulator-5554**, reproducing the security defect: after404/WORKSPACE_UNAVAILABLE and409/EXPORT_GENERATION_CHANGED, `originalReadable=true; subsequentOfflineExport=ready`, with the scope still unlocked. This tests client refusal handling; it is not a real-LAN/pinned-HTTPS revocation test. Stop was triggered immediately after this result; API37 reproduction and further qualification were not run.

The user explicitly required STOP for a serious security blocker. Do not merge to master, create release tags, publish candidates, or begin R10 while this gap remains. Retain originals/queues/receipts; repair must use the established scoped observer and distinguish authoritative refusal from missing operations, maintenance and transient network failures.

## Actual validation

Fresh full runs in the integration worktree:

| Check | Outcome |
| --- | --- |
| Backend Maven full suite | 119 run;112 passed;7 context-startup errors with overlapping host-storage locks;0 assertion failures |
| Frontend Vitest full suite | 323 run;322 passed;LibraryView bounded-page test timed out at5s |
| Focused LibraryView rerun, maxWorkers2 | 11/11 passed; initial full-run timeout remains recorded |
| Desktop full Node suite | 43 run;38 passed;5 failures without prepared desktop/bundle in this new worktree |
| Android Jest full suite | 109/109 passed across24 suites |
| Android TypeScript | Passed before native build |
| Reader runtime initial attempt | Failed because generated reader.js was not built yet |
| Reader runtime after Gradle asset generation | All six rendering/evidence/reader/geometry/media groups passed |
| Fresh Android release + instrumentation build | Passed; original signer/com.vaultor.app/API36+/protocol3/code31/diagnosticsfalse verified |
| API36 targeted source-security release gate | 2 run;2 failed, both confirming readable originals and successful offline export after authoritative source refusal |
| API37 / complete API36 native acceptance suites | Not run; stopped for confirmed security blocker |

These are not a successful full-system qualification. Complete API36/37 acceptance suites, real R6 install-over/data preservation, Windows installer/signing qualification, public updater download/install, frontend/desktop native regression checks and compatible publication remain uncompleted in this integration task. Prior feature-branch results are historical evidence, not fresh integration passes. Samsung/One UI/TalkBack/OEM, real-LAN and Mac acceptance are unclaimed.

The local diagnostic APK was built from the uncommitted merged tree; its generated metadata reports pre-merge HEAD31d8011. It is not a clean tagged-source release artifact and must not be published. The app and test APK installed successfully on the explicit API36 emulator without clearing data; this is not a claim of R6 install-over preservation. The owned emulator is stopped after evidence collection. Raw task logs remain ignored under desktop/cache/r7-r9-integration-audit; backend XML reports remain under ignored backend/target/surefire-reports.

The blocked candidate and diagnostic/doc changes are preserved as a non-fast-forward merge checkpoint on integration/r7-r9, with parents master31d8011 and R8–R9c97a73c. It is not merged to master or release-qualified. Product code was not repaired after the STOP gate. No release tag/asset was created or overwritten; Windows0.16.0/Androidalpha.27 remain unpublished candidates. Original/source/master worktrees are checked separately at handoff; old feature branches remain.

## R10 boundary and next-chat handoff

R7–R9 are implemented acceptance candidates, pending security repair, complete combined qualification, master integration and compatible Windows/Android publication. Master remains the released R6 baseline until then; there is no new R10 starting baseline yet. Retain all feature branches.

R10 retains the approved reconciliation's integrated Small/Atlas5000 scale/performance/lifecycle, accessibility, legacy/current upgrade, fault and cross-device/platform acceptance scope. It must start in a fresh chat from fetched verified master only after preceding milestones are integrated/released. It does not authorize UI redesign, general editing/two-way synchronization, backups/OCR/Linux expansion or phone access.

Next chat: read CODEBASE, AI_DEVELOPMENT_WORKFLOW, this audit, UI_PHILOSOPHY, ANDROID_UI_PHILOSOPHY and the reconciliation. Resume security remediation/qualification on integration/r7-r9 first; do not start R10 from an unmerged feature branch. Preserve all frozen import/export/Review identities, protected bytes, host authority and original signing identities. Follow the original user's stop/authorization scope before proceeding.
