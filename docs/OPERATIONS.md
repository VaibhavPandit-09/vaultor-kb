# Development, Docker and debugging

## Verification policy

Keep routine checks minimal: compile affected code and check changed failure-prone behavior selectively. Do not run full suites, API smoke scripts or disposable Docker verification for every UI change. Keep APIs/scripts available for specific debugging or explicit requests. Browser/native checks are reserved for necessary interaction/visual questions. Commands below are available procedures, not a mandatory per-change checklist.

## Ordinary file import verification

Run `node scripts/file-import-smoke.mjs http://127.0.0.1:18080 --disposable` against the isolated test container. It creates five test resources and checks multipart imports, same-request retries, changed-payload conflicts, duplicate-title isolation, file byte equality, backlinks and integrity. It may run after the existing workspace smoke script on the same disposable volume.

Frontend text conversion caps at 5 MiB; CSV conversion caps at 10,000 rows, 500 columns and 50,000 cells. Keep larger files as original resources under the existing upload cap. Native Windows/Vivaldi pointer visibility needs a targeted keyboard-versus-mouse check; API/component tests cannot establish it.

## Local development

Install Java 25 and Node 20.19+ (Node 24 works). Use the checked-in Maven wrapper. Create backend/data/files before first standalone startup; SQLite needs its parent directory. In frontend run npm ci then npm run dev. In backend run ./mvnw spring-boot:run (PowerShell: .\mvnw.cmd spring-boot:run). Vite proxies /api to localhost:8080.

Checks: frontend npm run build, npm run lint, npm test; backend ./mvnw test. Tests use disposable SQLite/storage. The production Dockerfile embeds frontend assets in Spring Boot. Backend-only Dockerfile does not build the UI.

## Normal deployment

~~~powershell
docker compose build
docker compose up -d
docker compose logs -f --tail 200 vaultor
~~~

Compose binds 127.0.0.1:8080, stores /data in the named vaultor_data volume and restarts unless stopped. Existing data is retained. Do not run docker compose down -v on a real workspace. The workspace has no authentication. For deployment outside your own machine, make an explicit hosting/access decision rather than assuming this is a public multi-user service.

| Environment | Default | Purpose |
| --- | --- | --- |
| DB_PATH | ./data/app.db (Docker /data/app.db) | SQLite file |
| STORAGE_PATH | ./data/files (Docker /data/files) | Uploaded binaries; sibling operations/ stores transfer artifacts |
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
node scripts/api-smoke.mjs http://127.0.0.1:18080 --disposable
docker compose -p vaultor-check-unique -f docker-compose.yml -f docker-compose.verify.yml logs --tail 100
docker compose -p vaultor-check-unique -f docker-compose.yml -f docker-compose.verify.yml down
~~~

Wait for GET /api/health to return UP before running the script. Port 18080 must be free. The script intentionally creates/replaces test resources and leaves the volume for inspection. Normal production startup is separate from this verification.

## Correlating a UI failure

Open Diagnostics from the sidebar; inspect backend readiness, recent browser failures, request IDs and the integrity report. Download the report for a reproducible snapshot (it includes diagnostic messages/stacks, not note content). The Settings and editor recovery panels expose copyable details. Browser console output remains enabled.

Use the failed response's X-Request-ID / problem requestId in Docker logs:

~~~powershell
docker compose logs --since 10m vaultor | Select-String 'the-request-id'
~~~

Each API request logs method/path/status/duration. Transfer logs include operation ID, originating request ID, phase/progress and build. Unexpected backend errors include stacks. Logs are JSON on stdout/stderr, so no shell inside the container is needed. Configure Docker log rotation for long-running deployments. Browser diagnostics are best-effort bounded batches; their absence does not prove the browser had no error.

409 WORKSPACE_BUSY is temporary: wait for the transfer. Save failed retains the draft; restore backend connectivity and Retry before leaving. A CLEANUP operation reports that data already committed; a restart retries obsolete-file cleanup. Failed pre-commit operations leave the original metadata intact and may be retried from a fresh preview. Integrity findings are reports, never automatic repairs.

## Note export runtime

Both Dockerfiles install fontconfig for the bundled PDF fonts. Note exports use the existing operations directory, worker, logging and restart handling. MAX_NOTE_EXPORT_ASSET_BYTES defaults to 104857600, also capped by MAX_ARCHIVE_BYTES. Expire artifacts manually with the backend stopped; do not delete workspace files. See [NOTE-EXPORTS.md](NOTE-EXPORTS.md) for format fidelity and targeted verification.

## Startup failure after search indexing

A NoSuchElementException at Hibernate AbstractInformationExtractorImpl.columnInformation during entityManagerFactory initialization can occur when grouped schema discovery inspects SQLite FTS5/shadow columns with empty JDBC type names. Fresh-database tests alone do not cover this restart condition.

application.properties sets spring.jpa.properties.hibernate.hbm2ddl.jdbc_metadata_extraction_strategy=individually so schema update inspects mapped application tables instead. Keep this setting when changing database configuration. Do not delete the database, search tables or volume as a workaround, and do not disable all schema updates. Rebuild the image and run docker compose up -d to use the fix. Verify /api/health and /api/diagnostics/search, then verify one restart. The focused disposable regression is ExistingSearchIndexStartupTest.

Validated 2026-09-24: rebuilt normal Compose image; startup plus restart succeeded with the existing vaultor-kb_vaultor_data volume. Read-only health/search diagnostics reported ready and complete index coverage.
