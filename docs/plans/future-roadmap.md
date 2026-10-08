# Deferred product roadmap

Reviewed 2026-10-08. This is the authoritative parking place for future scope; items here are not implemented or automatically authorized. Active resource work is in [resource-lifecycle-plan.md](resource-lifecycle-plan.md); existing native/platform blockers remain in the desktop tracker.

## Backups and recovery — explicitly deferred by the user

Priority: high for a later authorized milestone. No scheduled backup worker is added in the current lifecycle/search sprints.

Proposed outcome: scheduled local workspace backups, visible last-successful status, configurable retention/storage budget and a verified restore workflow. Updater recovery snapshots are not general backups. Define host ownership: a remote client must not independently snapshot a running host's SQLite files; the host performs consistent backups and clients request authorized operations.

Future plan must cover scheduling while tray hosting, missed runs after sleep, battery/disk limits, failures/retries, interrupted snapshots, full file inventory/hash verification, previewed restore, preserve-current-data recovery, workspace identity/generation, paused saves, paired-client disconnects, restore conflicts and test-restored copies. Store backups separately from live data; never commit/publish them. Include free local/external-drive destinations first. Cloud sync, paid services, backup encryption/passphrase/key recovery and backup of host trust require explicit design decisions, not silent introduction. Explain which portable backups exclude host credentials/device drafts and which private recovery snapshots include them.

Before implementation decide defaults for cadence, count/age/byte retention, destination, notifications, inclusion of Trash and recovery journals, and behavior when the app is closed. A test restore to disposable storage must precede claims of reliability. Link final runtime instructions from CODEBASE once implemented.

## Android client — next platform under consideration

The user is approaching Android work; readiness is active design scope, client implementation remains separately authorized. [ANDROID-READINESS.md](../architecture/ANDROID-READINESS.md) records contracts, decisions and the prototype gate. Preserve desktop/browser access and no mandatory payment. Do not interpret this as authorization for Play Store enrollment, APK publication, offline synchronization or unattended remote-host exposure.

## Later discovery and platform work

- OCR for screenshots/image-only PDFs after bounded PDF/text search, with local processing, coverage/cancellation and original-byte preservation. Office-document extraction, fuzzy search and other media indexing need separate evaluation.
- Full offline browsing/edit synchronization is separate from draft recovery; it needs mutation queues, conflict/deletion semantics and storage budgets across devices.
- Ubuntu native delivery remains the existing D10 deferred sprint; Mac native installation/update and real multi-device checks remain tracked blockers, not silently removed from scope.
- Thumbnail gallery/attachment maintenance may follow measured usage. Never automatically delete files merely because saved backlinks report no source: drafts, independent resources and another device's uploads can still depend on them.
- Performance follow-ups are grounded in [SCALE-INTEGRATION.md](../development/SCALE-INTEGRATION.md): 23.28-second Atlas startup, high shared-view process-tree memory, the large renderer bundle, bounded tag discovery, and cold-cache/concurrent-client measurements. These require a separately authorized plan; no general speedup or leak fix is claimed.

Maintain this file when priorities change. Move an item to an authorized tracker before implementing it and retain a link to its new owner rather than duplicate specifications.
