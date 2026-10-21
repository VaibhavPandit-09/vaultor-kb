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
connected-host workspaces. Saved connections remain in management until inspected. Routing remains by exact native
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
Batch1 TypeScript and13 focused geometry/source/reading/navigation Jest cases pass.
Scoped lint has zero errors (32 warnings). Original-signer release and native-test
compilation pass. API36 ReaderMotionExperienceTest passes after correcting a
management test assumption and the moving title endpoint (40.983s final); actual
intermediate native aperture bounds, retained WebView/DOM and scroll, list query,
Aa updates and Settings handoff are asserted. Existing capture/queue/original
preservation passes (8.43s). Recorded45s/8fps temporal samples were inspected, not
just endpoints. The first recording revealed a chasing/duplicate title endpoint;
fixed reader hierarchy geometry and temporary title ownership remove that defect.
Approval removal is present in its separate management section. No subjective S24
approval is claimed. This paragraph records the intermediate Batch1 checkpoint; final installed checks
are below. No physical approval is claimed.

Aperture geometry follows the small existing folio allocation change; real window,
IME or source changes cancel stale origins. Missing origins use a16–20dp bounded
reveal. Hidden reading/browsing trees remain mounted with exclusive touch/accessibility
ownership. Reader pixels wait for their own load acknowledgment before appearing,
preventing old-document pixels under a new title. No document text/bitmap scaling.

## A4 implementation checkpoint

Native captured-source transport, durable sending claims, exact PUT retries and
receipt/status reconciliation are implemented. [REVIEW-SYNC](REVIEW-SYNC.md) is
the authoritative behavior reference. TypeScript/focused JS checks,14 R5 ReviewTest
backend cases and original-signer release/instrumentation compilation pass.
Initial API36 journal/sync run passed8 cases. Real production pinned HTTPS passes:
lost committed response, process restart/exact retry, intentional death after
sending claim, recovery, offline/reconnection, genuine capture/Sync now, desktop
resolution/dismissal, different body under same UUID and nondefault workspace grant
while default grant is revoked. Host originals stay equal; same resource IDs do
not misdirect records. Final expanded native/API37/UI gates are recorded below.

## S24 Ultra consolidated acceptance procedure

Install the alpha.21/code25 development APK over alpha.20. Do not uninstall/clear
storage. Use an approved host with reviews:1 (R5 or newer), disposable notes and
known source/workspace identities. Existing protected captures may now deliver to
their approved original source when reachable; they are never automatically deleted.

1. Home/Library: confirm the three destinations, compact named source context and
   Settings. Open Sources; selection/status should be concise. Source management
   retains pairing/reconnect, downloads, recovery and separately confirmed trust
   removal. With only one source, no prominent switch chevron. Raw address is only
   needed for ambiguity/technical management. Change A→B→A and verify each source's
   query/filter/list/reader context, including a retained offline source and lock.
2. Open a visible note row in Library, then Back. The row's surface opens into the
   reader viewport and its title travels into the reading hierarchy; the document
   remains at final text size. Back closes toward a fresh valid origin. List position,
   search/filter and subsequent reading progress remain. Repeat from Home/Recent,
   slow/offline loading, rapid Back/open, scrolling origin out of view, rotation and
   background/resume. Missing origin should use a quiet bounded reveal, never a
   stale flight or stretched text. Assess actual movement, not endpoint screenshots.
3. In the middle of a long note, use Aa. Change text size/spacing/theme immediately;
   verify position, source and content. More reading settings and Settings remain
   reachable. Open an input, use Back to hide Samsung Keyboard, then Back to dismiss.
   Repeat Light/Dark/OLED, larger system text, gesture navigation, split/landscape
   windows and reduced motion. Check system bars, bottom gesture space and targets.
4. Disconnect the host/network after retaining a note. Select evidence, capture a
   new Review and Save on this phone. Confirm protected saved/queued receipt. Force
   stop and reopen; the same UUID/evidence remains in device-wide Review. Switch to
   another source; it must remain discoverable without activating its original.
5. Reconnect the approved original source. Foreground catch-up or Sync now should
   reach Synced · Open on desktop. Allow Android17 local-network permission when
   requested. Desktop must show exactly one Review and unchanged original note.
   Repeated Sync now/reopen must not duplicate it. Resolve/dismiss on desktop;
   Android should reflect it through the active stream, foreground refresh or Sync
   now. The saved quote/comment/source remains frozen even if desktop edits the note.
6. With disposable data, revoke a workspace grant or device approval, or make the
   host unavailable. Pending evidence stays protected with an actionable reason;
   prior acknowledged receipt stays last known. Restore approval and Sync now.
   Replacing a generation must block old-generation delivery, not redirect it. Do
   not replace personal data to test this. Native fault tests cover loss, duplicate
   delivery, process death and conflicts without requiring destructive phone tests.
7. Existing ordinary haptics should retain their restrained behavior. Sync/status
   refresh is silent. Assess actual motion, Samsung Keyboard and TalkBack focus on
   hardware. Report any abrupt return, shifted anchor, blocked Back or unreadable
   status. Emulator checks do not provide subjective approval.

A5 hardware polish/accessibility/performance acceptance remains open until this
candidate is reviewed. No R6 domain capability is deliberately deferred to R7;
R7 imports/R8 exports and broader settings/update work remain separately authorized.

## Consolidated verification — 2026-10-21

- TypeScript passes. Focused JS groups passed16 cases (geometry/source/reading/
  delivery/feed) and46 controller/browse/bridge/offline/navigation cases, with
  overlapping navigation coverage; updated quick-source2-case rerun also passes.
  Scoped lint has0errors (existing style/no-void warnings remain). R5 backend
  ReviewTest passes14 cases. No backend product code changed.
- Final original-signer release and instrumentation compilation passes. API36 and
  API37 each pass16 native tests:6 sync fault/identity cases,4 protected-journal,
  4 companion retention/lock,1 presentation policy and1 real-host revocation case.
  Receipt-write failure retains a sending claim, and generation replacement during
  GET cannot replace an acknowledged receipt. Revocation leaves14 default/1 other
  workspace host records unchanged; protected queued rows and prior receipts remain.
- Production pinned HTTPS passes on both APIs: enrollment/admission, lost real
  acknowledgment, exact retry/restart, intentional process death after a durable
  claim/recovery, offline/reconnect, genuine app capture and desktop status refresh.
  API36 additionally verifies actual conflicting host intent and nondefault grant
  while default is revoked. Captured bodies and original note checks remain equal.
- Corrected runtime UI checks pass: API36 theme/gesture/adaptive/reduced/Aa IME
  batch3cases77.486s; API37 source/Aa/resource motion2cases48.784s and theme/
  adaptive2cases64.696s. Capture selection and actual software-IME/rotation pass
  on both APIs. API37 Light/Dark/OLED plus1.3font saved receipt passes37.875s.
  API36 actual online→retained source selection and preservation of the original
  source query passes13.866s; native routing is restored after that isolated test.
- Final recorded API36 source/Aa/resource-return run passes38.361s, with intermediate
  native aperture bounds and retained reader identity asserted. The50s movie
  mobile/cache/r6-acceptance-motion36.mp4 was decoded and temporal samples inspected,
  including8fps31–34s Back/reopen geometry. It proves intermediate movement, not
  perceived Samsung smoothness or haptic quality. No FPS/performance claim.

Failures/corrections are retained honestly: an initial shell quoting error never
ran UI cases; a resolution check was invoked before the owner status changed and
passed after correct setup. Early UI batches had stale offline filter wording,
partially clipped/moving management targets and covered heading controls exposed
to automation. Helpers now settle scrolling and require actual sheet replacement;
covered browsing pixels are hidden after the reveal without unmounting or changing
list layout. A long source round-trip macro incorrectly addressed retained controls
and was stopped; the bounded isolated source-selection/session check passes. One
ADB screenrecord start failed; it is not evidence. The later complete50s recording
was successfully pulled after finalization and inspected. A repeated enrollment
reached approval before the separately committed second-workspace grant settled;
the test now waits for authorized catalog visibility. Once the grant settled, fresh
approval recovery preserves frozen intent (2.057s), and nondefault-only admission
passes again on the final native transport (0.946s).

Existing R6 A0–A3, haptic engine/effects/restraint, original API read-only guards,
min36/target37, package and signing identity remain. A4 is implemented; A5 S24,
TalkBack, physical OLED, actual Wi-Fi/OEM process/battery and subjective motion
acceptance remain open. Background scheduling is deliberately best effort.
Shared geometry is only used for a live valid origin; other openings use bounded
fallback. Platform predictive cancellation preserves the current visit; the shared
return runs on committed Back rather than inventing a speculative destination.
No R7, public release, master merge or unrelated branch integration.

## Artifact handoff

[Alpha.21 identity ledger](releases/0.1.0-alpha.21.md) records the local APK,
original signer and SHA256. Both pulled installed base.apk files match the staged
40,085,313-byte APK. arm64-v8a/x86_64, min36/target37 and com.vaultor.app are
verified. The generated android-release.json records exact final source HEAD.
No public release/tag or desktop build is produced. No physical approval claimed.
