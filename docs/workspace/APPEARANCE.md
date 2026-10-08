# Appearance and OLED

Reviewed 2026-10-08. Settings → Appearance chooses OS, Light, Dark or OLED for this device. OS remains the default and follows the system Light/Dark choice. The sidebar theme control cycles OS → Light → Dark → OLED → OS. Explicit themes do not change when the OS appearance changes.

## True-black surfaces

OLED uses #000000 for the workspace, sidebar, note panes, browsing results and journey bar. Raised dialogs/previews use #0A0A0A; menus/hover use #141414 and stronger surfaces #1E1E1E. Fine neutral borders separate black regions. Primary/secondary/muted text use #E8E8E8/#B3B3B3/#858585. Accent choices, semantic errors/status, tag colors and code syntax remain visible; focus and selection keep explicit accent indicators. Preserve original images, PDFs, videos and export colors rather than inverting media.

OLED retains the dark component class but uses data-theme=oled and native color-scheme=dark. Shared CSS tokens are authoritative; raised popovers use semantic surfaces with existing Light/Dark fallbacks. New components must use these tokens rather than hardcoded navy/white surfaces. Keep code syntax and media separate from application surface overrides.

## Transparency and persistence

OLED overrides glass alpha to 1 and blur to 0px; the floating sidebar stays black, while ordinary dialogs/menus/previews remain opaque near-black. The redesigned settings window uses a black canvas and small neutral control/menu surfaces; see [SETTINGS.md](SETTINGS.md). Dimmed modal backdrops remain overlays so context stays identifiable. The saved UI transparency value is unchanged and becomes effective again when leaving OLED. Settings explains this beside the control.

The theme is stored in device-specific local settings, outside portable archives. Backend normalization accepts oled without a schema migration; unknown values still normalize to os. Update the connected server to 0.3.2+ for reliable OLED persistence. Updating a remote client does not update its host. Browser access uses the host's UI build. Physical OLED appearance depends on the user's display; screenshots and native computed-color checks do not certify hardware rendering.

## Verification

Focused settings persistence/cycling/native-dark semantics and backend scoped-patch tests accompany this change. The disposable packaged check is VAULTOR_OLED_SMOKE=1 node desktop/scripts/chrome-smoke.mjs "<absolute packaged executable>". It verifies black canvases, opaque palette, retained preference, menus, notes/code/tables, narrow geometry, reduced motion and other theme regressions. The side preview reserves the native desktop control area so its actions stay reachable; browser layout is unchanged. Exact actual results belong in the versioned release notes and living tracker.

The focused settings UI is Sprint 1 of the coordinated 0.4.0 update; installed 0.3.2 retains Settings → Local → Appearance until that release. The shared expressive Smooth system and interactive comparison are implemented in Sprint 3; see [MOTION.md](MOTION.md).
