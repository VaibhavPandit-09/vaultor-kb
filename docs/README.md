# Documentation

Start with [CODEBASE.md](CODEBASE.md), the living architecture/design/workflow guide. Agents also read [AGENTS.md](../AGENTS.md). Keep one authoritative explanation per topic and update the guide in every relevant change.

- [R10 integrated qualification](plans/R10-ACCEPTANCE.md): authorized engineering, measured evidence, remaining acceptance and final merge/publication gate.
- [R10 Windows0.16.1 candidate](desktop/releases/v0.16.1.md): measured companion-manifest correction, compatibility and unpublished build qualification.

- [R7–R9 integration audit](plans/R7-R9-INTEGRATION.md): fetched ancestry, combined contracts, release-blocking source-lock investigation, actual checks and R10 entry gate.

## Desktop installation, connections and releases — `desktop/`

- [R7 / Windows0.15.0 acceptance candidate](desktop/releases/v0.15.0.md): unpublished compatible host, original-key artifacts, checks and platform limits.

- [0.14.0 integrated desktop and Reviews](desktop/releases/v0.14.0.md): fresh Windows release, installed verification, artifact hashes and exact integrated Mac handoff.

- [0.13.0 spatial desktop UI](desktop/releases/v0.13.0.md): accepted redesign integration, Mac delivery gates and separate Windows feature-stream limits.

- [Install and update on each platform](desktop/INSTALLATION-AND-UPDATES.md): exact Windows/Mac steps, browser/Docker/Ubuntu paths, available targets and recovery.
- [Agent-owned release process](desktop/RELEASE-PROCESS.md): standing responsibility for versions, native builds, verified artifacts, tags and GitHub publication.
- [0.12.0 review evidence/inbox](desktop/releases/v0.12.0.md): R5 Windows verification/publication, archive compatibility and exact Mac handoff.
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

- [Review evidence and triage](workspace/REVIEWS.md): R5 domain/API, source identity, conditional status, portability and minimal UI integration contract.

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

- [UI philosophy](design/UI_PHILOSOPHY.md): authoritative design/interaction contract; broad transformation remains the independent UI stream.

- [Companion checkpoints](architecture/COMPANIONS.md): R3 immutable reading datasets, selection/coverage, hashes/ranges, expiry/revocation and R4 client activation contract.

- [Host workspaces](architecture/WORKSPACES.md): W1 isolated storage/contexts, fixed-default routing, grants, adoption checkpoint, limits and compatibility.

- [Platform and connection boundary](architecture/PLATFORM.md): transport, cancellation, protocols and native/browser ownership.
- [Saved changes across devices](architecture/MULTI-DEVICE.md): approved SSE, clean-note refresh and dirty-note conflicts.
- [API guide](development/API.md): shared UI/agent contracts and diagnostics.
- [Operations](development/OPERATIONS.md): development, Docker, data/limits, logs and isolated verification.
- [Host access and pairing](security/HOST-ACCESS.md): owner bootstrap, HTTPS trust, persistent approvals and approved agent access.

## Android — `android/`

- [R8/R9 acceptance ledger](android/releases/0.1.0-alpha.27.md): unpublished signed Android/Windows candidates, exact tests and S24 procedure.
- [R8 exports and R9 connections/updates](android/EXPORTS-AND-CONNECTIONS.md): current implementation, portable partial format, source/consent boundaries and validation.

- [R7 alpha.24 acceptance ledger](android/releases/0.1.0-alpha.24.md): artifacts, actual faults/upgrade checks, limitations and S24 procedure.

- [Collected imports](android/IMPORTS.md): R7 acceptance candidate; host receipts/provenance/archive5, owner-approved ZIPs and separate protected Android queue.

- [Android alpha.23 R6 milestone](android/releases/0.1.0-alpha.23.md): published production prerelease, compatibility, install-over and physical limits.

- [R6 integration and verification](plans/R6-INTEGRATION.md): exact fetched branches, original R6 delta, conflict resolutions, fresh regression evidence and the stop before master.

- [Android Review delivery/status](android/REVIEW-SYNC.md): A4 native ownership, exact-source retries, durable receipts and desktop triage.
- [Android alpha.22 R6 milestone candidate](android/releases/0.1.0-alpha.22.md): one-step Review completion, automatic foreground delivery, A5 ledger and S24 script; local only.
- [Android alpha.21 consolidated development candidate](android/releases/0.1.0-alpha.21.md): local APK identity, installed-byte verification and S24 gate; no public release.
- [Consolidated R6 completion](android/R6-COMPLETION.md): authorized Batch1 usability/motion then A4, branch audit, state boundaries and validation checkpoints.

- [Genuine Review capture haptic trace](android/HAPTIC-CAPTURE-TRACE.md): development-only bounded diagnostics, sanitized copy, Samsung keyboard A/B procedure and interpretation.

- [Android interaction foundations](android/INTERACTION-FOUNDATIONS.md): A0 motion, semantic haptics, coordinated theme/bar foundation and physical review boundary.
- [R6 Android redesign phases](plans/android-r6-plan.md): approved audit, A0–A5 interaction gates and preserved Review contracts.
- [Android alpha.12](android/releases/0.1.0-alpha.12.md): A0 review candidate, installed validation and release ledger.

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

- [R5/redesign integration](plans/R5-REDESIGN-INTEGRATION.md): branch boundaries, semantic resolutions, validation and unreleased0.14.0 candidate.

## Active execution trackers — `plans/`

- [R7–R10 roadmap reconciliation](plans/R7-R10-RECONCILIATION.md): current post-R6 planning authority pending approval; requirement classifications, preserved UI, actionable R7 architecture and product decisions. No implementation authorization.

- [R7 fresh-chat handoff](plans/R7-HANDOFF.md): authoritative R6 master/release, compatibility, remaining acceptance and defined R7 scope.

- [Desktop UI redesign audit and proposal](plans/ui-redesign.md): isolated redesign stream, native baseline, implemented Library/browse/Note/pane/navigation/preview/command-palette/settings/utility/theme review candidates, interaction specifications and remaining motion/native review gates.

- [R5 integration handoff](plans/R5-INTEGRATION-HANDOFF.md): exact source boundary, API/schema/portability contracts, master overlap, tests and preservation requirements; no integration or R6 work.

- [Codex product stream](plans/codex-current-stream.md): branch isolation, R5 functional ownership and later UI-integration boundaries.

- [Multi-workspace and Android companion](plans/workspace-companion-plan.md): original functional plan and dated execution ledger; W1–W3/R1–R6 implemented, R6 released on master as Android alpha.23 with Windows0.14.0; remaining R7–R10 planning is reconciled above. One sprint per authorization; physical/integrated Mac gates remain explicit.
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

- [R6 implementation checkpoints](history/R6-IMPLEMENTATION-CHECKPOINTS.md): archived A0–A5 guide narrative and dated review gates, superseded by unified CODEBASE and integration evidence.

- [Modernization tracker](history/modernization-plan.md): archived implementation checklist and validation.
- [v2 specification](history/vaultor-v2-spec.md): former product intent; some claims differ from current implementation.
- [v1 specification](history/vaultor-v1-spec.md): earlier model and delivery notes.
- [Frontend template](history/frontend-template.md): archived scaffolding, not the current guide.

Keep CODEBASE and this index at the docs root for agent discovery. Put topic guides in their relevant folder, link them here and repair relative links when moving files. Archive completed historical specifications rather than rewriting them as current behavior. App updates are owned by agents, not left as user build homework; see the release process above.

- [Android alpha.8 workspace selection](android/releases/0.1.0-alpha.8.md): W2 switching, drafts and emulator evidence.

- [Android navigation Prototype 1](android/NAVIGATION-PROTOTYPE.md) — reader-first folio, source-grouped local Review, structural motion and S24 approval script.
- [Android alpha.20 refinement ledger](android/releases/0.1.0-alpha.20.md) — contextual Sources, balanced three-destination navigation and Library polish; S24 visual gate pending.
- [Android alpha.19 development ledger](android/releases/0.1.0-alpha.19.md) — signed build and actual emulator checks; no public release.
- [Android shell/source navigation](android/SHELL-NAVIGATION.md) — current prototype ownership, mounted reader, source activation and review boundaries.
- [Android alpha.13 release evidence](android/releases/0.1.0-alpha.13.md) — A1 review candidate and actual checks.

- [Android reader context](android/READER-CONTEXT.md) — A2 stable reading edge, contextual controls, media and platform Back.
- [Android alpha.14 release evidence](android/releases/0.1.0-alpha.14.md) — A2 review candidate and actual installed checks.

- [Android Review capture](android/REVIEW-CAPTURE.md) — source-bound protected capture/local queue.
- [Android alpha.15](android/releases/0.1.0-alpha.15.md) — actual A3 installed/publication evidence.

- [Android motion/haptic remediation](android/MOTION-HAPTIC-REMEDIATION.md) — shipped A0–A3 inventory, rejected S24 acceptance, candidate changes and real-device script; A4 blocked.

- [Android alpha.17 hybrid/restraint acceptance ledger](android/releases/0.1.0-alpha.17.md) — historical candidate evidence and alpha.16 comparison; later A4 continuation is recorded in R6 completion.

- [Integrated Android alpha.28 qualification](android/releases/0.1.0-alpha.28.md)

- [R10 fresh-master handoff (unstarted)](plans/R10-HANDOFF.md)
