# D9: Mac mini and two-device completion handoff

Prepared 2026-10-04 for the AI working on the user's Apple Silicon Mac mini. This is the remaining D9 validation, not a new feature sprint. Read AGENTS.md, CODEBASE.md and desktop-network-plan.md first; UPDATES.md, DESKTOP.md, HOST-ACCESS.md and MULTI-DEVICE.md are authoritative. Inspect the current tree and preserve unrelated work. Windows D9 work corrects Connections layout, packages 0.2.1 and supplies an isolated manual-test data directory; the recorded Mac D9 development checks used 0.2.2; the current 0.4.0 settings/images/motion release handoff is below. Do not declare the overall Windows/Mac release gate complete until the checks below actually pass.

## Boundaries and preparation

- No payment, publisher signing, notarization, Android or Ubuntu implementation. GitHub publication of verified artifact pairs is authorized under RELEASE-PROCESS.md; preserve the original source/signing identity. No broad redesign. Fix defects found in these flows and maintain living docs in the same change.
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

The desktop `ci` install runs Electron's `install-electron` binary in its `postinstall` lifecycle so the native executable is present; installing only the Electron npm package may leave `electron` unavailable.

prepare-server chooses the pinned darwin-arm64 Temurin runtime and verifies checksums, then builds the bundled Spring JAR/browser assets. Preserve runtime legal notices. If signing/build fails, repair the actual source/configuration and repeat only the affected check. Package expectations: Vaultor.app, an ad-hoc signature, bundled runtime/server and Vaultor-0.2.2-mac-arm64.dmg plus its signed .vaultor.json. Verify `codesign --verify --deep --strict --verbose=2` against the actual generated app path and inspect its Info.plist executable/architecture. Do not claim notarization. Record installer and unpacked sizes.

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

Post-D9 0.2.2 correction to verify on the real pair: stop the remote Mac host, then switch a clean Windows client to This computer without needing a manual keep-drafts override. Repeat with an unsaved note/title: require Keep drafts and switch and verify the original profile's recovery survives relaunch. Settings/storage failures and known active transfers must still block as documented. Fresh profiles have no automatic localhost:8080 entry; old independent server entries are retained and labeled separately. Build current 0.2.2 sources on Mac; the Windows 0.2.1 baseline above is historical actual validation, not a Mac package claim.

## Mac 0.2.2 development results and remaining gate (2026-10-04)

Verified environment: macOS 27.0.1, Apple Silicon arm64, Node 22.16.0/npm 10.9.2, Temurin Java 25, Electron 44.5.1, Chrome 152.0.7977.83 and Safari 27.0.1; Xcode command-line tools are installed. A private IPv4 address was present, but no real LAN/two-device test was conducted and the address is deliberately not recorded here.

Passed on this checkout: `npm --prefix desktop ci` (including native Electron executable installation), `npm --prefix desktop run build`, `npm --prefix desktop run prepare-server`, `npm --prefix desktop run check`, 14 focused desktop network/file/update tests and five focused `workspaceDeparture` tests. Backend tests are skipped by `prepare-server`; no full backend suite is claimed. The disposable 0.2.2 `package:dev` app at `desktop/packages/darwin-arm64-1791107186161/Electron.app` is arm64 and its ad-hoc Electron.app signature verified. The package occupies 629,944 KiB; this is a development Electron.app size, not a Vaultor release app or DMG size. Native owned-server smoke passed launch, edit/save, PDF preview and relaunch with Java removed from PATH. Native chrome smoke passed Connections layout, theme, credential-storage, default-sharing and window-control assertions. Dark/light/narrow frames in ignored `desktop/artifacts` were generated and reviewed. No user workspace was used.

Current bundled server manifest SHA-256: `ac3c804ecce03ab4c54fdbb1da0149dd2e6bc17e9a13d4da27b7a92142338e26`; server JAR SHA-256: `5ff50348264d6abdfca745bcc7a9b2b4a65f598335838c4c22b45342fe69894b`. These are bundle hashes, not release installer checksums.

Release is blocked: the matching private key was absent at the ignored release-key location and `VAULTOR_RELEASE_KEY` was unset. `package:release` was attempted and stopped at the missing key; no replacement key was generated, rotated or copied. No signed `.vaultor.json` or release DMG exists. Obtain the matching key privately from the user before retrying; never paste it into chat. macOS frontend install reported Node-engine warnings and 24 audit findings (2 low, 4 moderate, 18 high); no audit fix or dependency/version change was made.

Still unverified and required before D9 completion: release package and signed sidecar, Finder/DMG installation and normal Gatekeeper approval, manual titlebar/menu-bar/tray/shortcut/close-to-tray interactions, Mac update/recovery, login/sleep-resume and cleanup, separate browser trust, LAN/mDNS/firewall validation, and one coordinated Windows↔Mac session in both hosting directions. Automated smoke success does not substitute for these manual and partner checks. Preserve this partial status; do not mark D9 complete.


## 0.3.0 Windows-first browsing release: exact Mac delivery

Windows 0.3.0 ships first. No 0.3.0 Mac artifact/native verification is claimed. The matching private key and arranged native access remain required; earlier 0.2.2 development checks do not certify this version.

1. Read AGENTS/CODEBASE, inspect unrelated work, fetch origin/tags, and create a clean detached checkout of **v0.3.0**. Do not bump versions or move the tag.
2. Privately obtain the original key as described above; never regenerate it or upload it. Verify arm64, Java25 and Node20.19+; install frontend/desktop dependencies.
3. Set VITE_BUILD_VERSION and BUILD_VERSION to 0.3.0. Build frontend/desktop, prepare the pinned darwin-arm64 server/runtime, and package:release on the Mac. Expected pair: Vaultor-0.3.0-mac-arm64.dmg and .dmg.vaultor.json.
4. Run the focused frontend browsing tests and scoped lint, SidebarSettingsTest, release-artifact/publication-policy tests. Verify codesign against the generated Vaultor.app. Use disposable native/storage profiles, not the user's installation.
5. Run `VAULTOR_LAYOUT_SMOKE=1 node desktop/scripts/chrome-smoke.mjs "<absolute packaged Vaultor executable>"`. This focused session creates temporary API fixtures with its owned access key and checks empty/sparse/paginated groups, mixed pins, both themes, long titles, narrow layout, collapse/hide/defaults, Escape/focus and control clearance. Inspect the eight ignored desktop/artifacts/browse-*.png frames. Run the existing owned launch/edit/relaunch check only where needed for the Mac package. Finish Finder/Dock/menu-bar/tray/keyboard/install/update approval checks above; report actual results.
6. Preflight with publish:release, then add the missing pair with `npm --prefix desktop run publish:release -- --publish --add-platform --notes docs/desktop/releases/v0.3.0.md`. This must use the same v0.3.0 source. Existing Windows assets and signing identity are immutable; identical retries are safe, differing bytes fail.
7. Verify both uploaded Mac assets, update GitHub release notes with the actual Mac checks/platform availability, and make a documentation-only follow-up commit updating current guides/tracker. If code repairs are required, stop this same-version handoff and prepare a new version instead.

The Windows-first release is https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/v0.3.0. Update the host as well as clients to persist the new sidebar preferences; 0.2.2 hosts still normalize unknown device fields away. Browser UI follows its host build. Ubuntu/Mac Intel/Android packages remain deferred.

## 0.3.1 mixed browsing release: exact Mac delivery

For the historical mixed-browsing delivery use immutable **v0.3.1**. Current OLED delivery is v0.3.2 below. Fetch the tag and use a clean detached checkout. Preserve the original signing key and source version. Set BUILD_VERSION/VITE_BUILD_VERSION=0.3.1, install dependencies, run desktop build/prepare-server/package:release natively on arm64. Expected pair: Vaultor-0.3.1-mac-arm64.dmg and .dmg.vaultor.json.

Run the focused eight frontend files listed in the 0.3.1 release notes, scoped lint, MixedBrowseTest and SidebarSettingsTest. Run VAULTOR_LAYOUT_SMOKE=1 with chrome-smoke against the packaged Vaultor executable and inspect the eight frames. This version checks mixed ordering, filtered 100-item paging, bounded searchable type controls, both themes/narrow layouts, sidebar collapse/hiding and keyboard focus. Complete the manual Finder/Dock/tray/install/update checks above using disposable data; prior 0.2.2 native results do not certify 0.3.1. Use private matching-key transfer, never Git/chat.

After actual native verification, preflight and publish the absent platform pair using `npm --prefix desktop run publish:release -- --publish --add-platform --notes docs/desktop/releases/v0.3.1.md` from that exact tag. Verify uploaded bytes; preserve the Windows pair/tag. Record actual Mac availability/results in release notes and a documentation-only follow-up commit. If a runtime fix is necessary, prepare a higher version instead of changing tagged artifacts. Update a Mac host too for new sidebar type persistence/pin filtering.

### Exact 0.3.1 Mac commands

Use a separate clean checkout and keep the private key outside it:

```sh
git fetch origin --tags
git worktree add --detach ../vaultor-0.3.1 v0.3.1
cd ../vaultor-0.3.1
npm --prefix frontend ci
npm --prefix desktop ci
export VITE_BUILD_VERSION=0.3.1
export BUILD_VERSION=0.3.1
export VAULTOR_RELEASE_KEY="/absolute/private/path/to/original-private.pem"
npm --prefix desktop run build
npm --prefix frontend test -- src/components/LibraryView.test.tsx src/components/OrganizationViews.test.tsx src/components/SidebarSections.test.tsx src/components/ResourceTypeFilter.test.tsx src/lib/sidebarPreferences.test.ts src/lib/paneNavigation.test.ts src/components/modals/CommandPaletteModal.test.tsx src/lib/navigationRefresh.test.tsx
(cd backend && ./mvnw '-Dtest=MixedBrowseTest,SidebarSettingsTest' test)
npm --prefix desktop run prepare-server
npm --prefix desktop run package:release
codesign --verify --deep --strict --verbose=2 desktop/releases/mac-arm64/Vaultor.app
VAULTOR_LAYOUT_SMOKE=1 node desktop/scripts/chrome-smoke.mjs "$PWD/desktop/releases/mac-arm64/Vaultor.app/Contents/MacOS/Vaultor"
npm --prefix desktop run publish:release
```

Inspect desktop/artifacts/browse-*.png and complete the manual platform checks before the authorized missing-platform upload command above. Native version/runtime/signature and actual checks must match this tagged source. Do not merely upload a development app. If key/native access or a check fails, retain the missing-platform status and report the specific blocker.

## 0.3.2 OLED: current same-tag Mac handoff

Use a clean detached worktree at immutable v0.3.2. Obtain the original matching private key privately as documented above; never rotate it or publish it. On the Apple Silicon Mac run:

```sh
git fetch origin tag v0.3.2
git worktree add --detach ../vaultor-0.3.2 v0.3.2
cd ../vaultor-0.3.2
export BUILD_VERSION=0.3.2
export VITE_BUILD_VERSION=0.3.2
export VAULTOR_RELEASE_KEY="<private original-key path>"
npm --prefix frontend ci
npm --prefix desktop ci
npm --prefix desktop run build
(cd frontend && npx vitest run src/lib/settings.test.tsx src/components/editor/ResourceLinkMenu.test.tsx src/components/modals/CommandPaletteModal.test.tsx)
(cd backend && ./mvnw -Dtest=SidebarSettingsTest test)
npm --prefix desktop run prepare-server
npm --prefix desktop run package:release
codesign --verify --deep --strict --verbose=2 desktop/releases/mac-arm64/Vaultor.app
VAULTOR_OLED_SMOKE=1 node desktop/scripts/chrome-smoke.mjs "$PWD/desktop/releases/mac-arm64/Vaultor.app/Contents/MacOS/Vaultor"
npm --prefix desktop run publish:release
npm --prefix desktop run publish:release -- --publish --add-platform --notes docs/desktop/releases/v0.3.2.md
```

Inspect all OLED frames, then verify Finder/Dock/menu-bar/window controls, install and manual updater import with disposable data. Record real Mac results, same-tag DMG/sidecar hashes and update-host requirements. Preserve Windows bytes/tag. This is an ad-hoc personal build, not notarized. If source repairs are necessary, release a higher version rather than rewriting this tag. Existing 0.2.2 Mac results do not certify 0.3.2. Physical OLED testing is separately dependent on the display.

## 0.4.0 — exact same-tag Mac completion

Windows-first publication is authorized. No native Mac packaging, clipboard/pointer, keychain, DMG update or two-device verification is claimed from Windows. Read the release notes at `docs/desktop/releases/v0.4.0.md` and check out **v0.4.0**, never a later master snapshot. Preserve package/lock version 0.4.0 and the original Ed25519 public identity. Obtain its matching private key privately as described above; do not regenerate trust.

On the Apple Silicon Mac, from the repository root:

```sh
git fetch origin --tags
git checkout --detach v0.4.0
uname -m
node --version
java -version
xcode-select -p
npm --prefix frontend ci
npm --prefix desktop ci
export VITE_BUILD_VERSION=0.4.0
export BUILD_VERSION=0.4.0
# Set VAULTOR_RELEASE_KEY to the privately transferred matching key, outside Git.
npm --prefix desktop run build
npm --prefix desktop run prepare-server
npm --prefix desktop run check
npm --prefix frontend test -- src/lib/motion.test.ts src/lib/useRestoreFocusOnClose.test.tsx src/components/modals/SettingsModal.test.tsx src/lib/noteImages.test.ts src/components/editor/BlockEditor.images.test.tsx src/lib/sharedNoteDocuments.test.ts
node --test desktop/test/files.test.mjs desktop/test/updates.test.mjs
npm --prefix desktop run package:release
codesign --verify --deep --strict --verbose=2 desktop/releases/mac-arm64/Vaultor.app
VAULTOR_MOTION_SMOKE=1 node desktop/scripts/chrome-smoke.mjs "$PWD/desktop/releases/mac-arm64/Vaultor.app/Contents/MacOS/Vaultor"
npm --prefix desktop run publish:release
```

Use disposable app/server storage for the native helper; it exercises settings themes/search/resets, OS clipboard image paste/copy, saved session reload, Smooth/Snappy feedback, palette keyboard actions, source focus, reduced motion and narrow OLED. Inspect the fourteen resulting `desktop/artifacts` captures. If native shortcut or helper assumptions differ on macOS, establish the actual behavior before changing assertions; changes affecting shipped code need a newer version, not moved 0.4.0 source/tag.

Perform one manual Mac session: clipboard screenshot paste, drop multiple images, shared two-pane undo/resize, native clipboard copy, image previews, menu/tray/Dock/dragging, Cmd-based controls, ad-hoc signed DMG launch and update from a disposable previous installation. Verify original image bytes and PDF/Word first-frame/caption output on disposable data. Preserve the user's installation/data. Record exact Mac OS/CPU/tool versions, SHA-256/bytes, test outcomes and any failure.

Both hosts and clients now require API protocol 2. Update the host to 0.4.0 before connecting updated clients; old clients are intentionally rejected, with no silent image stripping. Coordinate one Windows/Mac LAN session for compatibility rejection, paired reconnect, duplicate-view edits/conflicts and export; loopback does not prove Wi-Fi or OS trust.

Only after these gates pass, upload the missing original-key Mac pair:

```sh
npm --prefix desktop run publish:release -- --publish --add-platform --notes docs/desktop/releases/v0.4.0.md
```

The helper preserves existing Windows assets and the source tag, accepting identical retries and refusing differing bytes. It does not edit publication notes/status. Then update GitHub notes with actual Mac results/availability; update living docs in a separate documentation-only commit. Never claim Windows-only publication updates a Mac host.


## 0.4.1 — update transport and remaining Mac one-click gate

Windows 0.4.1 adds default GitHub discovery/internal downloads and a verified silent NSIS handoff/relaunch. Macs receive platform-filtered automatic downloads, but still explicitly open a DMG for manual replacement. Standard Electron macOS auto-update requires its supported signing setup; our personal ad-hoc/no-payment constraint does not permit pretending that path is verified. No automatic Mac helper is enabled or published in this Windows delivery.

For the Mac AI: fetch/check out immutable **v0.4.1**, build fresh UI/server with VITE_BUILD_VERSION/BUILD_VERSION=0.4.1, preserve original trust/private key, and follow the exact build/native/package/add-platform steps above with version 0.4.1. Include `node --test desktop/test/github-updates.test.mjs desktop/test/updates.test.mjs desktop/test/update-handoff.test.mjs`, frontend DesktopUpdates tests and a native Mac check of platform-specific release discovery, download, DMG handoff, credential isolation and startup state. A Windows-only GitHub release must never supply its EXE to a Mac. Publish a verified same-tag Mac pair through --add-platform only if all native gates pass; do not move existing source/tag/assets.

To complete **one-click Mac replacement**, arrange native access and implement a separately authorized subsequent release: a helper must survive parent exit, use original-key/hash verification, mount only the verified artifact, check bundle identity/version/architecture/ad-hoc signature, retain the old application, replace only an owned writable installation atomically, preserve data, relaunch and recover/report interrupted replacement. Test paths with spaces, running processes, permission/quarantine prompts, partial copies, failure rollback and no security-policy changes on disposable Mac installations. Do not enable that capability merely from Windows unit tests. Record the actual OS approval flow rather than bypassing Gatekeeper or trust. The user owns an Apple Silicon Mac mini; native access/key transfer is currently unavailable here.
