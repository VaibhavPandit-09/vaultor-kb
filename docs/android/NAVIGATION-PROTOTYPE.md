# Prototype 1 — reader-first navigation

Reviewed 2026-10-19. This is the **alpha.19/code23 development prototype** on
`ai/codex-android-ux-prototypes`, following alpha.18. The original prototype base
remains immutable alpha.17, `1586743a6d15e55be824aa62a5a1c4019ac98cbe`.
No public release, final UI approval, Prototype 2/3 or A4 synchronization.
The UI philosophies remain authoritative; dimensions below are testable layout
hypotheses, not approved product specifications.

## Information architecture

Home, Library and Review are direct browsing destinations. Sources is a separately
named context action, showing workspace and availability. It opens the existing
checked source workflow; merely inspecting Sources or Review never activates a
workspace. The old drawer and shell topbar are removed, including duplicate Back
and title controls. Search remains in Home and Library. Vaultor options retains
Search, Collections, Recent, Pinned, All resources, Sources, Appearance & reading,
Offline downloads, Captures on this phone and Legacy recovery. Reader More retains
outline, capture, Find, appearance, downloads, journey, refresh and recovery, plus
access to Vaultor options. Host setup, matching-code pairing, reconnect, source
forgetting, locked copies and downloaded-source activation remain in Sources.

**Review** is the provisional singular activity name. “Reviews” implies a collection
of review-domain records with desktop status that A4 has not supplied. “Captures”
accurately describes today's local records but narrows the intended review workflow.
The destination therefore says “Protected on this phone · all sources” and explicitly
identifies draft/queued-local state. Naming remains subject to the user's device gate.
Groups use full host/workspace/generation identity, not names. Records from forgotten
or inactive sources remain visible; opening an existing item reads its journal ID
through the existing native list contract without creating a new record, emitting
a new capture haptic or selecting a source. The existing protected composer is reused.

## Interaction states and geometry

One `NavigationFolio` instance owns the edge throughout destination and reader
changes. No reader document-to-card animation is attempted in this prototype.

| Start → end | What physically moves | Ownership and reversal |
| --- | --- | --- |
| Home ↔ Library ↔ Review | The selected destination slot grows to 46% of the destination group while the other two narrow to 27%; the accent edge moves between those slots | A shared selected-position value reverses from its current position. Content changes immediately; loading is never held behind motion. |
| Browsing → focused reader | The destination group's width contracts to zero behind a clip, keeping its labels at their normal size; Back grows from zero to 48dp; the same context control takes the released width, changes its heading to the resource, and retains workspace/availability. Disclosure and More become reader actions. Edge height contracts by 8dp at ordinary phone text size | One focus value animates real layout widths/height. The document remains mounted. Browse navigation reverses this allocation; Focus reading contracts it again. No completion callback owns navigation. |
| Large-text browsing → reader | When window width is below 360dp or width divided by font scale is below 300, the destinations occupy a separate row above the context/actions. That row contracts to zero height in reading; browsing retains 8dp of clearance between the row allocations | Avoids squeezing scaled labels into tiny slots. Reader controls retain their text scale; long identity strings truncate visually with complete accessibility labels and the full Sources inspection. |
| Reader/Home/Library/Review → Sources → context | The measured Sources surface translates from the bottom navigation edge into the retained workspace. Done, scrim or Back retract it along the same path | Existing ContextSheet/MotionSheet and native-driver transform. Closing during entry reverses current progress. Window release has a bounded timeout independent of animation completion. Source activation still commits only after existing native/model identity checks. The existing orientation/confirmation begins after sheet window release, retaining the full native focus-wait budget; controls stop accepting source actions during exit. |
| Verified source A → B | Existing source orientation travels 24dp into its endpoint after native activity focus, with the existing H2 confirmation route | Source-specific sessions, epoch, generation, downloads and failures remain model/native owned. No new haptic effect or policy. Refusal stays in Sources with the existing error/H4 route. |
| Compact ↔ genuinely wide window | Same hierarchy becomes a left rail, 184dp browsing/144dp focused, when width ≥840, height ≥480 and width/fontScale ≥720 | Window geometry decides; landscape phone alone does not imply a rail. No duplicate sidebar or destination tree. Layout adaptation itself is immediate. |

Smooth navigation uses the existing 360ms token; Snappy uses 280ms. Destination-slot
motion uses structure 300/240ms. Existing easing is cubic Bézier (.2,0,.2,1).
Reduced motion resolves directly to the same endpoints. Folio layout uses bounded
React Native Animated layout properties on JS; Sources uses the native transform
driver. No animation library, navigation framework or Kotlin UI screen is added.
JS-thread layout responsiveness on the S24 is a subjective acceptance item, not a
claimed 120Hz guarantee.

## State, accessibility and platform boundaries

The same workspace and reader subtree survive Review presentation and Sources
inspection. Existing model sessions retain current per-source navigation, browse
configuration, journey, progress and note identity. Direct Library does not reset
its current query/collection/page/offset. A bounded 64-entry memory-only presentation
history also restores each source/destination's configuration when visiting Recent,
Pinned or Collections; this additional history is not a new durable storage schema.
After process death the existing durable **current** source session remains the
authority, rather than promising all former utility configurations survive restart.
Review is a device-wide presentation state and starts closed after restart.

System Back dismisses overlays/IME and contracts disclosed reader navigation first, then exits Review to the retained underlying
context, then follows existing reader journey/origin/browse rules. The Android Back
callback remains authoritative: no custom predictive gesture preview is introduced.
Main and modal system bars, four-sided insets and gesture space use existing native
and safe-area integrations. No new target/minimum support cost: minSdk36/target37,
React Native 0.87.1, original app ID and signer. No A4, domain, database, protocol,
resource JSON, security/transport, companion or Review journal contract changes.

Tabs expose selection; collapsed destinations leave the accessibility tree and
touch routing. Source labels include full identity context, and source dismissal
returns accessibility focus to the context action. Minimum actions remain 48dp.
Full TalkBack traversal, Samsung Keyboard and gesture feel still require physical
review. No tactile or subjective visual approval is inferred from emulator checks.

## Samsung S24 Ultra acceptance script

Install alpha.19 over alpha.18 using the single local development APK; do not clear
data or uninstall. Check that your approved sources, offline downloads and existing
captures remain. Do not use a public release or recreate pairing for this test.

1. In portrait, tap Home → Library → Review → Home. Watch the destination slots and
   traveling accent edge; judge thumb reach, legibility, density and source prominence.
   The content destination should be clear without a top navigation bar.
2. In Library, select a collection/filter/search and scroll. Visit Review, then Home,
   then Library. Confirm the same configuration and list position. Visit Pinned or
   Recent through Vaultor options, then Library; its earlier configuration should return.
3. Open a saved note. Watch the destination slots retract and the same context action
   expand beside Back, Browse navigation and reading More. Confirm there is no duplicate
   topbar or permanent browsing row. Scroll and judge actual useful reading area.
4. Tap Browse navigation, then Focus reading. Reverse promptly during movement several
   times. Confirm no stuck partial state, false selection or lost reading position.
   Begin an edge Back gesture and cancel it: note and navigation state should stay unchanged. Complete Back while navigation is disclosed to contract it before leaving the reader. Use Home → Resume and Review → system Back; the same note/progress should remain.
5. Tap the context action to inspect Sources. Close with Done, scrim and Back, including
   during entry. Watch both directions. Reopen and explicitly choose another approved
   or downloaded source. Check its name/status and previous navigation; return to the
   first source and confirm its own collection/query/reader position. Try a refused or
   unavailable connection: it must stay actionable with no false source confirmation.
6. In Review, inspect source groups, including a capture from an inactive/unavailable
   source. Open an existing draft/queued receipt. It must retain provenance and local
   state and must not activate its source or create a duplicate. Do not expect sync.
7. Check search with Samsung Keyboard, Back-to-hide then Back-to-navigate, and contextual
   More/Find/media/appearance/offline/recovery access. Verify system gesture space and
   status bar remain usable. Restore any fixture changes only in disposable data.
8. Rotate and, if available, resize split-screen/DeX. A narrow landscape phone should
   keep compact navigation; a genuinely wide window should use the rail. Increase font
   size, then enable Remove animations; check readable controls and immediate complete
   endpoints. Restore your preferences afterward.

Report which arrangement feels right, which motion is unclear, any thumb-reach or
reading-space cost, and any state loss. **The agent stops here for explicit physical
visual approval.** Prototype 2/3 and A4 require separate authorization.

## Haptic evidence

The user reports alpha.18 haptics are now perceptible in ordinary S24 Ultra/One UI9
use. Preserve existing restrained semantic/native architecture and effects. Existing
API36/37 genuine trace trials established H2/H3 platform requests, not physical feel.
No Samsung trace JSON was supplied to establish its individual H2/H3 results. If H3
remains absent, use the existing [one-shot A/B trace](HAPTIC-CAPTURE-TRACE.md) as a
targeted follow-up; it does not block this navigation prototype. No broad remediation.

Actual validation/build evidence belongs in the [alpha.19 ledger](releases/0.1.0-alpha.19.md).
