# Native Desktop Experience — master tracker

Reviewed 2026-11-04. Authoritative progress and resumption record for D1–D4. Phase 0 is complete; D1 engineering is Windows-validated with user acceptance pending; subsequent milestones retain the roadmap below. No Android feature development, independent windows, framework migration, backend rewrite or visual-identity redesign.

## Baseline and working rules

- Audited clean `master` / `origin/master` at `5003a91`; fetched remote, zero divergence. Branch `codex/desktop-experience-d1` created at the user's explicit request. Existing unrelated worktrees retained.
- Desktop version remains 0.25.2. This initiative explicitly excludes automatic versions, installers, tags and releases; no integration into master without completed scope/required checks.
- Preserve resource-based structured Tiptap JSON, multi-collection membership, shared API/settings/tokens, pane save barriers, private recovery and source/grant boundaries. Commands coordinate existing operations; they do not replace authorization or lifecycle transactions.
- Status progression: `NOT STARTED → IN PROGRESS → IMPLEMENTED → VALIDATED → COMPLETE`; also `BLOCKED` and `DEFERRED`. IMPLEMENTED means code exists; VALIDATED requires specified automated/runtime evidence; COMPLETE additionally requires acceptance criteria and applicable platform/user review. Compilation alone never qualifies.
- Medium risk for navigation/commands/focus; native text menus require Electron runtime validation. Lifecycle/backend logic is preserved. Future clipboard/filesystem/lifecycle mutations require high-risk boundary/failure checks.

## Phase 0 audit — actual implementation

| Area | Existing system / implementation | Gap / decision |
| --- | --- | --- |
| Commands | `lib/resourceActions.ts` event requests, connection epochs and Dashboard coordinator; `lib/commandPalette.ts` stable IDs, ranking and multi-step input/confirmation | Extend these, not a parallel framework. Pin/download bypassed dispatcher but already had shared authoritative helpers. |
| Palette execution | `CommandPaletteModal.tsx` consumes execute/push results and captured contextual resources; Dashboard provides callbacks | Route rename/Trash/export callbacks through the resource coordinator; keep palette search/confirmation stages. |
| Shortcuts | `lib/shortcuts.ts`, `closeNoteShortcut.ts`, Dashboard dispatch, configurable settings, static history bindings | Preserve bindings; context invocation adds ContextMenu/Shift+F10 without reserving text input keys. |
| Navigation | `PaneNavigation` sessions/slots, per-visit UUIDs/positions, 200-visit bound, async load/save transactions, persisted v2 layout | JourneyBar rendered entire sequence into horizontal scroll; change presentation only. |
| Menus | `LibraryPopover`, `ResourceActions`, collection/session/Trash/source popovers; editor-specific menus | Missing broad right-click invocation; reuse exact content and overlay/focus ownership. |
| Drag/drop | Editor managed-image drag, table/ProseMirror behavior, external import acquisition (`ImportSourceModal`, native tickets) | No unified resource/collection internal DnD. Do not disturb editor drag. D2 owns it. |
| Selection | Library/Trash page-scoped checkbox IDs and bulk organization/lifecycle dialogs; editor text selection separate | No common additive/range selection controller; D2 must preserve single-click opening. |
| Clipboard | `PlatformServices.writeClipboard`; native text/image clipboard, editor/table copy | No defined resource copy/cut membership payload or app-link routing contract. D3 owns semantics/security. |
| Electron boundary | `desktop/src/main.mjs`, `preload.cjs`, `frontend/src/lib/desktop.ts`, `platform.ts` | Privileged I/O stays in main; no raw filesystem paths or new renderer privileges for menus. |
| Native OS | Native file dialogs, export/save/open cached original, tray/close/Quit barriers, custom chrome, theme and updater, existing notifications | Activity-driven taskbar aggregation, resource drag-out, grant-aware reveal, foreground notification policy remain D3. |
| Accessibility/motion | Escape manager priorities, `dialogFocus`, portal registration/placement, source restoration, semantic CSS/WAAPI motion and reduced motion | Share utilities; add action-menu arrows/Home/End and compact spacing. Preserve pane/preview identity. |
| Durability/constraints | Linked ownership, revisions/generation, conditional saves, private drafts, protected lifecycle review, transactional hierarchy, Activity journals | No guessed Reveal/internal link/cut operations. Browser remains independent of Electron privileges. PDF iframe context belongs to its embedded viewer. |

Relevant contracts read: CODEBASE/source map/state/UI/keyboard/known limitations; documentation index; development workflow; complete UI philosophy; NAVIGATION, SESSIONS, DESKTOP, LIBRARY, RESOURCE-LIFECYCLE, IMPORTS, WORKSPACE-TRANSFERS and workspace isolation contracts. Specifications were checked against current source, not treated as implementation proof.

## D1 interaction specification

History: one retained compact bar with Back/Forward, current visit, at most two neighboring visits when room permits, and History. Under 640px neighbors compress away; current title truncates with full tooltip. History reveals the full ordered visit sequence (including duplicates and disabled unavailable visits), current index and direct jumps. Opening focuses current visit; arrows/Home/End navigate; Escape restores trigger. No breadcrumb/folder interpretation, new scroll owner, persistence change or duplicate expanded header. Existing document journey transitions communicate navigation; the retained bar does not replay a decorative entrance. Reduced motion keeps immediate state endpoints.

Menus: right-click opens at pointer; ContextMenu/Shift+F10 opens at focused target. Invocation never calls the resource's primary click. Same commands/content as ellipsis; clamp to viewport, scroll only when needed, arrows/Home/End skip disabled actions, Escape restores source, outside pointer/blur dismiss. Text inputs/contenteditable and links keep native text/viewer behavior. Nested rows own their closest menu. Compact styling uses current surfaces/tokens and shared utility motion. Dialog handoffs retain registered portal/focus ownership. Unsupported operations stay absent. No nested submenus needed for current compact action sets.

## D1 — Navigation & Command Foundation

| ID / priority | Status | Work, acceptance and validation | Locations / dependencies |
| --- | --- | --- | --- |
| P0 / P0 | COMPLETE | Audit and tracker established; roadmap, source map, dependencies and honest acceptance states. Documentation/source review completed. | This tracker; docs index/CODEBASE |
| D1.1 / P0 | VALIDATED | Bounded current/neighbor history + full History; no horizontal overflow at narrow widths; duplicate visits/unavailable entries/branching/restoration unchanged. Component history + pane/session regressions; Windows wide/narrow smoke; user feel review. | JourneyBar, index.css; PaneNavigation/JourneyViewport unchanged. Depends P0. |
| D1.2 / P0 | VALIDATED | Extend existing stable resource command IDs with labels/icons/capability/confirmation metadata; shared executor for open/split/rename/references/exports/Trash/pin/download/copy title. Existing coordinators retain review, save, error and authority. Test unsupported/linked/Trash refusal and propagated failures. | lib/resourceActions, ResourceActions, Dashboard. Depends P0. |
| D1.3a / P1 | VALIDATED | Right-click + keyboard menus on Library/Recent/Pinned resource rows, collection hierarchy, pinned collections, Open Notes, Trash, tags, linked source management, note chrome/preview surface and browse background. Exact ellipsis content, safe handoffs, viewport placement, focus and cancellation. Component + Electron smoke; user acceptance pending. | LibraryPopover, ResourceActions, OrganizationViews, OpenNotes, TrashView, LinkedSources, LibraryView, SidebarItem, Dashboard. Depends D1.2. |
| D1.3b / P1 | VALIDATED | Native editable/selected text context menus with Electron capability flags; application menus avoid text inputs/editor selections. Existing table-specific menus retained. Browser uses existing browser text behavior. Windows real editable-pointer event reached the native menu; macOS native acceptance unverified. | desktop/src/text-menu.mjs, main.mjs; focused native template tests. Depends D1.3a. |
| D1.4 / P1 | VALIDATED | Resource ellipsis/right-click share execution; palette rename/Trash/export use same coordinator. Navigation buttons/shortcuts already share PaneNavigation; pins already share favorite helper. Focused regression/source review passed; remaining clipboard/OS adapters are D3 work. | Dashboard, commandPalette, resourceActions, PinButton. Depends D1.2/3. |
| D1 acceptance / P0 | IN PROGRESS | Production build/lint, focused command/context/history/focus and existing pane/session/lifecycle regressions; one bounded disposable Windows native smoke with narrow placement. User visual/feel acceptance; macOS explicitly unverified. D1 cannot be COMPLETE before these criteria. | See validation ledger below. Depends all D1 tasks. |

D1 completion: modern bounded journey; preserved history/save/restore semantics; useful menus across major surfaces; meaningful command convergence; consistent keyboard/mouse/focus; no data-integrity regression. Remaining unimplemented or unvalidated scope must stay explicit, not folded into COMPLETE.

## D2 — Selection & Drag-and-Drop

All tasks NOT STARTED. Start only after D1 acceptance/any separately agreed stage boundary. No broad backend rewrites or new DnD dependency assumed.

| ID / priority | Detailed scope and acceptance | Dependencies / source |
| --- | --- | --- |
| D2.1 / P0 | Audit activation vs selection per surface; shared scoped selection controller, toggle/range/select-all/clear, distinguish opened/focused/selected. Define filter/sort/page/deletion pruning and announcements. Test ranges/stale IDs/input exclusion; retain ordinary single-click navigation. | D1; LibraryView/TrashView/useResourcePage/state |
| D2.2 / P1 | Bulk collection membership/tag/pin/Trash/restore through supported operations. Define mixed capability intersection, partial success, failed-target retention and workspace-generation rejection. Disposable mutation/failure tests. | D2.1, D1 commands; ResourceCollections/OrganizationManager/ResourceLifecycleDialog |
| D2.3 / P1 | Resource(s) → collection ADDS membership, → tag applies, → Pinned pins, → pane opens; collections reparent through hierarchy validation. Trash invokes protected review. Reject cycles/invalid sources/stale sessions. Test cancellation, multi-membership, hierarchy failures. | D2.1/2; existing membership APIs/PaneNavigation |
| D2.4 / P2 | Files/folders drop into existing import review/native tickets; distinguish external acquisition from internal organization. Investigate safe Electron drag-out exported copies without source path exposure; refuse unsupported platforms/capabilities. | D2.3, import/export security; desktop files/preload |
| D2.5 / P1 | Shared bounded drag state/preview, intent labels, valid/invalid feedback, edge scrolling, delayed hierarchy expansion, Escape/cleanup and keyboard alternatives. Floating/narrow sidebars and reduced motion. Runtime interaction checks, no pointer-move scans/permission calls. | D2.3/4; sidebar/portal/motion utilities |

D2 completion: common organization via coherent selection/DnD; membership, authorization and lifecycle/recovery invariants proven; partial failures actionable; keyboard alternatives available; platform evidence recorded.

## D3 — Operating System Integration

All tasks NOT STARTED; reuse Electron bridge and authoritative Activity state.

| ID / priority | Detailed scope and acceptance | Dependencies / source |
| --- | --- | --- |
| D3.1 / P1 | Define resource copy/cut/paste identity/membership semantics and source-scoped clipboard payload; text inputs/editors retain Ctrl/Cmd+C/X/V. Cross-workspace/stale grant refusal. No silent content duplication or membership removal. Decide supported internal-link format before exposing Copy link. | D1 commands, D2 selection; platform/desktop clipboard |
| D3.2 / P1 | Audit native import/save/default-open; add grant-aware Reveal only through validated main capabilities. Drag exports reuse approved export system. Reject arbitrary paths and stale connection ownership. | D2.4; desktop/files.mjs, preload/desktop bridge |
| D3.3 / P1 | Taskbar progress derives from Activity with deterministic concurrent aggregation, real indeterminate/error states and idle cleanup. No independent task registry. Unit + Windows runtime taskbar check. | Activity/task ownership and bridge |
| D3.4 / P2 | Completion/failure/attention notifications only for meaningful background work; respect foreground/system policy; no new permissions by default. Test source identity, duplicate suppression and foreground silence. | D3.3, Activity, existing notifications |
| D3.5 / P1 | Audit navigation/search/rename/delete/context/clipboard/pane shortcuts against customizable definitions and editor/platform exclusions; menu/tooltips show applicable shortcuts. Keyboard-only walkthrough. | D1, D2, D3.1; shortcuts/settings/help |
| D3.6 / P2 | Resize/Snap/high-DPI/display changes/minimize/restore/titlebar/maximize/tray/background/Quit audit; fix evidenced inconsistencies only. Record actual Windows and macOS boundaries. | D3.3/4; DesktopRoot/main/owned server |
| D3.7 / P3 | Investigate Jump Lists/New note/print-PDF/shell actions only after core work. Document utility/security decision; DEFER if unclear or costly. | D3.1–6 |

D3 completion: core desktop conventions work without weaker source, filesystem, updater or workspace authorization; native acceptance per supported platform recorded. No multi-window work.

## D4 — Desktop Experience Audit & Refinement

All tasks NOT STARTED; depends D1–D3 behavior being stable.

| ID / priority | Detailed scope and acceptance | Dependencies / source |
| --- | --- | --- |
| D4.1 / P1 | Audit hover/pressed/focus/disabled/loading/selection/drag/menu/confirmation/errors/Activity. Consolidate evidenced inconsistencies with existing primitives; distinguish interaction types. | D1–3; shared components/tokens |
| D4.2 / P1 | Narrow/floating sidebar, compact headers/panes, hierarchy, menus, resize/overflow/long names/empty states. No inaccessible controls, clipped menus or unnecessary horizontal scroll. | D4.1; layout and compression owners |
| D4.3 / P1 | Tab order, visible focus, Escape ownership, drag alternatives, announcements/labels/roles, reduced motion and contrast. Keyboard-only and relevant runtime checks. | D4.1/2; Escape/dialogFocus |
| D4.4 / P2 | Review structural motion/identity/animation settings; no arbitrary bounce/fades/transition-all. Inspect consequential transitions in motion; immediate reduced-motion endpoints. | UI_PHILOSOPHY/MOTION |
| D4.5 / P1 | Final bounded browser-like inconsistency pass on major organization/open/preview/edit/import/export workflows. Fix material issues; close/defer remaining decisions explicitly, avoiding endless polish. | D4.1–4 |

D4 completion: coherent mouse/keyboard/touchpad workflows and supported OS integrations; responsive density/motion/accessibility reviewed, no known material durability regressions; deferred platform acceptance remains explicit.

## Validation and commits

| Check | Actual outcome |
| --- | --- |
| Baseline Git | Clean master, fetched origin, 0/0 divergence, worktrees inspected; no unrelated changes. |
| Frontend TypeScript | `npx tsc -b --pretty false` passed at initial command/menu checkpoint; later edits require final build. |
| Native text-menu unit | `node --test test/text-menu.test.mjs`: 2 passed. |
| Lint initial checkpoint | Failed refs rule on render-prop line; corrected suppression location; subsequent full lint had no errors. |
| Focused frontend | 83 tests passed across14 files: ContextMenu, LibraryPopover, ResourceActions, JourneyBar/JourneyViewport, OpenNotes, ResourceLifecycleDialog, resourceActions, paneNavigation, CommandPaletteModal, AppModal, shortcuts, OrganizationViews and LibraryView. Final changed-menu/history subset:8 tests passed across3 files. |
| Production build | desktop npm run build passed (TypeScript + Vite + fresh desktop/ui). Existing large-chunk/dynamic-import/Browserslist warnings remain; no dependency/version changes. |
| Lint | Full frontend lint had0 errors and2 unused-dependency warnings in Dashboard; removed those dependencies and targeted Dashboard ESLint passed without warnings. Other files reuse the passing full-run evidence. |
| Windows Electron | VAULTOR_DESKTOP_EXPERIENCE_CHECK=1 node scripts/chrome-smoke.mjs passed on disposable owned data. Eight linked visits, full History jumps/Forward, bounded3 inline visits,600px current-only bar (217px current title, no overflow), viewport-edge resource menu without activation, ContextMenu/Shift+F10 source restoration, split through shared command and secondary-pointer nonactivation. Real editable right-click reached native text-menu handler; popup intercepted to avoid blocking the harness. |
| Visual inspection | Final dark-theme wide/narrow/edge-menu PNGs from vaultor-chrome-native-uV9MdG inspected. No motion/physical pointer feel/macOS/light/high-contrast acceptance claimed. |
| Desktop syntax | node --check main.mjs and native-desktop-experience-check.mjs passed; native text-menu tests2 passed. |

Associated source commits: implementation commit is recorded in the follow-up documentation ledger below. Baseline `5003a91` is not an implementation commit.

## Platform status and known decisions

- Windows: production build, automated checks, disposable Electron smoke and three dark-theme layout screenshots passed; personal visual/interaction acceptance remains user-owned. No installer/release generated by explicit task instruction.
- macOS: shared source preserved; native behavior, DPI and motion unverified. Do not claim acceptance.
- Browser: shared component tests and production build passed; no separate browser end-to-end session. Native text menu is Electron-only.
- Android: out of scope; unchanged.
- User owns visual quality/interaction feel review. Static/component checks cannot certify this.
- Internal resource links need a defined supported routing/clipboard format; no guessed URL scheme. Metadata copy currently limited to title.
- Linked source trees keep source-specific commands; no managed rename/export/reveal fiction. Text/PDF embedded viewers retain their own context behavior.
- Resource selection context menus currently target the clicked resource, not a bulk selection. D2 owns multi-target semantics.
- Menus use flat action sets; submenus deferred until justified by actual command density.
- Runtime validation must inspect duplicate native/app menus, dialog handoff, edge placement, narrow title visibility and stale source behavior. Keep any discovered gaps here.

## Resume here

D1 engineering is VALIDATED on Windows, not COMPLETE: user visual/interaction review and explicit platform acceptance/defer decisions remain. Review the feature branch before integration. Native acceptance beyond the tested resource/session/text paths (tags, linked-source management, every collection/Trash variation), real context-menu OS appearance, reduced-motion feel and macOS remain bounded gaps; shared primitive/component coverage is not a claim of those walkthroughs.

Do not repeat unchanged passing integration checks. Native iterations first corrected a wrong760px compression assumption, then exposed/fixed selector specificity overriding neighbor hiding; final600px run passed. Source review also protected secondary pointer presses from pane activation. Scope remains Phase0 + D1. Next engineering milestone after D1 review is D2.1 selection semantics, then D2.2 bulk commands.

Review D1 against the acceptance gaps above; then integrate only through the documented authorized procedure. D2–D4 remain NOT STARTED. Do not bump versions or publish automatically.
