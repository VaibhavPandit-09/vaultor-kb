# Android interaction design

Reviewed 2026-10-09. **A5 navigation and A6 writing are implemented; A6 publication is pending final artifact checks. A7–A9 remain planned.** Actual checks are recorded in the tracker. [ANDROID.md](ANDROID.md) describes current behavior; [the execution tracker](../plans/android-plan.md) owns implementation order, acceptance and actual evidence. This document owns the Android-specific design direction. Do not describe future organization, preferences or motion recommendations as shipped behavior.

## Purpose and principles

Vaultor Android is a phone-first client of the shared workspace, not a compressed desktop. Preserve resource identity, structured documents, trust, revision checks and recovery while designing navigation and tools for touch, the keyboard and interruptions. “Simplicity is sophisticated”: expose the primary action, group secondary actions and preserve discoverability and accessibility.

- Give the note most of the screen. Avoid stacked navigation, insertion, journey, status and formatting strips.
- Distinguish browsing, reading, writing and selecting content. Show tools in the relevant context instead of exposing every capability continuously.
- Favor reachable actions, platform selection/keyboard behavior, clear labels and predictable Back. Hidden gestures are never the only access path.
- Preserve Vaultor typography, accents and OS/Light/Dark/OLED identity; Android interaction conventions do not require a generic visual clone.
- Use motion to explain context changes. Touch has no hover; decorative effects must not move the caret or compete with writing.
- Retain the React Native shell and restricted Tiptap engine unless measured input, selection or accessibility failures justify a separately reviewed architecture change.

## Navigation and workspace drawer

The default direction is a **drawer-led hybrid**, not simultaneous duplicate drawer and bottom navigation. A5 compares a drawer-led layout with minimal bottom navigation using actual content and keyboard-open states, records the decision and delivers one coherent model. A major departure from the drawer direction should be discussed before feature expansion.

- Home offers bounded recent material and pinned shortcuts with immediate search access. Library owns mixed browsing, collection destinations and resource filters. Recent/Pinned remain reachable views without requiring permanent separate bottom tabs.
- A reachable navigation button opens the workspace drawer from browsing and notes. The drawer contains the workspace selector, Home, Library, Collections, bounded/collapsible shortcuts and Settings. Preserve alphabetical pins and global recency; never enumerate the workspace or create permanent blocks per resource type.
- Search is directly reachable from browsing and the drawer. Treat it as an action unless the prototype establishes a useful distinct destination. Keep titles default and saved content/scope explicit.
- A compact browsing creation action opens New note and secondary creation/import options when those operations are implemented. Do not ship decorative or nonfunctional buttons.
- Opening the drawer retains the live note, draft, selection and reading position. Close it before transferring focus to a chosen destination. Its gesture must not compete with editor selection or system Back; explicit button access is mandatory.
- On sufficiently wide windows the drawer may become a sidebar; decide using available width, including Android split-screen, with a minimum usable content area. This does not introduce tablet/DeX parity requirements or multi-pane note editing.
- Workspace/connection controls live behind the workspace selector. Show connection problems where they affect an operation; remove permanently visible diagnostic/status rows. Never hide outstanding draft-protection failures.

## A5 decision record

Use the drawer-led model. The [interactive comparison](design/a5-navigation-comparison.html) shows both alternatives with fixture-like mixed content and simulated keyboard/image states. Bottom navigation makes three root destinations one tap away while browsing, but adds permanent chrome and requires another route to workspace controls from the reader. The drawer costs one extra tap for root switching, keeps the note content-first and scales to Collections, shortcuts, Recovery and future Settings without more bottom tabs. Search remains direct on Home/Library and in the drawer.

The alpha.5 implementation supplies this shell, read/Edit separation, contextual Journey, compact Filters, retained editors and bounded mixed shortcuts. Native emulator checks, rather than the study, establish keyboard/Back behavior. The comparison's writing accessory/image sheet is a design proposal for A6, not a claim that A5 implements it. Settings is deliberately absent until A8; no nonfunctional entry is shipped. A5's manual Save and formatting row are transitional and visible only in Edit. Gesture polish, persistent sidebar customization, complete theme preferences and final accessibility certification remain later gates.

## Reading, editing and navigation history

- Existing notes open in reading state with the keyboard closed. A compact top bar supplies Back, title, Edit and More. New note creation enters editing directly.
- Reading uses the structured document's real presentation. Links open notes; files open temporary previews and do not advance the note journey. Reading and editing use the same live document, not independent copies.
- Edit enters the current document; avoid remounting the editor or resetting scroll/undo. Preserve a deliberate edit location when available. Done leaves editing/dismisses the keyboard; it is not a claim that the host acknowledged a save.
- While editing, one compact accessory follows the keyboard: Insert, Format and Undo, with Redo readily available when applicable. Prototype the exact arrangement with narrow widths and enlarged fonts; do not replace the old strips with a crowded icon ribbon.
- Text selection retains ordinary Cut/Copy/Paste affordances. Formatting tools preserve selection while opening/dismissing. Hardware shortcuts remain supported; do not rely on undocumented multi-finger gestures.
- Insert offers images/files, resource links and supported document blocks through a contextual sheet. Short action lists do not autofocus a search field or summon the keyboard; searchable resource lists do.
- Keep history available through a compact title/history affordance and accessible sheet. Avoid a permanent multi-row journey toolbar. Preserve the existing 200-visit bound, branching, unavailable steps and reading positions.
- Back first closes the active transient surface; when editing with the IME visible, it dismisses the IME without discarding edits. A further Back exits editing before navigating away. From reading, linked visits go to the previous journey step; a direct-open root returns to its browsing origin with query/scroll intact. Drawer destination changes are explicit and do not fabricate linked visits. Root Back uses Android exit behavior with any necessary unsaved/protection warning.
- Specify predictive Back behavior against that same hierarchy; do not register competing native/WebView owners. Restore focus immediately when a surface closes, including during exit animation.

## Automatic saving and honest status

A6 implements local-protection-first automatic saving and removes ordinary Save. Done ends editing; compact status distinguishes local protection and host acknowledgment. [WRITING.md](WRITING.md) owns the implemented receipt/reconciliation/accessory/creation contract.

- Journal each changed edit locally and debounce conditional host saving using the existing applicable settings. Coalesce requests; never run competing saves or discard newer edit versions when older acknowledgments arrive.
- Show a small status affordance with accessible text. Distinguish Saving, Saved to host, On this phone / waiting for host and protection failure. Routine successful saves must not announce every keystroke or produce toasts.
- Local recovery-write failure remains visible and blocks unsafe transitions according to existing guarantees. Remote failure permits protected writing and offers Retry; do not claim complete offline browsing/synchronization.
- Flush pending work on deliberate departure where feasible; background/process exit is best effort, not a guaranteed final network save. Navigation, host switching and epoch cancellation retain source ownership and explicit Keep drafts behavior.
- Reconcile unknown outcomes before retrying; conflicts stop automatic writes and retain both versions with the established recovery actions. Reconnection never means blindly replaying stale writes.

## Images, previews and organization

- Selecting an image reveals a compact contextual toolbar. Width/alignment/caption are primary; alternative text, replace, preview, copy, download original and remove placement live in an accessible sheet with progressive disclosure.
- Give caption entry the keyboard intentionally; ordinary image selection/tools should not leave the editor IME covering controls. Preserve selection and source anchors through sheets, uploads, undo and navigation.
- Preserve existing resource-backed images, original bytes, formats/bounds, retry UUIDs and source-note/connection binding. Failure feedback stays on the affected upload or placement.
- Preview prioritizes media, with fit/zoom and contextual actions. It is temporary, restores its source and never becomes a journey visit. Do not invert image/PDF pixels.
- Use shared row menus and contextual selection for organization. Avoid a permanent bulk-action bar. Collection membership, placement removal, Trash and permanent deletion have distinct names and consequences.
- Short confirmations identify the target and consequence; purge requires explicit confirmation. Show saved usage with its draft-coverage limitation. Local retries retain input/selection and operation identity.

## Visual, accessibility and motion foundation

- One main scroll owner per screen; sheets may scroll their own content when necessary. Keep the title and critical actions stable without oversized empty containers.
- Use semantic surfaces and text tokens from the start. OLED content canvases remain black with restrained boundaries; raised controls/sheets use near-black. Preserve other theme transparency behavior and original media colors.
- Maintain usable touch targets, visible focus, screen-reader names/order, font scaling, edge-to-edge safe insets and a visible caret above the keyboard/accessory. Test portrait, landscape and split-screen widths.
- Smooth uses coordinated sheet, drawer, selection and destination transitions; Snappy stays brief. Reduced motion removes translation/scale/stagger. No animation on typing, saves or background refreshes, no hover dependency, and no exit animation retaining input ownership.

## Design and validation gates

A5 captures comparable layouts for Home/Library, reading, keyboard-open editing, drawer and image selection. Evaluate reading area, reachable actions, action count, navigation steps, long titles, empty/mixed lists and enlarged text. Record actual findings rather than claiming modernity from screenshots. The A5 handoff exposes the chosen navigation model for user review before A6.

A6 proves selection/IME behavior, autosave safety and image-tool flows in installed release APKs on Android16/17 emulators with disposable hosts. Include typing during saves, host loss/conflicts, interrupted uploads, Back through nested surfaces and retained undo/scroll. A9 performs final integration, measured Atlas/cache observations and user-only S24 acceptance. No agent phone access. Emulator results do not certify Samsung Keyboard, One UI gestures, physical OLED or OEM lifecycle behavior.

Official guidance to recheck during implementation: [Android navigation/action patterns](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns) and [keyboard input](https://developer.android.com/develop/ui/views/touch-and-input/keyboard-input). These inform the design; the exact Vaultor interaction model is our product decision and must be tested.
