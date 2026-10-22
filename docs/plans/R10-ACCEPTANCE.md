# R10 integrated qualification

Reviewed 2026-10-22. **Engineering in progress; not an acceptance candidate yet.** The user authorized R10 engineering from current master and requires final acceptance before merge or publication. No post-R10 work is authorized.

## Baseline and evidence rules

Fetched `origin/master` and tags: `7b7f4f4dba7d4fbf8db67a502662e02d0c590622`. Both immutable `v0.16.0` and `android/v0.1.0-alpha.28` peel to `63668b00f8e970d5799498a056e35d3c96c2302e`. The initial historical R6 checkout was clean and remains untouched. Created managed worktree `C:/Users/Vaibhav/.codex/worktrees/vaultor-r10/vaultor-kb`, branch `codex/r10-quality`, directly from fetched master. Historical R6–R9 branches are not inputs.

Published Windows0.16.0 and Androidalpha.28/code32 are the runtime baseline. Existing [R7–R9 evidence](R7-R9-INTEGRATION.md) remains valid historical release evidence, clearly separated from fresh R10 runs. No new installer/APK/version is needed for documentation/test-only work. Product fixes, if demonstrated, require changed-platform candidates with original signing identities; final R10 approval precedes merge/tag/publication.

Reports and disposable host data stay ignored under `desktop/cache/r10`; Android measurement output is pulled there from the explicit emulator's app external-files directory. No credentials, private journals, workspaces or recovery ZIPs enter Git. Tests operate on portable copies of the existing marked Small70/Atlas5000 archives, verified against their recorded hashes. Original fixture databases remain closed/untouched.

## Qualification slices

1. Integrated workflows and faults: desktop conditional edits, connected downloads, offline Library/search/reader, protected Reviews/imports, exact delivery after interruption, desktop status reconciliation, portable partial/full ZIPs and independent copies; concurrent sources/equal IDs; persistent revocation/replacement locks; missing/expired snapshots and uncertain transfers. Reuse existing focused domain/native tests; add coverage only for missing integrated outcomes.
2. Scale: Small then Atlas5000. Record process/usable startup separately, bounded query timings, scrolling/frame statistics, reader/media readiness, memory/storage samples, checkpoint/refresh, import/export and queue behavior. State sample counts, emulator/tool versions, concurrent load and cache limitations. Do not infer physical performance or continuous peaks from samples.
3. One final interaction audit against both design contracts: approved Home/Library/Review, source switching/management, retained reader/Aa, themes/OLED, long content/media, font scale, Back/keyboard/gesture/reduced motion, narrow/landscape/split screen and accessible labels/focus where testable. No redesign. Emulator evidence cannot certify Samsung/OEM/haptic feel or TalkBack experience.
4. Meaningful checkpoint: full backend/frontend/desktop/mobile regressions and required runtime gates. Record failures and corrected reruns; do not erase initial outcomes.
5. Consolidated candidate: measured results, remaining blockers, exact platform handoffs, compatibility/recovery steps and master merge/release plan. Commit/push coherent R10 source, then stop for user acceptance.

## Work and attempts

- Added a disposable R10 host driver using the **released packaged bundle**, verified existing corpus ZIPs, ordinary protected APIs, conditional revisions, per-workspace routing and explicit matching-code Android enrollment. It measures API/transfer phases and prepares independent Small/Atlas workspaces; no product authority bypass.
- Added emulator-only installed-app scale instrumentation for full verified downloads/refresh, local bounded searches/storage, Library usable time and gesture/frame collection. Instrumented activity readiness is explicitly distinct from external cold process launch timing.
- First driver attempt imported Small and Atlas but used the wrong conditional note-update route (`/resources/{id}`); it stopped before claiming isolation. Corrected to the actual `/resources/{id}/note` contract. This was a harness error, not a reproduced product defect. Its timings were collected during native compilation and are preliminary, not a controlled baseline.
- Corrected host run passed equal-ID conditional-edit isolation and full ZIP import-as-new. A subsequent run encountered the already documented operation-status maintenance409 race; the driver now retries only GET operation status with that exact maintenance detail (and ordinary `WORKSPACE_BUSY`), preserving security/domain failures.
- The managed checkout's long path exceeded Ninja's260-character native object-path limit. Full app compilation failed; no candidate app was installed. Kotlin/instrumentation compilation and original-signer test packaging passed with `assembleReleaseAndroidTest -x ':app:buildCMakeRelWithDebInfo[arm64-v8a]' -x ':app:buildCMakeRelWithDebInfo[x86_64]'`. This is **test-APK-only** qualification against the unchanged published app, never a valid production release-build shortcut. Signing variables were read privately through android-env.ps1 and removed afterward. The first test-only packaging attempt omitted signing environment and correctly refused a missing key; corrected packaging passed.
- First API36 pairing hit the existing eight-remembered-host bound after actual host approval. The test now removes only an inactive loopback fixture approval, checking protected Review equality before/after; no data clear or permission relaxation. Corrected pairing and Small full verified download passed (5,902.16ms download phase).
- Disconnected cold Small Library was observed after explicit host reverse-route removal: Android `am start -W` reported COLD/TotalTime522ms/WaitTime525ms; first complete UI-dump observation found70resources at3,248.22ms. That is an upper bound including dump/poll overhead, not a precise display timestamp or cold OS cache measurement.
- Initial combined offline test run failed: UI readiness was not observed and queries reused a stale epoch after process restart. The query driver now obtains the current bootstrap epoch; its focused rerun passed11samples each of four bounded local queries. UI is being rerun separately with captured hierarchy/screenshot. Neither initial failure is counted as a product fix or successful gate.
- Fresh TypeScript, Node syntax and `git diff --check` passed. Initial full regression passed backend119/frontend323/desktop44/mobile111. The first backend attempt used the bundled JRE rather than a JDK and failed compilation; the installed JDK25 rerun passed. Product parsing work below was identified after this foundation checkpoint.

## Scale observations and demonstrated correction

The reused API36 image held eight remembered fixture hosts and eight companion scopes. Those refusal outcomes correctly enforced bounds; they are not failed data-integrity behavior. Preserved its disk image and created separate `Vaultor_R10_API36` writable storage under the ignored R10 root (stock API36, Pixel8,1080×2400,420dpi,2GiB RAM,60Hz, SwiftShader). Installed unchanged published alpha.28/code32. Pulled installed base.apk SHA256 **4b87dd8212f03c8db45395ea113e12761c2b1bb45185e1c7e5de6962aaba730b**, matching the published release. No app-data clear or original emulator reset.

| Fresh API36 observation | Small70 | Atlas5000 |
| --- | ---: | ---: |
| Full readable checkpoint transfer/verification/activation |5,593.18ms|408,645.98ms|
| External cold Activity `TotalTime` |938ms|522ms|
| First offline Home resource-row XML observation (upper bound) |4,253.97ms|3,347.02ms|
| Instrumented activity → Home navigation ready |1,541.18ms|1,440.12ms|
| Explicit Home → usable Library |1,263.31ms|1,226.72ms|
| Twelve scroll gestures |3,566.84ms|3,173.65ms|
| Android gfxinfo frames / janky |227 /18 (7.93%)|231 /20 (8.66%)|
| gfxinfo median /95th frame time |22/36ms|16/29ms|

These are observations, not physical-device/FPS/battery guarantees, cold OS-cache measurements or statistically repeatable startup rankings. The initial no-note offline session intentionally restores Home; earlier Library assertions assumed another root, then also incorrectly required the scrolled-away resource count to stay visible. Corrected tests explicitly enter Library and preserve accessible navigation while scrolling. Both focused final Library/scroll runs passed. Cold readiness checks now require actual resource rows, not the fixture source name containing a count. Legacy gfxinfo jank is separately retained in raw files; use the modern platform count above.

Small local query first /10warm median /warm max: Library34.83/7.51/21.35ms, title5.08/6.40/13.61ms, saved text11.22/7.53/13.31ms, beacon6.63/6.40/14.71ms. Atlas bounded queries passed; detailed measurements are retained for consolidation. Atlas native note detail37.11ms, downloaded image preview23.62ms and first PDF page353.66ms passed; this is native readiness, not full document decoding or displayed frame timing. Atlas retained payloads21,259,956bytes;80 originals explicitly omitted by readable policy, no unavailable/unselected links. Local storage includes catalogs and coexisting Small data; do not call total retained-store size an Atlas-only footprint.

Released Windows0.16.0 executable, fresh Small portable copy: Library usable12,898.20ms from process spawn; long image-heavy note DOM519.75ms. Process-tree working set/private bytes: Library977.85/854.54MiB, reader1,158.56/1,030.43MiB, immediate post-edit/undo1,187.43/1,059.21MiB. Edit/undo passed. Shared pages may be double-counted, and the final sample is not a cache-release or leak test. Two-second rAF scroll intervals are retained as raw observations, not physical display/FPS certification.

The released Atlas transfer exposed repeated whole-manifest deserialization: each payload reads/hashes/parses the3,656,900byte manifest. Controlled owner-loopback **51 identical859byte payload requests** after preparing another5000resource checkpoint: first40.26ms;50warm median24.63ms, empirical p9540.67ms/max47.57ms. Every returned payload length/SHA was checked. This isolates the payload path and does not model Android TLS. Baseline scripts/source and initial failed setup attempts remain retained.

The host0.16.1 candidate now retains one softly referenced immutable parsed manifest up to4MiB per workspace; it still reads and hashes actual bytes and rechecks receipt/source/validator on every request, plus per-chunk authority. Larger manifests remain uncached. Focused CompanionSnapshotsTest **14/14 passed**, including warm-cache same-size/same-mtime corruption, immutable nested lists, validator refusal/cancellation, expiry/restart/generation, grants/revocation, range and cross-workspace isolation. Full candidate backend regression, native candidate comparison and fresh Windows installer/sidecar preparation are in progress. Android product source/version is unchanged. No speedup or candidate release claim is made before measured requalification.

## Platform limits and release gate

This host is Windows10.0.26300 on Intel Core Ultra7 255HX/16.57GB RAM. Only a local Windows execution host is available in this session; no arranged macOS execution endpoint is available. Native Mac0.16 build/install/host/source/update qualification remains unperformed. [Exact Mac0.16 acceptance handoff](../desktop/MAC-HANDOFF.md#r10--exact-0160-mac-qualification) identifies the immutable source and required evidence. Windows/Android work proceeds independently.

Physical Samsung S24 Ultra/OneUI9, genuine tactile feedback, OEM lifecycle, real Wi-Fi/LAN and final TalkBack acceptance remain user-owned. Agents never access or pair the phone. Emulator tests do not satisfy these gates. Linux packaging is out of scope.
