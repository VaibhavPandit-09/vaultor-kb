# Prototype 1 — reader-first navigation

Reviewed 2026-10-19. This is the **alpha.20/code24 development prototype** on
`ai/codex-android-ux-prototypes`, refining alpha.19. The original prototype base
remains immutable alpha.17, `1586743a6d15e55be824aa62a5a1c4019ac98cbe`.
The user provisionally approved the navigation concept after alpha.19, but rejected
its visual execution. This refinement still requires S24 visual approval. No public
release, Prototype 2/3 or A4 synchronization.
The UI philosophies remain authoritative; dimensions below are testable layout
hypotheses, not approved product specifications.

## Information architecture

Home, Library and Review are direct browsing destinations. Sources is a separately
named compact context action beside the browsing heading, showing workspace and
material availability. It is absent from the three-slot browsing folio. Review
has no active-source heading: Sources remains reachable through Vaultor options.
Focused reading retains its source control beside the resource title. It opens the existing
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
| Home ↔ Library ↔ Review | Three equal slots retain their widths; a short accent mark moves between their centers. Line icons and labels share alignment | Shared selected-position animation reverses from its current value. Content changes immediately. |
| Browsing → focused reader | The full-width destination strip first releases 48dp for the disclosure allocation, then retracts through a horizontal clip. Reader controls take its released width; edge height contracts from the browsing hypothesis to the two-line reader region | One interruptible three-state value owns browse/disclosed/focused geometry. Labels keep intrinsic width instead of crumpling. No resource-to-document animation or completion-owned navigation. |
| Reader → disclosed browsing → focused reader | Reader region clips away as destinations and Focus reading regain width. Returning reverses this allocation | Same mounted reader, identity and offset. Hidden controls leave touch/accessibility routing. System Back contracts disclosure before leaving the note. |
| Home/Library/reader → Sources → context | Existing measured Sources sheet rises from the bottom edge and retracts over retained content | Done, scrim and Back reverse current sheet progress. Window-release timeout remains independent of animation completion. Review reaches Sources through utilities, without selecting a source. |
| Verified source A → B | Context identity settles through the existing 24dp orientation travel after sheet release/activity focus | Existing native/model identity, scope and generation checks own activation. No admission/effect change. Failure stays actionable in Sources. |
| Compact ↔ genuinely wide window | Same folio becomes a left rail, 144dp browsing/128dp focused, when inset-adjusted width ≥840, height ≥480 and width/fontScale ≥720 | Actual available window decides, not device identity. Large text can retain the compact layout. Adaptation itself is immediate. |

Ordinary-size compact browsing starts at 58dp; the two-line reader region starts at
52dp. Both grow with system text scale. These are prototype hypotheses, not fixed
approved dimensions. Every action retains at least a 48dp target. Larger text keeps
three equal destinations on one row now that source and utilities live elsewhere.
The browse heading is one compact orientation row, not a duplicate expanded header.
In Review it identifies the device-wide destination without active-source scope.

## Library hierarchy

Heading/source/options → search with Filters → one count/Resume row → resource list.
The count and Resume scroll with the virtualized list. Active filters, collection
return, saved-content scope and file-search coverage remain visible when relevant.
Search options always explain saved-content/draft/offline coverage. Downloaded state
is already visible in source context; the repeated permanent disclaimer is removed.
Rows use collection names, omitting membership already explained by the current
collection; file format remains useful secondary text. Missing names use grammatical
counts. Note type remains in icon/accessibility semantics, without repeating “Note”
on every row. No collection/resource semantics, sorting, filtering or API change.

Smooth navigation uses the existing 360ms token; Snappy uses 280ms. Selection-mark
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
returns accessibility focus to the visible context action when present. Minimum actions remain 48dp.
Full TalkBack traversal, Samsung Keyboard and gesture feel still require physical
review. No tactile or subjective visual approval is inferred from emulator checks.

## Samsung S24 Ultra acceptance script

Install alpha.20 over alpha.19 using the single local development APK; do not clear
data or uninstall. Check that your approved sources, offline downloads and existing
captures remain. Do not use a public release or recreate pairing for this test.

1. In portrait, tap Home → Library → Review → Home. Watch the equal destination slots and
   traveling accent mark; judge thumb reach, legibility, density and the compact heading source control. Review must not show active-source scope.
   The content destination should be clear without a top navigation bar.
2. In Library, first judge title/source/search/count/Resume/list spacing and collection
   metadata in Light, Dark and OLED. There should be no repeated “1 collections”. Select a collection/filter/search and scroll. Visit Review, then Home,
   then Library. Confirm the same configuration and list position. Visit Pinned or
   Recent through Vaultor options, then Library; its earlier configuration should return.
3. Open a saved note. Watch the destination slots retract and reader context
   enter beside Back, Browse navigation and reading More. Confirm there is no duplicate
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

Actual validation/build evidence belongs in the [alpha.20 ledger](releases/0.1.0-alpha.20.md).
