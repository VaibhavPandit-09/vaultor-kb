# Personal installers and updates

Reviewed 2026-10-08. Windows x64 uses a per-user NSIS installer. On Apple Silicon, the 0.2.2 development app and disposable native smoke checks have been verified; release DMG generation/installation and the live two-device gate remain pending. The matching private release key is required to produce the signed update manifest and is not present on the Mac. No publisher certificate, notarization, subscription, hosted feed or publishing is required. Android and Ubuntu packaging are outside D8.

For device-by-device installation and updating, read [INSTALLATION-AND-UPDATES.md](INSTALLATION-AND-UPDATES.md). Agents own packaging/publication after app changes through [RELEASE-PROCESS.md](RELEASE-PROCESS.md); this document owns the updater integrity, backup and recovery contracts.

## Build and launch

Use Node 20.19+ (Node 24 works), Java 25 for building the server, and the checked-in Maven wrapper. Installed packages bundle their Java runtime and do not require Docker or installed Java. Windows builds on Windows x64; Mac builds on Apple Silicon macOS with Apple's free command-line developer tools. Do not cross-build and claim native verification.

```powershell
npm --prefix frontend ci
npm --prefix desktop ci
npm --prefix desktop run build
npm --prefix desktop run prepare-server
npm --prefix desktop run package:release
```

Run `release:key` only for initial identity setup before a public key exists. This checkout already contains the public key: use its matching private key on another machine; the command intentionally refuses to generate a mismatched replacement. It refuses automatic key replacement. The public key is committed in `desktop/release-trust.json`; the private Ed25519 key is ignored at `desktop/cache/release-signing/private.pem`. Keep a separate private backup and transfer it privately to the Mac to sign releases for the same installation family. `VAULTOR_RELEASE_KEY` can point at that private file. Losing the original key requires an explicit reinstall/trust migration; do not regenerate it casually. These application release signatures are free and are distinct from OS publisher signing.

Build verifies the bundled server/runtime and matching private/public key. Artifacts are in ignored `desktop/releases/`: `Vaultor-0.2.2-windows-x64.exe` or `Vaultor-0.2.2-mac-arm64.dmg`, plus a `.vaultor.json` sidecar. The script never publishes. The tested Windows 0.2.0 build measured 257,901,237 bytes for the installer (about 246 MiB) and 730,896,084 bytes unpacked (about 697 MiB); the bundled Chromium/JVM are substantial. Mac footprint has not been measured. Runtime legal notices are included in `resources/bundle/THIRD-PARTY.md` and runtime/legal; Electron, discovery dependencies and builder-generated license notices travel with the package. Electron-builder and resedit are development dependencies only.

For development, rebuild and use `npm --prefix desktop start`. Windows now launches an ignored, icon-stamped clone named Vaultor.exe instead of the npm Electron executable. Cache identity includes Electron version and icon checksum. The npm runtime is untouched. Portable `package:dev` snapshots also use Vaultor.exe on Windows; they are separate from installer/update releases.

Windows installer and installed executable carry the same Vaultor ICO as runtime window/tray branding. The application identity and relaunch shortcut details use `personal.vaultor.desktop`. Quit the old app before launching a refreshed build. An already pinned Electron shortcut can retain its old target/icon: unpin it and pin the running Vaultor executable or installed Vaultor shortcut. This does not justify clearing user data or Windows icon caches automatically.

Windows may display an unknown-publisher/SmartScreen prompt because the executable has no paid publisher signature. Verify the source and checksums before explicitly running your personal build. Mac ad-hoc signing does not imply Gatekeeper approval or notarization; approve the known local build through macOS's normal security controls. Do not globally disable OS protections. macOS DMG replacement is manual, not unattended updating.

## Existing workspaces

Connections & hosting → Bring an existing workspace offers two paths:

- Connect to an upgraded compatible server. Protected independent loopback HTTP servers require selecting their existing `owner.key` in a native dialog; main verifies access and keeps it in OS-protected credential storage. Existing local profiles have an Authorize action. Keys never enter renderer state. Remote hosts use the existing paired HTTPS flow.
- Export a workspace ZIP from the original server, select This computer, then review/import it through the existing merge/replace dialog. Destination capture is connection-epoch scoped; a failed switch cannot import into a different server. No database or host directory is silently adopted.

Current desktop connections require protocol 2 plus changeFeed/scopedSettings capabilities. Use [HOST-ACCESS.md](../security/HOST-ACCESS.md) for standalone/Docker owner bootstrap, HTTPS publication and pairing. Docker/browser hosting remains supported; the installer does not migrate, stop or delete those servers.

## In-app updates

Window menu → Updates checks for releases automatically on opening. Installed normal apps also perform one check 10 seconds after startup; there is no repeating polling loop. Blank custom feed means the public Vaultor GitHub repository, not an unconfigured updater. The API reads at most the latest 100 release records (2 MiB), ignores drafts/prereleases, and chooses the highest stable version with a complete uploaded pair for this OS/architecture. It does not depend on GitHub's global latest flag, so Windows-first releases do not offer a Windows installer to Macs. Missing platform pairs are skipped; a selected pair with invalid metadata/signature fails explicitly instead of falling back silently.

**Update and restart** on an installed Windows app downloads/verifies the package, saves notes/settings/recovery/session state, stops owned hosting, makes its verified backup, launches the helper, installs silently and relaunches. The button itself authorizes the interruption described beside it; there is no second native confirmation or installer wizard in this path. Downloads show progress/cancellation. Failure retains a verified package for retry without another download; incomplete downloads are removed. One apply action runs at a time. Editing remains available while downloading; preparation freezes further mutations. A remote server is never updated by a client update.

`github-updates.mjs` uses unauthenticated public API/asset requests, never host credentials/cookies. Initial assets must be under this repository's HTTPS release path; at most four redirects are allowed to exact GitHub release-asset hosts. HTTP, credentials, unexpected hosts/ports and excess hops are refused. Metadata limits, original Ed25519 trust, platform/version/size and streamed checksum checks remain authoritative. There is no paid feed/service or hosted private key. GitHub rate limits/offline failures remain visible with Retry.

Advanced retains manual import, custom HTTPS manifest source (blank restores GitHub), same-version repair and local backup recovery. A custom manifest/installer source still rejects redirects; only the built-in GitHub transport has its bounded host allowlist. Manual import verifies a signed .vaultor.json beside its named installer. Existing custom source preferences persist.

Automatic installation is enabled only for a packaged Windows x64 `Vaultor.exe` with its NSIS uninstaller in the existing directory. Development/portable installs and Macs download/verify through the same UI but explicitly open the installer after confirmation; they do not claim automatic replacement. Mac one-click replacement needs a separately verified native helper for the personal ad-hoc build and remains in MAC-HANDOFF.md. Existing 0.4.0 and older apps need one transition update to 0.4.1 before this workflow exists.

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

The sidecar minimumProtocol=1 describes the updater envelope/installer protocol, not the resource-editing API protocol. It deliberately remains 1 so existing 0.3.x apps can verify/import the 0.4.0 installer. The 0.4.0 client and host require resource API protocol 2; update both devices before reconnecting. No trust rotation is involved.

Hash manifest, retained package records and an update journal live under the app's updates directory. At most two package versions and two completed backup directories are normally retained; a journal-referenced previous package is protected from ordinary pruning. Failed partial backup staging can remain for manual inspection. Restore-preserved workspaces are intentionally not automatically deleted. Client preferences, protected credentials, login settings and IndexedDB drafts remain in place, outside server snapshots. Host backups include private trust material; never publish them or put them into portable archives.

Windows automatic handoff copies a bundled PowerShell helper into private update staging, writes paths/version/signed size/hash and parent PID/start time, and waits for readiness before quitting. A hidden Start-Process launcher gives the helper an independent process lifetime. It polls the exact parent's identity until exit (60-second bound), tolerating exit between identity checks, rechecks bytes, runs NSIS `/S --updated /currentuser /D=<existing directory>`, validates installed package version and relaunches Vaultor. No execution-policy or OS security settings are changed. Direct child/detached PowerShell launch and Wait-Process races failed disposable checks and were corrected. `handoff-status.json` records progress/failure; a failure attempts reopening to expose retry/recovery. No database rollback happens automatically. The app's existing save/backup/journal boundary remains before this handoff. Manual repair/unsupported installation fallback uses the ordinary installer. Mac still opens the verified DMG for manual app replacement; no unattended Mac replacement is claimed. On a matching-version managed-local server startup, the journal is confirmed. Connecting only to a remote server does not confirm a local migration. Client-only updates never alter a remote workspace.

If local startup fails, Updates → recovery Details → Restore local backup is still reachable. Explicit confirmation and another save/stop barrier precede restore. Backup hashes and complete file inventory are checked; data is copied fully before swapping directories. Current local data is preserved in a separate `.before-recovery-<id>` directory. A retained previous installer is signature/checksum verified again before it opens; if unavailable/damaged, reinstall your original package manually. Restore does not roll back client drafts/preferences or remote servers. Atomic rename journals do not guarantee survival of every abrupt disk/power failure.

If preparation fails after stopping the host, reconnect/start This computer explicitly; no ambiguous mutation is replayed. For damaged journals, keep the updates/backups and preserved directories, quit the app, make independent copies, and inspect the manifest before manual recovery. Never overwrite a running SQLite workspace. Server schema management remains Hibernate ddl-auto=update, not a new migration framework.

## Validation

D8 focused tests cover signatures/platform/path/size/protocol rejection, package corruption, persisted staging, save-before-stop, snapshot trust/data, migration-failure recovery, damaged backup rejection, optional feed credentials/redirect policy, retention and client-only isolation. Executable branding checks compare embedded PE icon data against the canonical ICO. Frontend checks cover update dialog operation outside SettingsProvider and existing connection/settings flows. Windows installation/same-version repair/uninstallation/reinstallation, branded developer/installed native checks and actual packaged PE icon comparison passed. The Updates screenshot was inspected. Initial taskbar API and renamed-developer runtime-layout failures were corrected. Exact results and remaining validation are recorded in [the tracker](../plans/desktop-network-plan.md).

`powershell -NoProfile -File desktop/scripts/installer-smoke.ps1` refuses to run if Vaultor is already installed. It also refuses existing Vaultor shortcuts unless -PreserveShortcuts explicitly backs up and restores their exact bytes, even after failure. It uses a temporary install directory and disposable native workspace, exercises install/same-version repair/uninstall/reinstall, then uninstalls its test copy. It does not claim a different-version OS upgrade, real HTTPS publishing, real OS taskbar cache inspection or Mac verification. No routine Docker or broad API smoke is required.

D9 packages app version 0.2.1 for the revised connection menu. MAC-HANDOFF.md owns the remaining Mac build/native/upgrade/recovery verification; current Mac artifact names describe expected output, not a produced/verified DMG. Windows current artifact/native results are in the desktop tracker.

D9 Windows validation: final 0.2.1 installer is 259,369,342 bytes (~247 MiB), unpacked build 736,533,442 bytes (~702 MiB). Actual 0.2.0 → 0.2.1 upgrade, version checks, repair/uninstall/reinstall passed using disposable storage and preserved shortcuts. The same packaged native app passed its separate dark/light/narrow/menu/window/saved-change session; SkipNative avoided rerunning that UI session inside the final installer check. No Mac package was built here.

## What counts as an update and how to manage releases

An update is an explicitly built application release with a higher stable desktop/package.json version, the correct OS/architecture, original release-key signature and matching installer checksum. Note edits, workspace imports, Git commits and source changes do not by themselves update an installed app. A local import can reinstall the same version; discovery reports an available update only for a strictly higher version. A normal installed startup checks once, and opening Updates checks again. Downloads/installation require the user's update action; there is no repeating polling or unattended installation.

Agents follow [RELEASE-PROCESS.md](RELEASE-PROCESS.md) for versioning, native builds, original-key verification, source tags and GitHub draft/publication. `publish:release` is a dry-run preflight by default; `--publish` stages verified pairs in a draft without changing the original identity or overwriting released bytes. Explicit `--add-platform` can add a missing native pair to the same published tag and reuse identical assets; different bytes are refused. App-facing changes require release handoff; documentation-only changes do not. Missing platform access/key/native checks remain explicit blockers.
Normal Windows use from 0.4.1 is window menu → Updates → Update and restart. Public GitHub release assets are fetched and verified internally. For local/offline distribution, transfer the installer and its `.vaultor.json` together and use Advanced → Import update manually. Same-version repair remains explicit. Unsupported automatic installation opens the ordinary installer or DMG. Running a known installer directly bypasses the in-app pre-update backup flow; fully quit Vaultor first.

Optional custom source: host each platform's signed manifest and named sibling installer at an HTTPS URL and configure that manifest URL under Advanced. Blank restores GitHub discovery. Custom feeds reject redirects; bounded allowlisted redirects are supported only for public GitHub assets. Uploading a higher version's verified platform pair enables discovery; a Git push alone does not. OS/version/signature mismatches fail rather than installing.

Manage each device independently. Updating a Windows client updates that app and its bundled local server; it does not update or back up the remote Mac server. The Mac host has its own update and local backup. Compatibility is checked on connection. Client preferences/approvals/drafts remain in place; host downtime during update is expected. Standalone/Docker deployments have their own image/JAR deployment workflow, not this desktop installer feed. See MAC-HANDOFF.md for the outstanding Mac/two-device gates.


0.3.0 is a Windows-first grouped-browsing update. Mac delivery remains pending at the same source tag; update a host to 0.3.0 to persist sidebarSections device settings. Full update/platform instructions and actual release validation are in [v0.3.0 notes](releases/v0.3.0.md).


The prior 0.4.0 Windows release is published and original-key verified; use [the installation guide](INSTALLATION-AND-UPDATES.md). Both host and clients require API protocol 2 for managed images, while the signed sidecar retains updater envelope minimumProtocol 1 for upgrading existing apps. Mac 0.4.0 remains unavailable until same-tag native verification/publication. That older app requires a transition install/import to gain the 0.4.1 one-click Windows workflow.


0.4.1 verification/publication results are recorded in the tracker and versioned release notes. The new targeted `oneclick-smoke.ps1` refuses a real installed Vaultor, preserves existing shortcut bytes and uses a temporary installation/profile. It exercises the original-key verified silent helper upgrade and real relaunch/server readiness without modifying a production workspace.
