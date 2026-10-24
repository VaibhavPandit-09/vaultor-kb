# Documentation

Start with [CODEBASE.md](CODEBASE.md) for the current product, source map, architecture, contracts and limitations. Agents read [AGENTS.md](../AGENTS.md) and the [development workflow](development/AI_DEVELOPMENT_WORKFLOW.md) before changes. UI work additionally reads the design contracts below. [Root README](../README.md) and [mobile README](../mobile/README.md) are short discovery entry points; [.github release checklist](../.github/RELEASE_CHECKLIST.md) delegates to the release process.

Reviewed 2026-10-24 against integrated master, published Windows0.18.1 and Androidalpha.28/code32. W1–W3/R1–R10 engineering is complete. Current topic guides own behavior; qualification and versioned release records own historical evidence only. They do not authorize old branch work, restore editing-led Android UI or reopen completed milestone gates. Deferred scope has one owner below; no archive of obsolete plans is maintained.

## Architecture and security

- [WORKSPACES](architecture/WORKSPACES.md): Workspace identity, isolated contexts, adoption, selection and grants.
- [PLATFORM](architecture/PLATFORM.md): Shared/native transport, epochs, capability and platform boundaries.
- [MULTI-DEVICE](architecture/MULTI-DEVICE.md): Saved-change streams, conditional reconciliation and conflict limits.
- [COMPANIONS](architecture/COMPANIONS.md): Immutable host checkpoints, source authority, hashes/ranges, expiry and bounded manifest cache.
- [HOST-ACCESS](security/HOST-ACCESS.md): Owner bootstrap, pairing, pinned TLS, approval/revocation and agent access.

## Design contracts

- [UI_PHILOSOPHY](design/UI_PHILOSOPHY.md): Authoritative desktop/shared density, continuity, motion, accessibility and reduced-motion rules.
- [ANDROID_UI_PHILOSOPHY](design/ANDROID_UI_PHILOSOPHY.md): Android extension: hybrid UI, reader, Back, platform adaptation and restrained semantic haptics.

## Development and validation

- [AI_DEVELOPMENT_WORKFLOW](development/AI_DEVELOPMENT_WORKFLOW.md): Master-centered work, scope/isolation, integration/protections and immutable recovery points.
- [OPERATIONS](development/OPERATIONS.md): Build/dev/Docker, environment, logs and targeted disposable diagnostics.
- [API](development/API.md): Shared domain APIs, revisions, compatibility and diagnostics.
- [PRIMARY-TEST-WORKSPACE](development/PRIMARY-TEST-WORKSPACE.md): Marked Small/Atlas fixtures, guarded launch/reset and reproducible seed.
- [ATLAS-BASELINE](development/ATLAS-BASELINE.md): Historical0.4.1 corpus measurements and sample limitations.
- [FILE-SEARCH-MEASUREMENTS](development/FILE-SEARCH-MEASUREMENTS.md): Historical bounded extraction/coverage and search observations.
- [SCALE-INTEGRATION](development/SCALE-INTEGRATION.md): Historical0.7.1 scale/fault results; compare only under stated conditions.

## Desktop delivery

- [INSTALLATION-AND-UPDATES](desktop/INSTALLATION-AND-UPDATES.md): User installation/update order and honest platform availability.
- [DESKTOP](desktop/DESKTOP.md): Electron/owned server, storage/processes, native files and connections.
- [UPDATES](desktop/UPDATES.md): Original-key verification, update staging, stopped-host backups and recovery.
- [RELEASE-PROCESS](desktop/RELEASE-PROCESS.md): Agent-owned versions/builds/signing/native gates and publication.
- [RELEASE-NOTES-TEMPLATE](desktop/RELEASE-NOTES-TEMPLATE.md): Per-release compatibility/platform/evidence template.
- [DESKTOP-SETUP-TROUBLESHOOTING](desktop/DESKTOP-SETUP-TROUBLESHOOTING.md): Toolchain, npm/Electron and bundling failures.
- [MAC-HANDOFF](desktop/MAC-HANDOFF.md): Current exact-source native Mac blockers/qualification; old tags remain evidence.

## Workspace behavior

- [IMPORTS](workspace/IMPORTS.md): Ordinary file/folder acquisition, batch relationship resolution, limits, resume and UI disclosure patterns.
- [LIBRARY](workspace/LIBRARY.md): Resource browsing, collections/tags/pins and organization.
- [SEARCH](workspace/SEARCH.md): Title-first Library/Ctrl+K, explicit saved content, extraction and coverage.
- [REFERENCES](workspace/REFERENCES.md): Categories, thumbnails, saved references/occurrence counts and safe navigation.
- [RESOURCE-LIFECYCLE](workspace/RESOURCE-LIFECYCLE.md): Trash/Restore/purge, revisions, drafts, cleanup and portable state.
- [SESSIONS](workspace/SESSIONS.md): Session restoration, protected drafts, save conflicts and scoped recovery.
- [NAVIGATION](workspace/NAVIGATION.md): Open Notes sessions, visible slots, explicit splits, session journeys and navigation/save barriers.
- [TABLES](workspace/TABLES.md): Same-editor expanded tables, IDs, filtering, paste/copy and CSV.
- [IMAGES](workspace/IMAGES.md): Managed resource-backed images, placement/original distinction and byte bounds.
- [NOTE-EXPORTS](workspace/NOTE-EXPORTS.md): Immutable note/graph formats, fidelity, evidence scope and limits.
- [WORKSPACE-TRANSFERS](workspace/WORKSPACE-TRANSFERS.md): Full archives, import-as-new, replacement and independent desktop copies.
- [REVIEWS](workspace/REVIEWS.md): Immutable evidence, conditional triage, retention and portability.
- [SETTINGS](workspace/SETTINGS.md): Scoped settings/search/reset/save and keyboard behavior.
- [APPEARANCE](workspace/APPEARANCE.md): Theme/OLED tokens, opacity and coordinated theme reveal.
- [MOTION](workspace/MOTION.md): Shared desktop motion lifecycle, identity and reduced motion.

## Android behavior and delivery

- [ANDROID](android/ANDROID.md): Android onboarding, platform/storage authority, build/signing/upgrade/release and test boundaries.
- [SHELL-NAVIGATION](android/SHELL-NAVIGATION.md): Home/Library/Review, Sources/management, contextual settings, retained resource motion.
- [READER](android/READER.md): Safe immutable renderer, reading controls, journeys and legacy recovery.
- [READER-CONTEXT](android/READER-CONTEXT.md): Reading anchors, contextual Find/media, Back and interaction states.
- [MEDIA](android/MEDIA.md): Native image/PDF previews, original-file output/cache and legacy media recovery.
- [OFFLINE](android/OFFLINE.md): Verified activation/search/retention, policies, persistent locks and recovery.
- [REVIEW-CAPTURE](android/REVIEW-CAPTURE.md): Protected drafts, frozen evidence, one-action queue completion and feedback timing.
- [REVIEW-SYNC](android/REVIEW-SYNC.md): Captured-source dispatch, uncertain retries, receipts and desktop status.
- [IMPORTS](android/IMPORTS.md): Acquisition/staging, confirmed destinations, durable host creation/provenance and ZIP approval.
- [EXPORTS-AND-CONNECTIONS](android/EXPORTS-AND-CONNECTIONS.md): Full/partial exports, discovery, pinned recovery and verified APK updates.
- [INTERACTION-FOUNDATIONS](android/INTERACTION-FOUNDATIONS.md): Current hybrid motion/theme/haptic engine and physical acceptance limits.
- [HAPTIC-CAPTURE-TRACE](android/HAPTIC-CAPTURE-TRACE.md): Build-gated genuine capture diagnostics and user-owned hardware procedure.

## Remaining work

- [future-roadmap](plans/future-roadmap.md): Unqualified platforms/acceptance, known debt, deferred backups and future ideas; no implicit implementation authorization.

## Qualification evidence

- [Linked Markdown](development/qualification/LINKED-MARKDOWN.md): active five-phase source-fidelity and filesystem-safety qualification; isolated experiments, no production feature or release.

- [R6](development/qualification/R6.md): Historical R6 integrated/native/upgrade evidence with failures and corrected reruns.
- [R7-R9](development/qualification/R7-R9.md): Source-lock security defect/repair, actual upgrades, OS consent and published artifact checks.
- [R10](development/qualification/R10.md): Final integrated measurements, faults, security advisories, native/release results and remaining limits.

## Release and candidate records

These retain immutable source/artifact/signing identities, migration/compatibility, actual checks and explicit platform/manual limits. An unpublished candidate is not a public update. Historical future tense or stop gates apply only to that dated release; use current topic guides for development. All records are retained because they provide unique release/upgrade or acceptance evidence.

Desktop: [v0.3.0](desktop/releases/v0.3.0.md) · [v0.3.1](desktop/releases/v0.3.1.md) · [v0.3.2](desktop/releases/v0.3.2.md) · [v0.4.0](desktop/releases/v0.4.0.md) · [v0.4.1](desktop/releases/v0.4.1.md) · [v0.5.0](desktop/releases/v0.5.0.md) · [v0.6.0](desktop/releases/v0.6.0.md) · [v0.7.0](desktop/releases/v0.7.0.md) · [v0.7.1](desktop/releases/v0.7.1.md) · [v0.8.0](desktop/releases/v0.8.0.md) · [v0.9.0](desktop/releases/v0.9.0.md) · [v0.10.0](desktop/releases/v0.10.0.md) · [v0.11.0](desktop/releases/v0.11.0.md) · [v0.12.0](desktop/releases/v0.12.0.md) · [v0.13.0](desktop/releases/v0.13.0.md) · [v0.14.0](desktop/releases/v0.14.0.md) · [v0.15.0](desktop/releases/v0.15.0.md) · [v0.16.0](desktop/releases/v0.16.0.md) · [v0.16.1](desktop/releases/v0.16.1.md).

Android: [0.1.0-alpha.1](android/releases/0.1.0-alpha.1.md) · [0.1.0-alpha.2](android/releases/0.1.0-alpha.2.md) · [0.1.0-alpha.3](android/releases/0.1.0-alpha.3.md) · [0.1.0-alpha.4](android/releases/0.1.0-alpha.4.md) · [0.1.0-alpha.5](android/releases/0.1.0-alpha.5.md) · [0.1.0-alpha.6.1](android/releases/0.1.0-alpha.6.1.md) · [0.1.0-alpha.7.2](android/releases/0.1.0-alpha.7.2.md) · [0.1.0-alpha.8](android/releases/0.1.0-alpha.8.md) · [0.1.0-alpha.9.1](android/releases/0.1.0-alpha.9.1.md) · [0.1.0-alpha.9](android/releases/0.1.0-alpha.9.md) · [0.1.0-alpha.10](android/releases/0.1.0-alpha.10.md) · [0.1.0-alpha.11](android/releases/0.1.0-alpha.11.md) · [0.1.0-alpha.12](android/releases/0.1.0-alpha.12.md) · [0.1.0-alpha.13](android/releases/0.1.0-alpha.13.md) · [0.1.0-alpha.14](android/releases/0.1.0-alpha.14.md) · [0.1.0-alpha.15](android/releases/0.1.0-alpha.15.md) · [0.1.0-alpha.16](android/releases/0.1.0-alpha.16.md) · [0.1.0-alpha.17](android/releases/0.1.0-alpha.17.md) · [0.1.0-alpha.18](android/releases/0.1.0-alpha.18.md) · [0.1.0-alpha.19](android/releases/0.1.0-alpha.19.md) · [0.1.0-alpha.20](android/releases/0.1.0-alpha.20.md) · [0.1.0-alpha.21](android/releases/0.1.0-alpha.21.md) · [0.1.0-alpha.22](android/releases/0.1.0-alpha.22.md) · [0.1.0-alpha.23](android/releases/0.1.0-alpha.23.md) · [0.1.0-alpha.24](android/releases/0.1.0-alpha.24.md) · [0.1.0-alpha.27](android/releases/0.1.0-alpha.27.md) · [0.1.0-alpha.28](android/releases/0.1.0-alpha.28.md).

- [Desktop 0.18.1 release evidence](desktop/releases/v0.18.1.md): collection compression, directory modes and patch qualification.
- [Desktop 0.18.0 release evidence](desktop/releases/v0.18.0.md): nested collections, recursive imports, Windows qualification and the Mac/Latest gate.
- [Desktop 0.17.0 release evidence](desktop/releases/v0.17.0.md): Open Notes/session migration, Windows qualification and the incomplete Mac/Latest gate.
