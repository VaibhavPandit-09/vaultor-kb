# Interaction motion

Reviewed 2026-10-15. Settings → Appearance → Animation feel selects Snappy or Smooth on this device. The interactive Try it comparison is explicit, finite and does not change the preference. There are no decorative loops or cursor-following effects.

## Shared behavior

`lib/motion.ts` is the shared timing/lifecycle boundary, installed once in main.tsx with hot-reload cleanup. Snappy uses 70–90 ms feedback; Smooth uses 200 ms destination/category fades, 220 ms menus, 280 ms panels and 180 ms visual exits. Initial visible rows reveal over 200 ms with up to six 24 ms offsets (320 ms maximum). CSS semantic motion tokens coordinate controls, disclosure geometry and selection-marker movement. Journey back/forward retains its directional 200 ms Smooth/100 ms Snappy behavior.

Dialogs, palettes, organization/search popovers, settings resets, previews, editor menus, image tools and action failures use finite entrances. Existing panel/semantic dialog selectors supply shared defaults; new surfaces declare `data-motion-surface` and a stable `data-motion-key` when different renders belong to one surface. Geometry-owned previews bypass generic entrances. The command palette and AppModal utilities use shared utility timing with a small non-overshooting entrance; settings and other menus retain their existing motion. Whole browsing destinations fade, without page scaling. Initial list reveals use `data-motion-list`, `data-motion-ready` and a destination key; query keystrokes, retained-row background refreshes, ordinary typing, saves and server notices do not replay those reveals.

Selection markers follow category, segmented-control, palette and sidebar selection without taking focus or changing selected IDs. Appropriate actions lift by about 2 px and receive restrained accent borders/shadows in Smooth on hover-capable devices. Rows get stronger background/edge feedback. Input text and editor canvases are not transformed on hover. Pressing resolves back to the baseline. Keyboard focus is immediately visible and touch does not require hover.

## Exit and interruption

React removes the actual closed surface immediately. The motion boundary may retain a short inert visual clone to fade out, with IDs, roles, focusability and editability removed, controls disabled, aria-hidden and pointer events disabled. Clones have no React handlers, save/network ownership or Escape registration. Focus restoration uses the captured source view and centralized restoration registry after React cleanup in a microtask, without waiting for the visual exit or selecting a global editor. Reopening the same surface discards its old visual; interrupted entrance/preference changes cancel obsolete animations. No editor is remounted or replaced by this system. Geometry is refreshed before interactions and on scroll/resize, rather than on a sampling loop.

Sidebar disclosure uses a 0fr/1fr grid transition with content retained for cached rows. Collapsed contents become inert and aria-hidden immediately, while the existing enabled-query contracts continue to suspend browsing. Visibility/collapse settings and request ownership are unchanged.

## Reduced motion and checks

OS reduced motion disables translation, scale, overshoot, stagger and CSS animation/transition durations, including the comparison. Preference changes cancel running animations and remove visual clones. Focus/state changes remain immediate.

Focused tests cover durations, anchored portal transforms, no page scaling, six-row bounds, query/refresh suppression, editor identity, interruption and inert exits/focus. `VAULTOR_MOTION_SMOKE=1` uses an isolated owned desktop workspace through the chrome helper and includes settings/theme, real clipboard image/reload and motion integration. Actual packaged checks and visual review results are recorded in CODEBASE, the tracker and versioned release notes; Mac/physical OLED/touch results are not inferred from Windows screenshots.

## Current redesign review candidates

Pane focus uses an explicit user-requested depth transformation: equal logical widths avoid focus-driven text reflow, while inactive peers recede through modest scale/translation, dimming and translucency. Pointer/menu holds include visual transforms; reading-anchor compensation converts visual distances back to scroll coordinates. Reduced motion removes scale/translation. Open/close retains save-authorized real allocation and mounted editor ownership.

PreviewShell owns real geometry across Side/Floating with one viewer ancestor chain. `data-motion-surface="geometry"` bypasses generic entry scaling and exit clones; iframe/image pixels are not transformed to fake resize. Mode changes retain viewer DOM, zoom/scroll, native URL ownership and file-action state. Shared panel timing and CSS retargeting apply; pointer/menu holds protect moving controls and reduced motion uses immediate final bounds. Preview-owned utility menus inherit priority above the preview, so Escape closes them first. [Review evidence and remaining cases](../plans/ui-redesign.md).

Browse title accent follows the same smoothed compression progress as Note titles, including reversal, pointer/menu holds and reduced-motion endpoints; no independent color timer or duplicated heading exists. Library, Collection detail, Collections, Recent and Pinned share this rule.

CommandStage retains one body while real height adapts below a stable query anchor. Search loading retains allocation. Deeper/back navigation gets an8px directional cue at shared menu timing (220ms Smooth/75ms Snappy); ordinary query/result changes do not replay it. Height uses the CSS interaction token. Stage replacement/unmount cancels the old cue; runtime reduced-motion/preference changes cancel it through the shared motion boundary. Focus, queries, captured targets and execution do not wait for motion.

Phase5A utilities keep title/actions outside one body scroll and use the shared command/utility entrance without overshoot. Settings density and category geometry use existing motion; no new dramatic morph or routine recording. Focus/Escape and close guards depend only on mounted state. A native file-picker return waits one frame for its invoking button to re-enable, without waiting for a visual animation. [Utility validation](../plans/ui-redesign.md).

Phase5B adds one control-origin theme reveal at380ms Smooth/140ms Snappy. Its snapshot controller commits settings independently, cancels on renewed interaction, and applies immediately for reduced motion or capture failure. It does not remount real UI or create an interactive overlay. [Appearance](APPEARANCE.md) owns its lifecycle; [native review](../plans/ui-redesign.md) records the pending temporal gate.
