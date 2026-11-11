# Vaultor Next — UI Code-Parity Audit (M10 baseline)

**Basis:** Original Electron Vaultor UI versus the experimental Tauri/React/Rust UI at the reported M10 baseline (`a1badfe`, `codex/vaultor-next-m1`). This is a source-comparison audit, supplemented by screenshots previously supplied in the conversation. **It is not a claim that I launched either binary or inspected every runtime state.** Public GitHub browsing did not provide a full local checkout, so some items are hypotheses requiring native confirmation. Source paths link directly to the current branch; preserve the exact source SHA when incorporating the audit into the repo.

**Audit framing:** P0 = structural/identity regression that would block convincing visual parity; P1 = significant cohesion/usability gap; P2 = refinement or acceptance gap. The entries are *UI acceptance concerns*, not a demand to build unrelated new backend features. A user should not have to report each screen manually.

## Executive finding

The main problem is **presentation architecture divergence**, not missing Tailwind tokens or a Tauri limitation. The original Electron app composes a rich set of specialized navigation, resource-list, orientation, editor, contextual-toolbar and motion primitives. Next implements a separate simplified composition (`NextApp`, `NextEditor`, `WorkspaceBrowser`, `CompanionNavigator`, `BrowseHeader`) and selectively imports parts of the old design system. M6–M10 restored features and themes but did not restore the entire structure that made those features feel coherent. Across Next, generic rules and accumulating CSS overrides further blur visual hierarchy. Fixing isolated margins/screenshots will not solve that architectural source of inconsistency.

## Recommended implementation strategy

1. **UI foundation pass:** consolidate `next.css`, remove broad CSS rules, unify desktop chrome/browse rows/header/overlays/editor orientation as reusable presentation primitives. Keep Rust authoritative and preserve the Next state/data contracts; do not transplant old `Dashboard.tsx` backend logic.
2. **Core identity pass:** Library, resource rows, note workspace, sidebar companions, compact headers, pane/navigation transitions, settings and Help. Compare equivalent views with same fixture data, dimensions and theme.
3. **Screen-specific parity:** Collections, Tags, Linked Sources, Trash, Activity, transfer review, tables/images/links, error/recovery states, responsive and keyboard/accessibility flows.
4. **Acceptance discipline:** one source-controlled UI parity table with actual before/after evidence for representative states, not claims like “shares CSS, therefore visual parity.” Do this alongside remaining functional milestones, or as one dedicated UI reconstruction milestone when convenient.

## Detailed findings

### Architecture & design-system (6 findings)


**UI-01 · P0 — Two independent desktop UI composition systems: NextApp/NextEditor/WorkspaceBrowser/CompanionNavigator are not the original Dashboard/LibraryView/BlockEditor/AdaptiveNavigator. Reused tokens cannot recreate the original interaction hierarchy.**  
**Evidence:** Confirmed source-level architecture. **Remedy:** Extract/reuse presentation primitives and composition contracts while retaining Rust/Next state ownership; do not port old backend orchestration.  
**Acceptance:** Equivalent library, note and browse flows follow the same spatial UI grammar.  
**Source owners:** [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [Dashboard.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/pages/Dashboard.tsx) · [LibraryView.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/LibraryView.tsx) · [NextEditor.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextEditor.tsx) · [BlockEditor.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/editor/BlockEditor.tsx).


**UI-02 · P0 — Next-wide `.next-shell button` presentation rule imposes generic padding/gap/alignment across specialized controls.**  
**Evidence:** Confirmed CSS. **Remedy:** Remove blanket styling in favor of semantic variants and original button primitives.  
**Acceptance:** Chrome, rows, inline tools and dialogs have context-correct size and hover behavior.  
**Source owners:** [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css).


**UI-03 · P0 — `next.css` contains repeated redefinitions of shell, header, resource rows and pane styles from multiple milestones; final behavior depends on override order.**  
**Evidence:** Confirmed CSS. **Remedy:** Consolidate per-component CSS into a single effective rule set; remove stale selectors with screenshot/regression checks.  
**Acceptance:** No visual behavior changes accidentally from unrelated overrides.  
**Source owners:** [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css).


**UI-04 · P1 — One giant NextApp orchestration component holds page, panes, browser, menus, selection and settings together, increasing coupling of visual states.**  
**Evidence:** Confirmed source structure; performance impact unproven. **Remedy:** Move page presentation/state selectors to stable feature containers without changing Rust authority.  
**Acceptance:** Opening menus or typing does not rerender unrelated browser regions; measured React commits.  
**Source owners:** [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx).


**UI-05 · P1 — Current Next uses generic button/input/list shells instead of the original contextual browse/pane primitives.**  
**Evidence:** Source comparison. **Remedy:** Create shared primitives for resource-row, contextual header, overlay and pane title with coherent density.  
**Acceptance:** Same control semantics across Library/Tags/Collections/Sources/Trash.  
**Source owners:** [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [LibraryList.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/LibraryList.tsx) · [LibraryView.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/LibraryView.tsx) · [Dashboard.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/pages/Dashboard.tsx).


**UI-06 · P2 — The design contract calls for transformation, not stacked sticky chrome; current CSS implements several layout variants additively.**  
**Evidence:** Source/design contract. **Remedy:** Write visual-state contract for expanded/compact/narrow rather than adding incremental selectors.  
**Acceptance:** Transitions preserve identity and never conceal content.  
**Source owners:** [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [UI_PHILOSOPHY.md](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/docs/design/UI_PHILOSOPHY.md).


### Navigation & shell (8 findings)


**UI-07 · P0 — Library and note workspace architecture is improved, but browser navigation still uses Next-specific route switches and reset logic (`setPanes([])`); continuity may diverge from original session journeys.**  
**Evidence:** Confirmed code path; UX consequence needs native verification. **Remedy:** Verify/restore history and return-to-context behavior before changing navigation reset policy.  
**Acceptance:** Open note→browse→Back preserves intended sessions, focus, search and scroll.  
**Source owners:** [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [Dashboard.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/pages/Dashboard.tsx).


**UI-08 · P1 — Sidebar companion is a simplified seven-tab model rather than original AdaptiveNavigator context/quick-access behavior.**  
**Evidence:** Confirmed different components. **Remedy:** Reuse original adaptive context selection and compact groups where appropriate; avoid overcrowded tab strip.  
**Acceptance:** Auto/Chosen,  narrow windows and keyboard traversal feel like original.  
**Source owners:** [CompanionNavigator.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/CompanionNavigator.tsx) · [AdaptiveNavigator.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/AdaptiveNavigator.tsx) · [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx).


**UI-09 · P1 — Primary sidebar and companion currently share several labels, increasing risk of redundant destinations and unclear scope.**  
**Evidence:** Source and prior user screenshots; current state needs visual recheck. **Remedy:** Differentiate full browser destinations from compact companion shortcuts through labels, current-state indicators and navigation results.  
**Acceptance:** Top Collections opens full browser; lower Collections acts as shortcut; no confusing duplicate selected states.  
**Source owners:** [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [CompanionNavigator.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/CompanionNavigator.tsx) · [WorkspaceBrowser.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/WorkspaceBrowser.tsx).


**UI-10 · P1 — Sidebar brand and footer use Next-specific spacing/typography and show truncated internal workspace path in footer.**  
**Evidence:** Confirmed CSS and earlier screenshots. **Remedy:** Match original branding/footer hierarchy; show useful workspace name with path only on demand.  
**Acceptance:** No raw/truncated internal path as primary bottom-row content.  
**Source owners:** [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx).


**UI-11 · P1 — Next DesktopToolbar is a separate smaller toolbar from original DesktopChrome; menu/group hierarchy and responsive priorities differ.**  
**Evidence:** Source comparison. **Remedy:** Adapt original chrome presentation and keyboard/window affordances to Tauri, retaining only supported commands.  
**Acceptance:** Original toolbar hierarchy in normal/narrow/fullscreen windows, no dead actions.  
**Source owners:** [DesktopToolbar.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/DesktopToolbar.tsx) · [DesktopChrome.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/DesktopChrome.tsx).


**UI-12 · P1 — Two-pane maximum remains different from original three-pane model.**  
**Evidence:** Documented parity gap, not just visual style. **Remedy:** Restore triple-pane layout, min widths and active-pane affordances as separate parity work.  
**Acceptance:** Three panes usable and visually balanced at supported widths.  
**Source owners:** [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [Dashboard.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/pages/Dashboard.tsx) · [VAULTOR-NEXT.md](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/docs/plans/VAULTOR-NEXT.md).


**UI-13 · P1 — Pane cards use fixed inset border/radius and top stripe, but note identity/title/organization placement differs from original NoteOrientation.**  
**Evidence:** Confirmed structure + prior screenshots. **Remedy:** Restore NoteOrientation composition with compact header transformations and contextual tools; retain current saving model.  
**Acceptance:** Same document looks spatially/typographically comparable in single/split panes.  
**Source owners:** [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [NextEditor.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextEditor.tsx) · [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [Dashboard.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/pages/Dashboard.tsx).


**UI-14 · P2 — Sidebar working region can become visually overcrowded at narrow widths due to number of shortcut tabs and fixed spacing.**  
**Evidence:** Source inference from seven icons and CSS; native verification needed. **Remedy:** Adaptive overflow/compact mode tied to working-region width.  
**Acceptance:** No clipped or tiny targets at 900px and narrower window acceptance.  
**Source owners:** [CompanionNavigator.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/CompanionNavigator.tsx) · [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css).


### Library & browsers (8 findings)


**UI-15 · P0 — Next resource row is bare checkbox/icon/title/date/kind/actions, while original has richer per-row hierarchy, metadata, scope, pin/context states and selection affordances.**  
**Evidence:** Confirmed code comparison. **Remedy:** Adapt original BrowseResourceRow presentation for Next Summary model.  
**Acceptance:** Resource list hierarchy and hover/context/selection states look like original across all views.  
**Source owners:** [LibraryList.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/LibraryList.tsx) · [LibraryView.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/LibraryView.tsx) · [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css).


**UI-16 · P0 — Current row action buttons and checkbox have `tabIndex=-1`; alternate keyboard context handling exists but direct access to these specific controls is absent.**  
**Evidence:** Confirmed source; accessibility outcome needs native verification. **Remedy:** Provide accessible roving/focus design or keyboard-invoked menu equivalent with visible guidance.  
**Acceptance:** Keyboard-only users can access all row actions and selection without pointer.  
**Source owners:** [LibraryList.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/LibraryList.tsx) · [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx).


**UI-17 · P0 — Resource list uses a persistent bottom pagination strip, while original integrates browse/page actions contextually in compact header.**  
**Evidence:** Confirmed source/layout; screenshot. **Remedy:** Move pagination controls into shared compact toolbar when compressed; retain accessible footer if large expanded view calls for it.  
**Acceptance:** No wasted extra footer row in compact state; page controls remain available.  
**Source owners:** [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [LibraryView.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/LibraryView.tsx).


**UI-18 · P1 — The Next list has a generic `Notes` heading and page-scoped Ctrl+A hint, not original richer count/filter/collection context.**  
**Evidence:** Confirmed UI source. **Remedy:** Restore resource counts, active filters, context crumbs and concise scope summary.  
**Acceptance:** User can tell exactly what list/filter/search is shown before acting.  
**Source owners:** [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [LibraryView.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/LibraryView.tsx) · [BrowseHeader.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/BrowseHeader.tsx).


**UI-19 · P1 — Generic WorkspaceBrowser handles multiple destinations with similar list rows, losing some area-specific browser composition.**  
**Evidence:** Confirmed code design. **Remedy:** Create area-specific sections around shared primitives (collections tree, tag counts/chips, linked-source states).  
**Acceptance:** Collections/Tags/Sources look like related but purpose-built browsers.  
**Source owners:** [WorkspaceBrowser.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/WorkspaceBrowser.tsx) · [LibraryView.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/LibraryView.tsx).


**UI-20 · P1 — Search in window toolbar and Library can imply overlapping scopes; existing UI may not adequately explain which is global versus title-filter.**  
**Evidence:** UI inference; verify current app. **Remedy:** Differentiate global search/command entry vs active view search with labels and scope feedback.  
**Acceptance:** Keyboard/pointer entry produces predictable search scope.  
**Source owners:** [DesktopToolbar.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/DesktopToolbar.tsx) · [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [BrowseHeader.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/BrowseHeader.tsx).


**UI-21 · P1 — Collection/tag/source rows do not yet share original group separators, hover feedback and contextual metadata in all views.**  
**Evidence:** Source-level component divergence, visible verification needed. **Remedy:** Reuse consistent BrowseGroup/row primitives with contextual metadata.  
**Acceptance:** Screens compared side-by-side with original at matched content.  
**Source owners:** [WorkspaceBrowser.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/WorkspaceBrowser.tsx) · [LibraryView.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/LibraryView.tsx) · [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css).


**UI-22 · P2 — Viewport/fixed footer scroll responsibilities have been repeatedly patched; potential scroll/overlay clipping remains across browser types.**  
**Evidence:** Confirmed CSS complexity; current defect not proven. **Remedy:** Single explicit scroll owner per screen, geometric tests at narrow/maximized sizes.  
**Acceptance:** No disappearing header, obscured rows or extra document scrollbar.  
**Source owners:** [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [WorkspaceBrowser.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/WorkspaceBrowser.tsx) · [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx).


### Header compression & motion (6 findings)


**UI-23 · P0 — The M10 compact header is a grid variant activated by `data-compact`, while original philosophy emphasizes object continuity; this can feel like a mode switch rather than one transforming control.**  
**Evidence:** Source comparison, quality judgement. **Remedy:** Port the original orientation/motion behavior for content/controls while keeping efficient transforms.  
**Acceptance:** Film expanded→compact→expanded; no jump, jitter or reflow-induced focus loss.  
**Source owners:** [BrowseHeader.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/BrowseHeader.tsx) · [browseGeometry.ts](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/browseGeometry.ts) · [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [LibraryView.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/LibraryView.tsx) · [UI_PHILOSOPHY.md](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/docs/design/UI_PHILOSOPHY.md).


**UI-24 · P0 — CSS defines a 2-row expanded header and later several compact overrides; layout rules are fragmented.**  
**Evidence:** Confirmed CSS. **Remedy:** Consolidate layout variants into one tested component style with overflow priorities.  
**Acceptance:** Compact state exactly one row at supported widths; expanded state coherent.  
**Source owners:** [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [BrowseHeader.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/BrowseHeader.tsx).


**UI-25 · P1 — `compressBrowse` uses scroll thresholds and switches compact boolean after 100/45px; potential hysteresis/jumpy intermediate states.**  
**Evidence:** Confirmed algorithm; visual smoothness unverified. **Remedy:** Use continuous geometry interpolation with a stable compact latch only for accessibility/action changes.  
**Acceptance:** Smooth reversible animation while scrolling slowly and rapidly.  
**Source owners:** [browseGeometry.ts](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/browseGeometry.ts) · [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css).


**UI-26 · P1 — Compact header action priority/overflow is Next-specific and may omit original search/filter/pagination controls.**  
**Evidence:** Source comparison. **Remedy:** Define action-order and overflow contract per browser; preserve search flexibility.  
**Acceptance:** One-row toolbar with essential controls visible across widths.  
**Source owners:** [BrowseHeader.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/BrowseHeader.tsx) · [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [LibraryView.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/LibraryView.tsx).


**UI-27 · P1 — Animations may exist as classes but native checks were scoped; no full comprehensive motion parity evidence.**  
**Evidence:** Documented unverified gap. **Remedy:** Record actual state transitions by screen, not boolean “motion present.”  
**Acceptance:** Native video/interaction review of 10 representative transitions incl reduced motion.  
**Source owners:** [VAULTOR-NEXT.md](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/docs/plans/VAULTOR-NEXT.md) · [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [UI_PHILOSOPHY.md](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/docs/design/UI_PHILOSOPHY.md).


**UI-28 · P2 — Next note surface uses a static active-pane accent stripe, not necessarily the original coordinated pane handoff and title transitions.**  
**Evidence:** Confirmed implementation; comparison needs visual validation. **Remedy:** Preserve active-pane affordance while restoring original spatial handoff and control geometry.  
**Acceptance:** Pane split, close, switch and resize animate naturally without focus loss.  
**Source owners:** [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [Dashboard.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/pages/Dashboard.tsx).


### Editor (7 findings)


**UI-29 · P0 — NextEditor is a new shell, not the full original BlockEditor orientation. Shared Tiptap extensions do not restore the original identity/action/organization framing.**  
**Evidence:** Confirmed code architecture + prior screenshots. **Remedy:** Reuse original editor presentation strata and contextual header UI while retaining Next persistence services.  
**Acceptance:** Typical managed note visually and interactionally matches original in OLED/dark/light.  
**Source owners:** [NextEditor.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextEditor.tsx) · [BlockEditor.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/editor/BlockEditor.tsx) · [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css).


**UI-30 · P0 — NextApp note bar presents both Pin and Unpin actions simultaneously in the inspected code path; a contradictory control pair.**  
**Evidence:** Confirmed code. **Remedy:** Show one stateful Pin/Unpin toggle and contextually available actions; move rare actions to overflow.  
**Acceptance:** No mutually exclusive actions shown at once.  
**Source owners:** [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx).


**UI-31 · P1 — Editor tool controls live within Next wrapper and `.next-editor-tools` flex/wrapping rules, rather than always using original floating contextual positioning.**  
**Evidence:** Confirmed CSS/structure. **Remedy:** Port original selection-aware toolbar placement and collision management.  
**Acceptance:** Toolbar follows selection and avoids clipping/narrow-pane overflow.  
**Source owners:** [EditorControls.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/EditorControls.tsx) · [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [BlockEditor.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/editor/BlockEditor.tsx).


**UI-32 · P1 — Editor document max-width/padding originates in Next CSS and may not match original prose measure/zoom/typography.**  
**Evidence:** Confirmed differing layout rules; visual comparison required. **Remedy:** Compare same document at same viewport/theme; unify editor typography tokens and content inset.  
**Acceptance:** Title/body measure and scroll alignment match chosen design baseline.  
**Source owners:** [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [NextEditor.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextEditor.tsx) · [BlockEditor.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/editor/BlockEditor.tsx).


**UI-33 · P1 — Managed and linked editors share surface but require different Save authority; status affordances may be too subtle compared to original.**  
**Evidence:** Source design inference; verify native. **Remedy:** Present explicit linked Save/dirty/conflict and managed autosave in coherent contextual location.  
**Acceptance:** Users identify Save mode instantly without reading Help.  
**Source owners:** [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [NextEditor.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextEditor.tsx).


**UI-34 · P1 — Original table/image/link menus include elaborate focus/collision behaviors; adapted Next controls need the same geometry/focus acceptance.**  
**Evidence:** Documented partial parity. **Remedy:** Reuse original menu/selection retention interactions with Tauri host.  
**Acceptance:** Table popovers and image tools usable at pane edges and fullscreen.  
**Source owners:** [EditorControls.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/EditorControls.tsx) · [BlockEditor.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/editor/BlockEditor.tsx) · [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css).


**UI-35 · P2 — Note title is treated as field in a fixed bar, unlike original orientation section with organization context; can feel like a separate web form.**  
**Evidence:** Structural observation, preference judgement. **Remedy:** Rework title/metadata hierarchy using original visual orientation.  
**Acceptance:** Title editable but visually belongs to note, responsive under compression.  
**Source owners:** [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [NextEditor.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextEditor.tsx) · [Dashboard.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/pages/Dashboard.tsx).


### Settings, overlays & Help (4 findings)


**UI-36 · P1 — Next Settings is a separate compact custom component, not original SettingsModal presentation; categories may be functional but appear generic.**  
**Evidence:** Confirmed source difference. **Remedy:** Reuse original spacing, section navigation, disclosure and controls, without old service coupling.  
**Acceptance:** Side-by-side same setting categories render cohesively with original.  
**Source owners:** [DesktopSettings.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/DesktopSettings.tsx) · [SettingsModal.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/modals/SettingsModal.tsx) · [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css).


**UI-37 · P1 — Next Help viewer uses inline ReactMarkdown rather than full original HelpCenter screen/navigation system.**  
**Evidence:** Confirmed source architecture. **Remedy:** Restore article navigation, outline, related links, search and history with same visual system.  
**Acceptance:** Help screen matches original core navigation and readability.  
**Source owners:** [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [Dashboard.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/pages/Dashboard.tsx).


**UI-38 · P1 — Menus, dialogs, and Activity currently originate from different Next components with different density/positioning rules.**  
**Evidence:** Source composition; exact mismatch needs screenshot comparison. **Remedy:** Unify popover surface, motion, collision, focus and dismissal primitives.  
**Acceptance:** Consistent anchored menus and dialogs in all themes.  
**Source owners:** [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css).


**UI-39 · P2 — Settings form rows use generic `select`/label styling with fixed 180px nav; may lack original responsive layout at narrower widths.**  
**Evidence:** Confirmed CSS; native issue unverified. **Remedy:** Use original responsive settings behavior and compact section navigation.  
**Acceptance:** No overflowing settings controls; keyboard and screen reader labels intact.  
**Source owners:** [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [DesktopSettings.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/DesktopSettings.tsx) · [SettingsModal.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/modals/SettingsModal.tsx).


### Responsive, access & QA (5 findings)


**UI-40 · P1 — CSS and component structure have multiple fixed widths (sidebar, settings nav, resource metadata) and cascade-heavy breakpoints.**  
**Evidence:** Confirmed CSS. **Remedy:** Define minimum-pane/sidebar and adaptive content grid with test viewport matrix.  
**Acceptance:** Works at e.g. 900x650, 1200x800, maximized, 125–200% scaling.  
**Source owners:** [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx).


**UI-41 · P1 — Visual/motion parity is marked mostly through scoped manual checks, not systematic same-data original/Next side-by-side evidence.**  
**Evidence:** Documented process gap. **Remedy:** Automate screenshot capture for reproducible fixture states; record manual motion/video checks only for key transitions.  
**Acceptance:** Evidence for equivalent states, not arbitrary screenshots.  
**Source owners:** [VAULTOR-NEXT.md](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/docs/plans/VAULTOR-NEXT.md) · [UI_PHILOSOPHY.md](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/docs/design/UI_PHILOSOPHY.md).


**UI-42 · P1 — Keyboard, IME, screen reader and Windows OS interactions are not fully qualified.**  
**Evidence:** Documented parity gap. **Remedy:** Run concise physical keyboard/accessibility/IME acceptance focused on user-facing editor and dialogs.  
**Acceptance:** No regressions in typing, composition, focus and dialog escape.  
**Source owners:** [VAULTOR-NEXT.md](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/docs/plans/VAULTOR-NEXT.md) · [LibraryList.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/LibraryList.tsx) · [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx).


**UI-43 · P1 — UI component performance might regress as native polish is restored; note opening and memory comparisons are sensitive to different fixture/cache conditions.**  
**Evidence:** Reported benchmark uncertainty. **Remedy:** Use same-data A/B render profiling and record input-to-frame distinct from transition time.  
**Acceptance:** No significant unexplained increase in long tasks, retained editor instances or idle CPU.  
**Source owners:** [NextApp.tsx](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx) · [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [VAULTOR-NEXT.md](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/docs/plans/VAULTOR-NEXT.md).


**UI-44 · P2 — No evidence of full app design-token audit for OLED/light/dark and semantic focus/error states after Next CSS overrides.**  
**Evidence:** Verification gap. **Remedy:** Small systematic matrix: all surfaces/dialogs, selected/error/focus/disabled/high contrast.  
**Acceptance:** Theme contrast and hover/focus states consistent across app.  
**Source owners:** [next.css](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css) · [UI_PHILOSOPHY.md](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/docs/design/UI_PHILOSOPHY.md).

## Audit limitations and next actions

- Source-confirmed means a code/CSS structure or rule demonstrably exists. It does **not** prove a negative in every reachable runtime mode.
- Screenshot-confirmed means a difference appeared in prior screenshots, which were captured on various M5–M9 builds; **do not attribute them to current M10 without reproducing**.
- Visual hypotheses (e.g., narrow-window clipping or focus issues) are deliberately flagged for runtime verification, not counted as confirmed bugs.
- The product's existing feature-parity CSV should remain separate from this **visual / interaction parity** inventory. Cross-link the relevant feature IDs rather than duplicating implementation status.
- Prefer a bounded same-data comparison matrix: Library expanded and compact; managed editor; linked Markdown dirty/conflict; 2–3 panes; Collections; Tags; Sources; Trash; Activity; transfer modal; Settings; Help; command palette; themes; 900px and maximized; 125–200% display scaling; reduced motion. Inspect a few key transitions visually.
- After structural parity is restored, any deliberate design departure should have a written rationale and a working before/after demonstration. “Different because Next is new” is not sufficient.

## Reference paths

- [Original UI philosophy](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/docs/design/UI_PHILOSOPHY.md)
- [Original Dashboard](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/pages/Dashboard.tsx)
- [Original LibraryView](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/LibraryView.tsx)
- [Original BlockEditor](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/components/editor/BlockEditor.tsx)
- [NextApp](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/NextApp.tsx)
- [Next CSS](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/frontend/src/next/next.css)
- [Next migration tracker](https://github.com/VaibhavPandit-09/vaultor-kb/blob/codex/vaultor-next-m1/docs/plans/VAULTOR-NEXT.md)


## M11 reconciliation — 2026-11-11

The original audit above is retained as the M10 source assessment. Findings are not all proven runtime defects. The following scoped updates supersede only the identified implementation claims; all other findings remain unresolved or unassessed.

| Findings | Original assets / M11 implementation | Acceptance and remaining gap |
|---|---|---|
| UI-01, UI-05 | BrowsePresentation, LibraryOrientation, NoteOrientation, NavigatorFrame, SidebarSectionSurface and WindowControls shared with original controllers; Next retains Rust services. | Major Library/managed-note/sidebar surfaces reconciled; not a wholesale Dashboard/BlockEditor copy. Remaining browsers and editor parity stay open. |
| UI-02, UI-03 | Broad button geometry excludes classed primitives; conflicting Next resource-row/note-bar rules removed, original orientation owns the Library lane. | Some unclassed legacy controls and browser-specific CSS remain. Partial, not closed globally. |
| UI-04 | No claim that line count is a measured bottleneck. Metadata uses one bounded read, with stale response cleanup; row pin handler is stable. | NextApp orchestration remains large; avoid speculative breakup without behavior/performance need. |
| UI-06, UI-08 | Shared original scroll compression and note disclosure; original navigator frame and five categories; Pinned/Recent collapsible groups. | Full drag discovery, category scroll and sidebar customization remain open. |
| UI-07 | Managed-note visits retain the bounded100-row Library DOM with its observers/Escape inactive; changing the full browser still unmounts it. Shared sessions retain documents and cursor context; hidden editors are not mounted. | Necessary lifetime policy, not evidence of lost data. Original full route choreography remains partial. |
| UI-10, UI-11 | Footer shows workspace name, full path in tooltip; host uses shared original WindowControls. | Compact footer utility strip and native Windows details remain partial. |

Windows evidence and final scope are recorded in VAULTOR-NEXT.md and the sanitized M11 benchmark summary. Source extraction alone does not close visual findings. UI-12 and all unlisted advanced/editor/preview/Settings findings remain pending M12 or their existing later workstream.
