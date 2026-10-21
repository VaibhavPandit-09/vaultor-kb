# Consolidated R6 completion candidate

Authorized 2026-10-21 after S24 alpha.20 testing. The reader-first hybrid remains
the accepted foundation. Batch1 covers quick Sources/management, direct Aa and
resource-origin reader motion; Batch2 implements the existing A4 queue/status
contracts. One consolidated development acceptance APK is intended. No public
release, R7, master integration, new UI framework or haptic-engine expansion.

## Baseline and checkpoints

Prototype branch starts this work at c0731e05243ba526fc817d4d8254fe01fb0f4c7d.
Fetched master fb053862df386c1fefe9d9db2a7924eb63979b22 is its ancestor.
Original R6 tip6308fd6 has one absent documentation-only publication commit;
its A0–A3 product implementation is present through immutable alpha.17/1586743.
No later R6 functionality is omitted. No merge/cherry-pick/rebase is performed.

User authorization supersedes old stop-before-Prototype2/A4 gates. Technical
verification continues across meaningful slices, with physical acceptance at the
consolidated candidate. A5 subjective polish/accessibility remains user-owned.

## Source and settings slice

Sources opens a compact list: current source, retained offline generations,
connected-host workspaces and saved connections. Routing remains by exact native
identity, never names. Locked copies stay visible and nonselectable. A single source
has no switch chevron. Source management owns existing reconnect/pairing/approval
forgetting/download/recovery actions, with the original checks and confirmations.
A visible Settings action exposes settings/tools and source management. Reader Aa
opens theme, text size and spacing first; More reading settings retains width,
accent, motion, feedback, diagnostics and reset. Existing preferences, theme reveal,
DOM and reading anchor remain authoritative. Keyboard Back hides IME first.

## Resource motion specification

Measured resource/title origin → reader viewport reveal → title settles into reader
hierarchy. Render document text at its final size; animate a containing clip and a
separate title geometry, never stretch a WebView bitmap. Keep browsing context
mounted beneath reading. Scope/resource/visit identity and live geometry validate
reverse movement. Missing/recycled/offscreen origins use a small bounded fallback;
reduced motion resolves immediately. New interaction/source/resize/background cancels
stale motion. Navigation/loading/failure and central Back never wait for animation.
Home, Library, Recent and reliable note origins participate; file previews retain
their own contracts. No synthetic shared motion between unrelated notes.

## A4 boundary

Before A4 code, re-read android-r6-plan, workspace-companion-plan R6, REVIEWS and
REVIEW-CAPTURE against native journal/transport and host ReviewService. Native owns
one durable queue; preserve UUID and complete immutable PUT body including
baseRevision. Exact host/workspace/generation/grant admission; unknown outcomes retry
exact PUT, never infer a receipt from partial GET fields. Delivery and desktop triage
are separate. Original note JSON/revisions and evidence never change. Foreground
catch-up/Sync now must work without guaranteed background execution. No Android
status-write surface or note editing authority.

## Validation

Source/settings slice: TypeScript and focused source/reading Jest checks pass.
Android motion/runtime verification follows with Batch1 before A4 implementation.
No physical approval or new APK is claimed at this intermediate source checkpoint.
