# Android interaction foundations

Reviewed 2026-10-16. A0 is the first implementation slice of the approved [R6 Android plan](../plans/android-r6-plan.md). Android alpha.12/versionCode16 is its review candidate; release evidence belongs in [the release ledger](releases/0.1.0-alpha.12.md). A1–A5 and Review capture/sync are not implemented. The [Android design contract](../design/ANDROID_UI_PHILOSOPHY.md) owns product principles.

## Small shared foundation

The application remains React Native with restricted local reader/media WebViews. No Compose migration, animation dependency, scene manager or new network path is introduced. `src/motion.ts` owns Smooth/Snappy timing and easing. Millisecond starting values are micro120/80, utility220/120, structure300/160, navigation360/180, theme420/200. OS reduced motion gives zero-duration endpoints and is initially assumed until the system query completes. `ReadingProvider` supplies this single preference to both native presentation and the reader; a system event supersedes a late initial query.

`MotionSheet` is first used by Reading appearance. One bottom surface enters from its measured lower bounds. Its real controls remain mounted during entry; Done/Back immediately releases ownership without awaiting an exit animation. Rotation/keyboard resize recalculates the same surface. One ScrollView retains settings scroll; safe-area and IME handling are part of the modal. This is a foundation demonstration, not the A1 shell or A2 reader redesign.

## Haptic semantics and policy

`src/haptics.ts` sends named events to `VaultorPresentation.kt`; no screen supplies raw durations, waveforms or actuator calls. H0 is absence of a call. H1 micro uses platform frequent-segment feedback; H2 selection uses segment feedback; H3 completion and H5 confirmed destructive completion use platform confirmation; H4 uses rejection. Standard interactions remain platform/action-oriented.

Only selection/anchor and completion/capture may request a rich profile. Supported basic envelopes use a short40ms anchor or80ms two-part completion; supported tick/click primitives are the next choice; otherwise the platform semantic event is used. Exceptions fall back safely. The installed API37 SDK exposes envelopes/primitives but not the newer timeline builder; no reflection, speculative SDK upgrade or unsupported builder claim is introduced. These initial sensations require physical tuning, not emulator certification.

Native playback checks resumed lifecycle, attached/shown/focused source view, the view's feedback flag, Android touch-feedback settings and the persisted app preference. JS also rejects disabled/background calls. Duplicate event identity is suppressed. Effects use touch usage and no ignore-settings flags. The app declares VIBRATE solely for rich effects; ordinary system feedback does not need it. Pause/destroy cancels app vibration. No legacy one-shot/waveform buzzing is used.

Touch feedback is device-local System(default)/Off, normalized in TS and native preferences. It is excluded from portable content and recovery. Appearance accent changes use H1 at the committed selection frame; theme changes, scrolling, ordinary navigation and background work are silent. Explicit Preview selection/Preview completion controls let the user assess H2/H3; their small indicator settles before one feedback event. Repeated previews, preference changes, backgrounding and unmount invalidate stale callbacks. Labels say preview, never pretend that a resource was saved. Haptics-disabled behavior retains exactly the same visible/semantic feedback.

## Theme and system bars

An explicit theme choice captures bounded old pixels from the activity and initiating modal root into native view overlays, then commits the real preference. One circular reveal originates at the chosen control's center across both windows. Actual reader DOM, view identity, reading positions, focus and native controls are retained; overlays are inaccessible and cannot own input. Snapshots are memory-only, never files/logs/archives, bounded to32MiB total. Allocation/capture failure, background, interruption, resize, missing source, reduced motion or timeout falls back to the latest committed palette. JS capture wait is bounded120ms; native cleanup has independent watchdogs. No correctness depends on animator completion.

Startup/system-driven preferences apply immediately. Main and appearance-modal status/navigation icon styles follow resolved Light/Dark/OLED; original image/PDF pixels are never recolored. Theme transitions remain H0. Palette geometry stays stable. The source-bound reader and media security/write refusals are unchanged.

## Validation and physical review

Focused tests cover latest-intent theme races, capture timeout/failure, cancellation, reduced-motion routing, preference migration and feedback suppression. Native tests exercise capability routing and actual emulator foreground/system/app preference admission. Installed UI checks cover the existing appearance surface, theme changes, previews, Back, rotation and retention. Actual commands/results, failures and corrections are recorded in the release ledger.

The user owns real-device acceptance: install over the existing app; open Appearance & reading; compare Preview selection/completion with system touch feedback on/off and app Off; try Light/Dark/OLED, rotation, keyboard and Back. Assess crispness, fatigue and whether the sensation settles with the indicator. Agents never access/pair the phone. A0 is a review candidate until this feedback and important motion/system-bar review are accepted. No Samsung/OneUI, actuator quality, physical OLED or real-Wi-Fi certification is implied.
