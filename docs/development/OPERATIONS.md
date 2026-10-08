# Development, Docker and debugging

## Desktop development (D5)

Run npm --prefix desktop ci, npm --prefix desktop run build, npm --prefix desktop run prepare-server, then npm --prefix desktop start. This computer starts its own bundled Temurin/Spring child and separate application-data workspace; remembered existing loopback servers remain available. package:dev creates a portable development folder requiring neither installed Java nor Docker. Build tools still need Java 25/Node. Sharing is off by default; D5 host HTTPS/pairing services are implemented, with desktop/client pairing UX and D7 saved-change reconciliation implemented. No installer exists yet. [DESKTOP.md](../desktop/DESKTOP.md) owns setup, ownership, paths, bounded logs, native files, tray/login lifecycle and transfer limits. Windows portable launch/editor/relaunch was verified on disposable data with no installed Java in its environment; Mac verification is pending.

## D1 build and compatibility

The UI checks `/api/capabilities` before settings/workspace loads. A server without D1 metadata requires updating; an unsupported minimum requires a client update. Current protocol remains 1; deploy the current frontend/backend together to provide D7 PATCH and change-feed contracts. Protocol alone does not establish endpoint availability. `BUILD_VERSION` labels backend health/capabilities/request/operation logs (standalone and owned launcher default desktop-d7); `VITE_BUILD_VERSION` labels the built frontend (default desktop-d7). Electron package version is separate. Build strings do not determine compatibility; runtime variables do not relabel an already-built frontend. Diagnostics includes these values, protocol and desktop-owned startup logs; see [PLATFORM.md](../architecture/PLATFORM.md).

D1 adds no Electron process, JVM launcher, host switcher, authentication, LAN exposure or installer. Browser same-origin `/api` access remains the deployed transport. Focused contract tests mock adapters/repositories and do not mutate a workspace. No Docker rebuild or live API smoke was performed for this change.

## Verification policy

Keep routine checks minimal: compile affected code and check changed failure-prone behavior selectively. Do not run full suites, API smoke scripts or disposable Docker verification for every UI change. Keep APIs/scripts available for specific debugging or explicit requests. Browser/native checks are reserved for necessary interaction/visual questions. Commands below are available procedures, not a mandatory per-change checklist.

## Ordinary file import verification

Run `node scripts/file-import-smoke.mjs http://127.0.0.1:18080 --disposable` against the isolated test container. It creates five test resources and checks multipart imports, same-request retries, changed-payload conflicts, duplicate-title isolation, file byte equality, backlinks and integrity. It may run after the existing workspace smoke script on the same disposable volume.

Frontend text conversion caps at 5 MiB; CSV conversion caps at 10,000 rows, 500 columns and 50,000 cells. Keep larger files as original resources under the existing upload cap. Native Windows/Vivaldi pointer visibility needs a targeted keyboard-versus-mouse check; API/component tests cannot establish it.

## Local development

Install Java 25 and Node 20.19+ (Node 24 works). Use the checked-in Maven wrapper. Create backend/data/files before first standalone startup; SQLite needs its parent directory. In frontend run npm ci then npm run dev. In backend run ./mvnw spring-boot:run (PowerShell: .\mvnw.cmd spring-boot:run). Vite proxies /api and /access to 127.0.0.1:8080 on fixed port 5173; use the local browser handoff described in HOST-ACCESS.md.

Checks: frontend npm run build, npm run lint, npm test; backend ./mvnw test. Tests use disposable SQLite/storage. The production Dockerfile embeds frontend assets in Spring Boot. Backend-only Dockerfile does not build the UI.

## Normal deployment

~~~powershell
docker compose build
docker compose up -d
docker compose logs -f --tail 200 vaultor
~~~

Compose binds 127.0.0.1:8080, stores /data in the named vaultor_data volume and restarts unless stopped. Existing data is retained. Do not run docker compose down -v on a real workspace. Owner access now requires a local owner key/browser handoff; opt-in HTTPS clients require host approval. [HOST-ACCESS.md](../security/HOST-ACCESS.md) owns bootstrap, trust, owner/device APIs and recovery. Do not expose the HTTP owner port on LAN or the Internet.

| Environment | Default | Purpose |
| --- | --- | --- |
| DB_PATH | ./data/app.db (Docker /data/app.db) | SQLite file |
| STORAGE_PATH | ./data/files (Docker /data/files) | Uploaded binaries; sibling operations/ stores transfer artifacts |
| HOST_ACCESS_PATH | ./data/host-access (Docker /data/host-access) | Separate host secrets, approvals and sharing preference |
| HOST_NETWORK_PORT | 8443 | Opt-in HTTPS listener; not published by Compose by default |
| OWNER_BIND_ADDRESS | 127.0.0.1 (Docker 0.0.0.0 internally) | HTTP owner listener; publish only host loopback |
| HOST_ACCESS_PATH | ./data/host-access (Docker /data/host-access) | Separate host secrets, approvals and sharing preference |
| HOST_NETWORK_PORT | 8443 | Opt-in HTTPS listener; not published by Compose by default |
| OWNER_BIND_ADDRESS | 127.0.0.1 (Docker 0.0.0.0 internally) | HTTP owner listener; publish only host loopback |
| LOG_LEVEL | INFO | com.vaultor structured application log level |
| MAX_UPLOAD_SIZE | 512MB | Multipart file/request cap |
| MAX_ARCHIVE_BYTES | 536870912 | Compressed import/export limit |
| MAX_EXPANDED_BYTES | 2147483648 | Expanded archive limit |
| MAX_ARCHIVE_ENTRIES | 20000 | ZIP entry count |

JSON entries are additionally limited to 20 MiB. Keep upload and archive limits consistent; multipart framing requires headroom near the upload limit. Run one backend per data directory. Transfer operation history/staging/export artifacts currently have no automatic expiry. Clean old terminal-operation directories only while the backend is stopped, and retain any PREVIEW or unfinished-operation directories/journals. No cleanup should touch resource files or the SQLite database.

## Isolated Docker verification

The verification Compose file uses the built image, loopback port 18080 and a project-specific named volume. Choose a new project name for each run because the script rejects nonempty storage. This example never mounts the normal workspace volume:

~~~powershell
docker compose build
docker compose -p vaultor-check-unique -f docker-compose.yml -f docker-compose.verify.yml up -d --no-build
# Copy only the disposable container's owner key to a private temporary file first.
docker compose -p vaultor-check-unique -f docker-compose.yml -f docker-compose.verify.yml cp vaultor:/data/host-access/owner.key "$env:TEMP/vaultor-check-owner.key"
$env:VAULTOR_OWNER_KEY_FILE = "$env:TEMP/vaultor-check-owner.key"
# Copy only the disposable container's owner key to a private temporary file first.
docker compose -p vaultor-check-unique -f docker-compose.yml -f docker-compose.verify.yml cp vaultor:/data/host-access/owner.key "$env:TEMP/vaultor-check-owner.key"
$env:VAULTOR_OWNER_KEY_FILE = "$env:TEMP/vaultor-check-owner.key"
node scripts/api-smoke.mjs http://127.0.0.1:18080 --disposable
Remove-Item -LiteralPath $env:VAULTOR_OWNER_KEY_FILE
Remove-Item Env:VAULTOR_OWNER_KEY_FILE
Remove-Item -LiteralPath $env:VAULTOR_OWNER_KEY_FILE
Remove-Item Env:VAULTOR_OWNER_KEY_FILE
docker compose -p vaultor-check-unique -f docker-compose.yml -f docker-compose.verify.yml logs --tail 100
docker compose -p vaultor-check-unique -f docker-compose.yml -f docker-compose.verify.yml down
~~~

Use the disposable owner credential and wait for GET /api/health to return UP before running the script. Port 18080 must be free. The script intentionally creates/replaces test resources and leaves the volume for inspection. Normal production startup is separate from this verification.

## Correlating a UI failure

Open Diagnostics from the sidebar; inspect backend readiness, recent browser failures, request IDs and the integrity report. Download the report for a reproducible snapshot (it includes diagnostic messages/stacks, not note content). The Settings and editor recovery panels expose copyable details. Browser console output remains enabled.

Use the failed response's X-Request-ID / problem requestId in Docker logs:

~~~powershell
docker compose logs --since 10m vaultor | Select-String 'the-request-id'
~~~

Each API request logs method/path/status/duration. Transfer logs include operation ID, originating request ID, phase/progress and build. Unexpected backend errors include stacks. Logs are JSON on stdout/stderr, so no shell inside the container is needed. Compose limits JSON logs to three 10 MiB files; standalone stdout redirection needs its own rotation. Browser diagnostics are best-effort bounded batches; their absence does not prove the browser had no error.

409 WORKSPACE_BUSY is temporary: wait for the transfer. Save failed retains the draft; restore backend connectivity and Retry before leaving. A CLEANUP operation reports that data already committed; a restart retries obsolete-file cleanup. Failed pre-commit operations leave the original metadata intact and may be retried from a fresh preview. Integrity findings are reports, never automatic repairs.

## Note export runtime

Closing the note export picker keeps its frontend status controller running; failures and Download again remain in a compact status card. Details exposes operation/request IDs for correlation. Refresh stops client tracking but does not cancel backend rendering; use the operation API to retrieve an existing result. If POST creation loses its response, inspect diagnostics/logs before creating another export. No deployment or runtime configuration changes are required for this UI flow.

Both Dockerfiles install fontconfig for the bundled PDF fonts. Note exports use the existing operations directory, worker, logging and restart handling. MAX_NOTE_EXPORT_ASSET_BYTES defaults to 104857600, also capped by MAX_ARCHIVE_BYTES. N5 adds MAX_NOTE_EXPORT_NODES=200, MAX_NOTE_EXPORT_DEPTH=20 and MAX_NOTE_EXPORT_TOTAL_BYTES=157286400. Limits fail explicitly; a changed graph fingerprint returns 409 before creating an operation. Graph snapshot copying holds the workspace gate briefly; rendering runs outside it. Final artifacts are capped by MAX_ARCHIVE_BYTES. Expire artifacts manually with the backend stopped; do not delete workspace files. See [NOTE-EXPORTS.md](../workspace/NOTE-EXPORTS.md) for format fidelity and targeted verification.

## Startup failure after search indexing

A NoSuchElementException at Hibernate AbstractInformationExtractorImpl.columnInformation during entityManagerFactory initialization can occur when grouped schema discovery inspects SQLite FTS5/shadow columns with empty JDBC type names. Fresh-database tests alone do not cover this restart condition.

application.properties sets spring.jpa.properties.hibernate.hbm2ddl.jdbc_metadata_extraction_strategy=individually so schema update inspects mapped application tables instead. Keep this setting when changing database configuration. Do not delete the database, search tables or volume as a workaround, and do not disable all schema updates. Rebuild the image and run docker compose up -d to use the fix. Verify /api/health and /api/diagnostics/search, then verify one restart. The focused disposable regression is ExistingSearchIndexStartupTest.

Validated 2026-09-24: rebuilt normal Compose image; startup plus restart succeeded with the existing vaultor-kb_vaultor_data volume. Read-only health/search diagnostics reported ready and complete index coverage.

## Navigation and shared-note debugging

Pane navigation and duplicate note views are frontend state; there are no new N2 API endpoints or schema changes. Use focused PaneNavigation/sharedNoteDocuments tests for source routing, stale requests and shared undo. Failed source saves keep the pane visible and expose Retry. Do not diagnose a file preview as a history step. Refresh recovery and cross-tab revision conflicts are N4 work; current drafts remain in memory. See [NAVIGATION.md](../workspace/NAVIGATION.md).


## Session/recovery debugging

See [SESSIONS.md](../workspace/SESSIONS.md) for the authoritative local-storage and revision contracts. Diagnose stale saves using 412 NOTE_REVISION_CONFLICT and request IDs; do not strip If-Match to make a draft overwrite saved content. GET /api/workspace/identity distinguishes replacement generations. Browser IndexedDB storage is tied to the exact origin, independently of Docker data volumes. Do not clear site data while investigating unsaved drafts. The focused SessionRevisionTest uses disposable SQLite/storage and verifies existing-schema upgrade plus replacement isolation; frontend sessionRecovery.test.ts uses fake-indexeddb (development-only dependency). No container rebuild is required for routine frontend development checks.

N6 configures Hikari maximum-pool-size and minimum-idle to 1 for SQLite. This prevents concurrent deferred transaction lock upgrades; reads also queue. Keep transactions short and run only one backend per database. SessionRevisionTest additionally exercises simultaneous note saves. Final coverage: [INTEGRATION.md](../workspace/INTEGRATION.md).

D4: closing the desktop hides to tray; explicit Quit checks durable drafts/layout and active operations, then warns that hosting clients disconnect. Start at login is opt-in in the connection picker; inspect OS startup settings if denied. Sleep/resume does not replay failed mutations. Native imports/downloads stream up to 512 MiB; main file-cache has a 512 MiB aggregate bound and startup age cleanup. Interrupted owned transfers retain their server journals; use status/diagnostics after restart. No LAN access is enabled by D4.

D6: restart the development app via explicit tray Quit then `npm --prefix desktop start` to use rebuilt desktop/ui and bundle. Connections & hosting is in the sidebar/window/tray menu; shared access is off by default. Hosting shows private HTTPS browser URLs, public certificate export, device approval/revoke, startup and logs on demand. Main refreshes address certificates on interface changes/resume. Read-only panels do not restart a stopped host, and selecting a remote workspace keeps local hosting alive. For browser trust, manual Docker HTTPS publication and private-network troubleshooting, use HOST-ACCESS.md. No firewall/OS trust is configured automatically. Targeted two-host/native checks use disposable storage; there is no requirement for routine Docker or broad API smoke.

## Saved-change debugging (D7)

Capabilities advertise changeFeed/scopedSettings. Use approved `/api/changes` when debugging a specific stale-state issue; correlate its requestId with ordinary mutation logs. Events contain no note content. A reset means reconcile saved state, never replay mutations. Disconnection/revocation is expected, not a recursive diagnostic failure. Keep one backend per SQLite directory. Global spring.jpa.open-in-view is false; RequestEntityManager supports ordinary MVC paths but excludes long-running changes streams so they cannot monopolize SQLite’s single connection. Do not restore global OSIV to fix lazy DTO reads.

Settings clients use transactional PATCH leaves, not overlapping full-document PUT. HTTPS notes require If-Match (428 missing, 412 stale). Host restart notices are best effort; reconnect/reset is authoritative. See MULTI-DEVICE.md for bounds, recovery, concurrency limits and focused check results. `smoke:chrome` uses disposable storage and test-only Windows pointer input; it is for reported native regressions, not a routine development requirement.

## Personal installer/update operations (D8)

Use [UPDATES.md](../desktop/UPDATES.md) as the authoritative build, key continuity, optional feed, backup/recovery and existing-Docker onboarding guide. Build/UI/server preparation precedes package:release. No release publishing, paid OS signing or remote migration occurs automatically. Windows npm start now launches a cached branded Vaultor.exe; quit the old app first and repin obsolete Electron shortcuts if necessary. The update dialog remains accessible through the native menu even if the owned server fails startup. The disposable installer-smoke.ps1 refuses an existing Vaultor installation; do not substitute real app data in tests. Mac package/native verification remains pending.

D9 manual integration: VAULTOR_DESKTOP_TEST_DIRECTORY must be an absolute dedicated directory chosen for the test, initially empty for fresh D9 fixtures; Atlas intentionally reuses its marked synthetic profile. It isolates Electron profiles, sessions, owned server and update staging; clear the environment variable before normal user launch. Unlike smoke-directory variables, it does not trigger automated scenarios. Never test login registration assuming terminal-only variables will be inherited. Use MAC-HANDOFF.md for Mac and both-machine instructions and cleanup.


## Primary synthetic workspace

[Vaultor Lab — Atlas](PRIMARY-TEST-WORKSPACE.md) is generated under ignored `desktop/cache/atlas`: 5,000 resources, a separate host/profile and verified portable baseline. `node desktop/scripts/atlas.mjs open` launches it without changing the personal connection. Quit its app/tray before generation, verification or `reset --discard-lab-changes`; reset refuses unmarked/foreign storage and uses confirmed normal archive replacement. Python/Pillow/ReportLab are needed only for regeneration. [ATLAS-BASELINE.md](ATLAS-BASELINE.md) records actual API/native timings, memory snapshots and startup/narrow-layout findings; no cold-cache, Android or slow-network certification is claimed.

### Focused grouped-browsing packaged check

Set VAULTOR_LAYOUT_SMOKE=1 and run `node desktop/scripts/chrome-smoke.mjs "<absolute packaged executable>"`. This is one targeted visual/native session, not the broad chrome/API suite. It creates an owned disposable workspace with empty/sparse/mixed-pinned and 101-note paginated fixtures, using normal owner authorization; it checks both themes, narrow long titles, content-sized borders, sidebar collapse/hide/defaults, Escape/focus restoration and native-control clearance. Review eight browse-*.png frames under ignored desktop/artifacts. No real workspace is used. Existing independent launch/edit/relaunch checks remain separately available.

## Lifecycle validation and rollback

0.5.0 adds protocol-3 Trash/Restore and archive format 3. See [RESOURCE-LIFECYCLE.md](../workspace/RESOURCE-LIFECYCLE.md). `desktop/scripts/lifecycle-check.mjs` always creates an isolated temporary profile, uses its owned protected host, injects a disposable binary cleanup failure, restarts that host and checks native Actions/Trash/Restore/shared-view reconciliation through CDP. Set VAULTOR_BUILD_BUNDLE to the freshly verified release bundle and run it against matching win-unpacked artifacts. It preserves screenshots/report under its reported temp directory; it is not shipped in installers and never opens Atlas/personal data. No old executable should write to an upgraded database; rollback restores a matching pre-upgrade backup.

## Focused discovery check

Run `node desktop/scripts/discovery-check.mjs` against the freshly packaged Windows executable. It creates protected disposable data/profile under the system temp directory, uses generated Atlas PNG fixtures from ignored desktop/cache/atlas/media, checks category/reference counts and bounded thumbnails, and exercises source occurrence navigation/focus with screenshots. `--final` rechecks affected references/source/narrow behavior without repeating all theme frames. This small fixture is not an Atlas performance measurement, real LAN/touch check or physical OLED verification.
