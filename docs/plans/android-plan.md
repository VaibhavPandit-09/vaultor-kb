# Vaultor for Android — execution tracker

Created 2026-10-08; reviewed 2026-10-09. **A1–A4 implemented and published; A5 implemented, final publication gate in progress; A6–A9 not started.** The user authorized A1 implementation on 2026-10-08; phone access remains forbidden. This is the authoritative Android scope, testing and milestone tracker. [ANDROID-READINESS.md](../architecture/ANDROID-READINESS.md) owns shared contract readiness; existing workspace guides own resource/editor behavior.

## Delivery and agreed boundaries

Deliver **nine sequential sprints total, one per authorized implementation call**, stopping after each for discussion. At each start inspect source/working tree, verify relevant contracts, mark that sprint in progress, and preserve unrelated work. At each finish update CODEBASE, this tracker and affected authoritative guides with actual checks, APK availability and limitations. Do not silently start the next sprint.

- Primary user device: **Samsung Galaxy S24 Ultra, currently One UI 8.5**. Support its current Android generation and One UI 9 / Android 17; no older-Android compatibility effort. Implemented minimum Android 16 / API 36; compile/target API37. User confirms the phone Android version locally before installation; no agent phone inspection. Pinned actual toolchain is in ANDROID.md.
- **Agents never access the user's phone:** no USB/wireless ADB pairing, device control, credential retrieval or remote inspection. Development and agent-run tests occur on Windows with emulators and disposable hosts. The user installs APKs and voluntarily reports Samsung-specific results. Do not ask to connect the phone as a workaround for failed emulator tests.
- React Native mobile shell with a bundled, constrained Tiptap editor WebView is the starting architecture, subject to A1's editor gate. No Electron or Java host in Android. Windows/Mac remains authoritative; browser/desktop access is retained.
- Mobile gets one active note, a compact journey and temporary previews. Android-specific navigation, a workspace drawer, contextual sheets and row menus replace desktop multi-pane layouts. A persistent sidebar is adaptive to available width, not a compulsory phone layout. Collections/Tags remain organization concepts; Notes/Files remain storage kinds, images/PDFs remain file categories.
- Reuse stable resource IDs, structured JSON, conditional revisions, idempotent UUID operations, paginated search and saved-change contracts. Do not copy desktop IPC, paths or sessions into mobile. Extract reusable domain logic only where it is actually needed; no speculative repository rewrite.
- Zero mandatory payments: local builds/tests and personal signed APK distribution through GitHub. No Play Store/cloud testing enrollment. Offline sync, Android hosting, OCR, scheduled backups, drawing/handwriting recognition, tablets/DeX-specific polish and iOS remain outside this milestone.
- Preserve all themes/accents, true-black OLED, media colors, resource ownership and safe saving. Mobile preferences are device-scoped. Separate host approvals, workspace sessions and drafts; switching hosts never crosses those boundaries.

## Revised sequence after A4 — 2026-10-09

The user requested a phone-first design rethink before further implementation. **Planning authorization only: no A5 implementation starts in this change.** The former two remaining sprints are replaced by five; completed A1–A4 source tags, evidence and historical ledger entries remain unchanged. [Android interaction design](../android/DESIGN.md) owns the planned UI philosophy; ANDROID.md continues to describe shipped alpha.4 behavior.

| Sprint | Deliverable | Dependency and handoff |
| --- | --- | --- |
| A5 | Interaction prototype, workspace drawer and compact reading/browsing shell | A1–A4; review chosen navigation before A6 |
| A6 | Writing experience, safe automatic saving and contextual image tools | A5 shell; review actual keyboard/editing APK |
| A7 | Organization, references and resource lifecycle | A6 safety; original A5 domain scope retained |
| A8 | Mobile settings, discovery and verified in-app updates | A7; original A6 platform scope retained |
| A9 | Integrated motion, accessibility, performance and release acceptance | A5–A8; original A6 integration scope retained |

No permanent Save/formatting/journey strips in the target design. A5 keeps an explicitly transitional editing-only Save until A6's autosave gate passes. Baseline theme/accessibility/keyboard correctness belongs in A5/A6, not only final polish. A5 compares drawer-led navigation with a minimal bottom-navigation alternative and records one model, avoiding duplicate navigation systems. The drawer-led hybrid is the default; substantive deviations are discussed at handoff. Stop after every sprint for discussion. Publish safe, usable, original-key Android APK milestones under the existing process; do not label prototypes Samsung-certified or assign future versionCodes before checking published assets.

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
- First install is a user-initiated APK with Android's per-source installation permission. Later A8 adds in-app Check/download/verify/install handoff, retaining a direct APK fallback. Android owns installation consent; never promise silent replacement. Verify downloaded bytes, expected signer, package/version and supported HTTPS destinations before launch; no workspace credentials enter update requests. Decide authenticated update metadata trust in A1 and implement it before A8's install action.
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

2026-10-09: user installed A1 and successfully connected to a server on the Mac mini. This is user-reported interoperability, not agent-run Mac/Samsung certification. Editing interaction and surrounding appearance feel poor. The initial assignments to A3 navigation, A4 tools and former A6 polish did not resolve the broader interaction model. After A4 the user rejected the stacked Save/formatting/journey controls and requested an Android-specific design. Revised A5 owns navigation/layout, A6 owns writing/autosave/contextual tools, A8 owns settings and A9 owns integrated polish. Do not treat the prototype appearance as final.

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

Status: **Implemented and published (2026-10-09)**. User authorized A4 only. Release milestone Android0.1.0-alpha.4 / versionCode4; host0.7.1/protocol3 unchanged. Depends on A2 editing and A3 resource navigation.

- [x] Add photo/file picker and explicit camera capture with cancellation/permissions. Receive supported Android Share inputs; handle cold launch/host unavailable/source-note selection without inserting into the wrong note. Clipboard image support is capability-tested with a picker fallback; never promise Samsung formats from emulator evidence.
- [x] Reuse UUID import identities, mapped placement anchors and retained upload failures; preserve order/original bytes and 20 MiB/40 MP supported-image bounds. Pending bytes/progress stay outside note JSON; normal text saving continues.
- [x] Provide touch-accessible width/alignment/caption/alt/replace/remove controls, undo, and image fit/zoom. Removing a placement leaves its File resource; replacing affects only that placement.
- [x] Use authenticated lazy thumbnails/originals, cancellation and bounded disk/memory cache; broken media has Retry/Replace. Native file/content URIs and grants are temporary inputs, never saved resource links. Keep GIF/WebP behavior and original-media colors intact.
- [x] Provide image/PDF/file preview and user-chosen save/share destinations with safe filenames/MIME. Cover no-compatible-viewer and unavailable-resource failures. No unrestricted WebView external navigation.
- [x] Test picked/shared mixed media, denied/cancelled permissions, uncertain retry, interrupted process, moved/deleted anchors, host switch, undo, replacement and duplicate placements. Check saved image notes remain correct on desktop and in existing export snapshots.

**Acceptance:** insert, resize, caption, save/reload and download original images without duplication or byte loss. Publish an image-capable APK with physical Samsung clipboard/camera/share checks clearly user-owned.

Physical Samsung/One UI/camera/provider acceptance remains user-only. Exact adapter bounds and unverified platform cases are in [MEDIA.md](../android/MEDIA.md); no claim of full Samsung parity. Final APK identity and publication are recorded below.

## A5 — Android interaction foundation and navigation

Status: **Implemented (2026-10-09); final APK publication gate in progress.** Depends on published A1–A4. The design contract is [DESIGN.md](../android/DESIGN.md).

- [x] Build a concrete interaction prototype comparing drawer-led and minimal bottom-navigation layouts for Home/Library, reading, keyboard-open editing, image selection and workspace switching. Use real content. Record the choice and action/space tradeoffs before integrating the shell.
- [x] Implement the chosen shell with compact top bars, a workspace drawer reachable inside a note, bounded Home recent/pinned previews and retained Library/Collections/search context. No duplicated permanent navigation or resource-type blocks. Reuse mixed server paging/cancellation and cached metadata.
- [x] Open existing notes for reading with the IME closed; expose Edit and preserve the same live document/undo/scroll when entering editing. Keep explicit Save only in editing as a documented transition until A6. No nonfunctional creation or autosave claims.
- [x] Move journey controls to compact contextual access/history; preserve 200 visits, branching, current titles, missing targets and source-owned temporary previews. Define Back/drawer/sheet/IME/editing/journey/browsing priority without competing handlers.
- [x] Move connection details to the workspace selector; preserve actionable protection/connection failures. Short action sheets do not autofocus search; real searchable pickers retain intentional initial focus.
- [x] Establish reusable screen/top-bar/drawer/sheet/row tokens, safe insets, readable OLED/Light/Dark surfaces, touch targets, screen-reader labels and reduced-motion behavior. Adapt to narrow/landscape/split-screen widths; no full tablet/DeX scope.
- [x] Run focused navigation/focus/state tests and Android16/17 release-APK interactions. Inspect a targeted comparison including keyboard, long titles, enlarged fonts, empty/mixed lists, retained drafts and drawer reopening. Upgrade alpha.4 without losing approvals/session/recovery.

**Acceptance:** reading is content-first, navigation is reachable without abandoning the note, keyboard-open space is usable, and the chosen shell is available in a signed APK for discussion. Stop before A6; record unresolved design feedback instead of assuming prototype acceptance.

## A6 — Effortless writing, autosave and contextual media

Status: **Not started.** Depends on A5's reviewed interaction model. No new editor engine unless demonstrated failures require a separately reviewed plan.

- [ ] Implement local-protection-first debounced conditional autosave using applicable existing settings, exact-version acknowledgments and coalesced requests. Preserve typing during saves and distinguish Saved to host / On this phone / Saving / protection failure. Reconcile uncertain outcomes before retry; conflicts retain both versions and stop unsafe writes.
- [ ] Remove ordinary Save only after that gate passes. Done ends editing, not a server-save promise. Deliberate navigation, backgrounding, host switching and epoch cancellation preserve protected edits; process-exit network flushing is best effort, not a durability guarantee.
- [ ] Provide one compact keyboard accessory with Insert, Format and Undo; make Redo readily reachable when useful. Preserve native selection actions and hardware shortcuts, caret visibility, composition, undo and scroll through tool opening. No hidden gesture-only access or moving input text.
- [ ] Add ordinary New note / quick capture with retry-safe UUID identity and explicit collection destination where applicable. New notes enter editing, existing notes read first. Retain failed input and reconcile unknown creation results without duplicates.
- [ ] Consolidate insertion into contextual sheets. Rework image selection/tools with width/alignment/caption first and accessible secondary alt/replace/preview/copy/download/remove actions. Preserve mapped anchors, original bytes, queue ownership, undo and upload retry identity; do not regress A4 bounds or Share/camera/picker flows.
- [ ] Test mixed text/image input, selection/composition, image tools and IME, typing during acknowledgment, offline/failed saves, storage failure, conflicts, force-stop recovery, renderer restart, host switch and moved/deleted upload targets. Exercise both emulator generations and large fonts; no physical Samsung claim.

**Acceptance:** a real note can be written and illustrated without permanent operational strips or manual Save, with honest status and proven recovery. Publish the editing APK and stop for user feedback before domain expansion.

## A7 — Organization, references and resource lifecycle

Status: **Not started.** Depends on A6. Retains the original A5 organization scope within the new mobile patterns.

- [ ] Add shared resource Actions: create/rename collections and resources as applicable, pins, tags, collection membership, immediate add-existing and retry-safe create-and-add. Validate current input; preserve failures and operation identity. Build on A6 note creation instead of duplicating it.
- [ ] Implement metadata-only incoming/outgoing References and saved usage with counts/paging. Validate revision/occurrence before selection; fall back safely for edited/missing/unknown paths. Files remain temporary previews.
- [ ] Implement Trash/Restore with same identities and revision/UUID checks. Distinguish delete original / remove placement / remove membership; explain saved usage without implying draft coverage is exhaustive.
- [ ] Support explicit permanent-delete confirmation and durable cleanup Retry, never automatic purge. Safe partial results retain resource-specific feedback and unfinished selections. Use contextual bulk actions, not a permanent strip.
- [ ] Handle foreign Trash/Restore in editors and journeys, recover drafts, retain unavailable steps and reconcile restored targets. Unknown resource kinds remain neutral with explicit unsupported feedback.
- [ ] Test creation identity, membership retries, changed usage/conflicts, image ownership, restore/purge failures and generation notifications with disposable hosts. Check keyboard/Back dismissal and source focus in nested sheets.

**Acceptance:** mobile organization and lifecycle are discoverable without ambiguous deletion, duplicate creation or silent draft loss. Publish a lifecycle-capable APK and stop.

## A8 — Settings, discovery and verified updates

Status: **Not started.** Depends on A7; baseline theme/accessibility correctness is already required in A5/A6.

- [ ] Implement compact mobile settings using flat rows/contextual controls: OS/Light/Dark/OLED, accents, reduced motion, Snappy/Smooth and applicable device/workspace preferences. Preserve scope, immediate feedback, retry and exact reset confirmation; do not embed desktop settings cards. Preserve media colors.
- [ ] Add host discovery behind the workspace selector without making it required. Test permission denial, empty results, changed addresses, explicit trust changes and reconnect. Retain manual address and protected save-or-keep switching; no internet-hosting feature.
- [ ] Implement verified in-app APK discovery/download/install handoff under the established trust policy. One clear update action leads to Android's required installation consent; advanced/manual APK fallback remains available.
- [ ] Test cancellation, tampered/wrong-signer/wrong-package/downgrade/incompatible assets, offline retry, installation permission denial and actual upgrade retaining journals/approvals. Verify Android prereleases remain isolated from desktop feeds; no silent-install claim.
- [ ] Check settings/discovery/update sheets with keyboard, large fonts, narrow windows, screen-reader labels, reduced motion and retained editor state. Publish a verified settings/update-capable APK with precise installation steps.

**Acceptance:** host access, personal appearance and updates use the same mobile interaction language and preserve trust/data. Stop before final integration.

## A9 — Motion, integration, performance and release handoff

Status: **Not started.** Depends on A5–A8 gates and reviewed APK feedback.

- [ ] Finish coordinated Snappy/Smooth transitions across drawer, sheets, destinations, contextual tools and notifications. Reduced motion removes spatial effects; closed surfaces release focus immediately. No hover dependency, constant decoration, editor remounts or animation on typing/saves/refreshes.
- [ ] Run a focused final release-APK matrix on Android16/17: Small/Atlas, keyboard/composition/selection, journeys, images, conflicts/recovery, host shutdown, permission/revocation, process/renderer death, rotation, font scaling, all themes/accents, accessibility and narrow layouts. Measure bounded cache/memory/startup/scroll behavior rather than claiming responsiveness from screenshots.
- [ ] Verify upgrade from alpha.4 and intervening milestones, session/query/reading restoration, no replay of commands/uploads, retained approvals/recovery and safe updater retry. Use disposable data and explicit emulator serials only.
- [ ] Resolve user-reported S24 issues within scope. Keep Samsung Keyboard, One UI8.5/9, real camera/share/SAF, physical OLED and OEM lifecycle acceptance user-owned. Provide an exact Mac AI/real-LAN handoff when direct verification is unavailable; no agent phone access.
- [ ] Publish the final verified signed APK/tag/checksum and update/recovery guide with versioned notes, actual measurements and short S24/One UI checklist. Update CODEBASE, current Android/media/design guides, readiness and this tracker; record deviations and remaining gates.

**Acceptance:** coherent browsing/reading/writing and safe upgrades in the actual installed APK, with an honest emulator-verified release and explicit physical-device status. Stable Samsung-ready labeling requires user-reported acceptance. Stop; offline sync, backups, hosting and expanded tablet parity require new authorization.

## Per-sprint handoff ledger

For each sprint record: status/date/source/tag/versionName/versionCode; app ID/signer public fingerprint (never private key); host build/protocol; exact tests/emulator images; fixture seed/counts; inspected frames and measured performance; failures fixed and blocked cases; GitHub APK URL/size/SHA-256; installation/upgrade result; user-only acceptance checklist/results; remaining scope and next authorization. A1 implementation ledger (2026-10-08–09): mobile 0.1.0-alpha.1 / versionCode1 / com.vaultor.app; original public signer af1123bd0be38ee48ce61b4f40f3667c4fe740910b64005d3d21dacd83de2567. Protected Windows host 0.7.1/protocol3, two disposable notes, no personal data. RN0.87.1/WebView14.0.1/Tiptap3.31.4/JDK17/Gradle9.4.1/API36+37 builds passed. Three bridge tests, schema preservation/refusal/Save-lock checks, zero scoped lint errors (nine no-void warnings), three instrumentation cases per emulator passed. API36 google_apis x86_64/WebView133; API37 google_apis_ps16k x86_64/WebView145/16KiB pages; 1080×2400/420dpi/2GiB/software IME. Pairing/reconnect, real Gboard keys, undo/redo, protected force-stop recovery, conditional Save, failed Save/Retry, unknown-content refusal, rotation and renderer failure safety passed; captured frames inspected. Fixed phantom save-lock updates, latest-only journal status, retry protection and permission-controller selector. Same-signer install-over candidate retains profile/draft; no previous published APK exists for version upgrade. Final tagged-source APK is published; exact metadata follows. No phone, real LAN/Mac-host, CJK/full selection, large fonts/Atlas scale or Samsung/One UI result claimed. Tooling dependency advisories and a same-laptop private key backup limitation are recorded in ANDROID.md. Five future sprints remain unauthorized.

Published Android-only prerelease at 2026-10-08T18:48:40Z: [Vaultor Android 0.1.0-alpha.1](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/android/v0.1.0-alpha.1), immutable tag android/v0.1.0-alpha.1 / source 3371f53cac6b1ddee5044a7b8506881a45f33d8b. APK 40,071,324 bytes, SHA-256 8d6a2555515ecf4be75738d3f7a955a2f44cccdaf3c2250a0705c69865b4f557; original APK certificate af1123bd0be38ee48ce61b4f40f3667c4fe740910b64005d3d21dacd83de2567. Fresh tagged-source build and exact staged APK installs/reconnects passed on API36/37; final API37 conditional Save changed the disposable host revision/body. APK/package/target/minimum/ABI/16KiB alignment/signature and package/lock/Gradle agreement verified; tampered and test-package APKs refused. All three downloaded GitHub assets match local bytes/digests; byte-identical publication retry passed and release is non-draft/prerelease. Owned fixture host and both emulators stopped. This publication ledger has no additional runtime/architectural effect. Five future sprints remain unstarted; Samsung/One UI acceptance is user-only and open.

## Open decisions and non-blocking defaults

- Minimum API36 is implemented; the user confirms Android16+ in About phone before installation. Physical One UI acceptance remains user-owned.
- Resolved A1: RN0.87.1, WebView14.0.1, bundled Tiptap3.31.4, AndroidJUnitRunner/UI Automator, JDK17, SDK36/37, Gradle9.4.1; editor/trust gates passed.
- Resolved A1: com.vaultor.app; original Android signer privately owner-restricted with a byte-verified same-laptop backup; HTTPS metadata plus APK-signature/package/monotonic versionCode policy. Off-device disaster backup remains unverified; Android updater implementation is A8.
- Initial distribution is manual GitHub APK; A8 introduces in-app installer handoff. No Play Store fee or automatic-install claim.
- Manual address is mandatory, discovery comes in A8. Phone portrait is primary; resizing remains safe, but tablets/DeX feature parity is deferred.
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

## A4 implementation and candidate validation (2026-10-09)

Implemented Android0.1.0-alpha.4/versionCode4: native encrypted pending inputs; stable UUID/source-bound uploads; mapped image placements and tools; authenticated lazy thumbnails; bounded image/PDF/text previews; Photos/Files/camera/clipboard/Share/SAF adapters. No host/API/schema/archive/protocol/desktop change. [MEDIA.md](../android/MEDIA.md) is authoritative for bounds and deferred behavior.

TypeScript,40focused Jest tests and editor schema/refusal plus insertion/attributes/undo/duplicate acknowledgment/deleted-anchor/duplicate-placement checks passed. Scoped ESLint has zero errors/24 warnings (no-void, one shadow and existing inline style). Original-key release/application-test compilation and package/lock/Gradle/minimum36/target37/arm64+x86_64/16KiB checks passed. API36 and37 each passed five native storage/policy cases, two media cases and two real UI cases. Native cases verify encrypted bytes/catalog, restoration through a new native module, UUID retry after removing a simulated lost import acknowledgment, byte-identical originals, bounds and resource survival after pending-input removal. UI checks cover clipboard image insertion, width44/caption/alt editing, conditional Save, preview, picker cancellation and explicit shared file+text staging. API37 actual force-stop/relaunch retained an additional staged text input; the owned test input was explicitly removed afterward.

Disposable host0.7.1 saved standard image JSON and incoming references; PDF/Word/Markdown-assets export operations completed. Artifact checks found PDF image objects, embedded PNGs/captions in Word and original PNG/alt/caption in Markdown assets. This is content/artifact validation, not visual layout certification. Existing Word alt-description omission is documented. A focused API36/37 visual session inspected image loading/tools; a label incorrectly remained over loaded images and was fixed. The image-tools sheet now sizes to content and indicates selected alignment. Extended API37 native PDF two-page rendering and first100KB text-preview checks passed in the four-case media/UI rerun. Camera launch/cancellation and the native Create document destination were exercised on API37; final installed-byte checks and narrow tools/save/copy results follow below.

Failed integration runs exposed off-screen pairing verification controls and stale stopped-fixture TLS/pending input. Pairing now scrolls after content layout; the harness scrolls to verification controls. Only owned failed fixture inputs were removed; approvals/drafts were retained. One Kotlin test import and PdfDocument close mismatch were corrected. Failed runs are not passes. Physical S24/Samsung clipboard/camera/SAF/One UI8.5/9, TalkBack, real Wi-Fi/Mac transfers and OEM process/battery behavior remain open. A5/A6 remain unstarted; no phone access.

A4 final review: fixed editor IME remaining visible on image-tools opening, and guarded thumbnail delivery by current resource identity so late responses cannot repaint a replaced placement. Extended editor tests verify replacement/undo, stale-thumbnail refusal and duplicate-placement survival; TypeScript and fresh editor checks passed. These are A4 corrections, not A5/A6 work.

## A4 published APK and final verification

Published Android-only prerelease at **2026-10-09T04:51:27Z** (2026-10-09 local): [Vaultor Android0.1.0-alpha.4](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/android/v0.1.0-alpha.4). Immutable tag **android/v0.1.0-alpha.4**, source **aa9106878313decc202c14248f66a031bd7c70cb**. APK **40,232,456bytes**, SHA-256 **0096f5552d026d7e0efa4df90cc18bc38f3d528a21d4b837203abe3c2efeba58**. Original public signer **af1123bd0be38ee48ce61b4f40f3667c4fe740910b64005d3d21dacd83de2567**; package com.vaultor.app/versionCode4/minimumAPI36/targetAPI37/protocol3.

Fresh tagged-source release/application-test build and APK package/lock/Gradle/API/arm64+x86_64/16KiB alignment/original-signature checks passed. The exact staged hash matches the Android17 final installed candidate; the exact tagged APK installed over the retained Android16 app. All nine storage/media/UI checks passed on each: five storage/policy, two native media and two real interaction cases. Extended cases include two-page PDF rendering, bounded text and resource-backed clipboard copying with readable content-provider URI/dimensions/colors. Native MediaTest verifies byte-identical downloaded originals; Android17 Save original through Create document produced252bytes matching the current host asset snapshot exactly. The first comparison used an earlier export snapshot from before further fixture insertions; regenerating the current snapshot resolved that fixture mismatch, with no code change.

Matching-code/editor/browsing/picker/inline-link/native-Back checks passed on both generations earlier in A4. Approvals, note/session and protected records survived install-over. Actual force-stop/relaunch retained one staged Share input without inserting it. Photos/Files cancellation and mixed file+text Share staging passed; camera launch/cancellation was exercised on Android17. Narrow900×2100/130% font and default1080×2400 tools were inspected; the final tools open without the editor IME and wrap/scroll as needed. Default size/font were restored. Editor replacement/undo/stale-thumbnail and duplicate-placement tests passed;40Jest tests, TypeScript and scoped lint zero errors/24warnings passed. No FPS, full heap, visual export-layout or physical OLED certification is claimed.

Publisher verified clean pushed source/tag, original signer and all staged files, downloaded all three assets for byte comparisons, then published. GitHub confirms non-draft/prerelease status and matching APK/manifest/checksum sizes/digests. Desktop/Mac0.7.1 and protocol3 remain unchanged. Owned disposable hosts/listeners and both emulators were stopped; no personal workspace or phone access. Install only the APK over the existing app; do not uninstall/clear data. This publication ledger is documentation-only and does not alter the source tag or runtime.

Physical Samsung/One UI8.5/9 camera capture, clipboard/share providers/cold URI grants, real Wi-Fi/Mac media transfers, TalkBack, external-viewer outcomes and OEM process/battery behavior remain user-only/open. Animated previews remain static first-frame; originals are preserved. Word alt-description omission and possible repeated Android Share delivery are documented in MEDIA.md. **A4 complete; two sprints A5–A6 remain unstarted.**

## 2026-10-09 — Android-first redesign planning after A4

Replaced the former two remaining sprints with A5–A9: interaction shell, writing/autosave/media, organization/lifecycle, settings/discovery/updater, final motion/integration. Added DESIGN.md as the planned interaction contract. A1–A4 history and immutable tags remain intact; alpha.4/manual saving remains current. Documentation-only scope/link/whitespace checks passed; no runtime changes, builds, emulator sessions, source publication or new APK. **Five sprints remain unstarted; this request authorizes planning only.**

## A5 implementation and candidate checks (2026-10-09)

Implemented Android0.1.0-alpha.5/versionCode5: drawer-led Home/Library/reading shell, contextual Journey/Filters, shared OS palette, IME-aware editing, retained origin/session/editor and sequential bounded mixed quick access. Original signer/package and host0.7.1/protocol3 remain unchanged. A6 autosave/accessory, A7 organization, A8 preferences/discovery/updater and A9 integration remain unstarted. DESIGN.md owns the comparison/decision; ANDROID.md owns implemented contracts.

TypeScript,45focused Jest tests and fresh bundled-editor schema/refusal/read-mode/theme/media/undo checks passed. Scoped lint zero errors/38 warnings (no-void, shadow and existing inline styles); release/application-test compilation and package/lock/API/ABI/16KiB/original-signature checks passed. Android16 and17 each passed the actual matching-code approval/read/Edit/IME/typing/undo/conditional-save/Back/drawer/Filters/inline-link test and nine storage/media/UI regression cases. Installation over alpha.4 retained approvals/session.

One targeted visual session inspected API36 dark reading/real keyboard/drawer; API37 Light reading and temporary image preview, Small70 mixed Home/pins,900x2100/130% text with wrapped titles, compact options without IME and empty search. Wide docking was corrected from right to the same left edge. Final candidate left-side wide docking was rebuilt and inspected; installed/tagged artifact checks are recorded after completion. Explicit theme preference and full motion/TalkBack remain later gates. Drawer collapse is in-memory for an opening; it is not yet a saved device preference.

On Android17 the checksum-verified disposable Atlas5,000 case passed bounded mixed100-row paging,4,000notes/80collections/300pins,66-member collection, saved-body opt-in with title exclusion and scripted scrolling. Warm loopback first-page samples191/116/103ms, secondpage101ms; body query84ms/title query56ms; first usable Library2,126ms; six scripted scrolls3,097ms include harness overhead. No FPS, heap, Wi-Fi or performance-improvement claim. Dataset replacement targeted only the freshly created temporary host, never personal data.

Early failures exposed a real Edit keyboard focus issue and edge-to-edge tool overlap; native cancellable Edit focus plus KeyboardAvoidingView corrected them. Harness fixes cover offscreen Pair with many remembered hosts, restored Library instead of assumed Home and the header accessibility class. External UI-automation diagnostics also interrupted a run; subsequent tests used one instrumentation owner. Failed/interrupted runs are not passes. Physical S24/Samsung Keyboard/One UI8.5/9, TalkBack, actual Wi-Fi/Mac, OEM lifecycle and physical OLED remain user-only/unverified. No phone access. Stop after A5 publication for discussion.
