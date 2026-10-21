# R6 Android redesign and Review capture

Approved direction 2026-10-16. Branch `ai/codex-r6-android` starts at verified master `fb053862df386c1fefe9d9db2a7924eb63979b22`, matching fetched origin/master. No old R5 branch is incorporated. The initial audit was source/document inspection, not a new runtime certification. User's “start” authorized A0; “continue next” subsequently authorized A1. “Start next” subsequently authorized A2; “continue next” now authorizes A3. The2026-10-21 consolidated continuation authorizes A4 on ai/codex-android-ux-prototypes; [R6 completion](../android/R6-COMPLETION.md) owns current gates. [Workspace/companion roadmap](workspace-companion-plan.md) owns milestone scope, [Reviews](../workspace/REVIEWS.md) owns R5 API/domain semantics, and both UI philosophy documents remain authoritative.

## Audited baseline

- Drawer-led shell, mixed bounded lists and retained reader are worth preserving; fixed58dp topbar and stacked list controls lack progressive compression.
- Home introduction/resume is generic; connected hosts/workspaces and downloaded sources are split across surfaces.
- Reader has immutable safe DOM, distinct journey visits and revision-aware anchors. Controls are separate immediate sheets; new visits use decorative opacity entrance.
- Media is a temporary full-screen preview with scoped page/zoom/pan; permanent zoom/page/gallery rows consume reading space.
- Offline checkpoints are durable/verified/atomic and explicitly local. Generic offline wording does not distinguish checkpoint, cache fallback, unavailable original and lock.
- Download management mixes jobs/setup/policy, polling once per second; general connection errors occupy a global top notice.
- Appearance tokens preserve DOM but recolor immediately. Native bars/insets and modal/IME policy need coordinated treatment.
- There is no semantic haptic engine. Reduced motion exists, while motion timings and modal ownership vary.
- Accessibility has names/48dp targets/live regions but no complete TalkBack certification. Back is centralized; manifest support does not prove predictive progress/cancellation. Rotation/resizing has basic support without tablet/DeX parity.
- Android native admission rejects Review routes/writes, ReaderFeed rejects reviews notifications, and there is no durable review outbox.
- Reader paths `/0/1` need validated conversion to R5 `0.1`; internal zero-based PDF pages need one-based API conversion.
- Installed WebView custom menu replaces native selection choices and returns text only. Prove retained Copy and range/context extraction before adopting it.

## Phases and gates

| Phase | Scope | Review gate |
| --- | --- | --- |
| A0 — Android design foundations | Small motion primitives, native semantic haptics, theme/bar foundation, reduced motion and device preferences | Existing appearance sheet/theme/feedback demonstration; physical tuning outstanding |
| A1 — Shell/navigation + reader baseline | Source selector, resource resume identity, compressed browsing/orientation, coherent sheets/errors | Home→Library→reader→return and offline/source switching |
| A2 — Reader motion/context | Stable reading edge, contextual controls, journeys, compact media, Back/predictive Back | Reader/control/preview continuity in motion |
| A3 — Review capture UI | Source-bound evidence/composer, protected drafts, transactional local queue, selection/Copy and locator validation | Offline capture/death/storage/IME plus physical anchor/save feedback |
| A4 — Queue/sync/status | Source-grouped inbox, single native owner, exact receipt reconciliation, desktop status, recovery | Lost acknowledgment→one correct desktop review→explicit resolution→Android update |
| A5 — Polish/real device | Haptic/motion tuning, bars/themes/insets/accessibility/performance, upgrade/publication | User-owned physical acceptance and documented installed gates |

A0 implementation is authoritative in [Interaction foundations](../android/INTERACTION-FOUNDATIONS.md). A1 is implemented as the alpha.13 shell/source review candidate following “continue next”; A2 is published as the alpha.14 reader-context review candidate; A3 local capture and A4 native delivery/status are implemented in the consolidated continuation; A5 physical acceptance remains pending. A0 physical haptic acceptance remains pending. No R7 import or R8 export feature expansion; broader discovery/update settings remain R9.

## Preserved R6 contracts

Reviews are independent records; original note JSON/revisions/files/placements stay unchanged. Capture host/workspace/generation/resource/base revision before transient selection disappears. Retain local title/time separately from authenticated server author/title/time. Delivery (local/sending/unknown/synced/attention) and triage (open/resolved/dismissed) are separate dimensions.

Reuse R5 text/locator limits. Freeze UUID/body before dispatch; uncertain results never authorize changing intent or redirecting to the active workspace. Exact PUT retries provide full creation-body reconciliation; GET does not expose every immutable creation input. Review-only invalidations must not reload documents. Pending data survives download eviction/replacement/approval removal; locked sources are never reopened through a recovery bypass. Android initially reads desktop triage state rather than adding a status-write surface.

## Interaction specification retained for later slices

All controls retain visual/semantic equivalents with haptics off. Reduced motion uses stable immediate endpoints. Motion callbacks may emit feedback only for the current committed presentation token; application state never waits for animation. No duplicate pulse over platform-owned selection/system gestures. Emulator gates test correctness; real hardware gates sensation, touch/motion quality and bars.

| Interaction | Transformation / mounted identity / preserved state | Feedback keyframe and fallback | Main semantic/runtime risks |
| --- | --- | --- | --- |
| Drawer/sheets | Context→edge surface→source; reader/list mounted; position/query/trigger retained | Open/close H0; deliberate detent H2 at settle→system snap | Lost composer draft; test nested Back/focus/IME and physical edge gestures |
| Source switch/reconnect | A→verified B; retain A context/queue, mount B under B identity | Explicit activation H2 at commit→system; automatic reconnect H0; explicit refusal H4 | Wrong-source routing; test equal IDs/delays/grants/generation and physical clarity |
| Browse/filter/page | Same orientation compresses around one list; retain input/query/same-query scroll | Scroll/page H0; filter H1 at selection frame→system | Foreign counts/row jumps; test short/long/bottom/font and physical scroll |
| Open/link/Back | Resource origin→reader→prior visit; commit journey only after load | H0 including predictive cancellation | Stale capture target; test cycles/load failure/gesture cancellation and physical continuity |
| Reader controls | Same title/source/actions compact; WebView/DOM and reading-edge anchor retained | Scroll H0; mode H1 at commit, snap H2 at settle→system | Selection geometry drift; test outline/find/reversal/rotation and physical reading stability |
| Media | Context→temporary preview→source; viewer retained through chrome changes; page/zoom/pan/colors retained | Pan/pinch/page H0; explicit Fit H2 at settled fit→system | Wrong file/page target; test renderer/gallery/rotation and physical pinch |
| Appearance | Control-origin global palette reveal; mounted DOM/viewers/geometry retained; typography restores anchor | Theme H0; discrete appearance H1 at commit→system | Snapshot/focus/recreation; test rapid/OS/reduced/overlay and physical flash/OLED/bars |
| Download/lock/removal | Same source row expands; old checkpoint readable until activation; lock hides source | Background/progress H0; awaited activation H3→system; confirmed removal H5 after success | Evicting queue/substituting passage; test hash/disk/death/lock and physical completion |
| Capture | Passage/resource/page→context composer; reader retained; freeze range/evidence/source first | H2 at validated visible evidence lock→system | Lost Copy/fabricated locator/truncation; emulator range/limits/paths, physical selection |
| Local save/dismiss | Protected draft→durable queue; composer contracts toward confirmation, reader retained | H3 first queued frame after transaction→system; failure H4; typing/dismiss H0 | Premature success/edit-dispatch race; test double tap/disk/death/Back, physical timing |
| Queue/sync | Same keyed row delivery label transforms, evidence expands; UUID/body/source/scroll retained | Background H0; one awaited batch H3 after persisted exact acks→system; foreground actionable H4 | Timeout≠rejection/duplicate identity; test mixed/lost/restart/owner/switch and physical fatigue |
| Desktop status/recovery | Same row status/availability changes; original evidence/receipts retained | Updates H0; attempted blocked action H4 with explanation→system | Auto-resolution/reattachment/export acknowledgment; test desktop edits/missing/revoke/replacement and TalkBack clarity |

## A0 ledger — 2026-10-16

Implementation candidate adds presentation-only primitives and device-local haptics, without a host/API/resource/archive change. Android version increments to alpha.12/code16. Focused TypeScript/Jest and native gates are recorded in the release ledger; real-device approval remains pending. Stop before A1.

## A1 ledger — 2026-10-16

User authorized the next slice. Shell/source navigation and resource resume presentation are authoritative in [SHELL-NAVIGATION.md](../android/SHELL-NAVIGATION.md). Published alpha.13/code17 from immutable25dad991 is the shell/source review candidate; stop at A1 review before A2. Review capture/outbox/sync remains unimplemented. Actual validation belongs in the alpha.13 ledger.

## A2 ledger — 2026-10-16

User authorized A2 with “start next”. [Reader context](../android/READER-CONTEXT.md) owns its state/motion/haptic contract. Alpha.14/code18 is published from immutable02e39fac/android/v0.1.0-alpha.14 after focused installed emulator gates, exact-source/installed-byte comparison and staged/public verification; source identity, immutable originals and Review boundaries remain intact. Stop at A2 review before A3; physical acceptance remains user-owned.


## A3 ledger — 2026-10-16

“Continue next” authorizes A3 after published alpha.14. [Review capture](../android/REVIEW-CAPTURE.md) owns interaction/local persistence; [alpha.15 ledger](../android/releases/0.1.0-alpha.15.md) owns actual checks. Protected drafts and durable local queue are independent of downloads/legacy recovery. No upload/status transport is enabled; stop at A3 before A4. Physical acceptance remains user-owned.

Published A3 alpha.15/code19 from immutable7d64708/android/v0.1.0-alpha.15 at2026-10-16T07:14:53Z. Both exact installed emulator artifacts passed12 focused executions and match the clean-source signed APK. Three staged assets independently downloaded and compared before publication; alpha.15 ledger owns failures and physical limitations. Stop at A3 review before A4.

## 2026-10-16 — A0–A3 remediation gate

User rejected alpha.15 on real S24 Ultra: haptics and structural motion were not perceptible. A0–A3 are not approved. A4 is blocked until explicit approval of the revised development acceptance APK. MOTION-HAPTIC-REMEDIATION.md owns inventory, remediation, actual checks and physical script. This pass changes presentation/diagnostics only, with local persistence/source/original boundaries preserved.

### 2026-10-16 — Remediation candidate published; A4 blocked

[Development acceptance alpha.16/code20](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/android/v0.1.0-alpha.16) published at12:00:42Z from 9197816856d823b4f1efd35098e6d2985ced295c. Installed original-signer APK bytes, clean-source reproduction, three staged downloads and anonymous public APK checksum verified. [Audit and exact S24 script](../android/MOTION-HAPTIC-REMEDIATION.md) and [release ledger](../android/releases/0.1.0-alpha.16.md) own evidence. A0–A3 remain unapproved on real hardware; stop here. A4 requires explicit S24 approval.

### 2026-10-19 — Alpha.17 hybrid/refinement authorization

User authorizes architectural/interaction audit then minimum A0–A3 refinement and development acceptance alpha.17/code21. React Native remains primary UI/motion; existing thin Kotlin haptics renderer owns native effects. Motion-first/restraint policy removes routine Find/accent and product rich-anchor feedback; REVIEW_CAPTURED is the sole authored product event. No Compose rewrite/sound/A4. Audit, precise delta and separated alpha.16→17 S24 motion/haptic checklist are in [remediation](../android/MOTION-HAPTIC-REMEDIATION.md). Build/native/publication evidence follows in alpha.17 ledger; stop for explicit approval.

Alpha.17 installed gates:22 distinct API36 and15 API37 checks passed, including actual IME/named completion and original/reader retention; setup failures/limits are recorded in the alpha.17 ledger. No S24 subjective approval. A4 remains blocked; publication gates follow.
