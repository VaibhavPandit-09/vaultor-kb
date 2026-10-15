# Appearance and OLED

Reviewed 2026-10-15. Settings → Appearance chooses OS, Light, Dark or OLED for this device. OS remains the default and follows the system Light/Dark choice. The sidebar theme control cycles OS → Light → Dark → OLED → OS. Explicit themes do not change when the OS appearance changes.

## True-black surfaces

OLED uses #000000 for the workspace, sidebar, note panes, browsing results and journey bar. Raised dialogs/previews use #0A0A0A; menus/hover use #141414 and stronger surfaces #1E1E1E. Fine neutral borders separate black regions. Primary/secondary/muted text use #E8E8E8/#B3B3B3/#858585. Accent choices, semantic errors/status, tag colors and code syntax remain visible; focus and selection keep explicit accent indicators. Preserve original images, PDFs, videos and export colors rather than inverting media.

OLED retains the dark component class but uses data-theme=oled and native color-scheme=dark. Shared CSS tokens are authoritative; raised popovers use semantic surfaces with existing Light/Dark fallbacks. New components must use these tokens rather than hardcoded navy/white surfaces. Keep code syntax and media separate from application surface overrides.

## Transparency and persistence

OLED honors the same saved UI transparency value as Light/Dark:60–100% is panel opacity, with lower values revealing more application context. OLED no longer forces glass alpha1/blur0. Its workspace remains black, while glass dialogs, floating navigation, previews and utility menus use black/neutral raised RGB tokens with the saved alpha and blur. The root `--ui-opacity` updates with local settings. Unfocused note panes have additional depth opacity/brightness and a lower background alpha derived from the slider; focused panes use its direct alpha. Settings describes the control consistently across themes. Original PDF/image pixels remain unchanged. A black translucent surface over a black canvas can look black; overlaying other application content demonstrates the glass effect.

The theme is stored in device-specific local settings, outside portable archives. Backend normalization accepts oled without a schema migration; unknown values still normalize to os. Update the connected server to 0.3.2+ for reliable OLED persistence. Updating a remote client does not update its host. Browser access uses the host's UI build. Physical OLED appearance depends on the user's display; screenshots and native computed-color checks do not certify hardware rendering.

## Verification

Focused settings persistence/cycling/native-dark semantics and backend scoped-patch tests accompany this change. The disposable packaged check is VAULTOR_OLED_SMOKE=1 node desktop/scripts/chrome-smoke.mjs "<absolute packaged executable>". Its opacity/preview expectations now follow the saved alpha; only syntax was checked for this revision. Existing legacy UI selectors may need further maintenance before the packaged harness is used. Current validation is focused settings/motion/lifetime tests plus native Electron60/100% OLED comparisons and targeted viewer/theme checks recorded in the redesign plan; no packaged smoke run is claimed. The side preview reserves the native desktop control area so its actions stay reachable; browser layout is unchanged. Exact actual results belong in the versioned release notes and living tracker.

The focused settings UI is Sprint 1 of the coordinated 0.4.0 update; installed 0.3.2 retains Settings → Local → Appearance until that release. The shared expressive Smooth system and interactive comparison are implemented in Sprint 3; see [MOTION.md](MOTION.md).

W2 device presentation cache (vaultor-device-presentation-v1) applies normalized local appearance before settings load and across workspace switches; workspace values still use scoped host patches. Cache never enters portable archives. If device storage is blocked, host preferences remain the fallback.

## Theme reveal review candidate

User-originated theme changes reveal the complete new palette outward from the actual sidebar button or chosen Settings radio, including keyboard selection. `lib/themeTransition.ts` owns one root View Transition snapshot with a48px feathered radial mask and a typed animated radius; application geometry, editors and viewer DOM remain mounted. Settings state/cache/persistence update immediately. Root classes, data-theme and color-scheme apply together in the capture callback, bounded by a150ms watchdog. Smooth uses1100ms and Snappy280ms. Only outstanding color/shadow CSS transitions are completed for the snapshot; spatial transitions are retained. Native window controls have their own immediate snapshot group outside the reveal mask.

Pointer/key/scroll/resize, visibility/fullscreen and motion-preference changes cancel the visual and commit the latest requested palette. Rapid switches invalidate older callbacks. First paint, OS-following/programmatic changes, reduced motion, fullscreen, hidden documents, unsupported APIs and capture failures apply immediately. Theme choices, accent/opacity values and device persistence contracts are unchanged. The implementation follows the [View Transition capture lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition). Native PDF reading position survived Light/OLED switches; the corrected620ms wave was observed in the saved native recording and the user confirmed visible progression. The user's subsequent slower1100ms preference was loaded/exercised and accepted in the finish request; no second capture for this timing-only adjustment. See the [phase evidence](../plans/ui-redesign.md).
