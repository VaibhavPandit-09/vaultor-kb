# Settings

Reviewed 2026-10-15. Settings is a focused window over the current workspace. Sprint 1 of the 0.4.0 update replaces nested cards with flat rows; managed images and expressive Smooth motion complete the coordinated 0.4.0 update. These controls ship in 0.4.0; installed older versions retain their previous UI until updating.

## Navigation and controls

The window opens to Appearance with focus in global search. Its four categories are Appearance, Workspace, Layout & previews and Keyboard. Search matches setting names, descriptions and keywords across all categories, displaying only matching rows with category headings/scopes. Clearing search restores the selected category; selecting another category explicitly clears search. Opening the window again starts in Appearance with empty search.

The header and category navigation remain fixed. Only settings content scrolls. The current redesign candidate caps the canvas at1000×660px and the actual available height, reserving40px for native desktop controls; compact header/rail and14px row padding reclaim vertical space. Narrow rows use12px padding and the existing category selector. Category/search ownership and setting scopes are unchanged. Narrow windows replace the rail with a native category selector and stack controls below descriptions. Theme choices and two-choice controls are radio groups with arrow/Home/End keys; accent swatches have accessible names and roving keyboard focus. Focus mode is a switch. Numeric sliders also offer direct input; blur/Enter commits values within bounds and steps, invalid entries remain local with feedback linked through aria-describedby, and composition does not submit. Autosave accepts 0–1000 ms in steps of 100; transparency accepts 60–100% in steps of 5.

Appearance contains theme, accent, density, animation feel and transparency. Workspace contains pane capacity, direct-open behavior, autosave delay and focus mode. Layout & previews contains sidebar and file-preview modes. Keyboard exposes every configurable app shortcut using existing platform-aware conflict/reserved-key validation. Editing a shortcut affects the current platform. Escape cancels recording before closing the window; Tab ends recording without becoming a shortcut.

## Scope, saving and resets

Workspace values sync across the vault; appearance/layout/sidebar preferences belong to this device; keyboard edits belong to the current platform. Existing scoped patches and serialized save/retry handling remain authoritative. Changes apply immediately and show compact Saving/Saved status; failure retains values with Retry. Closing does not cancel the provider's pending saves. Settings changes never replace note drafts.

Settings options contains confirmed resets: device preferences, workspace behavior, current-platform keyboard shortcuts, or all settings. Individual shortcut resets also require confirmation. The confirmation explains scope before execution. Reset all settings retains the existing broader contract: workspace behavior, this device's local preferences and bindings on every platform, while preserving other devices' local preferences. Device reset also restores this device's sidebar presentation preferences.

## Surfaces and accessibility

Settings uses one canvas rather than nested cards. OLED uses a black canvas and neutral control/selection/menu/confirmation colors; its glass panel honors the saved opacity/blur just like other themes. See [APPEARANCE.md](APPEARANCE.md). Appearance includes an explicit Snappy/Smooth Try it comparison. Category/selection feedback follows the shared [motion boundary](MOTION.md); global-search typing does not replay row entrances.

Focus stays within settings or its reset confirmation, with visible indicators. Initial focus goes to search. Escape is owned by the shared manager: confirmation, recording and options close before the window. Click/Escape dismissal restores the invoking input/editor/control, including React Strict Mode. Confirmation background is inert. Reset descriptions can scroll within bounded confirmation geometry while Cancel/Reset remain reachable; options menus are also viewport-bounded. No positive tabindex values are used.

## Verification

Component tests cover category/search restoration, control scopes, numeric validation/composition, failed-save retry, resets, shortcut conflicts and focus/Tab/Escape under Strict Mode. Existing provider tests cover OS/OLED persistence and scoped retries. The settings-only disposable desktop session is VAULTOR_SETTINGS_SMOKE=1 with chrome-smoke.mjs; it captures eight frames for OLED, Workspace, Keyboard, search, reset, Light/Dark and narrow layout. See [R10 qualification](../development/qualification/R10.md) and versioned release ledgers for actual results. This check does not certify physical OLED or Mac rendering.

Phase5A native review used the isolated disposable profile: short/large Light/Dark/OLED, search/clearing, invalid opacity101 retained locally then95 restored, shortcut recording cancellation, reset confirmation cancellation/Tab/Escape and reduced motion. No reset was committed natively. Original OLED/Blue/Smooth/Comfortable/95% preferences and system Reduce motion off were restored. Component tests retain scope/reset/save-failure and numeric composition checks; native IME,600px minimum and full accent/size combinations remain pending. [Evidence and exact limits](../desktop/releases/v0.13.0.md).
