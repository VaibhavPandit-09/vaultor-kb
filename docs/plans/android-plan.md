# Vaultor for Android — execution tracker

Created 2026-10-08; reviewed 2026-10-09. **A1–A3 implemented and published; A4–A6 not started.** The user authorized A1 implementation on 2026-10-08; phone access remains forbidden. This is the authoritative Android scope, testing and milestone tracker. [ANDROID-READINESS.md](../architecture/ANDROID-READINESS.md) owns shared contract readiness; existing workspace guides own resource/editor behavior.

## Delivery and agreed boundaries

Deliver **six sequential sprints, one per authorized implementation call**, stopping after each for discussion. At each start inspect source/working tree, verify relevant contracts, mark that sprint in progress, and preserve unrelated work. At each finish update CODEBASE, this tracker and affected authoritative guides with actual checks, APK availability and limitations. Do not silently start the next sprint.

- Primary user device: **Samsung Galaxy S24 Ultra, currently One UI 8.5**. Support its current Android generation and One UI 9 / Android 17; no older-Android compatibility effort. Implemented minimum Android 16 / API 36; compile/target API37. User confirms the phone Android version locally before installation; no agent phone inspection. Pinned actual toolchain is in ANDROID.md.
- **Agents never access the user's phone:** no USB/wireless ADB pairing, device control, credential retrieval or remote inspection. Development and agent-run tests occur on Windows with emulators and disposable hosts. The user installs APKs and voluntarily reports Samsung-specific results. Do not ask to connect the phone as a workaround for failed emulator tests.
- React Native mobile shell with a bundled, constrained Tiptap editor WebView is the starting architecture, subject to A1's editor gate. No Electron or Java host in Android. Windows/Mac remains authoritative; browser/desktop access is retained.
- Mobile gets one active note, a compact journey and temporary previews. Native touch navigation, sheets and row menus replace desktop multi-pane/sidebar layouts. Collections/Tags remain organization concepts; Notes/Files remain storage kinds, images/PDFs remain file categories.
- Reuse stable resource IDs, structured JSON, conditional revisions, idempotent UUID operations, paginated search and saved-change contracts. Do not copy desktop IPC, paths or sessions into mobile. Extract reusable domain logic only where it is actually needed; no speculative repository rewrite.
- Zero mandatory payments: local builds/tests and personal signed APK distribution through GitHub. No Play Store/cloud testing enrollment. Offline sync, Android hosting, OCR, scheduled backups, drawing/handwriting recognition, tablets/DeX-specific polish and iOS remain outside this milestone.
- Preserve all themes/accents, true-black OLED, media colors, resource ownership and safe saving. Mobile preferences are device-scoped. Separate host approvals, workspace sessions and drafts; switching hosts never crosses those boundaries.

## Testing and release ownership

Agents own compilation, focused tests, emulator interaction checks, failure investigation, signed APK production, release notes and GitHub publication. A source push or debug build is not a delivered APK. Use Small for daily disposable checks; use Atlas for bounded list/cache/startup measurements and final integration. Never mutate personal data, expose host trust/credentials or publish fixture storage/logs containing note bodies.

### Windows test environment

At planning, ADB/emulator are not on PATH and the default Android SDK directory is absent. A1 must discover any other installations first, then set up Android Studio/SDK command-line tools, platform/build tools, Android 16 and 17 system images, project-specific Android JDK, pinned Node/package tooling, required NDK/CMake only if the selected React Native build needs them, and Gradle wrapper. Keep the desktop's Java 25 intact; use an isolated Android toolchain. Check hardware acceleration, SDK licenses, disk/RAM and host network reachability. Do not disable security/firewalls or reboot automatically; explain any administrator, license, firmware or restart action requiring the user. Nothing is installed during planning.

Use one accelerated emulator at a time initially. Record emulator API, image/WebView version, screen density, keyboard mode and build variant. A stock Android emulator cannot emulate Samsung One UI. Test both Android generations, and use keyboard-visible, enlarged text, landscape and resized layouts rather than a desktop viewport screenshot as mobile proof.

### Automated and interaction layers

1. Focused TypeScript/domain tests: scoped drafts, revisions/conflicts, stale responses, cancellation, query preservation, operation identities and schema validation.
2. Android native/instrumented tests: protected credential storage, TLS/host identity, binary/SSE transport, permission handling, file APIs, process lifecycle, updates and restricted WebView bridge. Select/pin a React Native UI harness in A1; use Android instrumentation/UI Automator for system surfaces as appropriate. No general testing-service subscription.
3. Emulator end-to-end tests: actual built APK, matching-code host approval, browsing/editing, keyboard/Back, permissions, image picking, rotation, termination/relaunch, host loss and recovery. Inspect captured frames; collect bounded/redacted diagnostics. Test release builds as well as debug when validating bridges/minification/security.
4. Disposable protected-host integration: Windows host, simultaneous browser/desktop edits, revision conflicts, revoked approvals, workspace generation changes, missing/trashed resources, uncertain upload/save responses and event-stream gaps. Inject faults only in marked fixture environments. Do not bypass TLS or approval to make tests pass.
5. User-only S24 acceptance: short checklist and APK covering Samsung Keyboard, actual touch, clipboard/share/camera, battery restrictions, One UI gestures/OLED and later One UI 9. Keep reported results separate from agent-run evidence. No phone access or physical-device claims by agents.

Each sprint reports passed/failed/blocked checks and unavailable hardware cases. Emulator success is **emulator verified**, not Samsung verified. One UI 9 remains an explicit user acceptance gate even after Android 17 tests pass. A1 selects reproducible scripts; later sprints run compilation and relevant focused checks, not repetitive full suites/Docker/API smoke runs. Block affected publication if saving, trust or document integrity is unsafe; publish safe partial functionality with explicit scope only.

### APK milestones and update policy

- A1 establishes a permanent application ID, an independent **Android APK signing identity**, versionName/versionCode policy, privately backed-up key and reproducible build/signature/checksum verifier. Android signing is separate from the desktop Ed25519 update identity; never regenerate or substitute either key casually. Keystore/passwords stay outside Git, releases, logs and portable archives.
- Use a separate Android version/tag namespace (recommended `android/v0.1.0-alpha.1`, increasing versionCode for every APK). Confirm before the first build; never label an Android-only APK a desktop update or bump desktop versions for mobile-only code. Desktop updater must ignore Android prereleases. Any shipped host changes use the existing desktop release gate separately.
- Publish an immutable source tag, verified **release-signed installable APK**, SHA-256, compatibility/scope notes and exact install/update directions as a clearly Android-only GitHub prerelease at every safe usable milestone. A1 builds the Android-specific packaging/publication path; do not run the Windows pair publisher against APKs. No sensitive data/test profiles are assets.
- Verify upgrade from the previous APK, same signer/application ID, increasing versionCode, and retained approvals/preferences/drafts. Avoid uninstall as an update instruction: it can remove local data. Signing-key loss is a real upgrade blocker. No automatic Android backup of credentials/trust; define recovery/session backup exclusions explicitly.
- First install is a user-initiated APK with Android's per-source installation permission. Later A6 adds in-app Check/download/verify/install handoff, retaining a direct APK fallback. Android owns installation consent; never promise silent replacement. Verify downloaded bytes, expected signer, package/version and supported HTTPS destinations before launch; no workspace credentials enter update requests. Decide authenticated update metadata trust in A1 and implement it before A6's install action.
- If a gate fails, record the blocker and fix it within the authorized sprint where possible. Never claim a debug-only build, untested APK, draft release or absent asset is delivered. Signed APKs may be narrower than final scope, but must preserve data and identify unavailable actions.

## A1 — Toolchain, secure connection and editor proof

Status: **Implemented and published (2026-10-09 local date)**. This call covers A1 only. Native trust/editor gates passed on API36/37; the verified Android-only APK is available.

- [x] Set up and verify the Windows toolchain, acceleration, Android 16/17 emulators, instrumentation and release build. Document exact local commands and user-only OS actions.
- [x] Add the mobile project/platform boundary and selected shared contracts without mounting the entire desktop frontend. Establish app ID, private signing key/versioning and APK artifact checks.
- [x] Implement manual host address, capability refusal, matching-code enrollment, protected remembered device credentials and per-host TLS trust. Manual address works independently of future discovery. Validate Android 17 LAN permission denial/retry; no global trust bypass.
- [x] Load a bundled editor with an origin/message-schema/size-limited bridge. Native code owns approved requests; WebView cannot navigate arbitrary sites or receive raw credentials. Resource bytes use bounded scoped handles, not token-bearing URLs.
- [x] Open a fixture note, edit and conditionally save it. Include a basic durable pending-draft journal before enabling real editing; A2 completes conflict/lifecycle flows. Unsupported nodes/marks retain original JSON and block unsafe saves.
- [x] Verify every current node/mark survives round-trip: text/headings/lists/tasks, quote/code, rules, tables, inline resources and managed-image placements. Android16 software-key taps/composition, undo/redo, caret/scroll/rotation and renderer termination passed; full selection/CJK and Samsung keyboard evidence remain open user/later gates. Do not promise a native editor simply because desktop Tiptap works.
- [x] Publish the first safe signed prototype APK with installed-release emulator results and a short user-only S24 checklist. If editor/trust safety fails, keep that feature unavailable and report the gate rather than shipping unsafe editing.

**Acceptance:** actual signed APK installs in both emulators, pairs without repeated enrollment after relaunch, opens a real structured note and retains safe edits. Editor findings decide whether A2 proceeds with WebView or requires an explicitly revised architecture. Alternative native-editor work is not silently inserted into later sprints.

## User feedback and assigned follow-ups

2026-10-09: user installed A1 and successfully connected to a server on the Mac mini. This is user-reported interoperability, not agent-run Mac/Samsung certification. Editing interaction and surrounding appearance feel poor. A2 addresses input/lifecycle reliability and removes avoidable editing obstruction; A3 owns mobile navigation/editor chrome integration, A4 owns image tools, and A6 owns complete themes, touch polish and motion. Do not rush decorative changes or treat the prototype appearance as final.

## A2 — Durable editing, sessions and multi-device recovery

Status: **Implemented and published (2026-10-09)**. User authorized A2; A3–A6 remain unstarted.

- [x] Complete host/workspace/generation-scoped journal and session storage; acknowledge/remove only the exact saved edit version. Define bounded cache retention and explicit draft handling on sign-out/revoke/host removal.
- [x] Recover matching revisions automatically; preserve both versions on conflicts, with Open recovered copy / Use saved version. Do not overwrite server content or silently drop unsupported documents.
- [x] Restore the active note and reading context after app termination; keep transient dialogs/previews closed. Host switching saves or explicitly retains drafts, handles an unavailable source and cancels old epochs.
- [x] Reconnect bounded authenticated notifications on foreground; reconcile clean notes and mark dirty conflicts/deletions. Handle cursor gaps, maintenance, address changes and revocation. Never replay mutations merely because the connection returned.
- [x] Distinguish offline/disconnected/saving/failed states. Retain local pending edits but do not claim full offline workspace access or synchronization. Android Back must not silently discard edits.
- [x] Test process termination, rotation, background/foreground, interrupted saves, unknown server outcomes, foreign edits, generation replacement and denied/revoked access. Verify APK upgrade preserves pending drafts/pairing.

**Acceptance:** interrupted edits survive safely; another device's changes cannot be silently overwritten; scoped sessions and credentials never bleed across hosts. Publish a signed recovery-tested APK.

## A3 — Native browsing, search and journeys

Status: **Implemented and published (2026-10-09 local)**. User authorized A3 only. Release milestone: Android0.1.0-alpha.3 / versionCode3; desktop/host0.7.1 stays unchanged.

- [x] Implement mobile destinations for Library, Recent, Pinned and Collections with one mixed list, shared type/category descriptors, concise metadata and touch-accessible row actions. Use bounded server pages and cancellation; never download all note bodies.
- [x] Default title search; explicit saved-content mode and collection scope preserve query, reset paging and show coverage/snippets honestly. No silent scope broadening. Collections stay destinations, not resource types.
- [x] Add one active-note journey with back/forward/overflow, distinct visits/cycles, branch replacement, current-title resolution and unavailable steps. Direct opens start a trail; files preview without advancing it. Reuse the 200-visit bound and recover reading positions.
- [x] Specify Android Back priority: top sheet/picker/preview, focused editor keyboard as appropriate, journey/navigation destination, then app exit. No conflicting WebView/native back ownership. Integrate predictive Back where supported by the selected stack.
- [x] Preserve query/filters/destination/scroll after return and restart; retain rows on background failure and offer local Retry. Empty states are compact and actionable.
- [x] Measure first usable browsing, scrolling, query latency and bounded caches on Small then Atlas; exercise both emulator generations, long titles and large font sizes.

**Acceptance:** find and navigate resources without losing drafts or search context; saved-content search remains opt-in and scoped. Publish a signed browsing APK.

## A4 — Images, previews and Android input/output

Status: **Not started**. Depends on A2 editing and A3 resource navigation.

- [ ] Add photo/file picker and explicit camera capture with cancellation/permissions. Receive supported Android Share inputs; handle cold launch/host unavailable/source-note selection without inserting into the wrong note. Clipboard image support is capability-tested with a picker fallback; never promise Samsung formats from emulator evidence.
- [ ] Reuse UUID import identities, mapped placement anchors and retained upload failures; preserve order/original bytes and 20 MiB/40 MP supported-image bounds. Pending bytes/progress stay outside note JSON; normal text saving continues.
- [ ] Provide touch-accessible width/alignment/caption/alt/replace/remove controls, undo, and image fit/zoom. Removing a placement leaves its File resource; replacing affects only that placement.
- [ ] Use authenticated lazy thumbnails/originals, cancellation and bounded disk/memory cache; broken media has Retry/Replace. Native file/content URIs and grants are temporary inputs, never saved resource links. Keep GIF/WebP behavior and original-media colors intact.
- [ ] Provide image/PDF/file preview and user-chosen save/share destinations with safe filenames/MIME. Cover no-compatible-viewer and unavailable-resource failures. No unrestricted WebView external navigation.
- [ ] Test picked/shared mixed media, denied/cancelled permissions, uncertain retry, interrupted process, moved/deleted anchors, host switch, undo, replacement and duplicate placements. Check saved image notes remain correct on desktop and in existing export snapshots.

**Acceptance:** insert, resize, caption, save/reload and download original images without duplication or byte loss. Publish an image-capable APK with physical Samsung clipboard/camera/share checks clearly user-owned.

## A5 — Organization, references and resource lifecycle

Status: **Not started**. Depends on A3 browsing and A4 placements.

- [ ] Add shared resource Actions: create/rename, pins, tags, collection membership, immediate add-existing and retry-safe create-and-add. Validate current input; keep it after failures. Respect existing device/workspace setting boundaries.
- [ ] Implement metadata-only incoming/outgoing References and saved usage with counts/paging. Validate revision/occurrence before selection; fall back safely for edited/missing/unknown paths. Files remain temporary previews.
- [ ] Implement Trash/Restore with same identities and revision/UUID checks, distinguish delete original / remove placement / remove membership, and explain saved usage without implying draft usage is exhaustive.
- [ ] Support explicit permanent-delete confirmation and durable cleanup Retry, never automatic purge. Safe partial results retain resource-specific feedback and unfinished selections.
- [ ] Handle foreign Trash/Restore in open editors and journeys, recover drafts, retain unavailable steps and show restored targets. Keep unknown resource kinds neutral and unsupported actions explicit.
- [ ] Test collection creation identity, membership retries, changed usage/conflicts, image ownership, restore/purge failures and archive-derived/generation notifications with disposable hosts.

**Acceptance:** consistent mobile organization/lifecycle without ambiguous deletion, duplicate creation or silent draft loss. Publish a lifecycle-capable APK.

## A6 — Polish, verified updates and release handoff

Status: **Not started**. Depends on A1–A5 gates.

- [ ] Finish mobile settings, OS/Light/Dark/OLED, accents, reduced motion and distinct Snappy/Smooth. Respect Android font scaling, accessibility labels/focus, touch targets, safe insets and keyboard; media pixels remain unmodified. No hover-only actions or constant decorative animation.
- [ ] Add convenient host discovery without making it required; test permission denial, no results, changed addresses, explicit trust changes and reconnect. No public exposure or internet-hosting feature.
- [ ] Implement verified in-app APK update discovery/download/installation handoff under the A1 trust policy. Test cancellation, tampered/wrong-signer/wrong-package/downgrade/incompatible assets, offline retry, installation permission denial, correct upgrade and retained journal/pairing. No silent installs.
- [ ] Run one final release-APK integration matrix on Android 16/17: Small/Atlas, keyboard, navigation cycles, images, conflict/recovery, host shutdown, permission/revocation, process/renderer death, rotation, large fonts, both theme families/OLED, reduced motion and memory/cache observations. Separate actual Windows-host evidence from untested Mac/real Wi-Fi/sleep claims.
- [ ] Resolve user-reported S24 issues within scope; track One UI 8.5/9 acceptance separately. If physical feedback is unavailable, publish an emulator-verified candidate with the physical gate explicitly open, not a fully Samsung-certified release.
- [ ] Publish the final verified signed APK/tag/checksum, installation/update/recovery guide, versioned notes and short S24/One UI 9 checklist. Update CODEBASE, readiness and this tracker with actual results and outstanding gates. Stop; future parity/offline/tablet work needs new authorization.

**Acceptance:** a usable, emulator-verified Android release with safe upgrades, precise compatibility and honest S24 status. Stable Samsung-ready labeling requires user-reported acceptance; it does not require agents accessing the phone.

## Per-sprint handoff ledger

For each sprint record: status/date/source/tag/versionName/versionCode; app ID/signer public fingerprint (never private key); host build/protocol; exact tests/emulator images; fixture seed/counts; inspected frames and measured performance; failures fixed and blocked cases; GitHub APK URL/size/SHA-256; installation/upgrade result; user-only acceptance checklist/results; remaining scope and next authorization. A1 implementation ledger (2026-10-08–09): mobile 0.1.0-alpha.1 / versionCode1 / com.vaultor.app; original public signer af1123bd0be38ee48ce61b4f40f3667c4fe740910b64005d3d21dacd83de2567. Protected Windows host 0.7.1/protocol3, two disposable notes, no personal data. RN0.87.1/WebView14.0.1/Tiptap3.31.4/JDK17/Gradle9.4.1/API36+37 builds passed. Three bridge tests, schema preservation/refusal/Save-lock checks, zero scoped lint errors (nine no-void warnings), three instrumentation cases per emulator passed. API36 google_apis x86_64/WebView133; API37 google_apis_ps16k x86_64/WebView145/16KiB pages; 1080×2400/420dpi/2GiB/software IME. Pairing/reconnect, real Gboard keys, undo/redo, protected force-stop recovery, conditional Save, failed Save/Retry, unknown-content refusal, rotation and renderer failure safety passed; captured frames inspected. Fixed phantom save-lock updates, latest-only journal status, retry protection and permission-controller selector. Same-signer install-over candidate retains profile/draft; no previous published APK exists for version upgrade. Final tagged-source APK is published; exact metadata follows. No phone, real LAN/Mac-host, CJK/full selection, large fonts/Atlas scale or Samsung/One UI result claimed. Tooling dependency advisories and a same-laptop private key backup limitation are recorded in ANDROID.md. Five future sprints remain unauthorized.

Published Android-only prerelease at 2026-10-08T18:48:40Z: [Vaultor Android 0.1.0-alpha.1](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/android/v0.1.0-alpha.1), immutable tag android/v0.1.0-alpha.1 / source 3371f53cac6b1ddee5044a7b8506881a45f33d8b. APK 40,071,324 bytes, SHA-256 8d6a2555515ecf4be75738d3f7a955a2f44cccdaf3c2250a0705c69865b4f557; original APK certificate af1123bd0be38ee48ce61b4f40f3667c4fe740910b64005d3d21dacd83de2567. Fresh tagged-source build and exact staged APK installs/reconnects passed on API36/37; final API37 conditional Save changed the disposable host revision/body. APK/package/target/minimum/ABI/16KiB alignment/signature and package/lock/Gradle agreement verified; tampered and test-package APKs refused. All three downloaded GitHub assets match local bytes/digests; byte-identical publication retry passed and release is non-draft/prerelease. Owned fixture host and both emulators stopped. This publication ledger has no additional runtime/architectural effect. Five future sprints remain unstarted; Samsung/One UI acceptance is user-only and open.

## Open decisions and non-blocking defaults

- Minimum API36 is implemented; the user confirms Android16+ in About phone before installation. Physical One UI acceptance remains user-owned.
- Resolved A1: RN0.87.1, WebView14.0.1, bundled Tiptap3.31.4, AndroidJUnitRunner/UI Automator, JDK17, SDK36/37, Gradle9.4.1; editor/trust gates passed.
- Resolved A1: com.vaultor.app; original Android signer privately owner-restricted with a byte-verified same-laptop backup; HTTPS metadata plus APK-signature/package/monotonic versionCode policy. Off-device disaster backup remains unverified; Android updater implementation is A6.
- Initial distribution is manual GitHub APK; A6 introduces in-app installer handoff. No Play Store fee or automatic-install claim.
- Manual address is mandatory, discovery comes in A6. Phone portrait is primary; resizing remains safe, but tablets/DeX feature parity is deferred.
- Mac-host interoperability can be user-tested or separately handed off to the Mac AI. Lack of Mac artifact verification is not permission to fake certification or downgrade security.

## Reference guidance

Recheck current official requirements when implementation starts: [React Native environment](https://reactnative.dev/docs/set-up-your-environment), [React Native security](https://reactnative.dev/docs/security), [Android emulator acceleration](https://developer.android.com/studio/run/emulator-acceleration), [Android instrumented testing](https://developer.android.com/studio/test/test-in-android-studio), and [Android LAN permissions](https://developer.android.com/privacy-and-security/local-network-permission). These support toolchain/security/testing choices; they do not prove Vaultor or Samsung behavior.

### 2026-10-09 — A2 durable editing and recovery

Implemented Android 0.1.0-alpha.2 / versionCode2; original package/signer retained. Native encrypted schema2 migrates A1 approval/draft data, isolates host/workspace/generation journals and sessions, separates local storage from network work and bounds retained records/caches. MobileWorkspace owns exact edit acknowledgments, save-while-typing, conditional conflicts, independent former-version retention, UUID-stable recovered copies, explicit save-or-keep host switches and stale-epoch refusal. Native pinned SSE reconciles on foreground, preserves dirty notes and blocks revoked access; restart restores note/reading context with transient surfaces closed. No desktop/server/API/protocol/archive change.

Checks: TypeScript and release JS/Kotlin/native compilation passed; 22 Jest bridge/controller tests and full editor schema/refusal/Save-lock checks passed. Scoped lint zero errors/13 warnings (no-void, one shadow and one inline style). Four native storage/address tests passed on API36 and API37; API37 pairing/editor plus storage suite passed five cases with denied network permission/retry and real matching-code approval. Installed API36 A1-to-A2 upgrade preserved approval and pending draft; restored draft saved conditionally. Native SSE accepted a clean foreign edit and retained a dirty conflict. Use saved version and recovered-copy import passed with unchanged original; protected force-stop restoration, background/foreground, offline cached reopening and revoked access refusal were exercised. API37 restart after foreign Trash exposed a missing recovery record; fixed and covered by a new controller test. Native tests initially contained an obsolete null expectation for a newer edit; corrected to verify it remains. The first API37 run exposed premature permission prompting; fixed to prompt on pairing/remembered reconnect. Captured API36 recovery/editor frame inspected. Final tagged-source installation/publication and the Trash recovery action are recorded in the publication follow-up, not claimed by this pre-publication entry.

Open gates: physical S24/Samsung Keyboard/One UI, real Wi-Fi/Mac reconnection/address changes, TLS identity replacement, simultaneous native two-host races, OEM process/battery behavior and large-workspace scale remain unverified. Pure controller tests cover cross-host/generation isolation, stale responses, failed/unknown saves and UUID retries; they are not native hardware evidence. A1 tooling advisories and same-laptop key backup limitation remain. User reports Mac connection success and poor prototype editing feel; A3 navigation/chrome, A4 image tools and A6 full touch/theme/motion polish retain those follow-ups. Four future sprints remain unstarted.

A2 final candidate gate: API37 same-signer install-over retained approval/session; restart after foreign Trash created one protected recovery record. Explicit recovered-copy confirmation created/opened a separate note and acknowledged the source record (Recovery 0). The original remains trashed; no restore/purge was replayed. The final tagged-source install/publication gate follows.

## A2 published APK and final verification

Published Android-only prerelease at **2026-10-08T21:55:09Z** (2026-10-09 local): [Vaultor Android 0.1.0-alpha.2](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/android/v0.1.0-alpha.2). Immutable tag **android/v0.1.0-alpha.2**, source **c15af6190415161bcd2a71ff8d06d41e3ce5cad9**. APK **40,128,824 bytes**, SHA-256 **b543b5caf96c9e84c36e9455cb7a2310514d652b26ae91c4ee41724af9af8878**. Original public APK signer **af1123bd0be38ee48ce61b4f40f3667c4fe740910b64005d3d21dacd83de2567**; package com.vaultor.app / versionCode2 / minimumAPI36 / targetAPI37 / protocol3.

Fresh tagged-source release/application-test compilation and APK identity/lock/version/API/arm64+x86_64/16KiB alignment/signature checks passed. Exact staged bytes installed over the existing fixture application on both emulators. All four native storage/address/migration tests passed again on API36 and API37. API37 retained approval and reopened its recovered note/session with transient panels closed; API36 retained its existing scope/cache and reopened the last note offline after the old fixture host stopped. Candidate permission-denial/retry/pairing suite passed five cases on API37; final candidate and tagged APK hashes are identical. The foreign-Trash restart/recovered-copy action passed on API37 before tagging. A1-to-A2 protected-draft upgrade, clean/dirty notifications and recovered original preservation passed earlier on API36 as detailed above.

Publisher verified a clean pushed source/tag, original signer policy, all staged assets and downloaded byte comparisons before publication. GitHub release is non-draft/prerelease; its three asset digests match local APK/checksum/manifest. Desktop/Mac0.7.1 remains unchanged. Owned disposable hosts/listeners and both emulators stopped; no personal data or phone access. This publication ledger changes no runtime architecture. **A2 complete; four sprints A3–A6 remain unstarted.** Physical Samsung/One UI and outstanding native/real-LAN cases remain open as previously listed. Install the single APK over alpha.1; do not uninstall/clear data.

## A3 implementation and candidate gate

Implemented native mixed 100-row paging, title-first/explicit saved-content and collection scope, retained three-page cache, local retry/cancellation, a persisted 200-visit note journey and compact editor navigation. Editor remains mounted behind browsing/Hosts/Recovery; hidden/background browsing requests stop. Native window keyboard visibility prevents stale modal keyboard flags consuming Back. No desktop/server/protocol/archive change.

TypeScript, 32 focused Jest tests, fresh editor schema/refusal/activation checks, scoped lint (zero errors/19 warnings) and signed release/application-test builds passed. API36 native storage/policy plus Small browsing suite passed six cases; Atlas query/paging/scroll passed one. API37 five native storage/policy cases passed; its final matching-code pairing/editor/browsing/picker/link-and-native-Back case passed separately after the keyboard fix. Small70/Atlas5,000 verified counts; first-page timing samples77/76/82ms and103/91/82ms, body-only query28/40ms, first usable Library1,839/1,635ms. Six scripted scrolls2,825/2,779ms include harness overhead; no FPS/Wi-Fi/heap claim. Actual setup/failed-run corrections/visual limitations are in ANDROID.md.

Final same-tag installs and publication passed; the exact ledger follows. Samsung/One UI, TalkBack, physical OLED/Wi-Fi and OEM lifecycle checks remain user-only/open. Image viewing/input belongs to A4, organization mutations A5, full themes/touch/motion/discovery/updater A6. Stop after A3.

## A3 published APK and final verification

Published Android-only prerelease at **2026-10-08T23:00:44Z** (2026-10-09 local): [Vaultor Android 0.1.0-alpha.3](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/android/v0.1.0-alpha.3). Immutable tag **android/v0.1.0-alpha.3**, source **4c55af16c9405e79000d94998ba68c2704cb42ca**. APK **40,163,388 bytes**, SHA-256 **a754e93ebba27105a0b603b5597d24292b35be19bcdf8d4c7c90111e7f8731fa**. Original public signer **af1123bd0be38ee48ce61b4f40f3667c4fe740910b64005d3d21dacd83de2567**; package com.vaultor.app / versionCode3 / minimumAPI36 / targetAPI37 / protocol3.

Fresh tagged-source APK installed over the existing app on API36 and API37. Five native storage/policy tests passed on each exact staged install. Android17 restored its note and journey. Final pairing/editor/browsing/picker/inline-link/native-Back checks passed on both generations. On API36, the first final interaction run matched the destination link text still in the source WebView and pressed Back before navigation completed. The focused test now waits for the destination's native TextView heading; rebuilding the test APK and rerunning passed. This test-only follow-up does not change the shipped APK or move the source tag. Android17 retained its previously granted LAN permission; no new denial/retry result is claimed for A3.

Publisher verified the clean pushed source/tag, original signer policy and staged assets, then downloaded and compared all three artifacts byte-for-byte before publication. GitHub confirms non-draft/prerelease status and matching asset sizes/digests. Desktop/Mac0.7.1 remains unchanged. Owned temporary host and both emulators were stopped; no personal workspace or phone access. Install the single APK over the existing app; do not uninstall or clear data. Samsung/One UI, TalkBack, real Wi-Fi and OEM lifecycle remain user-only/open. **A3 complete; A4–A6 remain unstarted.**
