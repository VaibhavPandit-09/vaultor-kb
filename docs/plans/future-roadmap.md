# Deferred work and remaining qualification

Reviewed 2026-10-23. W1–W3/R1–R10 engineering is integrated and released for the available Windows/Android platforms. No active implementation plan remains. This document parks unresolved work and future ideas; none is implementation authorization. [CODEBASE](../CODEBASE.md) describes what exists, topic guides own contracts, and [R10 evidence](../development/qualification/R10.md) owns measurements and unqualified cases.

## Remaining platform and acceptance work

- Current integrated Mac arm64 build/install/update qualification is unavailable; [MAC-HANDOFF.md](../desktop/MAC-HANDOFF.md) owns exact immutable-source gates. Published Mac0.13.0 lacks Reviews and archive4–6. Do not claim a current Mac installer or downgrade newer workspace data into it.
- User-owned Samsung S24 Ultra/One UI motion/haptic quality, real touch/keyboard/SAF/clipboard providers, physical OLED, OEM lifecycle/battery and real Wi-Fi/LAN remain unqualified. Agents never access/pair the phone. Emulator wiring/temporal geometry is not hardware acceptance.
- Spoken TalkBack/focus traversal, actual split-screen, subjective predictive Back and exhaustive PDF/layout/theme/accent combinations remain unqualified. A narrow runtime geometry test is not split-screen acceptance; the R10 TalkBack automation probe captured no focus events and did not pass experience acceptance.

## Known engineering limitations

- Windows startup/memory and multi-minute Atlas checkpoint transfer remain measured costs. R10 improved verified manifest parsing only; no general startup/LAN/battery speedup or numeric release budget is claimed. See [R10](../development/qualification/R10.md), [historical scale](../development/SCALE-INTEGRATION.md), [baseline](../development/ATLAS-BASELINE.md) and [file-search measurements](../development/FILE-SEARCH-MEASUREMENTS.md) for conditions and sample limits. Cold-cache, continuous peak/cache release and prolonged concurrent-client measurements remain work.
- Sidebar/note tag pickers enumerate all tags; large renderer chunks and transfer snapshot memory warrant measured follow-up. Transfer artifacts/export claims currently need stopped-host manual cleanup; there is no general automatic expiry worker. See [OPERATIONS.md](../development/OPERATIONS.md).
- Browser recovery/session storage is best effort, undo is not persisted, same-field settings are last committed wins, and save/notification streams are not collaborative typing or two-way sync. Android foreground opportunities do not guarantee delivery while suspended/force-stopped.
- Keyboard-versus-mouse native file-picker pointer visibility remains unverified. DOCX structure is checked but visual pagination is unqualified; table native clipboard/full multi-pane integration has limited manual coverage. See [NOTE-EXPORTS.md](../workspace/NOTE-EXPORTS.md), [TABLES.md](../workspace/TABLES.md) and CODEBASE.
- R10 recorded remaining development/packaging-tool dependency advisories. They are not a reproduced APK exploit or a blanket audit pass; exact findings and scope are in its qualification record. Do not force-downgrade dependencies to silence audit output.

## Scheduled backups — explicitly deferred

Updater recovery snapshots are not scheduled backups. A later authorized design should provide host-owned consistent local/external-drive backups, last-success status, bounded retention/storage and a test-restored disposable copy before reliability claims. A remote client must never copy a running host SQLite file as a backup.

Decide cadence/count/age/byte defaults, destination, app-closed/tray/sleep/battery/disk behavior, missed runs, notifications/retries, interrupted snapshots, original-file inventory/hashes, inclusion of Trash/journals, workspace identity/generation, paused saves, connected clients, restore preview/conflicts and preserve-current-data recovery. Keep backups separate from live data and out of Git/public artifacts. Cloud/paid destinations, encryption/passphrase/key recovery and host-trust backup need explicit decisions. Distinguish portable archives (no credentials/device journals) from private stopped-host recovery trees.

## Future ideas — not accepted requirements

OCR for image-only PDFs/screenshots; Office/fuzzy/media extraction; table XLSX/PDF and connected Google Docs publishing; thumbnail gallery/attachment maintenance after measured need. Never purge an original merely because saved backlinks are empty: drafts, independent resources and another device may depend on it.

General Android document/organization editing, independently writable mobile workspaces, two-way fork sync, collaborative typing, cross-workspace links/global search, cloud/public hosting, iOS, handwriting/precise PDF ink or rectangle annotation, tablet/DeX parity, Play Store distribution and native Ubuntu packaging remain outside implemented scope. Reviews are not task boards/due dates/reminders. Existing source-bound Review/import queues and partial exports do not authorize those broader systems.
