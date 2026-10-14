# Documentation

Start with [CODEBASE.md](CODEBASE.md), the living architecture/design/workflow guide. Agents also read [AGENTS.md](../AGENTS.md). Keep one authoritative explanation per topic and update the guide in every relevant change.

## Desktop installation, connections and releases — `desktop/`

- [Install and update on each platform](desktop/INSTALLATION-AND-UPDATES.md): exact Windows/Mac steps, browser/Docker/Ubuntu paths, available targets and recovery.
- [Agent-owned release process](desktop/RELEASE-PROCESS.md): standing responsibility for versions, native builds, verified artifacts, tags and GitHub publication.
- [0.11.0 companion checkpoint service](desktop/releases/v0.11.0.md): R3 host capability, actual Windows verification, compatible Android and exact Mac handoff.
- [0.10.0 independent workspace transfers](desktop/releases/v0.10.0.md): import-as-new, snapshot forks, recovery and Windows/Mac availability.
- [0.9.0 workspace switching](desktop/releases/v0.9.0.md): selectors, grants, sessions and Windows/Mac status.
- [0.8.0 workspace foundation](desktop/releases/v0.8.0.md): Windows-first host isolation, actual validation and same-tag Mac gate.
- [0.7.1 scale and integration](desktop/releases/v0.7.1.md): responsive panes, status availability, bounded references and Android handoff.
- [0.7.0 saved file-content search](desktop/releases/v0.7.0.md): bounded PDF/text indexing, coverage/retry, Windows release and exact Mac handoff.
- [0.6.0 resource discovery](desktop/releases/v0.6.0.md): Windows release, image categories, bounded thumbnails, saved references and same-tag Mac handoff.
- [0.5.0 resource lifecycle](desktop/releases/v0.5.0.md): Windows delivery, Trash/Restore, protocol-3/archive-3 compatibility and Mac handoff.
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

- [Workspace ZIP transfers and local copies](workspace/WORKSPACE-TRANSFERS.md): W3 staging, atomic publication, retries, copy semantics, bounds and recovery.

- [Settings](workspace/SETTINGS.md): focused categories, global search, scoped controls/resets, saving and keyboard access.
- [Interaction motion](workspace/MOTION.md): shared Smooth/Snappy transitions, selection, inert exits and reduced motion.
- [Appearance and OLED](workspace/APPEARANCE.md): true-black surfaces, opacity overrides, device persistence and media boundaries.
- [Resource lifecycle](workspace/RESOURCE-LIFECYCLE.md): shared Actions, revision-checked Trash/Restore, retained drafts, durable purge retries and portable state.
- [Library and organization](workspace/LIBRARY.md): browsing, collections, tags, pins and bulk actions.
- [File search measurements](development/FILE-SEARCH-MEASUREMENTS.md): bounded Atlas observation, partial coverage, sampled latency/memory and import timeout limitation.
- [Search and Ctrl+K](workspace/SEARCH.md): title-first search, saved-text opt-in, scope, actions and indexing.
- [Saved references and resource discovery](workspace/REFERENCES.md): file categories, static thumbnails, saved source/occurrence counts and safe reference navigation.
- [Managed images](workspace/IMAGES.md): paste/drop/upload, placement tools, authenticated previews/copy, portability and compatibility.
- [Tables](workspace/TABLES.md): in-note/expanded controls, filters, paste/copy and CSV export.
- [Pane navigation](workspace/NAVIGATION.md): journeys, source/destination ownership and shared editing.
- [Sessions and drafts](workspace/SESSIONS.md): restoration, recovery, conditional revisions and workspace isolation.
- [Note exports](workspace/NOTE-EXPORTS.md): linked graphs/assets, snapshots, fidelity and limits.
- [Integration handoff](workspace/INTEGRATION.md): focused validation and remaining verification limits.

## Architecture, development and host security

- [Companion checkpoints](architecture/COMPANIONS.md): R3 immutable reading datasets, selection/coverage, hashes/ranges, expiry/revocation and R4 client activation contract.

- [Host workspaces](architecture/WORKSPACES.md): W1 isolated storage/contexts, fixed-default routing, grants, adoption checkpoint, limits and compatibility.

- [Platform and connection boundary](architecture/PLATFORM.md): transport, cancellation, protocols and native/browser ownership.
- [Saved changes across devices](architecture/MULTI-DEVICE.md): approved SSE, clean-note refresh and dirty-note conflicts.
- [API guide](development/API.md): shared UI/agent contracts and diagnostics.
- [Operations](development/OPERATIONS.md): development, Docker, data/limits, logs and isolated verification.
- [Host access and pairing](security/HOST-ACCESS.md): owner bootstrap, HTTPS trust, persistent approvals and approved agent access.

## Android — `android/`

- [Offline reading companions](android/OFFLINE.md): R4 private storage, verified activation/resume, local search, coverage, policies and source locks.
- [Android alpha.11](android/releases/0.1.0-alpha.11.md): R4 installed APK validation and publication ledger.

- [0.1.0-alpha.10 R2 reading](android/releases/0.1.0-alpha.10.md): typography, outline/find, source-bound journeys, image/PDF viewing and actual verification/publication gates.

- [0.1.0-alpha.9.1 R1 reader](android/releases/0.1.0-alpha.9.1.md): read-only foundation, upgrade recovery and actual release checks.

- [Android reader and legacy recovery](android/READER.md): current read-only renderer, preserved upgrade records and private recovery ZIP boundary.

- [Android organization and lifecycle](android/ORGANIZATION.md): historical A7 Actions/lifecycle contracts; R1 retires original mutations.
- [0.1.0-alpha.7.2 A7 organization](android/releases/0.1.0-alpha.7.2.md): Android-only lifecycle release and actual validation gates.

- [Android implementation and APK delivery](android/ANDROID.md): isolated toolchain, native trust/drafts, prototype limits, signing, installation and actual validation.
- [Android companion design](android/DESIGN.md): reading/review/collection direction, implemented R1 shell and historical editing transition.
- [A5 navigation comparison](android/design/a5-navigation-comparison.html): interactive drawer/bottom-navigation layout study; simulated keyboard, not native evidence.
- [Android media](android/MEDIA.md): managed images, native input/output, encrypted pending uploads and preview/cache limits.
- [Android writing and autosave](android/WRITING.md): historical A6 save/creation contracts retained for legacy recovery.
- [0.1.0-alpha.6.1 A6 writing](android/releases/0.1.0-alpha.6.1.md): protected autosave, contextual tools and retry-safe New note.
- [0.1.0-alpha.5 A5 navigation](android/releases/0.1.0-alpha.5.md): drawer-led Home, reading/Edit separation and keyboard-aware navigation; Android-only APK milestone.
- [0.1.0-alpha.4 A4 images](android/releases/0.1.0-alpha.4.md): image tools, clipboard/pickers/share, native previews and original-file handling; Android-only APK.
- [0.1.0-alpha.3 A3 browsing](android/releases/0.1.0-alpha.3.md): mixed paged browsing, saved-content scope and active-note journeys; Android-only APK.
- [0.1.0-alpha.2 A2 recovery](android/releases/0.1.0-alpha.2.md): scoped drafts/sessions, remembered hosts and explicit conflict recovery; Android-only APK.
- [0.1.0-alpha.1 A1 prototype](android/releases/0.1.0-alpha.1.md): published Android-only APK scope and emulator evidence; user-only S24 checklist.

## Active execution trackers — `plans/`

- [Multi-workspace and Android companion](plans/workspace-companion-plan.md): active replacement plan; W1–W3/R1–R2 shipped, R3 Windows host checkpoints shipped (Mac gate pending), R4 is in candidate verification; R5–R10 remain separately authorized work. One sprint per authorization.
- [Original Android tracker](plans/android-plan.md): historical A1–A7 evidence; A8/A9 cancelled and superseded.

- [Resource lifecycle, discovery and Android readiness](plans/resource-lifecycle-plan.md): All five sprints implemented on Windows; measured integration, platform limits and separate Android prototype gate recorded.
- [Deferred roadmap](plans/future-roadmap.md): scheduled backups explicitly parked for later, OCR/offline/platform follow-ups and scope boundaries.
- [Primary synthetic workspace](development/PRIMARY-TEST-WORKSPACE.md): generated Atlas corpus, isolated launch/reset, checkpoint recovery and small/fault fixtures.
- [Scale and integration results](development/SCALE-INTEGRATION.md): same-seed measurements, fixes, native checks and precise remaining gates.
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

- [Android alpha.8 workspace selection](android/releases/0.1.0-alpha.8.md): W2 switching, drafts and emulator evidence.
