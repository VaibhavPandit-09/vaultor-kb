# Install and update Vaultor on each device

Reviewed 2026-10-08. This is the user-facing installation and update procedure. [UPDATES.md](UPDATES.md) owns package verification, backups and recovery internals; [RELEASE-PROCESS.md](RELEASE-PROCESS.md) tells agents how to build and publish releases.

## What you download

Use the [Vaultor GitHub Releases page](https://github.com/VaibhavPandit-09/vaultor-kb/releases). Pick a **published** release and read its platform availability and known limitations. A Git commit, source ZIP, development package or draft release is not an installed-app update.

| Device | Required files for in-app updating | Current support |
| --- | --- | --- |
| Windows x64 | None to select from 0.4.1+: Update and restart fetches both internally. First/transition install: EXE. Offline import: EXE + signed sidecar. | Silent in-app update/restart and installer tested |
| macOS Apple Silicon | `Vaultor-VERSION-mac-arm64.dmg` and the same filename plus `.vaultor.json` | Packaging implemented; development app tested; release DMG/install/update verification still pending |
| macOS Intel | None | No supported desktop package |
| Ubuntu/Linux | None | Desktop packaging is deferred; browser access and Docker server are available |
| Android | None | Native app deferred; browser access available |

For manual/offline import, keep each installer and its signed sidecar in the **same folder**, with their exact original names. Do not download source-code assets for installation. No Java or Docker is needed on a device running a packaged desktop app. Unsigned personal OS installers are separate from the app's Ed25519-signed update manifests: the latter verify update identity and bytes, but do not remove SmartScreen or Gatekeeper prompts.

**[0.5.0 Windows x64 is published](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/v0.5.0)** (2026-10-08). From installed Windows 0.4.1+, use Updates → Check for updates → **Update and restart**. From 0.4.0 or earlier, download just the current EXE, save and Quit Vaultor from the tray/menu, then run the installer once. Manual signed-pair import remains available for backup-aware transitions/offline updates. Checksums and actual native results are in [the release notes](releases/v0.5.0.md). Mac 0.5.0 remains unavailable until native build/key/verification gates are met; [MAC-HANDOFF.md](MAC-HANDOFF.md) specifies exact same-tag delivery. **Update hosts before remote clients: both require API protocol/minimum client 3.** A Windows client update does not upgrade a remote Mac host; incompatibility is refused before editors mount. Original trust and the separate updater protocol 1 remain unchanged.
