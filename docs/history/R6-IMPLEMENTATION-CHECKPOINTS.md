# R6 implementation checkpoint narratives

Archived 2026-10-21 from CODEBASE at integration publication-record commit 19f93a9. These dated A0–A5 implementation snapshots preserve the original technical narrative and review gates; their then-current blockers are historical. [CODEBASE](../CODEBASE.md) and [R6 integration](../plans/R6-INTEGRATION.md) own current behavior and readiness. No historical release ledger is rewritten.

### R6 A0 Android interaction foundation — review candidate

The approved [Android R6 phases](../plans/android-r6-plan.md) begin with A0 on ai/codex-r6-android from verified master fb05386; references above to unstarted R6 capture/sync remain domain boundaries. Android alpha.12/code16 adds small motion tokens/MotionSheet, a presentation-only native VaultorPresentation module, capability-aware semantic haptics, device-local System/Off and explicit feedback previews, coordinated control-origin theme reveal and main/modal system-bar styles. ReadingProvider owns a single conservative OS reduced-motion source used by the shell/reader. Native effects enforce foreground/view/system/app policy, prefer action feedback and use supported envelopes/primitives only for named rich profiles. Bounded memory-only old-palette overlays retain actual reader/DOM/control ownership and fail open on interruption/timeout/allocation; no animation owns correctness. Reading appearance is the first foundation surface; A1 follows below; A2–A5, Review capture/outbox/sync and physical haptic acceptance remain pending. Host/API/resource/archive/protocol/desktop are unchanged. [INTERACTION-FOUNDATIONS.md](../android/INTERACTION-FOUNDATIONS.md) owns exact policy/limits, and [alpha.12 ledger](../android/releases/0.1.0-alpha.12.md) owns actual validation/publication. A0 physical review remains pending.

### R6 A1 Android shell/source navigation — review candidate

Authorized by “continue next”, Android alpha.13/code17 retains the workspace/reader while Sources, drawer and legacy recovery are inspected. Source identity and availability share compact orientation; connected workspaces/hosts and verified downloads share one source surface. Native identity/scope and online/local admission are checked before explicit H2 confirmation; failures stay local with H4, and background events stay silent. Home resumes the actual resource; Library secondary controls move into the single measured FlatList header; drawer disclosure state survives dismissal, with native edge entry and safe areas at all widths. ContextSheet standardizes utility/modal ownership, bars and IME without a scene manager. [SHELL-NAVIGATION.md](../android/SHELL-NAVIGATION.md) owns exact behavior/compromises. Existing read-only API/transport/native epoch/session/download boundaries, resource JSON and desktop are unchanged. Review outbox/capture/status and reader-edge/predictive motion are not introduced. [Alpha.13 ledger](../android/releases/0.1.0-alpha.13.md) records actual checks and open physical acceptance. Stop at A1 review before A2.

### R6 A2 reader context — review candidate

Authorized by “start next”, Android alpha.14/code18 keeps a minimum48dp reading edge while the same native title/source compact with connected scrolling; offline context remains visible. Contextual Find overlays the bottom without consuming document height. Typography, decoded thumbnails and true resize use bounded revision-aware anchor retention, yielding to touch/recent scroll/new loads; readiness is independent of restoration. Media controls move into the shared surface over a retained viewport, gallery keeps its native window, explicit Fit uses one-image transform and current-ticket H2 settle, and PDF Go validates locally while displayed page identity follows actual render acknowledgment. A bounded cancellable native window-focus handoff admits Find input after modal release; Find entry uses H1 after focus; ordinary navigation/background/predictive gestures remain silent. Platform Back owns progress/cancellation and commits through existing navigation/modal ownership; no speculative destination preview. [READER-CONTEXT.md](../android/READER-CONTEXT.md) owns details and risks. Original JSON/files, API/transport/host/schema/archive/protocol/desktop and review boundaries are unchanged. Actual installed/physical limits belong in the alpha.14 ledger; stop before A3.

### R6 A3 Android local Review capture — candidate

Authorized by “continue next” after alpha.14, Android alpha.15/code19 adds contextual source-bound capture over retained reader/media surfaces. Native Copy remains; full bounded quote/context and validated block path or confirmed one-based PDF page freeze with source/resource/revision. VaultorReviews uses a separate encrypted AtomicFile journal (format1/256items/8MiB), atomic protection/version checks and same-UUID immutable local queue commit; corruption/failure retains prior evidence. Captures on this phone recovers protected drafts and inspects queued evidence independently of active source/download retention. ContextSheet/MotionSheet expose a cancellable settle keyframe for H2 anchor; durable queued confirmation uses H3 capture with capability/system/app fallbacks. No upload/status/SSE/original-write/API/schema/archive/desktop change. A4 owns delivery/reconciliation; queued is explicitly local. [REVIEW-CAPTURE.md](../android/REVIEW-CAPTURE.md) owns bounds/state/motion/haptics and integration-sensitive files; alpha.15 ledger owns actual validation. Stop at A3 review before A4; physical acceptance remains user-owned.

### A0–A3 real-device remediation — A4 blocked

The user rejected alpha.15 interaction work on the S24 Ultra: haptics and structural movement were not perceptible. Alpha.17/code21 refines the explicitly development-only acceptance candidate; alpha.16 remains its immutable comparison baseline. VaultorHaptics reports actual suppression/capability/request results, distinct platform semantics and selectable clear/platform/expressive rich profiles. Build-time native diagnostics default off and reject ordinary builds. Context surfaces start after native show/measurement; capture stays in one window with separate evidence lock and durable receipt geometry keyframes. Reader header now reclaims viewport space; Find reveals its edge; source confirmation waits for activity focus/settle. Theme snapshots scale within32MiB for QHD dual windows. MOTION-HAPTIC-REMEDIATION.md owns the complete shipped inventory, revised candidate and exact device script. Local protected draft/queue/source/original contracts remain unchanged. Runtime checks are not tactile/visual approval. A4 must not start without explicit S24 approval.

Android prototype continuation: alpha.20/code24 is the local Prototype 1
refinement candidate on ai/codex-android-ux-prototypes, based exactly on immutable
alpha.17 through alpha.18. [Navigation prototype](../android/NAVIGATION-PROTOTYPE.md)
owns Home/Library/device-wide source-grouped Review, the distinct Sources context
action, one contracting browsing/reader folio and window-width rail adaptation.
WorkspaceScreen retains the reader under Review and source inspection; existing
per-source durable sessions remain authoritative. A bounded presentation-only
BrowseMemory restores utility destination configurations without a storage change.
The drawer and duplicate shell topbar are removed. Existing reader/composer/domain,
native source admission, journal identity, transport and sync contracts are unchanged.
[Capture trace](../android/HAPTIC-CAPTURE-TRACE.md) remains development-gated, bounded,
memory-only and sanitized. The user reports perceptible alpha.18 S24 haptics;
no Samsung JSON establishes H2/H3 individually. Existing effects/admission/policy
remain unchanged, with targeted trace follow-up optional and navigation unblocked.
The user provisionally approved alpha.19’s navigation concept but rejected its visual
execution. Alpha.20 refines three equal destination slots and traveling selection
mark, moves Sources beside Home/Library headings and into focused reader context,
and removes active-source scope from global Review. Library shares count/Resume
and uses concise named membership metadata. Existing virtualized browsing/state and
protected journal semantics remain unchanged. No public release or subjective visual
approval of visual execution remains user-owned. On2026-10-21 the user accepted
the navigation foundation and authorized consolidated Batch1 source/settings/resource
motion plus A4 completion. [Current completion scope](../android/R6-COMPLETION.md) owns
checkpoints and exact branch audit. Quick Sources now separates selection from full
management; reader Aa exposes existing theme/size/spacing and advanced preferences.
The native journal, source checks and haptic engine are unchanged in Batch1.
ResourceTouch measures row/title identity and ReaderAperture reveals a fixed-size
retained reader over mounted browsing context; fresh valid origin geometry owns
reverse motion, with immediate model navigation and bounded fallback. Reader load
acknowledgment prevents old pixels under a new title.

### Current R6 A4 delivery/status

VaultorReviewSync owns single-dispatch exact-UUID/body retries from the independent
protected capture journal. Additive delivery metadata and bounded server receipts
preserve source/evidence/draft contracts; no migration, host/API/domain or original
resource change. Native pinned transport admits captured host/workspace/generation
and grant, independently of active source, with scoped capability and post-GET
identity checks. Sending claims precede dispatch; durable receipts precede synced.
Review-only events refresh status without reloading the reader. Foreground/resume/
queue catch-up and Sync now expose queued/sending/unknown/error/synced plus read-only
desktop triage. An admitted native batch may finish while the process survives backgrounding; there is no background scheduler or force-stop guarantee. [REVIEW-SYNC](../android/REVIEW-SYNC.md)
owns routing, retries, statuses, limits and diagnostics. No new haptic effect/policy.

Create Review is the sole explicit completion action: R5 requires a nonblank comment.
Flag opens a protected unfinished draft; typing/dismissal never publish it. Completion
waits for protection, queues the same UUID/body and triggers automatic native delivery.
ReviewSyncRunner coalesces one follow-up during an in-flight batch. Foreground/resume/
verified reconnection and bounded periodic retries repeat all admission checks;
immutable conflicts remain blocked. Receipt refresh uses native events/resume instead
of2s encrypted-journal polling. Settled sheet focus respects the IME; dismissal restores
a scoped reader/Review-row accessibility target.
