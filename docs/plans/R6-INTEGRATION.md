# R6 Android integration and verification

Historical integration-stage report. On2026-10-22 the user separately authorized master merge and publication; [R6 alpha.23 release](../android/releases/0.1.0-alpha.23.md) and [R7 handoff](R7-HANDOFF.md) record closure. Original stop-before-master boundaries below describe that earlier task.

Audited 2026-10-21. Integration only; no release, tag, master merge or R7 authorization.

## Source audit

| Source | Fetched tip | Role |
| --- | --- | --- |
| master | fb053862df386c1fefe9d9db2a7924eb63979b22 | authoritative desktop 0.14.0/R5 baseline |
| ai/codex-android-ux-prototypes | 4d07984febaed58c459dfe45a8fb7e03ed6f367d | completed R6 alpha.22/code26 |
| ai/codex-r6-android | 6308fd660ef63d49be2bbbc3483616bdae2dfcb8 | A0–A3 and alpha.17 publication history |

Both source checkouts were clean. Local tips equal origin after fetch. Master is an ancestor of the UX tip; there are no master-only commits. Original/UX merge base is 1586743a6d15e55be824aa62a5a1c4019ac98cbe. The only original-only commit is 6308fd660ef63d49be2bbbc3483616bdae2dfcb8; its complete six-file diff contains documentation only. No original-only source, test, dependency, schema or API contract exists. This conclusion uses ancestry and complete commit diffs, not matching filenames.

The dedicated worktree is C:/GitDev/vaultor-r6-integration, branch integration/r6-android, created from the fetched master. Existing checkouts remain untouched. Primary integration uses non-fast-forward merge 27af9f7ab830b0ada5ddc9b43b45a4ff36709bbb with both parents retained. The sole original-only commit is explicitly cherry-picked with -x as 19f93a9; no entire original-branch merge is performed.

## Conflict and semantic audit

The primary merge has no textual conflicts because master is an ancestor. The publication-record cherry-pick has exactly one textual conflict in docs/android/ANDROID.md: the alpha.22 current-development introduction overlaps the old alpha.17 current-release introduction. Resolution keeps alpha.22 as the current local candidate and preserves the complete alpha.17 publication identity/evidence under the historical-release heading. Other five publication-record files apply cleanly and were reviewed. Desktop and frontend trees and backend production sources remain byte-identical to master. All changed paths are inventoried below. Backend changes are tests only: blank-comment rejection and ChangeFeed test migration from retired DELETE to favorite mutation plus bounded maintenance-409 retry. No desktop redesign, shared client, Escape/focus, Tiptap schema, ReviewService, OpenAPI, protocol3 or archive4 downgrade occurs.

Native Review delivery was compared with the actual master ReviewService/controller: immutable UUID PUT body retains generation/resource/comment/quote/context/locator/baseRevision; receipt comparison never substitutes GET for uncertain PUT. Exact captured host/workspace/grant/generation admission uses pinned TLS and explicit workspace routing. GET status rechecks generation after response. Durable sending claim, separate protected draft/queue journal, bounded retry and receipt retention remain. R5 nonblank comment requirement matches Create Review; Keep draft never completes. Original resources are read-only from Android. Native transport restricts write paths and does not change the selected source. Revocation feeds retained-source locks.

Android layout/motion is preserved from the accepted candidate: measured origin aperture, retained reader native owner, reversible committed Back, source-bound context and centralized semantic haptics; reduced motion and cancellation do not own correctness. No integration redesign is introduced. Real S24/TalkBack/OEM acceptance remains user-owned.

## Original R6 publication delta

6308fd6 updates CODEBASE, ANDROID, MOTION-HAPTIC-REMEDIATION, alpha.17 release ledger, android-r6-plan and workspace-companion-plan. Preserve the immutable publication timestamp/source/checksum/publication evidence and historical comparison links. Its then-current alpha.17/A4-blocked status is historical: alpha.22/A4 implementation supersedes it. Do not restore that old gate as today's status. The full original commit remains on its source branch; integrate its documentation with explicit provenance rather than merge the entire divergent branch. All six changed documents are incorporated. No original-only implementation or test is omitted. The historical A4 stop remains in dated ledgers; it is not reinstated as a current gate. Current architecture/completion/index/install guidance is reconciled to alpha.22/A0–A5 engineering and links to one authoritative contract per topic.

## Versions and releases

Desktop package/lock stay 0.14.0. Android package/lock/Gradle stay alpha.22/code26, com.vaultor.app, min36/target37 and original signer. This is verification of an existing candidate, not a new distributed APK; no automatic version bump. Existing release notes and tags remain immutable. GitHub release inventory confirms alpha.17 is the latest published Android prerelease; alpha.18–22 are local development candidates, not public releases. Windows0.14.0 is published; integrated Mac delivery retains its existing gate. No publisher or tag mutation is permitted in this task.

## Validation

Fresh checks run from C:/GitDev/vaultor-r6-integration; historical alpha.22 evidence stays in its ledger and is not counted as a new run. Local logs are retained under mobile/cache/integration, excluded from Git.

| Check | Fresh result |
| --- | --- |
| npm ci frontend/desktop/mobile | pass, locked dependency trees; npm warns about existing deprecations/pending dependency scripts |
| desktop build (frontend TypeScript/Vite + fresh copied UI) | pass |
| frontend Vitest, maxWorkers=2 | 65 files / 321 tests pass |
| desktop syntax and Node tests with fresh bundle | 43 tests pass |
| Java25 backend contracts | 53 distinct cases pass across Review15, Companion13, DesktopContract4, NoteExportGraph1, MultiWorkspace7, WorkspaceApi6, WorkspaceGate2, HostAccess2, ChangeFeed3 |
| prepare-server | pass, fresh browser assets/JAR and pinned Temurin runtime |
| Electron/browser Review native check | pass: triage, counts/paging, unchanged originals, scoped note/file entry, preview/Escape/focus, narrow/themes |
| Android TypeScript / Jest | pass, 22 suites / 104 tests |
| generated reader + DOM/runtime/selection/geometry/media | pass |
| Android full ESLint | 0 errors / 149 existing warnings |
| Android original-signer release + instrumentation build | pass, both required ABIs, min36/target37, com.vaultor.app, code26, nondebuggable development diagnostics candidate |

Integration local APK: 40,088,449 bytes, SHA256 a0ecca11727f7f310a5d6bc077c12a6ef5bfd4fa797bf339b353169b28ede359, signer af1123bd0be38ee48ce61b4f40f3667c4fe740910b64005d3d21dacd83de2567. Built from merge27af9f7; subsequent changes are documentation and a backend test assertion only, with no Android product/source/build-input change. This is a same-version local verification build, not historical byte reproduction or a distributable update.

Initial failures and corrections are not hidden: the default high-parallelism frontend run passed320 and timed out once in LibraryView; the bounded-worker run passed321. Initial desktop tests lacked the generated server bundle (38pass/5fail); after fresh prepare-server all43 pass. Reader runtime initially lacked generated assets; build:editor then runtime pass. One initial Review replacement test encountered maintenance409; the later full15case Review run passes. An overlapping Maven clean/package invalidated an intermediate test run; it was discarded, then clean tests and packaging ran sequentially. Companion manifest access after READY raced a short maintenance gate: integration changes only that test assertion to use its existing bounded WORKSPACE_BUSY retry; the complete13case suite and corrected focused case pass. Concurrent original-write rejection assertions remain. Python was unavailable via its shell alias; no product change resulted. Synthetic media already produced by reader-fixture.py was reused from the prior disposable test cache.

Native/real-host results follow below.

## Incorporated primary commit range

Full range: fb053862df386c1fefe9d9db2a7924eb63979b22..4d07984febaed58c459dfe45a8fb7e03ed6f367d.

```text
439dab1e4aaa177b1dc6ce49de14f0371ab5d6c0 feat(android): establish A0 motion and haptic foundations
013bc8017083533271c783592dde0eb9f67e53e4 docs(android): record verified A0 review publication
25dad991fee359d7940eba07aed33193cf9e58ce feat(android): redesign A1 shell and source navigation
6a19079b9fbfd984f4385148d7cf2088babb6032 docs(android): record verified A1 review publication
02e39fac3a723cc9789a229d99bf33431ba6ba8e Redesign Android reader context and media continuity for R6 A2
212d70fb3ea20118e51e766d43b2e07c7c4d3579 Record verified Android alpha.14 publication and A2 review boundary
2ab19c6f97f273dfad9865618df6a0b4442e9756 Add source-bound offline Review capture to Android
25fac7eed0d58ceef03ae8cb323db5859c83f419 Include focused Android capture source tests in release source
f201755942aaed4209e93bf1f43179412a057741 Preserve capture across Android keyboard Back handoff
7d64708fd61fbb98bcdf6cdd15332951c2c6351b Record final A3 installed Android release gates
2cce6638d5d86e07cee3883c473fee14c355b7d7 Record published A3 Android capture release
c4c57eceda6fb5b118cd9148637bb22f72782c3b Audit shipped Android motion and haptic acceptance failures
26c30f7893d9051f1919df675f4bd917f4e67b53 Add observable semantic haptics and build-gated acceptance diagnostics
fbf8c36ad1e143796c6aa257f4a3f0bf89e296e2 Make contextual motion visible and synchronize capture feedback keyframes
5a68d16a17df26b155f3777cba9815697dec2efc Keep evidence stable through local save and interrupted motion
36d2dfafdc142bc88f09d21e91dee43959e9f63b Respect immediate Off selection in development feedback probes
bdc79a70ae6e7ef7e5c3a25f082376048f406ae8 Keep destructive feedback distinct through capability fallback
94e9f731ca8ce574060b7eb8df0242d6f9edf2c7 Verify actual capture feedback with explicit positive device policy
7d8487a48d0fa6b502b4f8e41e86c8974cd4652a Align saved feedback with keyboard release and resilient receipt motion
9197816856d823b4f1efd35098e6d2985ced295c Record remediation acceptance gates and verify assets independently
4d597b9115f13afdd3941217aad1dba438419387 Record published Android remediation acceptance candidate
3558637046c31c565678482e0998572c13fea68e Audit alpha.16 hybrid interaction boundary and restrained usage
7e271e300374540fceba2147ae8d1d0192778951 Establish restrained hybrid haptics and contextual motion ownership
1c8e07e7ae31c0dc1adf802c13ad4ebd6907bb98 Complete native silence assertions for Find and accent choices
3696642d9d2371e4683d8024e0e7ccc491bf34ef Require enabled feedback policy for native silence proof
5824b2ee13cdb06c3beec18767a80d1fc5c3df78 Verify hybrid capture wiring and correct native comparison setup
1586743a6d15e55be824aa62a5a1c4019ac98cbe Record hybrid Android acceptance gates and comparison limits
c6fc16ea1294c1445b13080916806ddc6be4762a Add development-only real Review capture feedback trace
48c339601cf37fa3a052e5ba5754ff092067a001 Record installed trace acceptance build and Samsung handoff
ed7ed7175d5539234dcb50cbd0cf4afcedb5c1cd Prototype reader-first Android navigation and contextual sources
c0731e05243ba526fc817d4d8254fe01fb0f4c7d Refine Android navigation balance, contextual Sources and Library density
aba15a8372fdd544d12220b1a1d4583bc5a3d525 Separate quick source switching from management and expose reader appearance
74f3b52eaddf7668ec88d9225099937e54028ee6 Connect resource origins to a retained reader with reversible aperture motion
05015bc76a9eaf0859e18d90d8ff0b4b8c806447 Deliver protected Review queue through exact native source admission
90d369c100b9510b37c1120c45a69b12779f46b6 Complete consolidated R6 usability, access-lock and runtime gates
fa05523e7f0bfd63805794192c6975685f7d1090 fix(android): complete Review once and recover foreground delivery
b7af1cbcc08347faff8c9a1387ed011b710edaff fix(android): bound retained reader cleanup and verify A5 lifecycle
d00cf3c885254385ebb2e0e29b8858e415b48112 fix(android): give retained WebView an explicit native visibility owner
4d07984febaed58c459dfe45a8fb7e03ed6f367d test(android): verify consolidated R6 milestone and document acceptance
```

## Complete primary path inventory

```text
M	AGENTS.md
M	backend/src/test/java/com/vaultor/vaultor/ReviewTest.java
M	backend/src/test/java/com/vaultor/vaultor/host/ChangeFeedTest.java
M	docs/CODEBASE.md
M	docs/README.md
M	docs/android/ANDROID.md
A	docs/android/HAPTIC-CAPTURE-TRACE.md
A	docs/android/INTERACTION-FOUNDATIONS.md
M	docs/android/MEDIA.md
A	docs/android/MOTION-HAPTIC-REMEDIATION.md
A	docs/android/NAVIGATION-PROTOTYPE.md
A	docs/android/R6-COMPLETION.md
A	docs/android/READER-CONTEXT.md
M	docs/android/READER.md
A	docs/android/REVIEW-CAPTURE.md
A	docs/android/REVIEW-SYNC.md
A	docs/android/SHELL-NAVIGATION.md
A	docs/android/releases/0.1.0-alpha.12.md
A	docs/android/releases/0.1.0-alpha.13.md
A	docs/android/releases/0.1.0-alpha.14.md
A	docs/android/releases/0.1.0-alpha.15.md
A	docs/android/releases/0.1.0-alpha.16.md
A	docs/android/releases/0.1.0-alpha.17.md
A	docs/android/releases/0.1.0-alpha.18.md
A	docs/android/releases/0.1.0-alpha.19.md
A	docs/android/releases/0.1.0-alpha.20.md
A	docs/android/releases/0.1.0-alpha.21.md
A	docs/android/releases/0.1.0-alpha.22.md
M	docs/design/ANDROID_UI_PHILOSOPHY.md
A	docs/plans/android-r6-plan.md
M	docs/plans/workspace-companion-plan.md
M	docs/workspace/REVIEWS.md
A	mobile/.eslintignore
M	mobile/App.tsx
A	mobile/__tests__/browsePresentation.test.ts
A	mobile/__tests__/captureTrace.test.ts
A	mobile/__tests__/navigationPresentation.test.ts
A	mobile/__tests__/presentation.test.ts
M	mobile/__tests__/readerFeed.test.ts
M	mobile/__tests__/readingPreferences.test.tsx
A	mobile/__tests__/resourceGeometry.test.ts
A	mobile/__tests__/resourceMotionLifecycle.test.tsx
A	mobile/__tests__/reviewCreation.test.tsx
A	mobile/__tests__/reviewDelivery.test.ts
A	mobile/__tests__/reviewSyncRunner.test.ts
A	mobile/__tests__/reviews.test.ts
A	mobile/__tests__/sourceChoices.test.ts
A	mobile/__tests__/sourcePresentation.test.ts
M	mobile/android/app/build.gradle
A	mobile/android/app/src/androidTest/java/com/vaultorandroid/CaptureExperienceTest.kt
A	mobile/android/app/src/androidTest/java/com/vaultorandroid/CaptureFeedbackTraceTest.kt
A	mobile/android/app/src/androidTest/java/com/vaultorandroid/FeedbackDiagnosticTest.kt
A	mobile/android/app/src/androidTest/java/com/vaultorandroid/NavigationExperienceTest.kt
A	mobile/android/app/src/androidTest/java/com/vaultorandroid/PresentationExperienceTest.kt
A	mobile/android/app/src/androidTest/java/com/vaultorandroid/PresentationTest.kt
A	mobile/android/app/src/androidTest/java/com/vaultorandroid/R6MilestoneTest.kt
A	mobile/android/app/src/androidTest/java/com/vaultorandroid/ReaderContinuityTest.kt
A	mobile/android/app/src/androidTest/java/com/vaultorandroid/ReaderMotionExperienceTest.kt
A	mobile/android/app/src/androidTest/java/com/vaultorandroid/ReviewStoreTest.kt
A	mobile/android/app/src/androidTest/java/com/vaultorandroid/ReviewSyncExperienceTest.kt
A	mobile/android/app/src/androidTest/java/com/vaultorandroid/ReviewSyncTest.kt
A	mobile/android/app/src/androidTest/java/com/vaultorandroid/ShellExperienceTest.kt
M	mobile/android/app/src/androidTest/java/com/vaultorandroid/WorkspaceTest.kt
M	mobile/android/app/src/main/AndroidManifest.xml
A	mobile/android/app/src/main/java/com/vaultorandroid/CaptureFeedbackTrace.kt
A	mobile/android/app/src/main/java/com/vaultorandroid/VaultorHaptics.kt
M	mobile/android/app/src/main/java/com/vaultorandroid/VaultorModule.kt
A	mobile/android/app/src/main/java/com/vaultorandroid/VaultorPresentation.kt
A	mobile/android/app/src/main/java/com/vaultorandroid/VaultorReviewSync.kt
A	mobile/android/app/src/main/java/com/vaultorandroid/VaultorReviews.kt
M	mobile/package-lock.json
M	mobile/package.json
M	mobile/reader/index.js
M	mobile/reader/media.js
M	mobile/reader/reader.css
M	mobile/scripts/build-release.ps1
M	mobile/scripts/publish-apk.mjs
A	mobile/scripts/review-fixture.mjs
M	mobile/scripts/test-reader.mjs
M	mobile/scripts/verify-apk.mjs
A	mobile/src/Action.tsx
M	mobile/src/BrowseScreen.tsx
A	mobile/src/ContextSheet.tsx
A	mobile/src/DevelopmentFeedbackPanel.tsx
A	mobile/src/FeedbackPreview.tsx
A	mobile/src/MotionSheet.tsx
A	mobile/src/NavigationFolio.tsx
M	mobile/src/NavigationSurface.tsx
M	mobile/src/ReaderView.tsx
M	mobile/src/ReadingControls.tsx
A	mobile/src/ResourceMotion.tsx
M	mobile/src/ResourcePreview.tsx
A	mobile/src/ReviewCapture.tsx
A	mobile/src/ReviewDestination.tsx
A	mobile/src/SourceContext.tsx
M	mobile/src/WorkspaceScreen.tsx
A	mobile/src/browsePresentation.ts
A	mobile/src/captureTrace.ts
A	mobile/src/haptics.ts
A	mobile/src/motion.ts
A	mobile/src/navigationPresentation.ts
M	mobile/src/readerFeed.ts
M	mobile/src/reading.ts
A	mobile/src/resourceGeometry.ts
A	mobile/src/reviewDelivery.ts
A	mobile/src/reviewSyncRunner.ts
A	mobile/src/reviews.ts
A	mobile/src/sourceChoices.ts
A	mobile/src/sourcePresentation.ts
A	mobile/src/themeTransition.ts
M	mobile/src/ui.ts
A	mobile/src/useReviewSync.ts
```

## Remaining gates and proposed master merge

S24 subjective motion/haptic quality, spoken TalkBack, Samsung keyboard/One UI/OLED, actual Wi-Fi and OEM suspended/battery behavior remain user-owned. This task provides emulator/loopback pinned-HTTPS integration evidence, not Samsung acceptance or sustained FPS/memory certification. Background delivery remains best effort. No Mac native build/test or new Windows installer install-over is claimed; desktop source/production backend stay identical to the published Windows0.14.0 baseline. Mac0.13.0 lacks reviews:1/archive4; a compatible host is required for delivery. No desktop/Android release assets, final tags or R7 work are created.

After explicit approval, fetch again and verify master still equals fb05386. If unchanged, prefer a non-fast-forward merge of integration/r6-android into master, preserving merge27af9f7 and publication cherry-pick19f93a9 plus the verification commit. Then verify master ancestry/clean state and rerun focused Review/native host compatibility gates before separately authorized release preparation. If master advances, integrate that new baseline in this branch, inspect all overlaps and repeat affected checks before approval; do not reset or force-push either source. Retain all source branches and historical tags.

## Existing release and tag inventory

Read-only GitHub inventory: 33 records. None were created or modified by integration. Annotated tag rows list tag object then peeled source; lightweight tags list source directly.

| Existing release | Published UTC | Kind |
| --- | --- | --- |
| android/v0.1.0-alpha.17 | 2026-10-19T07:36:23Z | prerelease |
| android/v0.1.0-alpha.16 | 2026-10-16T12:00:42Z | prerelease |
| android/v0.1.0-alpha.15 | 2026-10-16T07:14:53Z | prerelease |
| android/v0.1.0-alpha.14 | 2026-10-16T04:03:47Z | prerelease |
| android/v0.1.0-alpha.13 | 2026-10-15T23:26:54Z | prerelease |
| android/v0.1.0-alpha.12 | 2026-10-15T22:25:32Z | prerelease |
| v0.14.0 | 2026-10-15T18:34:48Z | stable |
| v0.13.0 | 2026-10-15T13:31:20Z | stable |
| v0.12.0 | 2026-10-14T20:50:06Z | stable |
| android/v0.1.0-alpha.11 | 2026-10-14T16:52:51Z | prerelease |
| v0.11.0 | 2026-10-14T11:20:55Z | stable |
| android/v0.1.0-alpha.10 | 2026-10-14T10:08:42Z | prerelease |
| android/v0.1.0-alpha.9.1 | 2026-10-14T04:45:47Z | prerelease |
| v0.10.0 | 2026-10-13T18:57:37Z | stable |
| android/v0.1.0-alpha.8 | 2026-10-13T15:37:52Z | prerelease |
| v0.9.0 | 2026-10-13T15:38:46Z | stable |
| v0.8.0 | 2026-10-13T14:30:53Z | stable |
| android/v0.1.0-alpha.7.2 | 2026-10-09T16:11:32Z | prerelease |
| android/v0.1.0-alpha.6.1 | 2026-10-09T10:39:09Z | prerelease |
| android/v0.1.0-alpha.5 | 2026-10-09T09:32:21Z | prerelease |
| android/v0.1.0-alpha.4 | 2026-10-09T04:51:27Z | prerelease |
| android/v0.1.0-alpha.3 | 2026-10-08T23:00:44Z | prerelease |
| android/v0.1.0-alpha.2 | 2026-10-08T21:55:09Z | prerelease |
| android/v0.1.0-alpha.1 | 2026-10-08T18:48:40Z | prerelease |
| v0.7.1 | 2026-10-08T16:32:34Z | stable |
| v0.7.0 | 2026-10-08T12:53:36Z | stable |
| v0.6.0 | 2026-10-08T12:15:42Z | stable |
| v0.5.0 | 2026-10-08T09:45:07Z | stable |
| v0.4.1 | 2026-10-08T06:30:33Z | stable |
| v0.4.0 | 2026-10-08T04:38:39Z | stable |
| v0.3.2 | 2026-10-07T18:09:05Z | stable |
| v0.3.1 | 2026-10-07T17:06:07Z | stable |
| v0.3.0 | 2026-10-07T15:59:36Z | stable |

```text
android/v0.1.0-alpha.1 851677cb868cf6c7458fe9bbd12794f13029b525 3371f53cac6b1ddee5044a7b8506881a45f33d8b
android/v0.1.0-alpha.10 2d7b406f0de71713fefd4c323f5f37a78f34e3fb
android/v0.1.0-alpha.11 f9a4fb3cedf82e0d7edee2c6c25ec4d272fb4e7f f140b9de8f693d396dc2ba3f93a7e9bfd7b57dab
android/v0.1.0-alpha.12 439dab1e4aaa177b1dc6ce49de14f0371ab5d6c0
android/v0.1.0-alpha.13 25dad991fee359d7940eba07aed33193cf9e58ce
android/v0.1.0-alpha.14 02e39fac3a723cc9789a229d99bf33431ba6ba8e
android/v0.1.0-alpha.15 7d64708fd61fbb98bcdf6cdd15332951c2c6351b
android/v0.1.0-alpha.16 9197816856d823b4f1efd35098e6d2985ced295c
android/v0.1.0-alpha.17 1586743a6d15e55be824aa62a5a1c4019ac98cbe
android/v0.1.0-alpha.2 c15af6190415161bcd2a71ff8d06d41e3ce5cad9
android/v0.1.0-alpha.3 3c2b346be7b3e638ecd685263b348ce3bff06524 4c55af16c9405e79000d94998ba68c2704cb42ca
android/v0.1.0-alpha.4 6ed7993d7235555b65323f091ab1d13470ef99cc aa9106878313decc202c14248f66a031bd7c70cb
android/v0.1.0-alpha.5 6935ba3aedd019ce9b33b3736b1c609660e76bdc
android/v0.1.0-alpha.6 1b19331e8e70fb1a3a8c14e1bd02613b8c81249c
android/v0.1.0-alpha.6.1 1ae12669f3149c54fd03ae6b42a056a3fa32cbbd
android/v0.1.0-alpha.7 f4ac58543e0fc1e76ef06cb0245076072fac13c1
android/v0.1.0-alpha.7.1 78c70e19b4968b17bbc647a2079033287881e7fd
android/v0.1.0-alpha.7.2 482857ceb43df34a92592c1ab4c26192ad70c70e
android/v0.1.0-alpha.8 8d46dc5d9558879784dbcc9f8e7bd3f125ab4cbb 74f628b53d5516d4def9e796f03d30abccce8cd8
android/v0.1.0-alpha.9 f0bcc0828853176cae4f1418944dea46fe9f1a1f
android/v0.1.0-alpha.9.1 ecfc423f9a0014599cfc6c812e08213538a21567
post-r5-ui-integration f46144fb0543ce8b7e9a3efbb4bfa9789fd07755 6e5c553e844dfb64bba55f84a84bf0a578b89ead
v0.10.0 839bf5dccb74a96b78d073fe19ba3eefd7f8094a b96006b0f43f46934f2d3cf5b41ac9078a0a8705
v0.11.0 b87b2388e12a73dd2093efdb5c4fb96a8ac45ace 8abd3fe6016475f9a37b7e199007ca729be88f50
v0.12.0 0eca8806185021bfbbf4719a954e41498e162977 4e2f71394547bf87422ac751793f56013bd7d043
v0.13.0 afc24353e8a1f9a643e266c4c44aa2a33aa3c88c 3615aa2131edf34cd480f16801d7eac6fac98f5f
v0.14.0 ebff3bc2ca8d77e9de34d033f684bca4d0996372 294b66e18eccf4a4a81c46b3972f81b384035458
v0.3.0 8ab773348331ed0e66e093c581c6b80544e6f910 9ee968cbf2c4af0f58fe58bde1529d6007c34278
v0.3.1 dd57027118b2c4ba372eb98a429fa125381cfa3f 6eb92e70b2a1279cc52116a7a0aaa2ea048d8b47
v0.3.2 788d696411878890c8c351f811e5e8c2dcb4fdf9 7fe56bc462aa9f44a25aaed296b2e62915bb61e0
v0.4.0 4b338117d2938c1eadd2f608cd04c19775d206fc c2d430592600db006131a2c2665aad1101ce80db
v0.4.1 f2bb40b0c8a8be604499f1f3519c4b3aba448180 ee8a769a6b501163f7f6e83e0c6c6c7f458db1e0
v0.5.0 3608699516b8402ba44c23acfe57467cb003fdf2 697cd171106c8a612096c7a645d7467f67b14a77
v0.6.0 edf13ab9745974da54cd625a75d86f3f88b4a0d3 d1fb85fdd55d2604733042b390a49ea325282119
v0.7.0 ea17c38117348bd66efd528e84ece9e5d8c38c45 1aa70a6f42b030a58fb067a59d1be845db27d6db
v0.7.1 7766bff9920d7167c3e5ed1b111de2697303f65a 3e455cd05e6ad722e7a38e07d9b102dd25e39609
v0.8.0 29c06815a73158f623970845dfdd51d1666ddd83 8d2b9c72dbcdf3a9907a8b2c20d01f136c5d3352
v0.9.0 2eae95d0836ff1a1ce9dc8f620d422672b400e14 74f628b53d5516d4def9e796f03d30abccce8cd8
```

## Fresh API36 / API37 host-mobile verification

| Runtime | Passing native cases | Deliberate death checkpoints | Live host totals after verification |
| --- | --- | --- | --- |
| API36 / emulator-5554 | 38 | 2, each followed by passing recovery | default6 / separately granted workspace1 |
| API37 / emulator-5556,16KiB | 44 | 2, each followed by passing recovery | default8 / separately granted workspace1 |

Each API passes the same20 core cases: ReviewSyncTest8, ReviewStoreTest4, CompanionStoreTest4, PresentationTest1 and CaptureFeedbackTraceTest3. Both also pass upgrade seeding/verification and16 positive real-host/runtime invocations. Two intentionally killed instrumentation calls per API are not counted as passes; recovery assertions run in new processes. API37 additionally passes6 UI regression cases. No final native failure remains.

Both installed base.apk files were pulled and independently SHA256-compared to the fresh local APK; exact a0ecca11…e359 hash and40,088,449byte size match. The preinstalled baseline on both emulators was the previous alpha.22/code26 candidate. Fresh install-over therefore verifies original-signer same-version candidate replacement with protected UUID/body/source/version, profiles/sessions, preferences and retained downloads. The seeder method retains its historical seedAlpha21UpgradeProtection name; this run does not falsely claim a fresh alpha.21→22 upgrade. That earlier version-changing upgrade evidence remains in the alpha.22 ledger. No uninstall/clear-data or phone access was performed.

Real-host tests use the freshly built integrated backend and production pinned HTTPS, ordinary matching-code owner approval, explicit emulator reverse routes and disposable data. Removing/reinstating forwarding exercises actual unreachable/reconnected transport. Every host is stopped after its sequence. All three source branch tips remain unchanged after a final fetch.

| Scenario on both APIs | Verification |
| --- | --- |
| Lost real committed acknowledgment | pairAndLoseActualHostAcknowledgment → force-stop → resumeExactAfterProcessRestart; exact body/UUID, one host item, other-workspace lookup404 |
| Desktop status | reflectDesktopResolutionWithoutBodyMutation and automaticDesktopResolutionReconciliation |
| Durable sending claim / death | dieAfterDurableSendingClaim (expected crash) → resumeSendingAfterDeath; wrong generation refuses delivery |
| Offline queue / reconnect | realOfflineQueueAndLaterConnection → resumeAfterActualConnectionReturns |
| Conflicting immutable intent | seedConflictingIntent → different real host body under same UUID → rejectActualConflictingServerIntent |
| Retained reader / automatic completion | prepareRetainedMilestoneReader → draftAndOneCreateAutomaticallyDeliver; Keep draft stays unfinished and Create Review delivers without Sync now |
| Protected offline capture / restart | offlineCreateAndDieAfterDurableQueue (expected crash) → restoreOfflineReaderAndProtectedQueue → automaticReconnectAndDesktopStatus |
| Source/settings/resource motion | sourceAppearanceAndSpatialReturn; native intermediate aperture bounds, retained WebView/DOM/scroll and Settings/Aa handoff |
| Independent grants | revoke default grant → nondefaultGrantDoesNotDependOnDefaultWorkspace |
| Revocation / retention | revoke approval → revokedAndUnavailableSourcesRetainReceiptsAndQueue; originalsUnchanged verification before/after |

Extra API37 cases: captureImeAndRotation, captureWithReducedMotion, pdfPageCapturesRenderedFile, readingEdgeAndFind, predictiveBackCancellationAndCommit, adaptiveAndReducedEndpoints. These assert runtime behavior/geometry, not subjective visual/haptic approval; no new integration movie inspection is claimed. The historical movies/acceptance ledgers remain retained.

Reproduction entry points: mobile/scripts/build-release.ps1 -Diagnostics; mobile/scripts/review-fixture.mjs with VAULTOR_READER_FIXTURE=1 and a freshly prepared mobile/cache/r6-host-bundle copied from desktop/bundle; adb -s emulator-5554 or emulator-5556 shell am instrument -w -e class com.vaultorandroid.<class>#<method> com.vaultor.app.test/androidx.test.runner.AndroidJUnitRunner. Pairing arguments come only from that disposable fixture descriptor; compare its public test code before approve. Run staged methods in the order above, drive fixture status/grant/revoke commands, and treat deliberate deaths separately. The local orchestration and exact native outputs are retained in ignored mobile/cache/integration. Existing build/publisher/verification scripts pass syntax checks; the publishers are not invoked because their clean immutable-tag gate is deliberately not satisfied in this integration-only task.

Final documentation checks: all local links in12 changed/new documents resolve; reconciliation diff passes whitespace checks. Original source checkouts remain clean. Fresh final fetch confirms unchanged audited source tips.
