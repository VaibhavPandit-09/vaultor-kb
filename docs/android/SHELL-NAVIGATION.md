# Android shell and source navigation

Reviewed 2026-10-23. Current published alpha.28 retains the integrated reader-first Home/Library/Review shell. This document owns navigation and source presentation; [ANDROID.md](ANDROID.md) owns implementation/build/release boundaries and [Review delivery](REVIEW-SYNC.md) owns synchronization. Earlier drawer/prototype gates are superseded; physical Samsung/TalkBack/OEM acceptance remains unqualified.

## Source ownership and preserved behavior

Home/Library/Review occupy the browsing folio. Sources is a distinct context action,
not a fourth destination. It sits beside the Home/Library heading, and in focused
reader controls; global Review reaches Sources through Settings and never
shows active-source scope. The same folio contracts into the reading controls; there
is no old drawer or shell topbar. Full workspace/availability labels remain accessible,
with all source details available by opening Sources. Identity strings and names are
display metadata, never routing keys. Download names match the full generation scope.

Sources retains current workspace and host, approved server workspaces and verified
active downloads in one scroll context. Remembered hosts and manual pairing sit behind
Manage connections. Reconnect/refresh, disabled locked copies, matching-code approval,
API37 network permission, failure-local retry, Offline downloads and legacy recovery
retain their established contracts. Inspection never activates a source. Only explicit
selection invokes existing native/model epoch and session checks. Source-specific
navigation, downloaded content, reader progress and protected records remain isolated.

Sources opens/retracts over the mounted content using ContextSheet/MotionSheet. Manual
close returns focus to the context control. Actual activation commits independently of
motion and retains the existing 24dp orientation/H2 after activity focus; refused
activation stays local with existing H4 feedback. Background refresh remains silent.
No effect, intensity, admission or semantic usage policy changes.

Review reads the device journal grouped by full host/workspace/generation without
activating a source. Existing local drafts/queued captures open by journal ID through
the current protected composer, including forgotten/unavailable source records.
Review inspection never changes original content, captured source or delivery identity.

## Shared surfaces and review boundary

ContextSheet supplies a modal window, measured MotionSheet, inset/IME handling,
palette-aware bars and heading focus. Sources alone opts into reversible exit;
its window has bounded cleanup even when animation is interrupted. Existing utility,
Find, media, appearance, capture and offline surfaces retain their ownership and
centralized Back behavior. Full TalkBack and Samsung gesture/keyboard feel remain
physical-device checks. Automated checks cannot approve motion or tactile quality.

[Review capture](REVIEW-CAPTURE.md) owns protected local record semantics;
[interaction foundations](INTERACTION-FOUNDATIONS.md) owns semantic haptic/native
policy. The user reports perceptible alpha.18 S24 haptics. Exact individual H2/H3
physical trace evidence remains user-owned and does not establish current full hardware acceptance.
Current automatic Review delivery is implemented; subjective device acceptance remains user-owned.

## Retained navigation, source and reader state

One NavigationFolio owns browsing/disclosed/focused states. Three equal Home/Library/Review slots retract as reader controls take their space; disclosure returns to browsing without replacing the reader. Hidden controls leave touch/accessibility routing. Compact browse/reader allocations start at58/52dp and grow with font scale, retaining48dp action targets. Wide adaptation uses actual inset-adjusted width≥840dp, height≥480dp and width/fontScale≥720, yielding144dp browsing/128dp focused rail; it is not a device-name/tablet parity promise. Source control is distinct from primary destinations.

Library uses heading/source/options, search/Filters, one count/Resume row and one virtualized list. Counts scroll with that list; active scope/coverage stays discoverable. Per-source destination configuration restores query/collection/page/offset. A bounded64-entry memory presentation history also restores utility destinations; after process death only the durable current-source session is promised. Review is device-wide and starts closed after restart.

Compact Sources lists current source, retained offline generations and connected-host workspaces; remembered servers/pairing/forgetting remain in management. Locked copies stay visible/nonselectable. A single source has no switch chevron. Settings & tools reaches management and utilities. Reader Aa first exposes theme/text size/spacing; More reading settings retains width/accent/motion/feedback/reset and build-gated diagnostics, with the same preferences and reading anchor.

Measured resource/title origin opens a clipped reader viewport and a separately settling title; document text renders at final size. The browsing tree remains mounted below it. Reverse motion validates scope/resource/visit and live origin bounds. Missing/recycled/offscreen origins use a16–20dp fallback; source/resize/background/new interaction cancels obsolete motion. Reader pixels await their own load acknowledgment. Hidden native WebView visibility and exclusive touch/accessibility ownership have bounded cleanup independent of animation completion. Reduced motion resolves immediately; navigation/load/failure/central Back never waits for motion. Files remain temporary previews, and unrelated notes never receive false shared-object motion.
