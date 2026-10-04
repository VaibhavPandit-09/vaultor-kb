# Personal installers and updates

Reviewed 2026-10-04, D8. Windows x64 uses a per-user NSIS installer. Mac Apple Silicon has a local build workflow producing an ad-hoc-signed app and DMG; building and native verification on the Mac mini remain pending. No publisher certificate, notarization, subscription, hosted feed or publishing is required. Android and Ubuntu packaging are outside D8.

## Build and launch

Use Node 20.19+ (Node 24 works), Java 25 for building the server, and the checked-in Maven wrapper. Installed packages bundle their Java runtime and do not require Docker or installed Java. Windows builds on Windows x64; Mac builds on Apple Silicon macOS with Apple's free command-line developer tools. Do not cross-build and claim native verification.

```powershell
npm --prefix frontend ci
npm --prefix desktop ci
npm --prefix desktop run build
npm --prefix desktop run prepare-server
npm --prefix desktop run release:key
npm --prefix desktop run package:release
```

Run `release:key` only for initial identity setup before a public key exists. This checkout already contains the public key: use its matching private key on another machine; the command intentionally refuses to generate a mismatched replacement. It refuses automatic key replacement. The public key is committed in `desktop/release-trust.json`; the private Ed25519 key is ignored at `desktop/cache/release-signing/private.pem`. Keep a separate private backup and transfer it privately to the Mac to sign releases for the same installation family. `VAULTOR_RELEASE_KEY` can point at that private file. Losing the original key requires an explicit reinstall/trust migration; do not regenerate it casually. These application release signatures are free and are distinct from OS publisher signing.

Build verifies the bundled server/runtime and matching private/public key. Artifacts are in ignored `desktop/releases/`: `Vaultor-0.2.0-windows-x64.exe` or `Vaultor-0.2.0-mac-arm64.dmg`, plus a `.vaultor.json` sidecar. The script never publishes. The tested Windows 0.2.0 build measured 257,901,237 bytes for the installer (about 246 MiB) and 730,896,084 bytes unpacked (about 697 MiB); the bundled Chromium/JVM are substantial. Mac footprint has not been measured. Runtime legal notices are included in `resources/bundle/THIRD-PARTY.md` and runtime/legal; Electron, discovery dependencies and builder-generated license notices travel with the package. Electron-builder and resedit are development dependencies only.

For development, rebuild and use `npm --prefix desktop start`. Windows now launches an ignored, icon-stamped clone named Vaultor.exe instead of the npm Electron executable. Cache identity includes Electron version and icon checksum. The npm runtime is untouched. Portable `package:dev` snapshots also use Vaultor.exe on Windows; they are separate from installer/update releases.

Windows installer and installed executable carry the same Vaultor ICO as runtime window/tray branding. The application identity and relaunch shortcut details use `personal.vaultor.desktop`. Quit the old app before launching a refreshed build. An already pinned Electron shortcut can retain its old target/icon: unpin it and pin the running Vaultor executable or installed Vaultor shortcut. This does not justify clearing user data or Windows icon caches automatically.

Windows may display an unknown-publisher/SmartScreen prompt because the executable has no paid publisher signature. Verify the source and checksums before explicitly running your personal build. Mac ad-hoc signing does not imply Gatekeeper approval or notarization; approve the known local build through macOS's normal security controls. Do not globally disable OS protections. macOS DMG replacement is manual, not unattended updating.

## Existing workspaces

Connections & hosting → Bring an existing workspace offers two paths:

- Connect to an upgraded compatible server. Protected independent loopback HTTP servers require selecting their existing `owner.key` in a native dialog; main verifies access and keeps it in OS-protected credential storage. Existing local profiles have an Authorize action. Keys never enter renderer state. Remote hosts use the existing paired HTTPS flow.
- Export a workspace ZIP from the original server, select This computer, then review/import it through the existing merge/replace dialog. Destination capture is connection-epoch scoped; a failed switch cannot import into a different server. No database or host directory is silently adopted.

Current desktop connections require protocol 1 plus changeFeed/scopedSettings capabilities. Use [HOST-ACCESS.md](HOST-ACCESS.md) for standalone/Docker owner bootstrap, HTTPS publication and pairing. Docker/browser hosting remains supported; the installer does not migrate, stop or delete those servers.

## In-app updates

The window ellipsis menu → Updates opens a compact dialog independent of workspace startup. It remains available if the server cannot start. Local import is the baseline: choose the `.vaultor.json` sidecar, keeping its named installer beside it. Import validates and copies the installer into main-owned staging; it does not execute immediately. Same-version reinstall is permitted; ordinary downgrades are rejected.

An optional HTTPS manifest URL enables in-app Check → Download → Install update. The feed defaults unset. Store the signed sidecar at that URL and the installer at its named sibling URL. Hosting/release publication is your separate choice; no service or fee is automatically configured. Checks are explicit, not periodic background polling. Downloads stream to disk with progress and cancellation; only verified complete files become Ready. Workspace credentials are never sent to the release feed. Redirects fail.

Signed envelope format:

```json
{
  "manifest": {
    "format": 1,
    "appVersion": "0.2.0",
    "platform": "win32",
    "arch": "x64",
    "filename": "Vaultor-0.2.0-windows-x64.exe",
    "size": 123456,
    "sha256": "<64 lowercase hexadecimal characters>",
    "minimumProtocol": 1
  },
  "signature": "<base64 Ed25519 signature of JSON.stringify(manifest)>"
}
```

Mac uses platform darwin, arch arm64 and .dmg. Stable three-part versions, platform/architecture, protocol, conservative filename, signed size, checksum and original public key must match. Manifest limit: 16 KiB. Installer limit: 1 GiB. Check timeout: 15 seconds; download timeout: 10 minutes. Staging/backup requires its expected bytes plus 256 MiB spare; this is a preflight, not a guarantee against later disk exhaustion. Concurrent update execution is rejected. Failure preserves entered preferences and exposes retry; partial downloads are removed.

## Installation and recovery

Install requires native confirmation explaining host-client interruption. The same safe-Quit barrier flushes notes/settings/recovery/session state and refuses conflicting native file or mutation work. Main freezes new work, withdraws discovery, cancels transports and gracefully stops its owned server. A server with active transfers may refuse shutdown. Only after stop does main inventory/copy the local workspace, including SQLite, binaries, operation journals and host trust/device verifiers. Symlinks/special files and more than 100,000 files fail explicitly.

Hash manifest, retained package records and an update journal live under the app's updates directory. At most two package versions and two completed backup directories are normally retained; a journal-referenced previous package is protected from ordinary pruning. Failed partial backup staging can remain for manual inspection. Restore-preserved workspaces are intentionally not automatically deleted. Client preferences, protected credentials, login settings and IndexedDB drafts remain in place, outside server snapshots. Host backups include private trust material; never publish them or put them into portable archives.

Windows launches the verified installer with its ordinary installer UI and quits; complete installation and reopen Vaultor. Mac opens the verified DMG and quits; replace the app manually and reopen it. No automatic app restart or unattended Mac replacement is claimed. On a matching-version managed-local server startup, the journal is confirmed. Connecting only to a remote server does not confirm a local migration. Client-only updates never alter a remote workspace.

If local startup fails, Updates → recovery Details → Restore local backup is still reachable. Explicit confirmation and another save/stop barrier precede restore. Backup hashes and complete file inventory are checked; data is copied fully before swapping directories. Current local data is preserved in a separate `.before-recovery-<id>` directory. A retained previous installer is signature/checksum verified again before it opens; if unavailable/damaged, reinstall your original package manually. Restore does not roll back client drafts/preferences or remote servers. Atomic rename journals do not guarantee survival of every abrupt disk/power failure.

If preparation fails after stopping the host, reconnect/start This computer explicitly; no ambiguous mutation is replayed. For damaged journals, keep the updates/backups and preserved directories, quit the app, make independent copies, and inspect the manifest before manual recovery. Never overwrite a running SQLite workspace. Server schema management remains Hibernate ddl-auto=update, not a new migration framework.

## Validation

D8 focused tests cover signatures/platform/path/size/protocol rejection, package corruption, persisted staging, save-before-stop, snapshot trust/data, migration-failure recovery, damaged backup rejection, optional feed credentials/redirect policy, retention and client-only isolation. Executable branding checks compare embedded PE icon data against the canonical ICO. Frontend checks cover update dialog operation outside SettingsProvider and existing connection/settings flows. Windows installation/same-version repair/uninstallation/reinstallation, branded developer/installed native checks and actual packaged PE icon comparison passed. The Updates screenshot was inspected. Initial taskbar API and renamed-developer runtime-layout failures were corrected. Exact results and remaining validation are recorded in [the tracker](desktop-network-plan.md).

`powershell -NoProfile -File desktop/scripts/installer-smoke.ps1` refuses to run if Vaultor is already installed. It also refuses existing Vaultor shortcuts. It uses a temporary install directory and disposable native workspace, exercises install/same-version repair/uninstall/reinstall, then uninstalls its test copy. It does not claim a different-version OS upgrade, real HTTPS publishing, real OS taskbar cache inspection or Mac verification. No routine Docker or broad API smoke is required.
