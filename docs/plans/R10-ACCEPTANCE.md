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
- Fresh TypeScript, Node syntax and `git diff --check` passed. Full Android Jest111/111 passed; frontend regression is in progress. No product defect has yet been demonstrated or repaired.

## Platform limits and release gate

This host is Windows10.0.26300 on Intel Core Ultra7 255HX/16.57GB RAM. Only a local Windows execution host is available in this session; no arranged macOS execution endpoint is available. Native Mac0.16 build/install/host/source/update qualification remains unperformed. [Exact Mac0.16 acceptance handoff](../desktop/MAC-HANDOFF.md#r10--exact-0160-mac-qualification) identifies the immutable source and required evidence. Windows/Android work proceeds independently.

Physical Samsung S24 Ultra/OneUI9, genuine tactile feedback, OEM lifecycle, real Wi-Fi/LAN and final TalkBack acceptance remain user-owned. Agents never access or pair the phone. Emulator tests do not satisfy these gates. Linux packaging is out of scope.
