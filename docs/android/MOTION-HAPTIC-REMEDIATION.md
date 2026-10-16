# A0–A3 motion and haptic remediation

Reviewed2026-10-16. **A3 alpha.15 failed the user's Samsung Galaxy S24 Ultra acceptance:** tactile feedback and structural movement were not meaningfully perceptible. A0–A3 are not interaction-approved. A4 is blocked until explicit user approval. Work stays on ai/codex-r6-android. This document records the pre-change source audit at2cce663 and the remediation candidate; it does not certify device feel.

## Shipped animation inventory (before remediation)

All RN timing uses cubic-bezier(.2,0,0,1), no spring. Smooth/Snappy milliseconds: micro120/80, utility220/120, structure300/160, navigation360/180, theme420/200. OS reduced motion resolves to0, initially assumed true. A failed preference query leaves motion disabled. The strongly front-loaded curve traverses much of the distance early, especially in Snappy. Mount effects/layout can run before the native modal is shown; elapsed animation is not evidence of visible travel.

| Interaction and source | Animated properties; start → end | Duration/easing | Visible geometry and likely normal-speed perception | Reduced motion |
| --- | --- | --- | --- | --- |
| Appearance entry: ReadingControls → MotionSheet | translateY measured full sheet height→0; opacity0 until measured then1 | utility220/120; shared curve | Large potential travel, but no native onShow gate; not established that real device sees the entire entrance |0 endpoint |
| Sources entry: WorkspaceScreen → ContextSheet → MotionSheet | Same bottom-sheet translation | Same | Potentially clear; immediate source commit closes modal, with no spatial return/selection continuity |0 endpoint |
| Reading options, outline, journey: ChoiceSheet → ContextSheet → MotionSheet | Same measured translation; underlying WebView retained | Same | Potentially clear if shown before progress advances; utility surfaces disappear immediately on selection |0 endpoint |
| Library sorting/filter choices: ChoiceSheet; organization controls: OrganizationSheet/ContextSheet | Same measured translation | Same | No per-row motion; list objects/scroll are retained. Options handoff is a cut |0 endpoint |
| Legacy recovery: WorkspaceScreen/ContextSheet | Same measured translation | Same | Entry only; close is immediate |0 endpoint |
| Media Preview options and PDF page controls: ResourcePreview/ContextSheet | Same measured translation | Same | Entry only; media remains mounted; page confirmation is immediate |0 endpoint |
| Drawer: NavigationSurface.WorkspaceDrawer | translateX−min(360,width−48)→0 | navigation360/180; shared curve | Full-width potential geometry; animation begins in effect before native Modal.onShow. Close cuts |0 endpoint |
| Reader chrome: WorkspaceScreen | title translateY0→captionHeight/2 (~7dp), caption opacity1→0 over scroll0–80 | Scroll-linked, linear interpolation; no duration | Very small title movement, **no reclaimed height**. Only online reader uses it, so downloaded reading has none. Insufficient structural contrast | Full caption/title stay unchanged |
| Find: ReaderView | **No animation**; immediate absolute bottom controls, focus/IME later | None | Surface appears as a cut, unrelated to controls that invoked it | Same |
| Media Fit/Actual-size/zoom command: ResourcePreview → reader/media.js | FLIP translate + scale from previous image bounds to new fit/zoom bounds; same img and viewport | structure300/160, capped380; CSS same curve | Clear only if bounds differ. No change at already-Fit is correctly silent. Pinch/pan is direct manipulation; no animation | Immediate final geometry |
| Review prepare→composer: ReviewCapture → separate preparatory Modal then keyed ContextSheet | Preparation static, native window replaced; composer full-height translation | utility220/120 | Window handoff can expose undim gap; no source/evidence-specific movement. Generic entry alone cannot explain anchoring | Immediate endpoint |
| Review queued receipt: ReviewCapture | native comment wrapper height140→64; receipt/actions replaced immediately | structure300/160; JS layout timing | Real76dp change, but fixed outer ScrollView height remains. Receipt appears before contraction; H3 fires at its first frame, **not the geometry settle** | Immediate64; same durable receipt |
| Expand saved comment: ReviewCapture | **No animation**, setValue240 | None | Abrupt geometry expansion | Same |
| Explicit feedback previews: FeedbackPreview | opacity0→1, translateY4→0, label changed | micro120/80 | Four-pixel fade is garnish; weak evidence of a spatial event | Immediate; haptic still requested |
| Explicit theme: ui/ThemeTransition → VaultorPresentation.Reveal | radius0→max hypotenuse, clipping old native root snapshots; real palette commits first | theme420/200, native PathInterpolator(.2,0,0,1) | Potentially strong global reveal, but JS120ms capture timeout can fall back to immediate recolor; native background/resize/32MiB limit/watchdog also cancel. Snapshot success not exposed | Immediate palette |
| Download management entry: OfflineControls | Native Modal fade only in Smooth; none in Snappy | RN/platform duration/easing, not specified by app | Opacity only, no structural relationship. Existing full-screen management surface | None |

Resource opening, Home/Library destination changes, preview full-screen entry, PDF/gallery replacement and source commit have no other A0–A3 animation. Their correctness/state retention is not proof of motion. Retired editing MediaTools native fades are not reachable in the companion and are outside A0–A3. No claim is made that every navigation needs a screen slide.

## Shipped haptic inventory (before remediation)

Every path below calls src/haptics.ts → VaultorPresentation.feedback. JS requires app enabled, active AppState and finite tag. Native requires resumed lifecycle, attached/shown/focused initiating view, isHapticFeedbackEnabled, Settings.System.HAPTIC_FEEDBACK_ENABLED==1 (missing value defaults0), app SharedPreferences haptics!=off and unique token. Rejected admission returns only `silent`, hiding the reason. Native performHapticFeedback's Boolean is ignored; `system` is returned even if Android rejected playback. A supported capability never proves perceptibility. Touch usage, VIBRATE for rich effects, no ignore-settings flags; pause cancels vibration.

| Semantic mechanism | API/effect/intensity | Capability/fallback | Device weakness / suppression |
| --- | --- | --- | --- |
| H1 micro | View.performHapticFeedback(SEGMENT_FREQUENT_TICK=27); platform strength | No actuator/effect check for system route; no fallback on false | Android explicitly permits no vibration if suitably soft feedback is unavailable. Intended for repeated segments rather than deliberate mode confirmation. OEM touch intensity can make it imperceptible |
| H2 selection | performHapticFeedback(SEGMENT_TICK=26); platform strength | Same | Fine-choice tick may be weak; false not reported |
| H3 complete | performHapticFeedback(CONFIRM=16); platform strength | Same | OEM-controlled; no actual playback report |
| H4 reject | performHapticFeedback(REJECT=17); platform strength | Same | OEM-controlled; false hidden |
| H5 destructive | **Same CONFIRM as H3**, no production caller | Same | No distinct H5 vocabulary in practice |
| Rich anchor | BasicEnvelopeBuilder: sharpness.65, intensity.25 over20ms then0/20ms (40ms); or PRIMITIVE_TICK scale.35 | hasVibrator + areEnvelopeEffectsSupported; else requires both TICK and CLICK supported; else H2 system. Exceptions→system | Capability priority assumes envelope is better; fixed20ms ignores reported envelope timing bounds. Low intensity/scale may be barely perceptible. No user fallback preference |
| Rich capture | Same envelope plus intensity.4/sharpness.7 over20ms then0/20ms (80ms total); or TICK.35 + CLICK.45 delay24ms | Same, exception→H3 system | Low strength and24ms separation can merge into indistinct sensation; supported does not mean calibrated |

| Interaction / exact source call | Level/profile | Synchronization in shipped code | Further risk |
| --- | --- | --- | --- |
| Appearance accent change, ReadingControls.onPress | H1 | requestAnimationFrame after update | Event target can be child tag; native gate may reject; no diagnostic |
| Find entry, ReaderView focusInput.then | H1 | Frame after confirmed focus, not Find surface settle | Focus window handoff can fail; canceled focus silent |
| Explicit Preview selection, FeedbackPreview.animation completion | H2 anchor | End of4dp label motion | Strong claim unsupported by tiny visual movement |
| Explicit Preview completion, same | H3 capture | End of4dp label motion | Does not exercise actual persistence |
| Activated source, WorkspaceScreen.activateSource | H2 system | Two JS frames after successful routing and closing Sources | Activity may not yet regain window focus; request permanently lost |
| Source activation failure, same catch | H4 | Frame after setSourceError | Modal focus/tag gate can reject |
| Media Fit/Actual-size, ResourcePreview onMessage settled | H2 system | Current command's WebView settle + next frame | Retained root required; meaningful geometry guard correct |
| Invalid PDF page, ResourcePreview.goToPage | H4 | Frame after pageError | Event tag/focus gate can reject |
| New capture anchor, ReviewCapture useLayoutEffect | H2 anchor | One frame after protected UUID matches MotionSheet.onSettled | Generic sheet settle only; evidence has no settle animation; no route visibility |
| Durable local queue, ReviewCapture useLayoutEffect | H3 capture | First queued receipt frame after native queue succeeds | Fires before comment contraction completes; correct durability, weak physical synchronization |
| Explicit queue failure, ReviewCapture pendingReject effect | H4 | First error frame | Autosave protection failure and some initial errors do not set pendingReject; intentionally no keystroke haptic |

All require enabled system and app haptics. Ordinary scrolling/typing/navigation/list loading/Copy/background work/theme/reopening saved capture/confirmed local draft discard use H0. H5 is diagnostic-only until a genuinely destructive product use is authorized. **We cannot determine which suppression path occurred on the S24 from the existing build.** User observation establishes rejection; the source explains plausible failure modes, not a measured Samsung root cause. Platform behavior: [Android constants](https://developer.android.com/reference/android/view/HapticFeedbackConstants), [custom effects](https://developer.android.com/develop/ui/views/haptics/custom-haptic-effects).

## Remediation interaction specification

1. Keep one native contextual window through capture preparation/composer/receipt. Gate entrances on native onShow plus measured geometry. Use the measured sheet travel and a less front-loaded curve; do not rely on slowing every token. Retain the same source reader/viewer, input, UUID and evidence.
2. After protected composer enters, evidence settles24dp into its source-labelled lock region; H2 fires at that actual endpoint. On durable queue success, the same comment collapses and a saved-status band claims space; H3 fires at completed geometry, with queued state correct immediately even if interrupted. Failure becomes visible with H4 immediately. Reduced motion uses immediate endpoints and corresponding single feedback; disabling haptics never suppresses visual feedback.
3. Find rises from its bottom edge by its own height; focus begins immediately but H1 awaits visible settle + successful focus. Reader source caption/title compress within their existing object, with a clearly visible source-band collapse rather than a7dp drift. Offline/source-unavailable identity remains visible. Drawer/sheets begin only after their native windows are visible. Source confirmation follows actual activity window focus, not a guessed two-frame delay. No animation of whole documents or arbitrary row entrances.
4. Standard H1 uses deliberate CLOCK_TICK, H2 GESTURE_END, H3 CONFIRM, H4 REJECT, H5 LONG_PRESS (rare diagnostic deliberate hold signature, no new destructive action). Respect system/app settings. Return actual admission/playback results. Rich anchor uses a supported crisp CLICK; rich completion uses two supported CLICKs with perceptually separate spacing/strength, or a supported predefined effect/system fallback. Envelope remains a manually comparable optional supported route, not presumed superior. A device-local rich policy permits platform fallback when custom feedback is weak; no brand checks or legacy buzzy waveform.
5. Build-gated development diagnostics expose H1–H5, both rich profiles, platform fallback and supported custom routes; display real capabilities/settings/admission/selected mechanism and requested-vs-accepted results. Default production build has the gate false and native diagnostic methods refuse entry. Candidate is explicitly a development acceptance APK, original signer/package retained for install-over; no USB/ADB phone access.

## Acceptance status

Audit complete; implementation/validation results and exact S24 script will be recorded here before candidate handoff. Subjective approval is pending. A4 remains blocked.
