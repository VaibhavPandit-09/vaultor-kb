# Documentation

Start with [CODEBASE.md](CODEBASE.md), the living architecture/design/workflow guide. Agents also read [AGENTS.md](../AGENTS.md). Keep one authoritative explanation per topic and update the guide in every relevant change.

## Desktop installation, connections and releases — `desktop/`

- [Install and update on each platform](desktop/INSTALLATION-AND-UPDATES.md): exact Windows/Mac steps, browser/Docker/Ubuntu paths, available targets and recovery.
- [Agent-owned release process](desktop/RELEASE-PROCESS.md): standing responsibility for versions, native builds, verified artifacts, tags and GitHub publication.
- [0.4.1 one-click Windows updates](desktop/releases/v0.4.1.md): automatic GitHub downloads, silent installation/relaunch and transition steps.
- [0.4.0 settings/images/motion release](desktop/releases/v0.4.0.md): Windows delivery, protocol-2 compatibility and exact Mac handoff.
- [0.3.2 OLED release](desktop/releases/v0.3.2.md): Windows delivery, validation and same-tag Mac handoff.
- [0.3.1 mixed browsing release](desktop/releases/v0.3.1.md): prior Windows correction, checks and Mac handoff.
- [0.3.0 browsing release](desktop/releases/v0.3.0.md): Windows package availability, focused checks and Mac follow-up.
- [Release notes template](desktop/RELEASE-NOTES-TEMPLATE.md): public platform/compatibility/validation checklist; versioned notes belong in `desktop/releases/` when preparing a real release.
- [Updater contracts and recovery](desktop/UPDATES.md): manifest trust, staging, stop-before-backup, installation and rollback limits.
- [Desktop shell and connections](desktop/DESKTOP.md): bundled Java/server, storage/process ownership, native lifecycle and integrated chrome.
- [Desktop setup troubleshooting](desktop/DESKTOP-SETUP-TROUBLESHOOTING.md): npm/Electron/resedit, bundled-server setup and release-key blockers.
- [Mac mini completion handoff](desktop/MAC-HANDOFF.md): exact remaining Mac release/native and real two-device checks.

## Workspace workflows — `workspace/`

- [Settings](workspace/SETTINGS.md): focused categories, global search, scoped controls/resets, saving and keyboard access.
- [Interaction motion](workspace/MOTION.md): shared Smooth/Snappy transitions, selection, inert exits and reduced motion.
- [Appearance and OLED](workspace/APPEARANCE.md): true-black surfaces, opacity overrides, device persistence and media boundaries.
- [Library and organization](workspace/LIBRARY.md): browsing, collections, tags, pins and bulk actions.
- [Search and Ctrl+K](workspace/SEARCH.md): title-first search, saved-text opt-in, scope, actions and indexing.
- [Managed images](workspace/IMAGES.md): paste/drop/upload, placement tools, authenticated previews/copy, portability and compatibility.
- [Tables](workspace/TABLES.md): in-note/expanded controls, filters, paste/copy and CSV export.
- [Pane navigation](workspace/NAVIGATION.md): journeys, source/destination ownership and shared editing.
- [Sessions and drafts](workspace/SESSIONS.md): restoration, recovery, conditional revisions and workspace isolation.
- [Note exports](workspace/NOTE-EXPORTS.md): linked graphs/assets, snapshots, fidelity and limits.
- [Integration handoff](workspace/INTEGRATION.md): focused validation and remaining verification limits.

## Architecture, development and host security

- [Platform and connection boundary](architecture/PLATFORM.md): transport, cancellation, protocols and native/browser ownership.
- [Saved changes across devices](architecture/MULTI-DEVICE.md): approved SSE, clean-note refresh and dirty-note conflicts.
- [API guide](development/API.md): shared UI/agent contracts and diagnostics.
- [Operations](development/OPERATIONS.md): development, Docker, data/limits, logs and isolated verification.
- [Host access and pairing](security/HOST-ACCESS.md): owner bootstrap, HTTPS trust, persistent approvals and approved agent access.

## Active execution trackers — `plans/`

- [Resource lifecycle, discovery and Android readiness](plans/resource-lifecycle-plan.md): Atlas Sprint 1 complete; four pending sprints for safe Trash/actions, image categories/usage, saved file search and measured integration.
- [Deferred roadmap](plans/future-roadmap.md): scheduled backups explicitly parked for later, OCR/offline/platform follow-ups and scope boundaries.
- [Primary synthetic workspace](development/PRIMARY-TEST-WORKSPACE.md): generated Atlas corpus, isolated launch/reset, checkpoint recovery and small/fault fixtures.
- [Atlas baseline](development/ATLAS-BASELINE.md): actual counts, Windows timing/memory, validation and scale/readiness findings.
- [Android readiness](architecture/ANDROID-READINESS.md): shared contracts, platform boundaries, pending client decisions and a separately authorized native prototype gate.
- [Desktop/private-network plan](plans/desktop-network-plan.md): D1–D9 Windows implementation; partial Mac development checks, pending release/two-device gate; D10 Ubuntu deferred.
- [Workspace evolution](plans/workspace-evolution-plan.md): Library/organization/search/navigation/session work and integration results.
- [Editor and portability](plans/editor-portability-plan.md): imports, tables and exports; actual validation and remaining manual coverage.

## Historical context — `history/`

- [Modernization tracker](history/modernization-plan.md): archived implementation checklist and validation.
- [v2 specification](history/vaultor-v2-spec.md): former product intent; some claims differ from current implementation.
- [v1 specification](history/vaultor-v1-spec.md): earlier model and delivery notes.
- [Frontend template](history/frontend-template.md): archived scaffolding, not the current guide.

Keep CODEBASE and this index at the docs root for agent discovery. Put topic guides in their relevant folder, link them here and repair relative links when moving files. Archive completed historical specifications rather than rewriting them as current behavior. App updates are owned by agents, not left as user build homework; see the release process above.
