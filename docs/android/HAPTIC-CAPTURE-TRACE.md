# Genuine Review capture feedback trace

Reviewed 2026-10-19. Development-only diagnostic slice on
`ai/codex-android-ux-prototypes`, based exactly on alpha.17
`1586743a6d15e55be824aa62a5a1c4019ac98cbe`. The frozen R6 checkout,
master and immutable release are untouched. Alpha.18/code22 is a local
acceptance build, not a public release. Navigation and A4 are not implemented
by this slice. S24 Ultra / One UI 9 / Android 17 acceptance is user-owned.

Model D (compact bottom destinations that transform during reading, adapting
by actual width) and device-wide source-grouped Review are approved design
directions only. Measurements, labels (Review/Reviews/Captures) and exact
arrangement remain prototype hypotheses. Navigation implementation requires
the next explicit authorization after these real-device trace results.

## Architecture and boundaries

The existing build-time VAULTOR_DIAGNOSTICS gate defaults false. Only an
explicit Diagnostics build exposes trace controls/native methods.
captureTrace.ts arms one ephemeral native-generated random correlation ID,
claims it for the next **new** Review capture and records JS milestones.
Existing capture callbacks and semantic haptic calls remain the owners:
no replay, waiting loop, intensity/effect change or admission bypass.
feedbackTraced delegates to exactly the same native feedback path.

CaptureFeedbackTrace keeps at most128 records in native memory. It evicts
oldest records with an explicit dropped count. Arming replaces the previous
trace; Clear erases it; Copy freezes and copies only its sanitized JSON.
Process death discards it. Reopened existing captures do not claim the arm.
Manual playback probes reject while armed/recording; Read/Copy never play.
Complete one trial and copy before arming another. Do not arm mid-capture.

Milestones include capture acceptance, native draft acknowledgment, sheet
settle, evidence animation completion/cancellation, Save acceptance,
durable native queue acknowledgment, receipt start/completion/cancellation,
JS keyboard state/completion checks, semantic emission/suppression, bridge
receipt/rejection, native admission facts, selected route, effect, actual
platform request and reported result. Lifecycle pause/destroy records
explain cancellation. Native admission also observes actual window IME
visibility. It does not add an admission condition.

Native code repeats an explicit stage/key/value allowlist. Exports contain
only that random ID, bounded relative timings, Boolean facts, fixed
semantic/status/reason/effect vocabulary, system preference -1/0/1 and
dropped/sealed/schema metadata. No titles, comments, quotes, content,
resource/source/host/workspace/generation IDs, view tags, haptic tokens,
addresses, credentials, absolute times, screenshots or exception messages
are accepted. No trace is written to disk, network or production logs.
The explicit copy action puts sanitized text on the Android clipboard;
Android/system clipboard handling is outside the app's memory lifetime.
Native tests may export sanitized test artifacts for verification only.

nativeMs is monotonic elapsed time since native arm. jsMs is monotonic
elapsed time since the JS arm response. Compare intervals within a clock;
do not subtract these different clock origins. Native arrival times include
bridge scheduling. No per-frame logging or event subscription is added.

## Exact S24 acceptance procedure

1. Install the original-signer alpha.18/code22 development APK over alpha.17.
   Do not uninstall, clear data or attempt downgrade. Confirm version in app info.
2. Use disposable evidence. Keep phone/system/app settings identical for A/B:
   normal phone touch-feedback setting; app Touch feedback System; current
   Capture tactile profile (record it); Smooth transitions; Remove animations
   off. Keep the same orientation/font scale, phone in hand and keyboard.
   Do not change effect profiles to improve the result during measurement.
3. Open navigation → Appearance & reading → Developer haptic diagnostics.
   Tap **Arm next Review capture trace**. Close settings. Do not tap any
   Trigger/Preview playback controls.
4. **Trial A:** begin a NEW genuine capture (Flag for review from selected
   text, or Add review item). Let evidence settle. Type a short unique
   comment using Samsung Keyboard; wait for Protected. Leave the keyboard
   visible and tap Save on this phone once. Do not scroll/dismiss immediately.
   Observe whether the evidence snap and save completion are felt, their
   timing relative to evidence/receipt/keyboard, and any clipping or movement.
5. Wait about two seconds. Done returns to the reader. Reopen the developer
   panel and use **Read capture trace**, then **Copy sanitized capture trace**.
   Paste into your report as Trial A. Copy freezes the trace. Record tactile
   ratings absent/weak/clear/excessive and early/on-time/late separately.
6. Arm again. **Trial B:** create another NEW Review record using equivalent
   evidence/comment length. Wait for Protected, manually hide Samsung
   Keyboard with system Back, confirm the composer remains, then tap Save
   once. Repeat observation/wait/read/copy. Paste as Trial B before rearming.
7. Include app version/code, transition/profile/system/app feedback settings,
   font/orientation, keyboard identity, observed receipt visibility and
   separate H2/H3 ratings. Do not include resource content or identifiers.
   Stop for diagnosis; these trials are not subjective redesign approval.

Opening diagnostics after the event is inspection only. Its current window
focus is not the event's focus; use the correlated trace's native facts.
Copying to another app may add host_paused after the event; do not confuse it
with foreground admission at playback time.

## Interpretation

| Evidence | Meaning |
| --- | --- |
| Empty records after arm | New capture was not claimed, JS restarted, or the trace was rearmed; not proof of actuator failure |
| save_accepted without durable_save; save_failed | Local save did not acknowledge durability; no success haptic is expected |
| durable_save without receipt_finished | Presentation callback never completed or was cancelled; inspect receipt_cancelled/composer_closed |
| receipt_finished with completion_check keyboardVisible true, no later emission | Keyboard gate retained completion; compare A/B and native IME facts |
| js_suppressed | Check enabled/active/validTag; no native playback call was made |
| completion_check viewPresent false | Receipt has no native target; semantic call was not made |
| js_emit without bridge_received | Bridge receipt absent; js_bridge_failed can identify rejected bridge call; scheduling/process death remains possible |
| bridge_rejected | Invalid/duplicate token or event, or bridge exception; no forced retry |
| native_admission reason other than admitted | Exact native preference/lifecycle/view/focus rejection; no platform request expected |
| platform_exception or false androidAccepted without later successful fallback | Playback failed/was declined at API boundary |
| platform_result androidAccepted true | System feedback accepted at API boundary, not proof of physical sensation |
| platform_result submitted true | Custom vibrate call returned; Android exposes no actuator acknowledgment |
| Similar requests in A/B, felt only in B | Keyboard-associated timing/masking hypothesis; repeat before assigning causality |

An absent/late effect after a successful API request can still be imperceptible,
masked, affected by system policy, or cancelled. This app cannot measure
physical actuator output. Diagnostic records can perturb scheduling slightly.
Missing keyboard events, visibility or completion remain findings to investigate,
not repaired by the trace. Haptics must remain rare and admission remains strict.

## Device feedback and follow-up

On 2026-10-19 the user reported alpha.18 ordinary-use haptics are perceptible on
Samsung S24 Ultra / One UI9. This is positive physical feedback, not an agent-made
claim of individual H2/H3 measurements. No Samsung trace JSON was supplied here.
Existing emulator A/B traces show H2/H3 requests; native API submission does not
establish physical actuator output. Preserve effects, intensity and restrained
policy. A missing H3 remains a targeted optional trace follow-up and does not block
the separately authorized [navigation prototype](NAVIGATION-PROTOTYPE.md).

## Validation

Implementation: mobile/src/captureTrace.ts, ReviewCapture.tsx, haptics.ts and
DevelopmentFeedbackPanel.tsx; native CaptureFeedbackTrace.kt,
VaultorPresentation.kt and observer hooks in VaultorHaptics.kt. Focused coverage
is captureTrace.test.ts, CaptureFeedbackTraceTest.kt and the genuine A/B case
in CaptureExperienceTest.kt. Package/lock/Gradle changes only advance version.
No new dependency, native module, navigation framework or domain change.

Actual build/native/installed outcomes belong in
[alpha.18 diagnostic ledger](releases/0.1.0-alpha.18.md). Automated results
prove routing/collection/privacy/state behavior, never Samsung tactile quality.
Public publication requires separate explicit user approval.
