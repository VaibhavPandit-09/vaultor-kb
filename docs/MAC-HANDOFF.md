# D9: Mac mini and two-device completion handoff

Prepared 2026-10-04 for the AI working on the user's Apple Silicon Mac mini. This is the remaining D9 validation, not a new feature sprint. Read AGENTS.md, CODEBASE.md and desktop-network-plan.md first; UPDATES.md, DESKTOP.md, HOST-ACCESS.md and MULTI-DEVICE.md are authoritative. Inspect the current tree and preserve unrelated work. Windows D9 work corrects Connections layout, packages 0.2.1 and supplies an isolated manual-test data directory. Do not declare the overall Windows/Mac release gate complete until the checks below actually pass.

## Boundaries and preparation

- No payment, publisher signing, notarization, publishing, Android or Ubuntu implementation. No broad redesign. Fix defects found in these flows and maintain living docs in the same change.
- Use disposable server data and browser profiles. Do not import, replace, delete or pair against the user's real workspace. Quit the user's normal Vaultor deliberately before a native test; do not kill arbitrary Java processes.
- Get the latest repository including D9 changes from Windows. Do not copy Windows desktop/bundle, node_modules or packaged executables to Mac as runnable Mac artifacts. Ignored build directories are machine-specific.
- Record macOS version, `uname -m` (must be arm64), Node/npm, Java, Electron version, browser versions, LAN addresses, package checksum and exact test results. Do not print owner keys, device credentials, private certificates, recovery note bodies or the private release signing key.
- Coordinate with the user/Windows AI for the one real two-device session. Loopback hosts on one machine do not prove Wi-Fi, mDNS, macOS keychain, browser trust or Windows Firewall behavior.

Prerequisites: free Node 20.19+ (24 works), build JDK 25, Apple's command-line developer tools and this checkout. Check `node --version`, `java -version`, `xcode-select -p`. If missing, explain the required free prerequisites and install through the user's usual method. The installed app must later work without Java on PATH; build JDK is only for building. Use the checked-in Maven wrapper, not an invented global Maven dependency.

The checkout contains desktop/release-trust.json. Obtain the **matching private release key** from the user's ignored Windows desktop/cache/release-signing/private.pem over a private transfer. Keep it outside Git with owner-only permissions and set VAULTOR_RELEASE_KEY to its absolute path. Never paste it into chat. `release:key` intentionally refuses to regenerate a mismatched key. If unavailable, document the blocker; do not silently rotate trust or publish an unsigned update manifest.

## Build and bounded automated checks

Run from the repository root:

```sh
npm --prefix frontend ci
npm --prefix desktop ci
npm --prefix desktop run build
npm --prefix desktop run prepare-server
npm --prefix desktop run check
node --test desktop/test/network.test.mjs desktop/test/files.test.mjs desktop/test/updates.test.mjs
npm --prefix desktop run package:release
```

prepare-server chooses the pinned darwin-arm64 Temurin runtime and verifies checksums, then builds the bundled Spring JAR/browser assets. Preserve runtime legal notices. If signing/build fails, repair the actual source/configuration and repeat only the affected check. Package expectations: Vaultor.app, an ad-hoc signature, bundled runtime/server and Vaultor-0.2.1-mac-arm64.dmg plus its signed .vaultor.json. Verify `codesign --verify --deep --strict --verbose=2` against the actual generated app path and inspect its Info.plist executable/architecture. Do not claim notarization. Record installer and unpacked sizes.

Run native checks against the generated app executable, using its actual path (electron-builder normally outputs desktop/releases/mac-arm64/Vaultor.app/Contents/MacOS/Vaultor):

```sh
node desktop/scripts/owned-smoke.mjs "<absolute generated app executable>"
node desktop/scripts/chrome-smoke.mjs "<absolute generated app executable>"
```

These own disposable data, exercise bundled Java, launch/edit/relaunch, native PDF display, OS-protected credential storage, Connections layout/themes/narrow width and window controls. Review the generated ignored desktop/artifacts frames. Do not run native sessions concurrently. Programmatic Mac clicks are not proof that titlebar dragging/menu-bar/tray hit testing works: check those once manually. If an existing smoke assertion is Windows-specific or outdated, fix the assertion only after confirming the real behavior, and record the correction.

Install the DMG manually into a disposable installation location; don't replace the user's production app without agreement. Check Finder launch, app icon, Dock identity, monochrome menu-bar icon, Cmd-based shortcuts, minimize/maximize/close, close-to-tray and explicit Quit. Use macOS's normal approval for a known unsigned personal build; never disable Gatekeeper globally. Capture the exact approval steps actually required.

## Isolated manual session on each machine

Create an empty, absolute directory. VAULTOR_DESKTOP_TEST_DIRECTORY overrides Electron app data without launching an automatic smoke. It isolates profiles, local server, sessions, protected client credentials and update staging. The directory must already exist. Do not set the automatic VAULTOR_*_SMOKE_DIRECTORY variables for manual use.

Mac example:

```sh
task_data="$(mktemp -d /tmp/vaultor-d9-mac.XXXXXX)"
VAULTOR_DESKTOP_TEST_DIRECTORY="$task_data" "<absolute Vaultor.app/Contents/MacOS/Vaultor executable>"
```

Windows partner example (PowerShell):

```powershell
$taskData = Join-Path $env:TEMP ('vaultor-d9-windows-' + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $taskData | Out-Null
$env:VAULTOR_DESKTOP_TEST_DIRECTORY = $taskData
& 'C:\GitDev\vaultor-kb\desktop\releases\win-unpacked\Vaultor.exe'
```

Use the same test directory on relaunch. Clear that shell environment variable before launching the normal user app. No login startup is enabled by these commands. Test startup registration only in a disposable OS account or explicitly coordinate its enable/disable with the user, confirm restoration and report what really happened. Background-login launches do not inherit a terminal-only isolation variable.

## One coordinated two-device session

Make a small disposable fixture: two linked notes A → B → A, a third note, a table, a CSV, a PDF/image and one collection/tag. Use unique D9 titles; no real user notes. Then:

1. On Windows enable sharing in Hosting. Record host ID/fingerprint and private HTTPS address. Confirm Nearby discovers it on Mac; also exercise manual address entry. Compare the same six-digit code and approve Mac desktop. Relaunch the Mac test app and reconnect without repeat pairing. Switching to Windows must keep Mac's local host ownership independent.
2. Using an isolated browser profile on Mac, export/transfer only the Windows host's **public** certificate. Compare its fingerprint. Install trust through normal Keychain/browser controls and approve that browser separately. Verify resource load and a mutation, ordinary request IDs/logs, reconnect and browser independence from desktop approval. Do not bypass TLS warnings.
3. Reverse roles: Mac hosts; Windows desktop and isolated browser pair separately. Document actual private-interface reachability, mDNS/manual fallback, Windows Private-network firewall and macOS incoming-connection steps. Never publish the HTTP owner listener to LAN, forward router ports or enable Internet access.
4. From both clients edit saved notes/settings/collection membership. Verify saved changes reconcile in the other client while a dirty draft stays intact. Make a deliberate same-note stale revision conflict: retain both versions, recover a separate copy, and verify no silent overwrite. Test deletion and one disposable workspace replacement; old drafts must remain isolated recovery copies.
5. Revoke one test client. Its stream/API must fail while other approved clients continue. Reapprove deliberately. Refresh the host's address certificate and restart host/app; stable approvals remain. Change address if feasible, or mark real-address-change coverage pending rather than simulating success. Sleep/resume once with the partner aware: host unavailable during sleep, then reconnect without mutation replay. Test incompatible-server feedback using a disposable fixture, not by downgrading the user's actual server.
6. Check linked note in-place navigation, Ctrl/Cmd-click split/pane limit, duplicate-note shared editing/undo, Alt+Arrow pane switching, preview dismissal/focus and session relaunch. Check native upload, Markdown/PDF export/save cancel/retry and PDF preview. Begin an export while editing/switching and verify operation ownership does not download from the wrong host. Check a failed save blocks an ordinary switch; Keep drafts is explicit and recoverable.
7. One focused visual session: Connections and Hosting in both themes/narrow width, reduced motion, keyboard Tab/Shift+Tab/Enter/Escape/focus restoration, journey trail and table expanded/in-note controls. Do not repeatedly explore unrelated UI.

Afterward disable sharing for these fixtures, revoke test clients, remove only the test host certificates from the stores where installed, close isolated browsers and quit both test apps. Preserve data/results until reviewed. Do not recursively delete any computed path unless it is verified inside the named test directory; never remove a real OS trust store or user workspace.

## Update/recovery and release gate

Test local signed-package import and one native update handoff using disposable storage. Optional HTTPS feed can remain unset; no publishing is authorized. Mac Install must save/recover, stop owned hosting, create a verified backup, open the DMG and quit. Replace the test app manually and reopen with the same test directory. It must not promise unattended installation. Verify approvals/preferences/drafts survive, local startup confirms the journal and connecting only to a remote host does not alter that host. Corrupt signature/platform/size/hash packages must remain non-executable; service tests cover these without repeated native dialogs.

For an actual different-version Mac upgrade/rollback, coordinate a separate locally built package/version using the **same release key**; don't rewrite a published tag or the user's existing package. Restore the pre-update disposable workspace after a seeded migration/startup failure and retain the displaced directory. Revalidate previous installer bytes before handoff; when no valid previous installer exists, show manual reinstall guidance. Windows 0.2.0 → 0.2.1 installer upgrade is checked in the Windows D9 work; that does not prove Mac update recovery. Record any missing prior Mac package as a remaining check, not a passed rollback.

Finish by updating desktop-network-plan.md, CODEBASE.md maintenance history, DESKTOP.md, UPDATES.md and this handoff with exact outcomes and defects/fixes. Keep API/platform/operations/host/session docs synchronized if behavior changes. Record output paths, OS/browser/build versions, package sizes and only non-secret diagnostic references. Mark D9 complete only when Windows/Mac release gates pass; otherwise distinguish completed implementation/Windows validation from remaining Mac/two-device checks. D10 Ubuntu requires separate authorization. No background documentation updater exists.

## Windows handoff baseline (actual results)

Windows build 10.0.26300.0, Node 24.18.1, npm 11.16.0, Electron 44.5.1. App 0.2.1 production compilation/scoped lint/syntax passed; 15 frontend and 14 Node network/file/update cases passed. A focused native session passed Connections row placement/dark/light/minimum desktop width, menu/window controls, OS theme and saved-change/deletion recovery. Three Connections frames inspected. The initial popup keyboard helper failure was corrected by not reactivating its parent; rerun passed. Windows disposable 0.2.0 → 0.2.1 installer upgrade/version checks/repair/uninstall/reinstall passed with existing shortcut bytes restored. Final installer: 259,369,342 bytes; unpacked: 736,533,442 bytes. This is not proof of Mac/LAN/OS browser trust/login/update-recovery handoff; those are the remaining gates above.
