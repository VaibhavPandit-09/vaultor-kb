# Help Center initiative

Development branch: `codex/help-feature-catalogue`, based on `adbcc96` (remote master 2026-11-08). No version bump, installer, release or automatic merge is authorized. Master stays unchanged.

## Coverage and implementation

- H1/H2: 42 stable catalogue entries and 15 cohesive user articles cover resource organization, editor/links/images/tables, sessions/panes/history, selection/context/clipboard/drag, search, linked-source authority/recovery, imports/exports/workspaces, Activity/native tools/updates, settings/shortcuts, Trash/recovery, Android differences and troubleshooting.
- Evidence: current source and tests, CODEBASE/topic contracts, completed Desktop tracker and public release metadata. Fetched master corrected the initially older Mac baseline: Windows x64 and Mac arm64 both published 0.26.0; Android alpha.28/code32 remains unchanged. Introduction versions omitted when not independently proved.
- H3/H4: read-only Help utility modal, local history/search, area/task discovery, outline/related links, Markdown copy and current shortcut reference. Application menu, sidebar contextual action, Settings and palette entry points. Stable screen mappings fall back home. Editors stay mounted.
- H5: authoritative Help governance procedure linked by AGENTS, AI workflow, desktop/Android release instructions and release checklist. Production validation and source hashes accompany bundled raw Markdown/catalogue; no remote Help fetch.
- H6: final command results and runtime evidence are recorded below before handoff.

## Boundaries and acceptance

Help itself is unreleased development functionality. No Android Help renderer or original editing, native platform change, remote docs service or AI search. Browser has no native clipboard/filesystem authority. Catalogue availability uses evidenced release baselines rather than assuming source equals publication. What's New summarizes existing release ledgers.

User-owned acceptance: Windows presentation/readability, preferred topic grouping, real keyboard/focus experience and ordinary workflows; native Mac Help check and assistive technology remain unclaimed. Existing product limitations remain in canonical technical guides and user troubleshooting; this is a broad practical inventory, not an exhaustive editor/OS shortcut specification.

## Validation record

- Root Help validator: 16/16 positive/negative tests pass, including stale/missing packaged-byte checks. Source links/headings/categories/platform/status/version formats, required screen mappings and all evidence paths validate.
- Frontend production build (TypeScript + Vite), full lint and desktop syntax checks pass. Existing large-chunk/dynamic-import/Browserslist warnings remain. Desktop copy and release packaging now refuse stale bundled Help; the production build emits all 15 articles/catalogue/provenance.
- Broader frontend run: 736/740 passed; four existing 5-second timeouts in LibraryView, LinkedSources and Markdown remediation under concurrent load. All three files passed serial recheck with default timeouts. Focused integration recheck passed Help/AppModal/search and the new Settings handoff test after fixing its autofocus race (final Settings/Help:16/16). Palette callback test:10/10. The complete suite was not repeated after unrelated evidence passed.
- Broader desktop run:143/145 passed. Native disk graph test passed focused recheck without product changes; the packaging dependency test caught the new native Help smoke missing from the allowlist, fixed and rechecked (2/2). No signing/updater/native-file behavior was changed.
- Windows production-equivalent Electron check passes on disposable owned workspace, freshly built desktop/ui and existing bundled server/runtime: application-menu IPC, contextual editor/Settings, eight required searches with renderer network disabled, shared current shortcuts, copy, safe read-only markup, narrow table width, retained mounted note/draft and actual Settings Help search focus. Wide/narrow dark screenshots visually reviewed. Final runtime directory: `%TEMP%/vaultor-chrome-native-vfVDIR`. An Electron GPU shutdown diagnostic followed the passing run; no failed assertion.
- Help state/search tests also verify no fetch and dirty-editor DOM/value preservation, Back/search history, unknown context fallback and safe internal/external destination admission. Existing AppModal tests cover focus containment/restoration; new Settings test verifies yielding and trigger restoration.
- No installed-app installer qualification, native Mac/browser UI, light-theme visual pass, assistive-technology certification or user acceptance was claimed. No backend/Docker/API smoke was needed for separate application-owned content. No release or version bump.
