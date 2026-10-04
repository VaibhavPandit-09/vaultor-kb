# Desktop setup and troubleshooting

Reviewed 2026-10-04. These notes cover the desktop install/build errors reported during the 0.2.2 Mac handoff. Run commands from the repository root unless noted. For the full Mac validation record and remaining D9 gates, see [MAC-HANDOFF.md](MAC-HANDOFF.md).

## Missing `package.json` at the repository root

The repository intentionally has no root `package.json`; `npm run build` from the root therefore fails with `ENOENT`. Frontend and desktop packages live in separate directories. Install/build through their package prefixes:

```sh
npm --prefix frontend ci
npm --prefix desktop ci
npm --prefix desktop run build
```

The desktop build compiles the frontend and copies its output into the desktop app. To prepare the bundled Java/server runtime as well, run:

```sh
npm --prefix desktop run prepare-server
```

## `electron: command not found` or `Cannot find package 'resedit'`

Desktop dependencies belong to `desktop/`, not the repository root. A missing Electron executable or `resedit` import means the desktop install is incomplete or its lifecycle scripts did not run. Install the lockfile dependencies from the repository root:

```sh
npm --prefix desktop ci
npm --prefix desktop exec -- electron --version
```

The desktop package now runs Electron's `install-electron` binary in its `postinstall` lifecycle. This specifically installs the native executable that was missing after a clean npm install; `resedit` is installed from the same desktop lockfile. Do not install packages globally or use a root-level `npm install`. If npm was run with lifecycle scripts disabled, rerun the normal `npm --prefix desktop ci` command.

Then start the app with:

```sh
npm --prefix desktop start
```

After source changes, run the build and server preparation steps above before launching a packaged/native smoke check. Desktop packaging and release commands are documented in [DESKTOP.md](DESKTOP.md) and [UPDATES.md](UPDATES.md).

## Bundled server missing

The packaged app depends on a prepared, platform-specific server bundle; it is not the same as connecting to a separate local server. From the repository root, run `npm --prefix desktop run build` followed by `npm --prefix desktop run prepare-server`. The preparation step selects the pinned runtime for the current platform, checks its checksum and builds the server/browser payload.

The checked-in Maven wrapper's executable permission was corrected during the Mac setup, and the pinned macOS arm64 server preparation subsequently passed. If a future checkout reports a wrapper permission failure, verify that the checkout is current and inspect the wrapper's tracked executable bit before changing permissions; do not substitute an unpinned global Maven/runtime.

## “Local server” does not mean “This computer”

**This computer** is the desktop app's bundled and owned workspace/server. A remembered **Local server** profile, such as a localhost URL, is a separate server and may not implement the current desktop/API contracts. The D7 warning for an older localhost server was not a missing bundle. Choose **This computer** to use the owned server; keep a separate server profile only when you intend to connect to that independent installation. Do not delete or migrate its data as a troubleshooting step.

## Mac native smoke checks

The 0.2.2 Mac smoke failures below were in test assumptions/setup and were corrected; they were not workarounds for weakening owner authentication or macOS security:

- Direct unauthenticated fetches to owner-only APIs returned 401 as designed. The owned-server smoke now uses the shared `DesktopTransport`, which attaches the disposable owner key.
- The smoke previously created its transport before the owned server had a ready address and could quit while disposable file/save/mutation activity was still in flight. It now creates the transport after readiness and waits for those activities to settle before requesting quit.
- The chrome smoke expected a hidden window menu bar on all platforms. macOS owns an application menu, so its check now verifies the File/View/Window application menu instead; other platforms retain the window-menu assertion.

The corrected native owned-server smoke passed launch, edit/save, PDF preview and relaunch with Java removed from `PATH`; the corrected chrome smoke passed its Connections/theme/credential/window-control assertions. The detailed environment, bundle hashes and test scope are in [MAC-HANDOFF.md](MAC-HANDOFF.md). These automated checks do not replace manual Finder/Gatekeeper/titlebar/tray checks or the coordinated two-device test.

## Mac release key unavailable

The 0.2.2 development app and native checks passed, but release packaging remains blocked because the matching private release key was unavailable. A release DMG and signed `.vaultor.json` were not produced. Obtain the existing matching key through a private transfer, keep it outside Git with owner-only permissions, and set `VAULTOR_RELEASE_KEY` to its absolute path. **Never paste the key into chat or regenerate/rotate it with `release:key`.** Do not treat the development Electron.app as a release installer.

## Known install warnings

The Mac frontend install reported Node engine-range warnings under Node 22.16.0 and 24 npm audit findings (2 low, 4 moderate, 18 high). The observed build/tests passed; no audit fix or dependency/version change was applied. These warnings were not the causes of the missing Electron executable or `resedit` error.
