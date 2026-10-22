# Deferred product roadmap

Reviewed 2026-10-22. This is the authoritative parking place for deferred scope; listing an item is not implementation authorization. Active resource work is in [resource-lifecycle-plan.md](resource-lifecycle-plan.md); existing native/platform blockers remain in the desktop tracker.

## Backups and recovery — explicitly deferred by the user

Priority: high for a later authorized milestone. No scheduled backup worker is added in the current lifecycle/search sprints.

Proposed outcome: scheduled local workspace backups, visible last-successful status, configurable retention/storage budget and a verified restore workflow. Updater recovery snapshots are not general backups. Define host ownership: a remote client must not independently snapshot a running host's SQLite files; the host performs consistent backups and clients request authorized operations.

Future plan must cover scheduling while tray hosting, missed runs after sleep, battery/disk limits, failures/retries, interrupted snapshots, full file inventory/hash verification, previewed restore, preserve-current-data recovery, workspace identity/generation, paused saves, paired-client disconnects, restore conflicts and test-restored copies. Store backups separately from live data; never commit/publish them. Include free local/external-drive destinations first. Cloud sync, paid services, backup encryption/passphrase/key recovery and backup of host trust require explicit design decisions, not silent introduction. Explain which portable backups exclude host credentials/device drafts and which private recovery snapshots include them.

Before implementation decide defaults for cadence, count/age/byte retention, destination, notifications, inclusion of Trash and recovery journals, and behavior when the app is closed. A test restore to disposable storage must precede claims of reliability. Link final runtime instructions from CODEBASE once implemented.

## Multi-workspace and Android companion — promoted to planning

[The replacement 13-sprint tracker](workspace-companion-plan.md) retains the original intentions and execution history. W1–W3/R1–R6 are implemented; R6 is integrated on master and published as Android alpha.23, compatible with Windows0.14.0. The [R7–R10 reconciliation](R7-R10-RECONCILIATION.md) owns current remaining-milestone planning, pending approval: imports, full/partial exports, remaining settings/discovery/verified updates and integrated readiness. Physical acceptance and integrated Mac verification remain unclaimed. The old A8/A9 and editing-led A1–A7 UI are historical, superseded by the reader companion and current R6 design. Do not implement from this parking document or treat planning as implementation authorization. General mobile document editing and two-way fork sync remain deferred.

## Later discovery and platform work

- OCR for screenshots/image-only PDFs after bounded PDF/text search, with local processing, coverage/cancellation and original-byte preservation. Office-document extraction, fuzzy search and other media indexing need separate evaluation.
- Source-bound offline reading/reviews/import queues are now owned by the companion plan. General offline document-edit synchronization remains deferred; it is not implied by those narrower queues.
- Ubuntu native delivery remains the existing D10 deferred sprint; Mac native installation/update and real multi-device checks remain tracked blockers, not silently removed from scope.
- Thumbnail gallery/attachment maintenance may follow measured usage. Never automatically delete files merely because saved backlinks report no source: drafts, independent resources and another device's uploads can still depend on them.
- Performance follow-ups are grounded in [SCALE-INTEGRATION.md](../development/SCALE-INTEGRATION.md): 23.28-second Atlas startup, high shared-view process-tree memory, the large renderer bundle, bounded tag discovery, and cold-cache/concurrent-client measurements. These require a separately authorized plan; no general speedup or leak fix is claimed.

Maintain this file when priorities change. Move an item to an authorized tracker before implementing it and retain a link to its new owner rather than duplicate specifications.
