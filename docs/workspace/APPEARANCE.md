# Appearance and OLED

Reviewed 2026-10-29. Settings → Appearance chooses System, Light, Dark or OLED for this device. System (stored as os) remains the default and follows the system Light/Dark choice. The sidebar theme control cycles OS → Light → Dark → OLED → OS. Explicit themes do not change when the OS appearance changes.

## First paint

`public/theme-bootstrap.js` is a parser-blocking same-origin script before styles/application modules, compatible with desktop `script-src 'self'`. It reads `vaultor-device-presentation-v1`, normalizes Light/Dark/OLED or OS fallback, and applies root classes, data-theme, color-scheme and a matching background before React or host settings. Missing/corrupt/blocked storage follows OS. The existing SettingsProvider keeps the same device isolation, persistence/migration and OS-change listener. Initial/programmatic application has no reveal; intentional user choices retain the coordinated transition below.

Desktop `appearance.mjs` mirrors only the normalized device theme in private app-data `appearance.json`, written atomically; it never enters archives. BrowserWindow starts hidden with the corresponding OS/Light/Dark/OLED background and shows on ready-to-show. Bootstrap/provider send the normalized preference through a constrained native appearance call; OS mode follows `nativeTheme` changes. The renderer cache remains authoritative for renderer presentation; stale/missing native cache cannot force another theme. Native cold/warm evidence and early-frame captures belong in the release ledger; unit tests alone do not certify a perceptible flash is absent.

## True-black surfaces

OLED uses #000000 for the workspace, sidebar, note panes, browsing results and journey bar. Raised dialogs/previews use #0A0A0A; menus/hover use #141414 and stronger surfaces #1E1E1E. Fine neutral borders separate black regions. Primary/secondary/muted text use #E8E8E8/#B3B3B3/#858585. Accent choices, semantic errors/status, tag colors and code syntax remain visible; focus and selection keep explicit accent indicators. Preserve original images, PDFs, videos and export colors rather than inverting media.

OLED retains the dark component class but uses data-theme=oled and native color-scheme=dark. Shared CSS tokens are authoritative; raised popovers use semantic surfaces with existing Light/Dark fallbacks. New components must use these tokens rather than hardcoded navy/white surfaces. Keep code syntax and media separate from application surface overrides.

## Transparency and persistence

OLED honors the same saved UI transparency value as Light/Dark:60–100% is panel opacity, with lower values revealing more application context. OLED no longer forces glass alpha1/blur0. Its workspace remains black, while glass dialogs, floating navigation, previews and utility menus use black/neutral raised RGB tokens with the saved alpha and blur. The root `--ui-opacity` updates with local settings. Unfocused note panes have additional depth opacity/brightness and a lower background alpha derived from the slider; focused panes use its direct alpha. Settings0.24.1 labels the slider Opacity:100% is solid, lower values are more transparent. The existing uiTransparency value/schema and60–100% bounds are unchanged. Original PDF/image pixels remain unchanged. A black translucent surface over a black canvas can look black; overlaying other application content demonstrates the glass effect.

The theme is stored in device-specific local settings, outside portable archives. Backend normalization accepts oled without a schema migration; unknown values still normalize to os. Update the connected server to 0.3.2+ for reliable OLED persistence. Updating a remote client does not update its host. Browser access uses the host's UI build. Physical OLED appearance depends on the user's display; screenshots and native computed-color checks do not certify hardware rendering.

## Verification

Focused settings/provider/motion tests and targeted native OLED60/100% comparisons protect opacity and theme lifecycle. Installed OLED/Settings/retained preview checks passed for the integrated [0.14 release](../desktop/releases/v0.14.0.md) and later [R10](../development/qualification/R10.md). The disposable VAULTOR_OLED_SMOKE=1 chrome-smoke helper uses isolated storage; current selectors and prerequisites must be checked before reuse. Native side previews reserve desktop control space. These results do not certify physical OLED or every native platform.

Focused settings and the expressive Smooth/Snappy system are implemented; see [SETTINGS.md](SETTINGS.md) and [MOTION.md](MOTION.md).

W2 device presentation cache (vaultor-device-presentation-v1) applies normalized local appearance before settings load and across workspace switches; workspace values still use scoped host patches. Cache never enters portable archives. If device storage is blocked, host preferences remain the fallback.

## Coordinated theme reveal

User-originated theme changes reveal the complete new palette outward from the actual sidebar button or chosen Settings radio, including keyboard selection. `lib/themeTransition.ts` owns one root View Transition snapshot with a48px feathered radial mask and a typed animated radius; application geometry, editors and viewer DOM remain mounted. Settings state/cache/persistence update immediately. Root classes, data-theme and color-scheme apply together in the capture callback, bounded by a150ms watchdog. Smooth uses1100ms and Snappy500ms. Only outstanding color/shadow CSS transitions are completed for the snapshot; spatial transitions are retained. Native window controls have their own immediate snapshot group outside the reveal mask.

Pointer/key/scroll/resize, visibility/fullscreen and motion-preference changes cancel the visual and commit the latest requested palette. Rapid switches invalidate older callbacks. First paint, OS-following/programmatic changes, reduced motion, fullscreen, hidden documents, unsupported APIs and capture failures apply immediately. Theme choices, accent/opacity values and device persistence contracts are unchanged. The implementation follows the [View Transition capture lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition). Native PDF reading position survived Light/OLED switches; the corrected620ms wave was observed in the saved native recording and the user confirmed visible progression. The user's subsequent slower1100ms preference was loaded/exercised and accepted in the finish request; no second capture for this timing-only adjustment. See the [phase evidence](../desktop/releases/v0.13.0.md).

Implementation rationale from the completed redesign: keep the feathered gradient in CSS on the snapshot pseudo-element and animate only its typed radius. Putting var()-dependent gradients into WAAPI keyframes resolved the variable once and produced whole-palette jumps despite an advancing radius. Native temporal frames exposed this; corrected progression was inspected and user-confirmed. The final1100/500ms adjustment was exercised and accepted without a new recording. [0.13 evidence](../desktop/releases/v0.13.0.md) retains release/native limits; static endpoints alone never certify a theme wave.
