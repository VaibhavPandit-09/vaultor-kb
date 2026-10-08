# Desktop application and private-network hosting

Created/reviewed: 2026-10-04. Status: D1–D8 implemented on Windows; current Mac 0.2.2 development build/native smoke partially verified; release DMG/manual Mac OS validation and the D9 real two-device gate remain pending in MAC-HANDOFF.md. D9 Windows implementation/validation complete; D10 deferred.

## Delivery and maintenance

Deliver one sprint per explicit authorization, stop after its handoff, and do not interpret Continue as authorization for another sprint if the current one is complete. Interrupted work may resume. The initial request authorized planning; subsequent calls explicitly authorized D1, D2 and D3. D4 was authorized by “start next sprint” and is implemented; D5 was authorized by “start next sprint” and is implemented. D6 was authorized by the next sprint request plus the desktop chrome corrections and is implemented. D7 is now authorized, including native window hit-testing, default OS theme and unified application/tray icons. Stop before D8.

Maintain this tracker after each completed task: checklists, decisions, blockers, exact checks and remaining limits. Update CODEBASE.md and relevant authoritative docs in the same change. Use docs/README.md for discovery. Historical trackers retain their history; their completed work is not restarted. Archive this tracker under docs/history/ when the sequence is complete, preserving current explanations in supporting docs.

Preserve unrelated work; D6 began from a clean working tree. Inspect working tree and applicable instructions at the start of every sprint.

## Locked product decisions

- Electron desktop shell, bundled React/Tiptap interface and bundled Spring Boot server/Java runtime. No Docker, Java or paid developer account required for installation.
- Windows x64 and macOS Apple Silicon first. An available Mac mini can be used for builds/native verification when access is arranged. Ubuntu x64 follows in its own sprint; Android and Mac Intel are deferred.
- Zero mandatory payment. Personal unsigned Windows builds and ad-hoc-signed Mac builds; no purchased code-signing certificate, Apple Developer membership, notarization or paid infrastructure.
- One local workspace per installation and multiple remembered remote servers. Every installation can be a host, client, or both. Only one workspace is displayed in a desktop window at a time; initial release uses one main window per installation.
- Local server starts when local workspace is needed, and continues while sharing is enabled even if the window switches to another host. Last selected connection restores on launch; first launch opens This computer.
- Closing the window hides to tray/menu bar while hosting. Explicit Quit stops the owned server. Start at login is a required user option, off by default; it can run hosting in the background without opening a window. OS sleep still makes the host unavailable.
- Browser access remains available locally and over the private LAN. Network sharing is off until explicitly enabled. No Internet workspace exposure or port forwarding; discovery always has manual-address fallback.
- Host-approved, code-verified device pairing; remember approval until revoked. Browser profiles pair independently. Routine app restarts, IP changes, certificate renewal and workspace replacement must not require re-pairing.
- LAN HTTPS uses locally generated per-host trust material, not a purchased certificate. Browser clients require a deliberate one-time trust installation; no global TLS-validation bypass or routine certificate-warning bypass.
- Save before switching. If saving fails, offer Keep drafts and switch only after local recovery storage acknowledges the outstanding edits. Retain drafts for the original host/workspace; full offline browsing/synchronization and simultaneous collaborative typing are deferred.
- Saved changes notify other clients; retain local drafts and revision conflicts. Explicit existing-Docker connection or archive transfer; no silent database copying/reset.
- Native save dialogs, download outcomes, file opening and safe quit handling. Preserve shared style, editor JSON, save coordinator and centralized Escape/focus behavior.
- Change the sidebar default to Ctrl+Alt+B / Cmd+Option+B. Keep Ctrl/Cmd+B for Bold and Ctrl/Cmd+Shift+B for Quote. Other shortcuts remain unchanged.
- In-app update checking/downloading and local-package installation are included. No paid release hosting required. Standard unattended Mac updating is not promised for these personal builds. Update installation/restart requires explicit user action, especially while hosting.

## Architecture and behavior contracts

### Shell, platform services and transport

Keep Electron-specific code outside the shared React application in a dedicated desktop package. Main process owns the server process, connection profiles, certificate trust, credentials, discovery, native dialogs, logs and update staging. Use a sandboxed renderer with context isolation and no Node integration. Expose narrow typed preload methods with argument validation, not arbitrary filesystem/shell/network execution.

Load locally bundled UI through a registered secure application origin. Keep its storage origin stable across app updates and server-address changes. Remote servers supply data, not executable UI. Route the shared API client and diagnostics through a connection-aware transport; cover uploads, downloads, previews and event streams, not just JSON Axios calls. Native main-process transport adds paired credentials and validates the approved host certificate. Browser builds use same-origin APIs and browser credentials. No wildcard CORS in paired mode.

Use platform services for save/open dialogs, external URLs, clipboard where needed, application lifecycle and connection state. Browser implementations retain existing behavior. Desktop credentials never enter note JSON, renderer storage, diagnostics or portable archives. Diagnostics carry connection/host identity without credentials, note bodies or pairing codes.

Capabilities expose build version, API protocol version, minimum compatible client protocol and feature flags. Negotiate before opening a workspace. Unsupported clients get an actionable connection screen; no writes and no silent remote upgrade. Version UI distinguishes desktop, selected server and locally hosted server versions.

### Managed local host and data

Bundle an Eclipse Temurin Java 25 runtime for each target architecture with license notices and the built Spring Boot JAR. Keep UI/server/runtime versions in one release manifest. Data is outside the installation: user application-data directory with separate workspace, host identity/trust/pairing, recovery/profile and bounded log areas. The host identity is distinct from portable workspace identity/generation. Pairing and private keys survive workspace replacement but are excluded from archives.

Prevent multiple writers with installation single-instance handling and an OS-released data-directory lock checked by the server. Do not attach to an unknown process just because a port responds. Verify owned host identity/local credentials, or report conflict and choose an available local endpoint. Remember the local browser endpoint when possible; browser storage remains origin-specific and cannot be migrated silently between different ports/hosts.

The private owner/control listener binds only to loopback. A separate HTTPS connector exposes the same application APIs to paired LAN clients when sharing is enabled; no unauthenticated parallel LAN port. Owner management is not exposed through ordinary paired-client permissions. Generate startup owner credentials outside logs/command-line arguments. Apply origin/CSRF protections to browser calls even on loopback. All clients use the same resource/transfer services and validation.

Startup waits for readiness and identity/protocol checks; failures show retry, logs and connection alternatives. Capture JVM stdout/stderr and shell logs with request IDs and bounded rotation. Limit automatic restart to three attempts with backoff; never loop indefinitely or kill an unrelated Java process. Graceful stop waits for transactions/transfer safe points; show failure before offering an explicit force quit.

### Host switching and recovery

Connection profiles contain stable host identity, remembered endpoints, display name and trust state. Host/workspace/generation identify data, not IP address or resource ID alone. Namespace caches, sessions, recoveries and UI device settings accordingly, including the case of two hosts created from copied data. Migrate existing desktop/browser records only when their source identity is verified; preserve browser records and explain separate browser/desktop sessions.

Switch transaction: verify destination identity/protocol/trust; flush current content/title/settings; await recovery writes; stop transient operations/subscriptions; persist current layout; activate the destination and restore its context. Cancel/stale requests cannot commit a switch. Keep drafts and switch retains original revision/journal and never queues its edits against the new host. If recovery storage fails, keep the current view and provide retry/export-copy; do not claim drafts were retained. Forget connection removes credentials/profile only after explicit confirmation and never deletes workspace/drafts.

Uploads/imports/workspace replacements block switching until safe completion or supported pre-commit cancellation. Active export tracking must not follow the new server: keep origin-bound background tracking and deliver its artifact through the original authenticated connection, or expose a paused retry state; never reuse an operation ID at the destination. Previews, popovers, dialogs, bulk selections and command targets close on switch; old diagnostics stay associated with their origin. Always show the active host in a compact switcher and an explicit connection state, without crowding the editor.

### TLS, pairing and discovery

Create a unique per-host private CA and leaf certificates with supported libraries. Never ship a shared private key. Keep host identity/trust stable; leaf renewal and address SAN updates do not reset pairing. Pin the approved host trust identity in desktop profiles and validate its leaf chain; changed trust requires a visible verification flow. Browser trust setup exports only the public certificate and verifies its fingerprint via the host UI/out-of-band transfer before installation. Host private keys stay local. Offer removing trust on disconnect/retirement with precise OS instructions; trust installation/removal is explicit.

Use mDNS advertisement on sharing-enabled hosts for name, endpoint and protocol hint. Discovery is untrusted until pairing verifies identity; names are not identities. Re-resolve a remembered host when addresses change, with bounded retry and manual fallback. Disabling sharing withdraws advertisement and network access without revoking approvals. Document firewall/private-network prerequisites; do not change firewall or global certificate trust silently.

Pairing requests are short-lived (five minutes), bounded/rate-limited and require physical comparison of a short code bound to the observed certificate identity and request nonce on both screens. Use standard TLS/randomness/hash primitives, not custom cryptography. Unapproved clients can access only bounded host/pairing information and static pairing UI, never resources, exports, binaries, diagnostics or event streams. Enrollment polling uses an unguessable request secret; approval issues a high-entropy per-client credential once, with retry-safe completion. Persist only credential verifiers server-side. Client credentials use OS-protected storage; browser approval uses persistent HttpOnly Secure SameSite cookies and CSRF protection. Renewal of browser session cookies is transparent while its approval remains valid. Clearing storage, deliberate revocation, reinstalling without credentials or resetting host trust can require pairing again; do not promise browser storage survives those events.

Owner lists, names and revokes paired clients. Revocation terminates their streams and rejects subsequent access; pending local drafts remain recoverable. Network clients have full workspace use but cannot approve devices, export private trust material, change hosting settings or install host updates. There are no accounts, master passwords or encrypted backups. Pairing management data is separate from resource settings and archive operations. API agents on the LAN use approved client credentials and ordinary application APIs; there is no access bypass for debugging.

Local browser access remains usable through Open in browser: issue a short-lived, one-use owner-browser bootstrap ticket through the private control channel, exchange it for an appropriately scoped local browser session, and remove the ticket from navigation history. Do not place durable credentials in URLs/logs. Tickets cannot be redeemed through the LAN connector. Standalone/Docker deployments provide an explicit owner-bootstrap command using locally provisioned owner material, so approving peers does not require Electron. Browser clients reaching the LAN URL follow ordinary pairing and can never self-promote to owner. Document setup/recovery for this owner access alongside the Docker connection/migration flow.

### Shared saved state, updates and limitations

Publish authenticated SSE invalidations only after committed mutations. Events include boot epoch/sequence, mutation category, relevant IDs and workspace generation, never documents or secrets. Keep replay bounded to 1,000 events/ten minutes; gaps/restarts signal a metadata refresh. Reconnect with backoff and bounded coalescing, pause while disconnected, and reconcile on focus. Ordinary browsing/open recency does not refresh unrelated groups. Clean open notes may receive authoritative saved content; dirty notes retain drafts and get a conflict indicator, never a whole-document overwrite. Existing in-window shared-document synchronization remains unchanged.

Audit cross-client settings/title/tag/pin/collection mutations, not only body saves. Require conditional revision updates for network note edits; avoid full-settings-document lost updates with atomic scoped settings changes and conflict/retry feedback. Server events identify changed settings scopes so device appearance stays device-specific. Deletion/replacement notifications preserve recoverable drafts and do not navigate to arbitrary notes.

Update packages live separately from user workspaces. Initial zero-cost update source is a local release-package file; optionally configure a public HTTPS release feed later without requiring it to use the application. With no feed configured, Update UI explains local installation instead of pretending to check a server. No private hosting tokens embedded in the app. Verify release manifest, platform/architecture, size/checksums and an application-owned release signature with a pinned public key before staging; OS publisher signing is a separate concern. Keep the private release-signing key outside source control. No downgrade by default.

In-app checks/downloads may run automatically when a feed is configured; installation is Restart and update, never an automatic hosting restart. Windows personal packages can use supported installer mechanisms; Mac personal builds stage/open the verified replacement package and explain manual approval/application replacement. Standard signed Mac automatic installation remains unavailable. Ubuntu update mechanics are decided in its own sprint, with package-manager/manual installation as the zero-cost baseline.

Before installation: notify connected clients of scheduled restart, flush local edits/recovery, quiesce mutations, wait for or safely suspend operations, shut down the owned server and take a consistent local backup of database/files plus separate host configuration. Do not copy a live SQLite file. Retain the previous application version and one verified pre-update backup. If startup/migration fails, stop writes and present explicit restore/retry; restoring the older executable alone cannot undo a schema change. Backups containing host credentials remain local and are not portable exports. Never update a remote server from this client. The installer must not delete data, pairings, login preference or profiles.

## Sprint sequence

Each sprint is independently reviewable. Normal development uses compilation and focused failure-path tests. Run native/browser checks only for an interaction fact; deployment/pairing/installer sprints have explicitly scoped checks because those are the functionality being changed. Mutating verification uses disposable data. No routine repeated Docker builds or broad API smoke.

### D1 — Shared platform/connection foundations and sidebar shortcut

- [x] Introduce typed platform services, connection identity and API protocol/capabilities contract while keeping the browser build functional.
- [x] Route API client, diagnostic batches, binary URLs/downloads, previews and future streams through the common connection context. Remove hard-coded API requests bypassing it.
- [x] Define native request cancellation/stream ownership and consistent errors without automatic retry of ambiguous mutations.
- [x] Change sidebar default to Mod+Alt+B and generated help/settings labels. Migrate the previous shipped Mod+B value only; preserve other custom bindings and record this unavoidable same-value migration. Add validation against known editor Bold/Quote conflicts and clear remapping guidance.
- [x] Separate client build, server build and protocol version in diagnostics/capabilities; reject unsupported protocol versions before editing.
- [x] Focused checks: browser behavior, keyboard Bold/Quote/sidebar, custom bindings, protocol rejection, request IDs and diagnostic recursion. Compile affected frontend/backend.

Acceptance: existing browser usage works, editor formatting shortcuts are no longer taken by sidebar default, and platform-specific behavior has one defined boundary.

D1 outcome: implemented platform.ts/connection.ts and ConnectionGate, an explicit backend capability DTO/OpenAPI schema, shared configurable build information, request/stream ownership and browser platform file/clipboard actions. Application requests are compatibility-gated; raw bootstrap/diagnostics use the same transport without recursive reports. Queue delivery waits for compatibility, drops old-host events and remains bounded. Binary failures retain bounded JSON problem details. Sidebar defaults/normalization agree in frontend/backend; identical custom Mod+B necessarily migrates too. Details: [PLATFORM.md](../architecture/PLATFORM.md).

Validation: frontend production build and final TypeScript check passed; targeted ESLint passed. 31 frontend checks passed across platform, shortcuts, note export and table-control files. Four DesktopContractTest backend cases passed, compiling main/test code. Whitespace/source-bypass inspection passed. Existing large-bundle/Browserslist and JVM/Mockito warnings remain. No browser/native visual check, Docker rebuild, broad API smoke, real workspace mutation or deployment. Native adapters/stream transport are contracts only; D2 is not started. No D1 blocker remains.

### D2 — Electron shell and persistent desktop identity

- [x] Scaffold the dedicated desktop package, secure local UI origin, narrow validated preload bridge and single main window/single-instance behavior.
- [x] Preserve native window controls, application menus, focus/Escape and existing editor appearance; allow external web links only through the OS browser.
- [x] Add connection screen/compact switcher, offline/startup failure states and local profile storage. Connect to an existing loopback server in development; server bundling follows D3.
- [x] Namespace desktop caches/sessions/recovery by connection profile/workspace and establish persistent desktop session ownership across process restarts, independent of browser tabs. Authenticated host identity follows pairing; profiles isolate copied workspace IDs now.
- [x] Bridge main-process transport, explicit unavailable credential/trust placeholders and cancellation without exposing arbitrary IPC/network targets to uploaded content.
- [x] Focused checks: relaunch/session isolation, renderer boundaries, invalid IPC, denied unintended navigation, unreachable host and browser build. Windows native launch/editor/relaunch and screenshot checked.
- [ ] Mac native launch/menu/storage verification when access to the Mac mini is arranged; required before Mac release, not claimed by Windows checks.

Acceptance: installed-style window runs the bundled UI, reconnects safely and retains its session across app relaunch without changing browser sessions.

D2 outcome: Electron 44.5.1 development package/main/preload, same bundled frontend and native menus, loopback profile picker and offline states, bounded main-owned transport, strict save/recovery switch barrier and stable desktop session ownership. No arbitrary network/IPC/credential exposure; active mutations/transfers/exports block switching. No backend API/schema changes. Startup restores last profile/view and current-identity changes cannot silently receive old drafts. See [DESKTOP.md](../desktop/DESKTOP.md) for current implementation and launch commands.

Checks: production browser/desktop build, final TypeScript, targeted ESLint and desktop syntax passed; four Node cases and 33 distinct frontend cases passed (seven desktop cases rerun after fixing duplicate auto-reconnect). Disposable Windows native launch/typing/relaunch passed; renderer/preload isolation, denied IPC/file target and captured layout checked. Fixture membership response was corrected before the successful native result. No real workspace/API smoke or backend/Docker rebuild. Mac verification remains pending; no claim of verified Mac delivery. Buffered transport is capped at 32 MiB until D4, and native file/lifecycle behavior remains provisional. D3 not started.

### D3 — Bundled local server, runtime and data ownership

Authorized/implemented 2026-10-04 on Windows. Use a checksum-verified free Temurin 25 runtime, a managed loopback child with OS-assigned port, private stdio ownership and an application-data workspace independent of Docker. D4 is not authorized. Mac build/native verification remains pending access to the Mac mini.

- [x] Bundle target Java runtime/JAR and license notices; launcher starts on local use, waits for readiness and negotiates identity/protocol.
- [x] Establish application-data paths, directory lock, process ownership, port conflict handling and local owner/control channel. Never adopt an unknown server or use Docker data automatically.
- [x] Retain files/workspace/host identity outside app installation; handle write permissions, insufficient space and missing/corrupt runtime with recovery UI.
- [x] Capture bounded JVM/shell startup and crash logs; expose them through Diagnostics without secrets. Implement three-attempt restart/backoff and graceful owned-process stop.
- [x] Produce Windows x64 development package without installed Java/Docker; add target-native Mac arm64 packaging/pinned runtime workflow. Final release installation is D8.
- [x] Focused disposable Windows checks: first/second startup, locked directory, occupied unrelated port, server crash, failed startup, no orphan/duplicate process, data preserved after replacement of app files; portable native editor/relaunch.
- [x] Build the current Mac arm64 0.2.2 development app and pass disposable owned-server startup/edit/PDF-preview/relaunch plus native chrome smoke. This does not verify a release package.
- [ ] Produce/install the Mac release DMG; manually verify Finder/Gatekeeper, titlebar/menu-bar/tray/shortcuts, storage, login and quit behavior.

Acceptance: a clean personal installation opens a local workspace and browser endpoint with no external runtime, while existing workspace data remains intact.

D3 outcome: This computer is a stable bundled profile; fresh launch starts Temurin/Spring on loopback with private stdio owner proof, an OS data lock and parent-death cleanup. UserData/local-workspace keeps database/files/operations/host identity outside application files. Random ports avoid adopting unknown servers. Startup recovery/details and Diagnostics expose bounded logs; restarts stop after three attempts and never replay mutations. Browser UI ships in the JAR. Existing selected connections/data remain intact. See DESKTOP.md for paths, build/package commands, graceful quit and provisional D4 limits.

Validation: browser/desktop production compilation, clean backend main/test compilation and executable packaging passed; targeted ESLint and desktop syntax passed. Five profile/transport policy cases and eight desktop frontend cases passed. Four owned-server cases passed with disposable bundled JVMs (corruption/free-space/log bounds, locking/concurrent startup/occupied unrelated port/crash/relaunch/app-file replacement, bounded restarts, launcher-death release); corruption/host-identity assertions received a focused two-case rerun. Windows portable native create/edit/save/relaunch passed with installed Java excluded; screenshot inspected. Initial native Saved selector was corrected to the existing accessible label. Backend suite was skipped; no Docker/broad user-workspace smoke. Mac remains a validation blocker for Mac delivery. D4 not started.

### D4 — Native file operations, hosting lifecycle and login startup

- [x] Native save/open flows for notes/workspace/table exports, file imports and existing previews. Stream large binaries to disk instead of IPC/base64 buffering entire archives.
- [x] Distinguish preparation, save-dialog cancellation, actual successful disk write and retry; cancellation must not rerender an export. Browser download semantics remain truthful.
- [x] Tray/menu-bar hosting controls, Show app/Open in browser, close-to-background explanation, explicit Quit and bounded save/recovery/operation barrier.
- [x] Start at login toggle, off by default, with start-in-background while sharing. Surface OS-denied startup registration; never silently override the user/OS setting.
- [x] Sleep/resume and quit during failed saves: retain drafts, show whether clients will be disconnected, do not claim unload requests guarantee saving.
- [x] Focused checks: file cancel/write failure/retry, close versus quit, login setting, app reopen/focus and unchanged browser import/export. Automated services and Windows lifecycle verified; outstanding native OS checks below.

- [ ] Manual Windows save-dialog confirm/cancel/overwrite and actual OS login launch; Mac mini dialog/menu/startup/quit verification. Automated cancellation of a native save sheet timed out; do not claim that case passed.

Acceptance: desktop file/lifecycle behavior is native, start-at-login is usable, and merely closing the window cannot unexpectedly stop hosting.

D4 outcome: opaque OS-selected import tickets; streamed multipart and API-to-disk transfers, native save outcomes, conservative OS Open and bounded/released preview cache; fixed Chromium PDF viewer integration. Tray close retains the same editor/host; explicit Quit requires save/recovery/layout acknowledgement and transfer-aware owned-server draining. Login is explicit/off by default, with OS-denial reporting and rollback. Resume only probes, never replays mutations. A read-only operation-activity API and shutdown transfer admission prevent new imports/exports racing close. No schema, structured-document or archive-format changes; independent servers remain untouched. Sharing/LAN remains off.

D4 validation: frontend/browser/desktop production compilation, backend main/test compilation/JAR packaging, targeted lint and desktop syntax passed. 33 distinct focused frontend cases passed (desktop 10, export 12, import 11); desktop/export 22 rerun after file-service changes. Four native-file/login service cases passed, including 33 MiB streaming, cancel/no fetch, disk failure/original retention/retry, range/cache/token bounds and fake OS registration/denial/rollback; two backend gate cases passed. Launcher-death JVM cleanup passed. Windows portable native close-to-tray/host-still-live/show/focus/edit/save/session relaunch/explicit Quit passed with installed Java absent, using disposable storage. A narrow real PDF operation/native preview exposed blocked internal viewer resources; after fixing the allowlist and response policy its page was visually inspected and a blank-frame regression capture check passed. A private Chromium DOM-based geometry assertion was unsuitable for its out-of-process viewer and replaced with the screenshot check. Native save-sheet automation timed out; confirm/cancel/overwrite and actual start-at-login launch still need manual OS checks. No user storage, Docker, broad API smoke, real startup registration or Mac launch was touched. Existing bundle/Browserslist and dynamic-import warnings remain. Stop before D5.

### D5 — Host HTTPS and persistent pairing services

- [x] Separate host identity/trust/pairing storage from portable workspace settings. Create/renew unique CA/leaf material; preserve approval through workspace replacement.
- [x] Separate owner loopback access from opt-in HTTPS network access; close all API/static-binary/export/diagnostic/stream bypasses and replace wildcard paired-mode CORS.
- [x] Implement enrollment, code-bound host approval, durable credentials, browser cookies/CSRF, device list/revoke and strict owner-only management.
- [x] Implement local Open in browser handoff and standalone/Docker owner-bootstrap procedure; keep network peer approval available without the Electron host window.
- [x] Add structured pairing/access/TLS errors and bounded request logging with no credentials/codes/private keys. Extend OpenAPI and approved-agent instructions.
- [x] Define trusted-host lifecycle: pinning, changed trust verification, leaf renewal/address updates and public certificate export; no automatic OS trust changes.
- [x] Disposable service/API checks specifically for unapproved access, approval/retry/replay/expiry, revocation, restart persistence, certificate renewal, replacement identity and cookie/CSRF/CORS protections. Check both connectors, not only controller methods.

Acceptance: approval survives normal lifecycle changes, unapproved peers cannot use workspace APIs, and no reintroduced encrypted-note/login flow is required.

D5 decisions/results: services are implemented in host/ with separate private host-access storage; existing host.json is reused. Public descriptor is GET /api/access/host. The managed owner key is distinct from lifecycle proof and supplied only by main. Standalone/Docker use explicit local bootstrap; Docker retains host-loopback publication despite container-internal 0.0.0.0. The minimal browser page supports enrollment and owner approval; final UI/discovery/client pinning/protected profiles remain D6. Incomplete enrollment expires after restart; approved but uncompleted entries can be revoked. No continuous address watcher or IPv6 listener yet; owner leaf renewal/startup refreshes SANs. HOST-ACCESS.md owns full contracts.

Validation: seven backend, ten frontend and nine desktop focused cases passed, plus one real bundled-JVM crash/relaunch/preservation/bootstrap/approved-agent scenario. Both actual owner HTTP and trusted HTTPS connectors were checked with disposable storage and real restart, denied assets/APIs/owner routes, code/secret/replay/expiry/bounds/revoke, cookies/CSRF/origin/CORS, renewal and replacement generation isolation. Compilation, production build/package, targeted lint, desktop syntax and OpenAPI references passed. Added file-test assertion initially used the wrong token argument; corrected. No Docker, broad API smoke, live user storage, OS trust installation, visual browser/native or Mac checks. D4 manual save/OS-login and Mac checks remain pending. Stop before D6.

### D6 — Sharing, discovery, browser trust and server switching UX

- [x] Remove native title/menu/connection strips; integrated window controls and drag areas use existing workspace space. Connection information moves to a sidebar control and on-demand switcher; window/tray menus retain access when the sidebar is hidden.
- [x] Compact host switcher with This computer, remembered servers, Nearby and manual address; search and keyboard form behavior, status/pending/error feedback.
- [x] Sharing controls, mDNS advertise/discover/withdraw, remembered identity re-resolution, firewall/private-network troubleshooting and browser-address copy/open actions.
- [x] Matching-code pairing UI, Devices management, browser first-approval UI and public certificate trust/removal instructions for Windows/Mac browser clients.
- [x] Atomic switch with destination validation, source save/settings/recovery barrier, Keep drafts and switch, origin-bound exports and cancelled stale previews/requests/commands.
- [x] Local hosting persists while displaying a remote workspace; forgetting/revoking connections does not delete drafts or resource data. Returning restores that host's layout/context.
- [x] Focused two-host disposable checks (implemented checks complete; real cross-machine multicast/OS browser trust remains D9): duplicate names/copied workspace identities, changed IP, failed discovery/manual fallback, switch failure/stale completion, pending exports/imports, recovery-storage failure, restart without repeat approval and browser trust setup.

Acceptance: two desktops can connect without repeated pairing, local/remote switching never mixes data/drafts, and paired LAN browser access works without routine certificate warnings.

D6 decisions/results: no additional top rows. A frameless Electron window uses themed controls over reserved existing heading space; connection information is in the sidebar and on-demand window/tray menu. Connections/Hosting share the established focus/Escape/save barrier. bonjour-service 1.4.4 advertises only active sharing; private HTTPS enrollment observes a chain only, then verified transport plus code approval binds trust. safeStorage credentials never reach renderer or logs; NativeFiles and JSON share strict pinned transport. Same-host/CA re-pair reuses retained recovery identity (100 retired identities bound). Switching does not stop local hosting; saved sharing resumes even when remote is selected. Status polling does not restart an explicitly stopped host. Browser approval now requires code comparison and retries an existing request after transient failure. No workspace/API schema change.

Validation: fifteen focused frontend cases passed (13 desktop/switch/recovery/chrome/enrollment/approval, two browser access cases), nine existing desktop transport/file/login cases passed, and two real disposable hosts passed pairing, credential persistence, wrong pin, restart/renewal, changed-address hints, revocation, same-name/copied-workspace and forgotten-identity recovery. Production-dependency staging is checked separately. Frontend build/lint, desktop/static-page syntax, Java main/test compilation and bundled-JAR preparation passed; backend suite skipped. One targeted Windows native session checked no extra rows, maximize controls, sidebar access, default-off sharing and actual OS-protected storage; dark/light/narrow/Hosting frames inspected. Initial Hosting-tab fixtures, Promise typing and asset-path setup were corrected; hidden Chromium returned stale captures until the disposable window was shown inactive. No Docker/broad smoke, user workspace, OS trust/firewall/login changes, full new portable package or Mac check. Real cross-machine mDNS and browser OS-trust installation are carried to D9, along with prior native-save/OS-login/Mac limitations. Stop before D7.

### D7 — Multi-device change propagation and mutation reliability

- [x] Fix mouse interaction with native window controls; test actual pointer clicks, not just direct maximize calls.
- [x] Add OS theme as the default, live-follow OS changes, preserve explicit dark/light choices.
- [x] Use a consistent Vaultor glyph for window/taskbar/tray and future installers.

- [x] Commit-only bounded SSE notifications/replay/gap refresh, authentication/revocation, reconnect and selected-host ownership.
- [x] Reconcile Library/sidebar/backlinks/open clean documents while preserving dirty content/title/undo and source-specific conflicts; avoid navigation flicker or broad refresh per keystroke.
- [x] Audit and fix cross-device settings updates/metadata mutations; add atomic scoped settings contract and require revision preconditions on network note writes.
- [x] Handle other-device deletion and workspace replacement with retained recovery copies; event replay never replays commands/imports/downloads.
- [x] Emit operation/hosting restart notifications without making an unreachable client block shutdown indefinitely.
- [x] Targeted disposable two-client checks: simultaneous notes/settings/pins/memberships, committed rollback/no-event, gap/reconnect/restart, stale notes, deletion/replacement and no diagnostics/log storms.

Acceptance: saved changes appear on other devices, stale edits never silently overwrite, settings updates do not lose another client's fields, and reconnect reconciles safely.

D7 implementation/results: bounded approved metadata SSE and selected-host cancellation; clean-note refresh without echo saves; dirty/deleted drafts retained; generation replacement isolation; scoped atomic settings and required HTTPS revisions. Fixed Windows control hit testing by excluding heading drag regions, made OS theme default/live and added canonical V icon assets. Icons are runtime window/tray assets; executable/pinned shortcut branding is D8. See [MULTI-DEVICE.md](../architecture/MULTI-DEVICE.md) for authoritative behavior and limits.

Validation: 29 focused frontend cases, one native-stream Node case and one actual disposable owner/approved HTTPS integration case passed. Integration covers concurrent settings, note preconditions, tags/membership/pins, merge/replace notification, rollback/no-event, cursor replay/gap and revoke. Frontend/desktop compilation/build, targeted lint, desktop syntax and Java main/test/JAR staging passed. Real Windows pointer checks cover menu/minimize/maximize/restore/close in Library and note views; native OS-theme following, saved remote edit without extra save and deletion recovery passed. Dark/light/narrow captures inspected. Fixed SSE retaining SQLite’s only connection, native browser-stream fallback and an unnecessary global error banner during background deletion reconciliation. Expected deletion 404s remain bounded diagnostics. No Docker, broad smoke, user data or OS trust/firewall/login changes. Real Windows–Mac interaction, prolonged disconnection/load, host-restart delivery timing and actual browser OS-trust checks remain D9; prior conflict/restart service coverage was not repeated broadly. D7 complete; stop before D8.

### D8 — Personal installers, existing-data onboarding and zero-cost updates

- [x] Windows x64 installer and macOS arm64 ad-hoc app/DMG build workflow with bundled runtime. The current Mac 0.2.2 development app and native smoke checks passed; release DMG/install, manual native OS verification and Gatekeeper steps remain pending. No paid signing/notarization promises.
- [x] Existing Docker onboarding: connect to upgraded compatible server or explicitly export/import into This computer. Browser-only/Docker hosting remains supported with documented pairing management configuration.
- [x] Release manifest/checksums/application release signature, local update-package import, configurable HTTPS feed and in-app check/download/progress/errors. Unconfigured feed remains a valid personal setup.
- [x] Update quiescence, host restart notice, consistent backup, previous-version retention, failure recovery and explicit Mac manual replacement handoff. Preserve data/trust/pairing/login preference.
- [x] Build/release scripts run on user's own Windows/Mac machines; include exact free prerequisites/license notices. Never publish releases or incur subscriptions automatically.
- [x] Targeted Windows install/same-version repair/uninstall/reinstall checks (real different-version OS upgrade and Mac install pending) with disposable data and corrupted/wrong-platform/oversized/unsigned-manifest packages. Test migration failure/restore and client-only update not altering remote host.

Acceptance: personal packages need no payment/external runtime, existing data stays discoverable, and in-app update workflow has no false claim of unattended Mac installation or successful download before disk completion.

D8 actual validation: production browser/desktop build and targeted ESLint passed; desktop syntax passed. Sixteen focused frontend cases and eight distinct Node update/branding cases passed. Final backup/recovery cases were rerun after adding copied-backup hash verification and revalidation of retained previous installers. Optional HTTPS tests use bounded fixtures; no release feed was published. Windows developer branded launch and installed native launch/control/theme/update-dialog checks passed on disposable storage. Installer repair/uninstall/reinstall passed; temporary registration/shortcuts were removed, and separate disposable storage remained. Packaged Vaultor.exe PE icon data matched the canonical ICO. Native Updates screenshot was inspected.

Initial installed startup failed because the taskbar API name was incorrect; corrected to BrowserWindow.setAppDetails with appIconPath/relaunchDisplayName. A renamed developer executable also reports isPackaged=true; selection now uses the actual resources/app layout, and developer native launch passed afterward. Expected 404 diagnostics came from deliberately deleting the disposable note. No user workspace, real pairing/trust/firewall/login preference, Docker or broad API smoke was altered/run.

D8 remaining validation carried to D9: Mac mini package/build/native checks, genuine different-version installer upgrade and end-to-end native install/rollback handoff, live hosted HTTPS release feed, OS cached/pinned taskbar appearance, and real Docker owner-key/archive onboarding. Service tests cover rejection/recovery, not every native failure dialog. No paid signing/notarization or unattended Mac update is implied. Developer/installer commands and key/recovery limits are authoritative in [UPDATES.md](../desktop/UPDATES.md). Stop before D9.

### D9 — Windows/Mac integration and release handoff

- [ ] One bounded real two-device session using Windows and the Mac mini, with separate desktop/browser approvals and both hosting directions. Carry D6 real mDNS, private firewall reachability and one-time OS/browser certificate installation/removal checks here.
- [ ] Verify first launch, local/network/browser access, relaunch, background sharing, login startup, sleep/resume, changed address, revoke/reapprove, incompatible server and TLS renewal.
- [ ] Verify note links/table editing/shared panes, native uploads/previews/downloads, failed-save switch/recovery, cross-device edits, conflicts, replacement, export while switching and hosting update/recovery.
- [ ] Check both themes, narrow window, keyboard dialogs/shortcuts, reduced motion and safe quit with local/remote active clients. Keep it targeted; do not repeatedly explore unrelated UI.
- [x] Complete current build/install/trust/pairing/network/update/debugging/API docs and provide exact Mac execution handoff; final Mac outcomes remain pending. Maintain the CODEBASE source map. Record exact OS/browser versions, actual results, unavailable access and limitations rather than marking unperformed checks passed.
- [x] Preserve zero-cost and no-Android boundary. Summarize installer size/runtime footprint measured on the test machines, rather than promising a lightweight app.

Mac development results (2026-10-04): macOS 27.0.1 arm64, Node 22.16.0/npm 10.9.2, Temurin 25, Electron 44.5.1, Chrome 152.0.7977.83 and Safari 27.0.1. Clean desktop install, build, pinned server preparation, desktop check, 14 focused Node tests and five focused frontend workspace-departure tests passed. The disposable arm64 development Electron.app was 629,944 KiB and passed ad-hoc signature verification; it is not the Vaultor release app/DMG. Native owned-server and chrome smokes passed, and dark/light/narrow frames were reviewed. Manifest/JAR hashes and test details are in [MAC-HANDOFF.md](../desktop/MAC-HANDOFF.md). Release packaging is blocked by the absent matching private key; no key was rotated and no release DMG was produced. Manual Mac installation/native controls, browser trust and the real two-device LAN session remain pending. D9 is partial, not complete.

Release gate: Windows and Mac personal installers, no external Java/Docker requirement, browser retained, opt-in paired HTTPS LAN use, persistent approvals, isolated sessions/drafts, reliable saved-state refresh, native file/lifecycle behavior, working login option and recoverable update path. No user data mutation during verification.

D9 actual Windows results (2026-10-04): production frontend/desktop build, scoped lint and desktop syntax passed; 15 focused frontend and 14 Node network/file/update cases passed. Real disposable loopback hosts verified pairing/reconnect/address hints/revocation without loss; this is not a real two-device LAN session. Branded 0.2.1 native window check passed, including connection row geometry, dark/light and minimum-width frames, OS theme, native menu/window actions, saved remote editing and deletion recovery. Three Connections frames were inspected. An initial native-menu automation failure was corrected by keeping foreground focus on the popup during keyboard selection rather than reactivating its parent; the affected session then passed. Expected 404s came from deliberate disposable note deletion.

The user requested an exact Mac AI handoff instead of SSH access: [MAC-HANDOFF.md](../desktop/MAC-HANDOFF.md) contains prerequisites, same private release-key continuity, platform-native builds, isolated data commands, both hosting directions, separate browser/desktop approval, trust/firewall cleanup, native files/controls, concurrency/recovery, update/rollback and documentation gates. Remaining Mac/Linux/real network checks are not marked passed. No Docker, public release feed, real workspace mutation, OS trust/firewall change or actual login registration was performed. Manual integration can use absolute existing VAULTOR_DESKTOP_TEST_DIRECTORY; terminal-only isolation must not be assumed for login startup.

Final Windows 0.2.1 installer measured 259,369,342 bytes (about 247 MiB), unpacked files 736,533,442 bytes (about 702 MiB). Mac size is unmeasured. Final disposable Windows 0.2.0 → 0.2.1 upgrade, installed-version checks, same-version repair, uninstall and reinstall passed. Native coverage used the same packaged executable in its separate successful session; the installer-only rerun used SkipNative to avoid repeating UI exploration. Existing shortcut bytes were backed up/restored, temporary installation registration removed, and separate disposable data remained. D9 is the last Windows/Mac sprint, but its full release gate remains open until the Mac/two-device handoff passes. D10 is separately authorized; Android remains deferred.

### D10 — Ubuntu x64 follow-up (separate authorization)

- [ ] Package/test on Ubuntu 24.04 LTS x64 with target Java runtime; use a deb package as baseline and document supported distro/version rather than claiming universal Linux support.
- [ ] Implement tray fallback, login autostart, desktop keyring credential storage and explicit failure when protected storage is unavailable; never silently fall back to plaintext credentials.
- [ ] Verify native dialogs, TLS/browser trust, mDNS/firewall guidance, host lifecycle, existing-data paths, sessions and conditional edits with Windows/Mac peers.
- [ ] Use package-manager/manual installation for personal updates; retain in-app check/download/local-package guidance and tested backup/recovery.
- [ ] Update distribution matrix, docs and final tracker; archive only after all authorized deliveries are complete or the user explicitly defers the follow-up.

Acceptance: Ubuntu personal host/client behavior matches the same APIs and data guarantees; limitations are explicit. Android remains deferred.

## Public interfaces to deliver

Keep precise request/response schemas authoritative in OpenAPI during each API sprint. These names fix the required capabilities without introducing a separate privileged resource-debug API:

| Interface | Access / purpose |
| --- | --- |
| GET /api/capabilities | Bounded pre-pair protocol/build discovery; no workspace contents |
| GET /api/access/host | Bounded public host name/identity/protocol hint |
| POST /api/pairings; GET /api/pairings/{id}; POST /api/pairings/{id}/complete | Enrollment, secret-bound status and retry-safe credential/cookie completion |
| POST /api/owner/pairings/{id}/approve or /reject | Owner-only code-verified decision |
| GET /api/owner/devices; DELETE /api/owner/devices/{id} | Owner-only approved device listing/revocation |
| GET/PUT /api/owner/sharing | Owner-only current hosting configuration; disabling closes listener/streams |
| GET /api/owner/trust/certificate | Owner-only public trust certificate export; never private material |
  | GET /api/changes | Approved SSE invalidations with resume/gap behavior |
| PATCH /api/settings | Atomic scoped updates, validation and concurrency errors; replaces overlapping full-document client writes |
| PUT /api/resources/{id}/note | Existing conditional update; paired network callers must provide If-Match |
| Existing resources, organization, transfer, diagnostics APIs | Same services, approved access, request IDs and cancellation semantics |

Native platform interfaces cover connection verify/activate, host start/stop/status, discovery/pairing/revoke, request/upload/download/event stream, file save/open, external links, login startup and update staging/installation handoff. No UI action accepts raw shell commands or unrestricted paths. Connection changes invalidate all stale renderer callbacks by connection epoch.

## Tracking, dependencies and actual validation

| Sprint | State | Result |
| --- | --- | --- |
| D1 | Complete | Platform/compatibility foundation; Ctrl+Alt+B migration; build/lint, 31 frontend and 4 backend checks passed |
| D2 | Implemented; Mac verification pending | Windows shell/native relaunch verified; build/lint, 4 Node and 33 frontend cases passed |
| D3 | Implemented on Windows; Mac validation pending | Bundled Temurin/server, data ownership, portable editor/relaunch; Mac package build/native checks require access |
| D4 | Implemented on Windows; manual OS/Mac validation pending | Native files/tray/login/quit; pending cases listed above |
| D5 | Implemented | Disposable both-connector/restart checks passed; D6 UX pending |
| D6 | Implemented on Windows | Paired connections, host UX and integrated chrome; real Mac/network checks D9 |
| D7 | Implemented on Windows | Saved-change propagation, scoped mutations, native control fixes, default OS theme and unified icons; 29 frontend + one Node + one disposable backend case and targeted native checks passed |
| D8 | Implemented on Windows; Mac build/native verification pending | Branded developer/installed executable, NSIS installer, signed local/optional HTTPS updates, snapshot/recovery and explicit existing-data onboarding; Windows installer/native checks passed |
| D9 | Windows implementation/native checks complete; Mac/two-device checks pending | Connection menu fixed; 0.2.1 package; exact Mac execution handoff requested by user; full cross-platform release gate remains open |
| D10 | Deferred follow-up | Requires separate authorization and Ubuntu validation environment |

Planning validation: inspected current guide/index, session/recovery identities, transport/diagnostics/download implementations, server config/CORS and packaging. No code edits, runtime checks, builds, tests, purchases, certificate installation, network exposure or deployment performed. Plan docs were reviewed for cross-sprint coverage and preservation of existing N6 work.

Dependencies/risks to track: availability/access to Mac mini (confirmed by user; connection not arranged), disposable second-device data, future Ubuntu environment, personal Gatekeeper/Windows approval friction, browser trust store differences, mDNS/firewall behavior, OS-protected storage, installer size and updater recovery. No paid signing or hosting is a blocker for the personal baseline. Optional release-feed URL/publisher configuration can remain unset; no invented repository or publishing authorization.

Deferred work: Android, Mac Intel, full offline database/sync, collaborative typing, multiple local workspaces, public Internet hosting, paid publisher signing/notarization and unattended standard Mac updating. These cannot be silently added to the sprint scope.

### Maintenance history

- 2026-10-04: created decision-complete D1–D9 Windows/Mac sequence plus separately authorized D10 Ubuntu follow-up; documentation only. No implementation sprint started or execution checks claimed.
- 2026-10-04: implemented authorized D1, preserving unrelated N6 work; updated PLATFORM/API/navigation/operations/codebase/index docs. Production build, final TypeScript, targeted lint, 31 frontend and 4 backend focused checks passed. Stopped before D2; no hosting/pairing/desktop packaging or live deployment performed.
- 2026-10-04: implemented authorized D2 development shell/profile/session/IPC boundary, preserving existing work. Builds/lint/syntax, four Node and 33 frontend cases passed; disposable Windows native editor/relaunch and screenshot checked. Mac launch remains pending; D3 stopped before implementation. No user-workspace mutation or backend/Docker checks.
- 2026-10-04: implemented authorized D3 owned runtime/server and personal development package. Windows bundled JVM checks, portable native editing/relaunch, build/lint and focused frontend/profile checks passed; data preserved, no user storage/Docker touched. Mac build/native verification remains pending. Stopped before D4.

- 2026-10-04: implemented authorized D4 native files, lifecycle and opt-in startup; updated authoritative desktop/platform/export/session/API/operations/codebase docs. Focused compilation/tests and disposable Windows native lifecycle/PDF preview passed; manual native dialog/OS-login and Mac verification remain. No LAN or D5 implementation.

- 2026-10-04: completed authorized D5 host trust/listeners, pairing/owner browser access, CSRF and approved-agent/OpenAPI contracts. Updated codebase/platform/desktop/operations/API/index docs and HOST-ACCESS.md. Focused actual connectors/restart and transport tests passed; no D6 implementation or real deployment/trust changes.

- 2026-10-04: completed authorized D7 and user-requested chrome/theme/icon corrections. Updated authoritative multi-device/API/desktop/platform/host/session/operations/codebase docs. Exact focused results and deferred native/Mac/fault coverage are recorded above; no D8 implementation.

- 2026-10-04: completed authorized D8 implementation on Windows, including requested executable/taskbar branding. Added UPDATES.md and synchronized current architecture/platform/host/session/operations/API docs. Actual checks, corrected native failures and pending Mac/upgrade/feed checks recorded above. D9 and D10 not started.

- 2026-10-04: D9 Windows menu correction/native validation and 0.2.1 release handoff; user requested MAC-HANDOFF.md for execution on the Mac mini. Updated current guide/desktop/operations/update/index docs. Windows actual results and remaining Mac/two-device gate are recorded above; no D10 implementation.

- 2026-10-04 post-D9 correction: a real stopped Mac host exposed clean-client departure blocking on unavailable /operations/activity. Added bounded concurrent identity/activity policy and retained draft/settings/recovery/known-transfer guards; fresh local profiles no longer include an unused localhost placeholder. Version 0.2.2, production compilation/lint, 19 frontend and five Node cases passed. Windows package built; live stopped-Mac retest remains user/Mac handoff work. No new sprint or Mac release-gate success implied.
- 2026-10-04 Mac D9 partial: clean desktop install now runs Electron's native executable installer; corrected authenticated owned-server smoke setup/idle barrier and macOS menu assertion. Current 0.2.2 arm64 development app, owned-server/chrome smoke, scoped checks and focused cases passed. Exact environment, bundle hashes and remaining private-key/release/manual/two-device blockers are recorded in MAC-HANDOFF.md. Do not mark the D9 release gate complete.

- 2026-10-04 post-D9 layout correction: reviewed the Mac commit and retained its partial release gate. More/New collection now align with the content edge; page actions reserve only the native top band, with flexible long-title wrapping, consistent collection-row spacing and distinct empty/search messages. Production build/scoped lint/script syntax, seven focused Library/popover tests and one disposable Windows native layout check passed; dark/light/narrow frames reviewed. No installer, API smoke, Docker or Mac rerun. Design conventions recorded in CODEBASE.md to prevent repeating whole-row chrome spacers.

- 2026-10-07 release ownership/documentation: topic folders and links reorganized; INSTALLATION-AND-UPDATES.md and RELEASE-PROCESS.md define device steps and standing agent responsibility for versioned verified artifacts/source tags/GitHub publication. Added draft-only publisher and original-key artifact preflight; no automatic feed/CI secret or app release is implied. Mac DMG/native/two-device gates remain pending. This task is documentation/release tooling, not another desktop sprint. Validation: local-link/OpenAPI checks, script syntax, focused signature/checksum/platform/version guard test and dry-run preflight of the existing Windows package passed. No installer build/publication or native/API/Docker/Mac rerun.


## 0.3.0 — Coherent browsing and Windows-first release

Authorized 2026-10-07 as one coordinated update.

- [x] Shared content-sized browsing groups/rows and accurate per-type metadata queries; overview 12/type, full type 100/page.
- [x] Grouped pinned/recent quick access, collapsible/hideable sections, normalized device settings and consistent creation controls.
- [x] Same shell for Collections/Pinned; secondary row organization and local pin feedback retained.
- [x] Explicit missing-platform release upload mode preserving original bytes/tag.
- [x] Production compilation/scoped lint; eleven frontend, one backend settings and two Node artifact/publication cases passed.
- [x] Disposable packaged Windows visual session passed empty/sparse/101-note pagination, mixed pins, long titles, dark/light/narrow, collapse/hide/defaults, Escape/focus and native controls; eight frames inspected.
- [x] Fresh 0.3.0 Windows UI/server/installer, packaged check and original-key artifact preflight. Final installer is 244,860,425 bytes; current desktop/browser assets match with no obsolete files.
- [x] Release source 9ee968cbf2c4af0f58fe58bde1529d6007c34278 committed/pushed; immutable v0.3.0 tag pushed. Windows-only release published 2026-10-07T15:59:36Z; both GitHub asset digests/sizes match the verified pair. [Published release](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/v0.3.0).
- [ ] Mac arm64 package/native verification from the same release tag: blocked without arranged Mac access/original key there; Windows-first explicitly approved.
- [x] CODEBASE, Library/API/desktop/operations/release docs and exact Mac missing-platform handoff updated with actual checks and platform limitations. User update: download both Windows files → Updates → Import update → select .vaultor.json → Ready → Install update.

No broad API smoke or Docker rebuild is planned. API fixtures are allowed only for the requested disposable visual/package check; owner/revision/TLS checks remain intact.
# Scalable browsing correction — 0.3.1

Authorized 2026-10-07. Implemented: replace fixed type groups with mixed ordered lists and shared searchable type filters; normalize pinned shortcuts, persist sidebar type choices, unify type presentation, run focused checks/native visual validation, then publish a verified Windows 0.3.1 pair. Mac delivery requires native verification from the same immutable tag. No new resource type/database migration or save/navigation redesign.

Production frontend/desktop compilation, scoped ESLint, fresh embedded Java/server compilation and original-key artifact preflight passed. Forty-two focused frontend cases (Library, OrganizationViews, SidebarSections, ResourceTypeFilter, sidebarPreferences, PaneNavigation, CommandPaletteModal and navigationRefresh) and two backend cases (MixedBrowseTest and SidebarSettingsTest) passed. One disposable packaged Windows session passed mixed Recent order, pin filtering/type preference persistence, empty/sparse/102-resource paging, 101-note filtered paging, bounded type popover with 25 DOM-only future-choice layout fixtures, both themes/narrow long titles, collapse/hide/defaults, Escape/focus and native-control clearance. Eight frames were inspected; all five packaged UI files match dist and embedded browser assets byte-for-byte. A pin-envelope refactor initially altered the tag-page return type; compilation caught it and focused backend checks/fresh packaging passed after correction. No broad API/Docker run or user installation/uninstall; Mac native/package/two-device verification remains pending. Existing Browserslist/bundle-size/mixed-import/Java-agent/deprecation/ASAR warnings remain.

- [x] Windows 0.3.1 installer/sidecar verified; release source `6eb92e70b2a1279cc52116a7a0aaa2ea048d8b47` committed/pushed and immutable v0.3.1 tag pushed. Windows-only release published at 2026-10-07T17:06:07Z; both GitHub asset sizes/digests match local verified bytes. [Published release](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/v0.3.1).
- [ ] Mac arm64 package/native verification remains blocked; exact same-tag original-key handoff is in MAC-HANDOFF.md. Ubuntu/Mac Intel/Android remain outside this delivery.
- [x] Actual validation, compatibility, release checksums and user update steps recorded. Final publication-status documentation has no additional shipped-code effect.

## 0.3.2 — OLED appearance and Windows delivery

Authorized as one coordinated update, with OS unchanged as default and separate opaque OLED option.

- [x] Frontend/backend device preference, OS → Light → Dark → OLED cycle and native dark semantics.
- [x] True-black canvases, neutral raised surfaces, legacy editor/menu audit and stored transparency preservation.
- [x] Final focused/native checks and reviewed disposable frames. Production frontend/desktop and fresh embedded Java/server compilation, scoped lint, eleven focused frontend cases and two backend settings cases passed. One disposable packaged Windows session passed saved OLED reload, OS/cycle/native dark semantics, exact black main surfaces, all neutral text-token contrast checks, saved opacity restoration, palette/menu Escape/focus, notes/code/tables, side/floating previews, native-control clearance, settings/export/connections/hosting, narrow layout and reduced motion. Fourteen frames were captured; representative frames and the corrected preview clearance were inspected. All five packaged UI files match dist and embedded browser assets byte-for-byte. Original-key artifact preflight passed. Focused test fixtures and native assertions were corrected during validation; no broad API smoke, Docker build or user installation/uninstall was performed. Existing Browserslist/chunk/mixed-import/Java-agent/deprecation/ASAR warnings remain. Physical OLED hardware, Mac native packaging and two-device verification remain unverified.
- [x] Fresh UI/server, original-key Windows pair, immutable source/tag and verified GitHub publication. Windows-only 0.3.2 published at 2026-10-07T18:09:05Z from immutable tag v0.3.2 (`7fe56bc462aa9f44a25aaed296b2e62915bb61e0`). Both GitHub asset sizes/digests match the original-key verified pair. [Published release](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/v0.3.2). Mac packaging/native verification remains pending under the exact same-tag handoff. This publication-status documentation update has no additional architectural or shipped-code effect.
- [ ] Mac same-tag packaging/native verification; access/key on native Mac remains unavailable.

## 0.4.0 — Settings, images and expressive motion

Authorized 2026-10-08: three sequential sprints, one per implementation call, with discussion after each and one final release after Sprint 3. Preserve the resource/save/session model. No intermediate installer release is requested.

- [x] Sprint 1 (complete): focused settings window; Appearance/Workspace/Layout & previews/Keyboard; global search; flat rows/direct controls; scoped resets; saving feedback; focus/Escape; focused tests and one disposable visual session.
- [x] Sprint 2 (complete): resource-backed PNG/JPEG/WebP/GIF image insertion/tools, 20 MiB/40 MP bounds, originals retained, retry-safe uploads, shared editing, preview/clipboard, exports/archive/search; protocol 2 on both client and host.
- [x] Sprint 3 (complete): shared expressive Smooth motion (180–320 ms), preserved Snappy, accessible reduced motion, major-surface integration and focused checks.
- [ ] Final gate: fresh UI/server, 0.4.0 package+lock, original-key verified Windows installer/sidecar, committed/pushed immutable source tag and usable GitHub release; same-tag Mac handoff if verification remains unavailable.

Sprint 1 retains the current protocol and shipped version until the final release. Image bytes/nodes, protocol changes, new motion system and automatic updater feeds are not part of Sprint 1. Each sprint maintains CODEBASE and authoritative supporting docs with actual results.

Sprint 1 results (2026-10-08): frontend TypeScript/production compilation, scoped lint and fourteen focused settings/provider tests passed. Tests cover cross-category search/restoration, scoped controls, numeric validation/composition, failed-save retry, all reset scopes, shortcut conflicts/recording and keyboard/focus dismissal. Desktop helper syntax and whitespace checks passed. One focused disposable Windows native visual session (with a final rerun after screenshot-driven spacing polish) used fresh production UI and the existing verified 0.3.2 server; OLED black-canvas/persisted accent, Light/Dark, search, resets/Escape/focus, stable header height and narrow geometry passed. Eight frames were captured/reviewed, with final OLED/Keyboard/narrow frames rechecked. No backend changes/rebuild, broad API/Docker run, user installation or release publication. Mac and physical OLED hardware remain unverified. At the Sprint 1 handoff, two sprints remained; see the subsequent Sprint 2 results below for current status. [Settings guide](../workspace/SETTINGS.md) owns current behavior.


Sprint 2 results (2026-10-08): frontend TypeScript/production compilation, scoped ESLint, 23 focused frontend cases (seven upload/ownership/retry/order/anchor/shared-image cases, two real-editor schema safety/empty-document cases, eight platform/compatibility and six shared-document cases), twelve focused backend cases and five native-file Node cases passed. Backend cases cover bounded PNG/JPEG/GIF/WebP inspection/first-frame rendering, animation, references/remapping, saved alt/caption search, PDF/Word/Markdown/assets fidelity and protocol rejection. One disposable Windows native session passed actual OS screenshot paste, clipboard-file byte preservation, dimensions, width/alignment/caption/alt, native image copying, preview/replacement picker, Escape and saved session reload. Three frames were captured and inspected; the final helper rerun also verified reload after the host acknowledged image attributes. Strict validation exposed the valid existing empty doc-array representation and it was normalized without an automatic save. A retry-order test exposed reversed insertion order and was corrected. The clipboard harness was updated for Electron 44's async ClipboardItem API and compares actual clipboard File bytes because Windows can reencode pasted PNGs. Fresh development renderer and embedded browser/server assets match byte-for-byte; OpenAPI routes are included. No installer/version bump, release publication, Docker build, broad API smoke or user workspace mutation was performed. Existing Browserslist/chunk/mixed-import/Java deprecation warnings remain. Native Mac, browser clipboard permission prompts and interactive pointer/touch coverage remain unverified; pending upload bytes are memory-only, with exit warnings. Protocol 2 requires updated clients and hosts together. Sprint 3 (expressive Smooth, final integration and 0.4.0 delivery) remains the single next sprint; the final release gate is still open.


Sprint 3 results (2026-10-08): shared finite motion lifecycle/tokens cover settings/category/selection, sidebar disclosure, browsing/list reveals, dialogs/popovers, palette, previews, editor menus/image tools and alerts; source-owned focus restoration no longer waits two frames or uses a global editor. Production frontend/desktop and fresh Java/server compilation, scoped ESLint, 51 focused frontend cases across nine files and eight Node updater/artifact cases passed. The focused cases cover timing/reduced motion, anchored transforms, six-row reveal bounds, hidden-page deferral, refresh suppression, inert visual exits/interruption, captured focus, settings, sidebar request suspension, palette, browsing, upload and shared-document behavior. Previous Sprint 2's twelve backend image/export/search/protocol cases and five native-file cases remain the relevant validation; no backend behavior changed in Sprint 3. A disposable development integration followed by the final packaged Windows integration passed settings OLED/Light/Dark and persisted purple accent, real OS image paste/original bytes/native copy, placement tools and saved-session reload, Smooth/Snappy durations, actual 2 px hover feedback, moving markers, immediate Escape/source focus, Tab/Enter palette actions, retained editor/no typing animation, sidebar inert disclosure, narrow OLED and emulated reduced motion. Fourteen frames were captured; OLED/Smooth/narrow, Light/Dark, palette and image frames were reviewed. Native checks exposed source-focus restoration and initial-row reveal gaps; both were fixed with focused tests. Harness assertions normalize minified time units and send native Enter character events. All five packaged UI files match fresh dist and embedded browser JAR bytes, with no obsolete assets. Original-key preflight passed for the Windows installer and sidecar. No broad API/Docker run or user installation/uninstall; existing Browserslist/chunk/mixed-import/Java deprecation/ASAR warnings remain. Native Mac, real LAN/touch/browser clipboard prompts and physical OLED hardware remain unverified. Pending image bytes are memory-only. Windows-first 0.4.0 publication follows the final source/tag gate; MAC-HANDOFF.md specifies exact same-tag protocol-2 delivery.
