# Desktop application and private-network hosting

Created/reviewed: 2026-10-04. Status: D1 complete; D2–D9 not started; D10 deferred.

## Delivery and maintenance

Deliver one sprint per explicit authorization, stop for discussion after its handoff, and do not interpret Continue as authorization for a subsequent sprint if the current one is already complete. An interrupted sprint may be resumed. The initial request authorized planning only; the subsequent “Start the first sprint” authorized D1 only.

Maintain this tracker after each completed task: checklists, decisions, blockers, exact checks and remaining limits. Update CODEBASE.md and relevant authoritative docs in the same change. Use docs/README.md for discovery. Historical trackers retain their history; their completed work is not restarted. Archive this tracker under docs/history/ when the sequence is complete, preserving current explanations in supporting docs.

Current code has unrelated/uncommitted N6 work. Preserve it. Inspect working tree and applicable instructions at the start of every sprint.

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

D1 outcome: implemented platform.ts/connection.ts and ConnectionGate, an explicit backend capability DTO/OpenAPI schema, shared configurable build information, request/stream ownership and browser platform file/clipboard actions. Application requests are compatibility-gated; raw bootstrap/diagnostics use the same transport without recursive reports. Queue delivery waits for compatibility, drops old-host events and remains bounded. Binary failures retain bounded JSON problem details. Sidebar defaults/normalization agree in frontend/backend; identical custom Mod+B necessarily migrates too. Details: [PLATFORM.md](PLATFORM.md).

Validation: frontend production build and final TypeScript check passed; targeted ESLint passed. 31 frontend checks passed across platform, shortcuts, note export and table-control files. Four DesktopContractTest backend cases passed, compiling main/test code. Whitespace/source-bypass inspection passed. Existing large-bundle/Browserslist and JVM/Mockito warnings remain. No browser/native visual check, Docker rebuild, broad API smoke, real workspace mutation or deployment. Native adapters/stream transport are contracts only; D2 is not started. No D1 blocker remains.

### D2 — Electron shell and persistent desktop identity

- [ ] Scaffold the dedicated desktop package, secure local UI origin, narrow validated preload bridge and single main window/single-instance behavior.
- [ ] Preserve native window controls, application menus, focus/Escape and existing editor appearance; allow external web links only through the OS browser.
- [ ] Add connection screen/compact switcher, offline/startup failure states and local profile storage. Connect to an existing loopback server in development; server bundling follows D3.
- [ ] Namespace desktop caches/sessions/recovery by host/workspace and establish persistent desktop session ownership across process restarts, independent of browser tabs.
- [ ] Bridge main-process transport, credential/trust placeholders and cancellation without exposing arbitrary IPC/network targets to uploaded content.
- [ ] Focused checks: relaunch/session isolation, renderer boundaries, invalid IPC, denied unintended navigation, unreachable host and browser build. One Windows native launch/editor check; Mac launch when the Mac mini is available.

Acceptance: installed-style window runs the bundled UI, reconnects safely and retains its session across app relaunch without changing browser sessions.

### D3 — Bundled local server, runtime and data ownership

- [ ] Bundle target Java runtime/JAR and license notices; launcher starts on local use, waits for readiness and negotiates identity/protocol.
- [ ] Establish application-data paths, directory lock, process ownership, port conflict handling and local owner/control channel. Never adopt an unknown server or use Docker data automatically.
- [ ] Retain files/workspace/host identity outside app installation; handle write permissions, insufficient space and missing/corrupt runtime with recovery UI.
- [ ] Capture bounded JVM/shell startup and crash logs; expose them through Diagnostics without secrets. Implement three-attempt restart/backoff and graceful owned-process stop.
- [ ] Produce development packages for Windows x64/Mac arm64 without requiring installed Java/Docker; final release installation is D8.
- [ ] Focused disposable checks: first/second startup, locked directory, occupied port, server crash, failed startup, no orphan/duplicate process, data preserved after replacement of app files. Native checks on both target machines.

Acceptance: a clean personal installation opens a local workspace and browser endpoint with no external runtime, while existing workspace data remains intact.

### D4 — Native file operations, hosting lifecycle and login startup

- [ ] Native save/open flows for notes/workspace/table exports, file imports and existing previews. Stream large binaries to disk instead of IPC/base64 buffering entire archives.
- [ ] Distinguish preparation, save-dialog cancellation, actual successful disk write and retry; cancellation must not rerender an export. Browser download semantics remain truthful.
- [ ] Tray/menu-bar hosting controls, Show app/Open in browser, close-to-background explanation, explicit Quit and bounded save/recovery/operation barrier.
- [ ] Start at login toggle, off by default, with start-in-background while sharing. Surface OS-denied startup registration; never silently override the user/OS setting.
- [ ] Sleep/resume and quit during failed saves: retain drafts, show whether clients will be disconnected, do not claim unload requests guarantee saving.
- [ ] Focused checks: file cancel/write failure/retry, close versus quit, login setting, app reopen/focus and unchanged browser import/export. One necessary native dialog/lifecycle session per OS.

Acceptance: desktop file/lifecycle behavior is native, start-at-login is usable, and merely closing the window cannot unexpectedly stop hosting.

### D5 — Host HTTPS and persistent pairing services

- [ ] Separate host identity/trust/pairing storage from portable workspace settings. Create/renew unique CA/leaf material; preserve approval through workspace replacement.
- [ ] Separate owner loopback access from opt-in HTTPS network access; close all API/static-binary/export/diagnostic/stream bypasses and replace wildcard paired-mode CORS.
- [ ] Implement enrollment, code-bound host approval, durable credentials, browser cookies/CSRF, device list/revoke and strict owner-only management.
- [ ] Implement local Open in browser handoff and standalone/Docker owner-bootstrap procedure; keep network peer approval available without the Electron host window.
- [ ] Add structured pairing/access/TLS errors and bounded request logging with no credentials/codes/private keys. Extend OpenAPI and approved-agent instructions.
- [ ] Define trusted-host lifecycle: pinning, changed trust verification, leaf renewal/address updates and public certificate export; no automatic OS trust changes.
- [ ] Disposable service/API checks specifically for unapproved access, approval/retry/replay/expiry, revocation, restart persistence, certificate renewal, replacement identity and cookie/CSRF/CORS protections. Check both connectors, not only controller methods.

Acceptance: approval survives normal lifecycle changes, unapproved peers cannot use workspace APIs, and no reintroduced encrypted-note/login flow is required.

### D6 — Sharing, discovery, browser trust and server switching UX

- [ ] Compact host switcher with This computer, remembered servers, Nearby and manual address; search and keyboard form behavior, status/pending/error feedback.
- [ ] Sharing controls, mDNS advertise/discover/withdraw, remembered identity re-resolution, firewall/private-network troubleshooting and browser-address copy/open actions.
- [ ] Matching-code pairing UI, Devices management, browser first-approval UI and public certificate trust/removal instructions for Windows/Mac browser clients.
- [ ] Atomic switch with destination validation, source save/settings/recovery barrier, Keep drafts and switch, origin-bound exports and cancelled stale previews/requests/commands.
- [ ] Local hosting persists while displaying a remote workspace; forgetting/revoking connections does not delete drafts or resource data. Returning restores that host's layout/context.
- [ ] Focused two-host disposable checks: duplicate names/copied workspace identities, changed IP, failed discovery/manual fallback, switch failure/stale completion, pending exports/imports, recovery-storage failure, restart without repeat approval and browser trust setup.

Acceptance: two desktops can connect without repeated pairing, local/remote switching never mixes data/drafts, and paired LAN browser access works without routine certificate warnings.

### D7 — Multi-device change propagation and mutation reliability

- [ ] Commit-only bounded SSE notifications/replay/gap refresh, authentication/revocation, reconnect and selected-host ownership.
- [ ] Reconcile Library/sidebar/backlinks/open clean documents while preserving dirty content/title/undo and source-specific conflicts; avoid navigation flicker or broad refresh per keystroke.
- [ ] Audit and fix cross-device settings updates/metadata mutations; add atomic scoped settings contract and require revision preconditions on network note writes.
- [ ] Handle other-device deletion and workspace replacement with retained recovery copies; event replay never replays commands/imports/downloads.
- [ ] Emit operation/hosting restart notifications without making an unreachable client block shutdown indefinitely.
- [ ] Targeted disposable two-client checks: simultaneous notes/settings/pins/memberships, committed rollback/no-event, gap/reconnect/restart, stale notes, deletion/replacement and no diagnostics/log storms.

Acceptance: saved changes appear on other devices, stale edits never silently overwrite, settings updates do not lose another client's fields, and reconnect reconciles safely.

### D8 — Personal installers, existing-data onboarding and zero-cost updates

- [ ] Windows x64 installer and macOS arm64 ad-hoc app/DMG with bundled runtime. State unknown-publisher/Gatekeeper approval steps honestly; no paid signing/notarization promises.
- [ ] Existing Docker onboarding: connect to upgraded compatible server or explicitly export/import into This computer. Browser-only/Docker hosting remains supported with documented pairing management configuration.
- [ ] Release manifest/checksums/application release signature, local update-package import, configurable HTTPS feed and in-app check/download/progress/errors. Unconfigured feed remains a valid personal setup.
- [ ] Update quiescence, host restart notice, consistent backup, previous-version retention, failure recovery and explicit Mac manual replacement handoff. Preserve data/trust/pairing/login preference.
- [ ] Build/release scripts run on user's own Windows/Mac machines; include exact free prerequisites/license notices. Never publish releases or incur subscriptions automatically.
- [ ] Targeted native install/upgrade/uninstall/reinstall checks with disposable data and corrupted/wrong-platform/oversized/unsigned-manifest packages. Test migration failure/restore and client-only update not altering remote host.

Acceptance: personal packages need no payment/external runtime, existing data stays discoverable, and in-app update workflow has no false claim of unattended Mac installation or successful download before disk completion.

### D9 — Windows/Mac integration and release handoff

- [ ] One bounded real two-device session using Windows and the Mac mini, with separate desktop/browser approvals and both hosting directions.
- [ ] Verify first launch, local/network/browser access, relaunch, background sharing, login startup, sleep/resume, changed address, revoke/reapprove, incompatible server and TLS renewal.
- [ ] Verify note links/table editing/shared panes, native uploads/previews/downloads, failed-save switch/recovery, cross-device edits, conflicts, replacement, export while switching and hosting update/recovery.
- [ ] Check both themes, narrow window, keyboard dialogs/shortcuts, reduced motion and safe quit with local/remote active clients. Keep it targeted; do not repeatedly explore unrelated UI.
- [ ] Complete build/install/trust/pairing/network/update/debugging/API docs and CODEBASE source map. Record exact OS/browser versions, actual results, unavailable access and limitations rather than marking unperformed checks passed.
- [ ] Preserve zero-cost and no-Android boundary. Summarize installer size/runtime footprint measured on the test machines, rather than promising a lightweight app.

Release gate: Windows and Mac personal installers, no external Java/Docker requirement, browser retained, opt-in paired HTTPS LAN use, persistent approvals, isolated sessions/drafts, reliable saved-state refresh, native file/lifecycle behavior, working login option and recoverable update path. No user data mutation during verification.

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
| GET /api/host | Bounded public host name/identity/protocol hint |
| POST /api/pairings; GET /api/pairings/{id}; POST /api/pairings/{id}/complete | Enrollment, secret-bound status and retry-safe credential/cookie completion |
| POST /api/owner/pairings/{id}/approve or /reject | Owner-only code-verified decision |
| GET /api/owner/devices; DELETE /api/owner/devices/{id} | Owner-only approved device listing/revocation |
| GET/PUT /api/owner/sharing | Owner-only current hosting configuration; disabling closes listener/streams |
| GET /api/owner/trust/certificate | Owner-only public trust certificate export; never private material |
| GET /api/events | Approved SSE invalidations with resume/gap behavior |
| PATCH /api/settings | Atomic scoped updates, validation and concurrency errors; replaces overlapping full-document client writes |
| PUT /api/resources/{id}/note | Existing conditional update; paired network callers must provide If-Match |
| Existing resources, organization, transfer, diagnostics APIs | Same services, approved access, request IDs and cancellation semantics |

Native platform interfaces cover connection verify/activate, host start/stop/status, discovery/pairing/revoke, request/upload/download/event stream, file save/open, external links, login startup and update staging/installation handoff. No UI action accepts raw shell commands or unrestricted paths. Connection changes invalidate all stale renderer callbacks by connection epoch.

## Tracking, dependencies and actual validation

| Sprint | State | Result |
| --- | --- | --- |
| D1 | Complete | Platform/compatibility foundation; Ctrl+Alt+B migration; build/lint, 31 frontend and 4 backend checks passed |
| D2 | Not started | Depends on D1 |
| D3 | Not started | Depends on D2; Mac access needed for native validation |
| D4 | Not started | Depends on D3 |
| D5 | Not started | Depends on D3–D4 |
| D6 | Not started | Depends on D5 |
| D7 | Not started | Depends on D6; required before LAN release |
| D8 | Not started | Depends on D7; release feed is optional, local packages are baseline |
| D9 | Not started | Depends on D8; two-device/Mac access required |
| D10 | Deferred follow-up | Requires separate authorization and Ubuntu validation environment |

Planning validation: inspected current guide/index, session/recovery identities, transport/diagnostics/download implementations, server config/CORS and packaging. No code edits, runtime checks, builds, tests, purchases, certificate installation, network exposure or deployment performed. Plan docs were reviewed for cross-sprint coverage and preservation of existing N6 work.

Dependencies/risks to track: availability/access to Mac mini (confirmed by user; connection not arranged), disposable second-device data, future Ubuntu environment, personal Gatekeeper/Windows approval friction, browser trust store differences, mDNS/firewall behavior, OS-protected storage, installer size and updater recovery. No paid signing or hosting is a blocker for the personal baseline. Optional release-feed URL/publisher configuration can remain unset; no invented repository or publishing authorization.

Deferred work: Android, Mac Intel, full offline database/sync, collaborative typing, multiple local workspaces, public Internet hosting, paid publisher signing/notarization and unattended standard Mac updating. These cannot be silently added to the sprint scope.

### Maintenance history

- 2026-10-04: created decision-complete D1–D9 Windows/Mac sequence plus separately authorized D10 Ubuntu follow-up; documentation only. No implementation sprint started or execution checks claimed.
- 2026-10-04: implemented authorized D1, preserving unrelated N6 work; updated PLATFORM/API/navigation/operations/codebase/index docs. Production build, final TypeScript, targeted lint, 31 frontend and 4 backend focused checks passed. Stopped before D2; no hosting/pairing/desktop packaging or live deployment performed.
