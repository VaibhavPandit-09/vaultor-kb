# Vaultor Android UI Philosophy

> **Status:** Product design contract  
> **Scope:** Vaultor Android companion UI, motion, haptics, navigation, reader surfaces, review/capture flows, offline states, and future Android companion features  
> **Relationship to desktop:** This document extends `docs/design/UI_PHILOSOPHY.md`. Android must share Vaultor's interaction language without mechanically copying desktop layouts.

---

## 1. Core principle

Vaultor Android should feel like the same product as Vaultor desktop, expressed natively for a handheld touch device.

The Android app must inherit these Vaultor principles:

- spatial continuity;
- transformation rather than abrupt replacement;
- dense but calm information hierarchy;
- restrained surfaces;
- structural motion rather than decorative animation;
- preservation of object identity;
- context that survives navigation;
- motion that explains cause and effect;
- accessibility and reduced-motion support;
- polished theme transitions;
- deliberate use of available space.

Do not copy desktop layouts literally.

Android has different constraints:

- touch rather than mouse-first interaction;
- smaller and variable viewport geometry;
- system bars and display cutouts;
- system Back and predictive back behavior;
- device rotation / resizable-window behavior where supported;
- gesture navigation;
- one-handed use;
- different platform expectations for sheets, dialogs, lists, and navigation;
- a high-quality haptic actuator on many devices.

The goal is:

> **Vaultor's design language, translated into native Android behavior.**

---

## 1.1 Intentionally hybrid React Native architecture

React Native remains Vaultor Android's primary product/UI framework: product screens, navigation, reader, Review UI, offline/sync presentation, settings and most motion belong there. Thin Android/Kotlin modules own platform capabilities when native access materially improves quality. Haptics are the canonical example. This is not permission to rewrite screens in Jetpack Compose; move a surface only after profiling or a hard platform limitation establishes the need.

Priority: (1) spatial continuity and structural motion, (2) hierarchy/density/typography, (3) responsive touch, (4) haptics. Motion is more central to Vaultor's identity than tactile feedback. Sound is out of scope unless separately authorized. Vaultor is calm, precise, mature, focused and restrained.

The boundary is React Native interaction → semantic Vaultor event → thin native Kotlin renderer → best supported device effect. Feature code requests meaning, never amplitudes, primitive sequences, waveforms, API-level or manufacturer decisions. Native owns capability/effect support, authored composition, fallback, system preference admission, vibration permissions and future Android APIs. The S24 Ultra is a subjective acceptance device, never a manufacturer-specific code path.

## 2. Android should feel physical

On desktop, Vaultor uses space and motion to preserve continuity.

On Android, Vaultor should use **space + motion + touch + haptics** as one interaction system.

Visual movement and tactile feedback should agree.

A control should not animate one event while the phone's haptic signal implies another.

Where meaningful, synchronize haptics with the visual moment in which an interaction:

- settles;
- snaps into place;
- becomes selected;
- completes;
- reaches a boundary;
- succeeds;
- fails;
- changes mode.

The haptic signal should feel like the physical consequence of the visual transformation.

---

# 3. Haptics are a first-class design system

Vaultor Android must understand the device's haptic capabilities fully and exercise them with restraint. Quality matters more than frequency; most interactions intentionally have no Vaultor haptic. A diagnostic surface demonstrates capability, not permission to distribute effects throughout the product.

"Use haptics fully" does **not** mean vibrate on every tap.

It means:

- use tactile feedback wherever it materially improves interaction;
- use the best device-supported primitive/effect;
- vary feedback semantically rather than randomly;
- synchronize rich effects with meaningful animation;
- use graceful capability fallbacks;
- respect system/user haptic preferences;
- avoid long buzzy legacy vibrations.

Prefer Android's action-oriented/system haptic feedback for standard interactions.

Use richer composed haptics for Vaultor-specific interactions only when they add real value and the device supports them.

On newer Android versions, prefer the current platform composition/builder APIs for expressive effects when appropriate. On older versions, use supported predefined effects or primitives with capability checks and safe fallback.

Never make an interaction depend on haptic playback.

---

## 4. Vaultor haptic vocabulary

Vaultor should have a small semantic haptic vocabulary.

The exact underlying platform primitive may vary by OS/device capability, but the *meaning* must remain consistent.

### H0 — No haptic

Use when tactile feedback adds no information.

Examples:

- passive scrolling;
- ordinary content appearing;
- automatic background refresh;
- every animation frame;
- every navigation step;
- every list row tap when visual feedback is already sufficient.

### H1 — Micro confirmation

A very light crisp response.

Reserve for a deliberate micro confirmation only when touch adds information beyond the visual state. Ordinary toggles, icons, chips, filters, settings and Find focus should normally remain H0. H1 is a semantic option, not a mandate for frequent feedback.

### H2 — Selection / snap

A clear tick or snap.

Use for:

- explicit source/mode locking where tactile confirmation adds information; normal resource opening remains H0;
- crossing a meaningful drag/reorder target;
- snapping a sheet or slider to an intentional stop;
- completing a mode transition;
- a review anchor/capture target locking into place.

### H3 — Action completion

A stronger but still short confirmation.

Use for:

- successfully saving a review/capture;
- completing a meaningful local action;
- an offline item being intentionally queued;
- a user-triggered sync finishing while the user is actively waiting for it.

Do not use H3 for silent background sync.

### H4 — Warning / rejection

A distinct warning or rejection response.

Use for:

- invalid action;
- blocked destructive operation;
- failed save/capture;
- sync failure that requires immediate user attention;
- reaching an interaction boundary where the attempted action cannot continue.

Do not use a long buzzing vibration.

### H5 — Destructive confirmation

A deliberate, unmistakable confirmation used sparingly.

Use only after the user confirms a genuinely destructive action such as permanent deletion where Android/system behavior makes tactile confirmation appropriate.

The confirmation UI itself must still communicate the consequence visually.

---

## 5. Rich haptics

Rich/custom haptics reinforce a meaningful spatial or completed interaction; they must never compensate for weak motion. Start with one authored product pattern: REVIEW_CAPTURED, a short completion after durable local persistence and the visible saved/queued transformation. Evidence locking uses subtle standard H2. REVIEW_SYNCED_FOREGROUND is only a possible later pattern for explicitly awaited synchronization, not permission to implement A4. Do not create speculative patterns.

Classify every caller:

- Group A: intentionally silent ordinary navigation, screen transitions, resource opening, scrolling, typing, search results, passive reader chrome, themes, background sync/refresh and reopening saved Reviews.
- Group B: subtle meaningful evidence/selection/snap confirmation; short rejection only when an explicit blocked action becomes visibly evident.
- Group C: rare authored durable Review capture completion; future explicitly awaited completion or genuinely destructive confirmation only when justified.

The visual interaction carries the experience with haptics disabled. Rich patterns are not weak/medium/strong buzz presets. Diagnostics may expose old/candidate routes for comparison; they are never ordinary production UI. No background celebration or audio feedback.

---

## 6. Haptic capability and fallback

The haptic layer must be capability-aware.

Build one semantic haptics abstraction for the app rather than sprinkling direct vibrator calls across screens.

A semantic call should look conceptually like:

- `VaultorHaptics.microConfirm()`
- `VaultorHaptics.selectionSnap()`
- `VaultorHaptics.actionComplete()`
- `VaultorHaptics.reject()`
- `VaultorHaptics.destructiveConfirm()`
- `VaultorHaptics.playAuthoredPattern(REVIEW_CAPTURED)`

The thin native Kotlin renderer decides the best available platform mechanism. Keep the five-level semantic vocabulary small; the TypeScript facade only forwards semantic names, native view identity and interaction identity. Reject mismatched/unknown authored events at the boundary.

Requirements:

- prefer system/action-oriented feedback for standard interactions;
- check support before using effects/primitives that require capability discovery;
- provide coherent fallbacks;
- respect system haptic settings;
- no legacy long one-shot buzzing for ordinary touch feedback;
- do not require VIBRATE permission when a standard system feedback API can provide the intended interaction;
- when richer vibration APIs require permission/capability handling, centralize it in the haptics layer;
- tests must verify semantic routing/fallback, not actuator "feel."

---

# 7. Haptics must be tunable on real hardware

Emulator behavior is insufficient for final haptic approval.

For significant tactile interactions (without making the app haptic-heavy):

- test on at least one real Android device;
- prefer a modern device with a high-quality actuator for design review;
- also verify graceful fallback behavior on a lower-capability environment/device where practical.

The user's primary high-end Android phone is an important reference target, but Vaultor must not hardcode behavior for one manufacturer.

The product should use device capabilities, not device-brand assumptions.

---

# 8. Motion character

Android motion should feel:

- responsive immediately;
- compact;
- spatially understandable;
- interruptible;
- touch-driven;
- softly settled;
- deliberate rather than bouncy.

Avoid:

- gratuitous spring overshoot;
- entire screens sliding for every navigation event;
- long transitions that delay reading;
- unrelated fades;
- every item animating on list load;
- scaling text in ways that blur;
- visual motion with haptics that fire at the wrong moment.

---

# 9. Navigation continuity

Navigation should preserve object identity when useful.

Examples:

- tapping a resource in a list should visually connect to the reader when feasible;
- opening a review from a resource should preserve where the review came from;
- returning should restore list/reader position;
- sheets and contextual controls should emerge from the interaction they belong to;
- predictive/system Back should remain semantically correct.

Do not force shared-element motion when the source/target relationship is unstable.

Navigation correctness always wins over animation.

---

# 10. Reader-first hierarchy

Android remains a companion with reading/review/capture as central activities.

Reader chrome should:

- establish orientation when entering;
- reduce when the user is reading;
- keep essential controls reachable;
- avoid permanent oversized toolbars;
- avoid nested scrolling unless content genuinely requires independent scroll ownership;
- preserve reading position across transient UI.

The reader should feel calm. Motion should not compete with content.

---

# 11. Review and capture interactions

Review/capture is a first-class Android workflow.

The interaction should feel tied to the source material.

Preferred qualities:

- capture begins from the current resource/context;
- source identity remains obvious;
- review composer appears contextually rather than as an unrelated generic screen;
- saving locally/offline gives immediate clear confirmation;
- pending sync is visible but not alarming;
- successful synchronization transforms state rather than replacing the whole screen;
- desktop resolution later appears as a state update without mutating the source note.

Haptic guidance:

- entering capture: H0; contextual motion establishes entry;
- anchoring/selecting evidence: subtle standard H2 at the actual lock endpoint;
- successfully queued offline: one short H3 / REVIEW_CAPTURED after durable persistence and visible receipt settle;
- successful foreground sync: H3 if user initiated/awaited it;
- failed save/sync requiring action: H4;
- background sync completion: normally H0.

---

# 12. Offline states

Offline is a normal companion state, not an error theme.

Use calm visual hierarchy:

- available offline;
- queued locally;
- pending sync;
- synchronized;
- source unavailable;
- stale/replaced source.

Do not bombard the user with warnings.

Haptics should distinguish an intentional local save from a failure, but silent background state changes should usually remain silent.

---

# 13. Lists and resource browsing

Lists should prioritize scanability and touch accuracy.

Use:

- compact but safe touch targets;
- clear row identity;
- preserved scroll position;
- contextual actions;
- purposeful selection feedback.

Avoid:

- card-per-row layouts unless containment is meaningful;
- excessive rounded rectangles;
- large vertical gaps;
- haptic ticks during normal free scrolling.

If selection mode is entered, the visual hierarchy and haptic signal should agree.

---

# 14. Sheets, dialogs, and contextual controls

Use Android-native interaction expectations where they serve clarity.

Sheets may be appropriate for:

- review capture;
- compact metadata;
- filters;
- contextual resource actions.

But a sheet is not automatically correct.

Important state should not be buried merely because a sheet is convenient.

Motion should connect the sheet/context surface to its trigger where appropriate.

Haptics may accompany meaningful snap points or final confirmation, not every sheet movement.

---

# 15. Theme transitions

Android theme switching should follow the same Vaultor concept:

> **The new theme enters the workspace.**

Use a coordinated visual transition where technically sound.

Do not independently tween every component.

Respect:

- system theme;
- Light;
- Dark;
- OLED/true-black where supported by the product;
- reduced motion;
- system bars;
- contrast during transition.

Theme reveals are intentionally H0. Visual continuity should carry the transformation.

System-driven theme changes should normally avoid attention-grabbing haptics.

---

# 16. System bars and edge-to-edge layout

Treat system bars, gesture insets, display cutouts, keyboards, and IME as part of the real layout.

Do not validate Android UI only inside idealized preview bounds.

Test:

- gesture navigation;
- keyboard open/closed;
- landscape where supported;
- resizable-window behavior where relevant;
- large text/font scaling;
- display cutouts/system insets;
- real device pixel density.

---

# 17. Accessibility

All functionality must remain understandable without motion or haptics.

Respect:

- reduced motion;
- system haptic/touch feedback preference;
- TalkBack semantics;
- font scaling;
- contrast;
- touch target guidance;
- focus order;
- system Back behavior.

Haptic meaning must always have a visual/semantic equivalent.

---

# 18. Performance

Haptics and animation must never make the reader feel heavy.

Requirements:

- prefer native/UI-thread-driven React Native transforms where appropriate;
- avoid per-frame React state churn or rebuilding the WebView during gestures; use bounded JS layout animation only where actual geometry requires it;
- keep long lists efficient;
- do not rebuild expensive reader content for chrome transitions;
- preserve reader/viewer identity across presentation changes when practical;
- benchmark/trace only where evidence suggests a problem.

---

# 19. Validation

A significant Android UI slice is not complete until it has been checked in motion.

Required categories where applicable:

### Automated
- unit tests;
- React Native semantic routing and Android native/UI tests;
- build/lint/static checks;
- sync/domain tests.

### Emulator
- layout variants;
- navigation;
- themes;
- accessibility basics;
- deterministic screenshots when useful.

### Real device
Required for:
- haptic quality;
- haptic-animation synchronization;
- gesture feel;
- motion perception;
- system bars;
- real touch interaction.

Static screenshots do not certify motion or haptic quality.

---

# 20. AI implementation contract

For Android UI work, agents must:

1. read `docs/design/UI_PHILOSOPHY.md`;
2. read this file completely;
3. inspect the current Android implementation;
4. audit before redesigning;
5. define visual + motion + haptic behavior together;
6. implement one coherent interaction at a time;
7. verify on Android runtime;
8. verify meaningful haptics on real hardware before declaring them polished;
9. stop at major interaction gates for user review;
10. preserve source/workspace/review/sync semantics.

Do not copy desktop UI literally.

Do not add haptics as an afterthought.

Do not add vibration to every interaction.

Motion carries the product; rare tactile feedback reinforces the same event. An understandable, polished interaction must remain when haptics are disabled.

---

# 21. Final standard

The desktop standard is:

> "Of course it moved there."

The Android extension is:

> **"Of course it moved there."**

At rare meaningful tactile moments: "And the phone felt like it settled there."

That is the target.
