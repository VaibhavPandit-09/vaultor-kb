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

**[0.4.1 Windows x64 is published](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/v0.4.1)** (2026-10-08). From 0.4.0 or earlier, download just its EXE, save and Quit Vaultor from the tray/menu, then run the installer once. The signed-pair import route remains available if you want the existing pre-update backup flow. Thereafter Windows uses Updates → Update and restart. Uploaded/downloaded bytes are verified; checksums and native results are in [the release notes](releases/v0.4.1.md). Mac 0.4.1 remains unavailable until native build/signing-key/verification gates are met; [MAC-HANDOFF.md](MAC-HANDOFF.md) specifies exact same-tag delivery. Host and client API protocol remains 2 (0.4.0+ required for managed images); a Windows client update does not upgrade a Mac host. Original trust and the separate updater protocol 1 are unchanged.

## First installation — Windows

1. Download the Windows `.exe` from a published release. Use Windows x64; ARM Windows is not a verified target.
2. Run the installer for your Windows user. Choose the intended install location and finish. If Windows warns about an unknown publisher, verify the release source before explicitly allowing your own personal build. Do not disable security protections globally.
3. Start **Vaultor** from its installed shortcut. A new installation opens **This computer**, which starts the bundled local server. An existing installation retains its selected connection and data.
4. Open Connections & hosting from the sidebar or window ellipsis menu if you want a different server. **This computer** is the app-managed local workspace; an **independent local server** is a separate server you explicitly configured.
5. Check the application version in window menu → **Updates**. Old pinned Electron development shortcuts can retain the wrong target/icon; use the installed Vaultor shortcut instead.

## First installation — Apple Silicon Mac

Follow these steps only when the release lists a produced and verified Mac arm64 DMG. Until then, [MAC-HANDOFF.md](MAC-HANDOFF.md) covers development builds and outstanding native checks.

1. Download and open the Mac `.dmg`. Drag **Vaultor.app** into **Applications**.
2. Eject the disk image and open the copy in Applications, not the copy inside the mounted image.
3. This is a personal ad-hoc-signed build, without paid notarization. If macOS blocks it, approve this known build using the normal **Privacy & Security → Open Anyway** flow where offered. Never disable Gatekeeper globally or blindly clear quarantine on unknown downloads.
4. Select **This computer** or connect to your remembered LAN host. Installed packages bundle Java.
5. Check the application version in **Updates**. Pairing and local workspace data live separately from Vaultor.app and should survive app replacement.

## Update an installed desktop app — preferred route

With 0.4.1 or newer installed on Windows, open window menu → **Updates**. The app checks GitHub automatically. When a complete Windows release is available, click **Update and restart**. Vaultor downloads/verifies it, saves your work, backs up the managed workspace, updates in its current location and reopens. No browser download, JSON selection or installer wizard is needed. Download progress supports Cancel; failures offer retry and retain verified packages. Local hosting briefly disconnects paired devices. Remote hosts update separately.

Confirm the new version in Updates, the selected workspace, open notes and pairing. Select This computer when appropriate to confirm its local update journal. Data/profiles/drafts remain separate from installed app files. OS prompts can still appear on a personal unsigned build; never disable security globally.

### One transition update from 0.4.0 or older

Those versions do not contain the new updater. Download the 0.4.1 Windows EXE from the published release, finish saving, **Quit** Vaultor through the tray/menu (closing can merely hide it), run that installer and reopen. This single-file manual route preserves app data but does not run the app's pre-update backup. For a verified backed-up transition, keep the EXE and signed sidecar together and use the existing Updates → Import update → Install update flow once. Later Windows updates use Update and restart.

### Advanced and unsupported installations

Advanced contains manual import (signed sidecar beside the installer), custom manifest source (blank uses GitHub), same-version repair and recovery. On Mac or portable/development Windows copies, automatic replacement is not verified: **Download and install** fetches/verifies the files and opens the installer after confirmation. Mac users still manually replace Vaultor.app from the DMG. Native Mac one-click work remains pending in MAC-HANDOFF.md. Never delete app data to update. If local startup fails, use Advanced → Restore pre-update workspace; preserve backups and failed recovery directories.

## Updating a Mac host and its Windows clients

Each device is a separate installation. For a Mac hosting a shared workspace:

1. Stop editing from connected clients and finish workspace transfers. Export an independent workspace archive if you want an additional portable copy.
2. Update the **host Mac** with its Mac package. Hosting stops during installation; clients can retain drafts and switch to a local workspace if needed.
3. Reopen the Mac app, verify the local workspace and sharing state, then reconnect clients. Existing approvals should persist; repeated pairing is not a normal update requirement.
4. Update Windows clients with the Windows package when needed. Read release compatibility notes; if a release requires coordinated versions, follow its stated order instead of assuming every old client works.

App version and server protocol are distinct. Every desktop release includes its own bundled server, but a client connected to the Mac uses the Mac's server. The connection check explains an incompatible client/server combination.

## Optional in-app HTTPS feed

Updates → **Update source and recovery** can store a platform-specific HTTPS manifest URL. **Check**, **Download**, and **Install update** are currently explicit actions; there is no periodic automatic check or silent installation.

The signed manifest and its named installer must be served at sibling URLs without redirects. Direct GitHub Release asset links normally redirect and are **not a supported feed** under the current transport policy. Do not paste a GitHub release page, `latest` URL or raw manifest URL whose sibling installer is absent into this setting. GitHub download + Import update is the supported zero-cost baseline. A compatible feed is optional future hosting work, not a prerequisite or a promise that GitHub publication alone enables automatic updates.

## Browser and Docker — Windows, Mac and Ubuntu

A browser is a client of a server; it has no Vaultor installer. Updating the host updates the browser UI. Refresh after deployment and retain draft recovery if changes are pending. Remote browser access still requires HTTPS trust and pairing; see [HOST-ACCESS.md](../security/HOST-ACCESS.md). Never expose the owner listener publicly.

For an existing Docker/Compose deployment, from the repository root:

```text
git status --short
git fetch origin --tags
docker compose stop vaultor
docker compose cp vaultor:/data PRIVATE_BACKUP_DIRECTORY/workspace-before-VERSION
git checkout vVERSION
docker compose build
docker compose up -d
docker compose logs --tail 100 vaultor
```

Preserve local source/config changes before checkout. Use a published release tag that includes source; do not substitute a random newer commit. Before stopping, finish edits/transfers. Replace PRIVATE_BACKUP_DIRECTORY with an existing absolute folder outside the repository, on storage you control; require a successful copy before rebuilding. The stopped-container copy includes SQLite, uploaded files, operation journals and host access state consistently. Those host credentials make this backup private: never upload it to GitHub or use it as a portable workspace export. Keep your original deployment directory, Compose project name and volume mapping unchanged. See [OPERATIONS.md](../development/OPERATIONS.md) for paths, owner bootstrap and deployment debugging. **Never use `docker compose down -v` for an update**: that deletes the workspace volume. Rebuild/recreate with the same volume and configuration; afterward verify readiness and open the browser. Docker deployment does not install or update a desktop client. No blanket OS-trust/firewall change is part of updating.

For a standalone JAR deployment, quit the existing server after finishing writes, back up its configured SQLite/files/operations/host-access storage together, build the published tag with `npm --prefix frontend ci` then `npm --prefix frontend run build`, and run the Maven wrapper from backend with `-Pdesktop -DskipTests clean package` (Windows: `.\mvnw.cmd`; Mac/Ubuntu: `./mvnw`). The desktop profile embeds the frontend. Replace `backend/target/vaultor-0.0.1-SNAPSHOT.jar` and restart it with `java -jar` using the same data paths/configuration and working directory. Follow [OPERATIONS.md](../development/OPERATIONS.md); do not copy a live SQLite file as an update backup.

Ubuntu can use the browser against another host, or host Docker/standalone. There is no AppImage/DEB, Linux update manifest or supported Electron installer yet. macOS Intel and Android native packages also remain deferred. Do not treat source compilation as a verified personal installer for these platforms.

## If no update is available

Ask the implementation agent for the release URL and platform-specific asset pair. Agents own the build/publish work after app changes; you should not need to regenerate signing keys or build Windows packages yourself. If Mac access, original signing identity, GitHub access or native verification is missing, the agent must state exactly which platform is blocked and leave a precise handoff. An unbuilt/untested platform must never be described as released.

## 0.5.0 lifecycle update order

Update hosts before remote clients: both require API protocol 3. Windows 0.4.1 installed users open window menu → Updates → Check for updates → **Update and restart**; downloads, signed-sidecar verification, save/recovery backup and installation are handled internally. There is no two-file selection step. Existing 0.4.0 and older installations can use the manual transition described above. A local desktop update includes its bundled host; a remote Mac/Windows host is a separate installation. Mac 0.5.0 availability must match release assets and native validation; use the exact same-tag MAC-HANDOFF when its pair is absent. The app must refuse an old remote host instead of opening editors.

The additive Trash schema is not a safe in-place downgrade: old servers treat retained originals as active. Rollback requires stopping the host and restoring its pre-update workspace backup with the corresponding older app, not merely reinstalling old binaries. Portable workspace ZIPs now use format 3 and retain Trash; complete export refuses unfinished permanent cleanup.
