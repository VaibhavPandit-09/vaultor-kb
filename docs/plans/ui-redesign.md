# Desktop UI redesign: audit and proposed interaction plan

Reviewed 2026-10-15. **Library reviewed by the user; Collection detail and pagination follow-up implemented for review.** The user authorized the next interaction on 2026-10-15 and asked that recordings be reserved for key animations. Note workspace and later interactions remain outside this slice.
Design authority: [UI philosophy](../design/UI_PHILOSOPHY.md). Current behavior remains documented in [CODEBASE](../CODEBASE.md). This document records source findings and proposed transformations, not shipped behavior.

## Branch and evidence

- Clean starting checkout: `master`, `11b09aa`, matching fetched `origin/master`. No `dev` branch exists locally or remotely; origin HEAD is master.
- Created `ai/codex-ui-redesign` from `origin/master`. No active AI branch was incorporated. `origin/ai/codex-current` remains untouched.
- Inspected the actual components, global CSS, shared motion, settings application, pane presentation, desktop window configuration and native validation infrastructure. No previous redesign plan was used as authority.
- `npm --prefix desktop run build` passed, compiling the frontend and staging ignored `desktop/ui`. Warnings: stale Browserslist data, large JavaScript chunk and ineffective dynamic import of the shared API module. No dependency changes.
- Launched the real Electron development application with separate `/tmp/vaultor-ui-audit-20261015` user data and dynamic loopback networking. Native observation was attempted twice; Computer Use reported pending macOS Accessibility/Screen Recording permissions both times. **No desktop visual, pointer, resize or temporal motion verification is claimed.**
- Findings below are implementation facts and design assessments from those facts. Actual perceived spacing, motion quality and platform hit testing remain a mandatory native review gate before implementing the first visual slice. No broad suites, API mutation smoke or Docker checks were run.

## Native baseline and observation limits — 2026-10-15

The real Electron app uses isolated `/tmp/vaultor-ui-audit-20261015` user data. Native Accessibility and screenshot observation now work; read-only inspection confirmed existing Screen Recording permissions. Seeded 112 disposable notes through ordinary owner-authorized loopback imports, with no credentials printed or user workspace touched. The fixture provides a bounded 100-row page, pagination and a long Unicode title.

Before loading the prototype, inspected the original Library at normal 1320×900, large 1920×967, user-resized ~950×847 and short 1920×484 logical sizes, with Light/Dark/OLED observations. The original title/kicker, search/filter/actions, count/mode, selection and repeated Resources/count all scroll away. Short geometry fits about three rows beneath orientation. Smaller wheel actions and reversal move the whole stack; there is no transformed working form. Search focus survives scrolling; long resource titles truncate. A discrepancy beyond the source audit: More passes behind native controls during partial scrolling.

The user confirmed that dragging the empty top band moves the window normally and manually resized it successfully. Native menu sizing and Maximize/Restore were exercised. Automated edge drags were unreliable; one later edge drag did resize the prototype. Minimize and Close-to-tray were invoked, but observation immediately raises the app, preventing independent certification of its OS/tray state.

Native baseline recordings were saved at `~/Desktop/Screen Recording 2026-10-15 at 2.09.39 AM.mov` and `2.11.36 AM.mov` (actual filenames contain a narrow no-break space before AM). The latter is 48.513s, 30fps, 3932×2026 and shows the isolated Vaultor window. A smaller review copy is `/Users/vaibhavpandit/.codex/visualizations/2026/10/15/vaultor-library/baseline.mp4`.

**Limits:** the exact 600×480 minimum was reached during prototype testing, not the original baseline; do not describe the original baseline as a complete minimum-size matrix. Computer Use supplies individual observations, not live video playback to the agent. Native input plus saved temporal footage establishes behavior, but does not replace the user's real-time feel assessment. These limits should have been kept explicit before beginning implementation; the initial implementation files were written while the final drag confirmation was still pending, although the running app remained on its original build until that confirmation arrived.

## Phase 1A review candidate

The initial Phase 1A candidate opted only unscoped Library into `LibraryOrientation` and `useLibraryCompression`. The Collection follow-up below extends it; Recent remains on its existing composition; no notes, panes, sidebar, preview, settings or theme redesign. The same mounted heading, search, type/options and More controls change geometry over the first 160px of the existing scroll owner. Kicker space collapses, title reduces from 28px to18px and wide search migrates upward/right into the title/action row. At workspace widths <=940px, search stays on a second row while moving upward32px. Working geometry reclaims84px wide /44px narrow. The repeated visual Resources/count label is removed only here; its accessible group name remains.

One integrated header retains the transformed controls using CSS sticky positioning; there is no duplicate compact DOM, second toolbar, floating card or nested list scroll. Count/search mode and contextual filters/selection remain available. Bottom padding compensates for collapsed height to keep scroll range stable, with browser scroll anchoring disabled only on this view. CSS writes are component-owned and rAF-coalesced, without React updates or layout measurements per frame. ResizeObserver measures only actions width/viewport changes. Smooth follows with65ms response, Snappy35ms, with continuous reversal and no overshoot. Reduced motion applies endpoint geometry immediately. Pointer activation freezes geometry through click/React commit; an open header popover retains its anchor. Search focus/caret, list identity, pagination/query and selection ownership stay unchanged.

### Actual validation and tuning

- Initial native reload exposed a lifecycle defect: the child's layout effect ran before its parent scroll ref was available, so compression never attached. Changed attachment to a passive effect and added a mounted Library integration test; subsequent native scrolling compressed correctly.
- At600×480 Light/Dark, summary sat too close to search in the compact state. Reduced narrow compression from52px to44px and added8px clearance; rebuilt/reloaded and visually checked the correction.
- Exercised smaller wheel increments, larger trackpad-like deltas, repeated reversals, focused title search followed by continued typing, long Unicode resource titles, Files filter/zero results, all-visible100 selection and filter clearing in Electron. These are injected native scroll deltas, not physical trackpad hardware certification.
- Reviewed large and short Light/Dark/OLED, intermediate ~950px Light and600×480 Light/Dark. Native controls remain above/clear of Library controls. This is **not** every Cartesian size/theme combination. Native baseline supplied normal1320×900 observations; an exact1320×900 prototype window was not independently restored.
- Toggled macOS Accessibility → Motion → Reduce motion on, exercised scroll/reversal in the minimum window, then restored the original off preference. Exercised existing Smooth mode as well as Snappy; no settings implementation changes.
-12 focused tests pass across LibraryView, LibraryPopover and compression driver: mounted attachment, focus/caret/row identity and no extra query, page/filter/selection contracts, pointer/click/popover freezing, successive gestures, reversal, reduced motion and disposal. Scoped ESLint passes. Fresh `npm --prefix desktop run build` passes TypeScript/Vite/UI staging with existing stale Browserslist, chunk-size and shared API dynamic-import warnings. No full suites/API smoke/Docker checks.
- User-started prototype window recording saved as `~/Desktop/Screen Recording 2026-10-15 at 2.29.41 AM.mov`:371.328s,30fps,4064×1192. Resizing leaves black space around the recorded window. A40s native-motion excerpt is `/Users/vaibhavpandit/.codex/visualizations/2026/10/15/vaultor-library/library-motion.mp4`; it includes expansion/compression/reversal and search interaction. Temporal frame sequences were inspected alongside native actions; screenshots alone are not motion approval. The recording includes the initial defect/fix and narrow sizing; later final checks extend beyond it.

Remaining gates: user's personal motion judgement, full size/theme Cartesian coverage, physical trackpad feel, independent Minimize/tray-state certification and installed Windows/macOS release checks. This is a branch review candidate, not a published installed-app release. No versions, signing, installers or release assets changed. Collection detail was unstarted at this handoff; its later authorized implementation is recorded below.

## Phase 1B Collection detail and pagination follow-up — 2026-10-15

The user confirmed that Library motion works, reported bottom-only pagination, and authorized the next part. Recordings are now reserved for key structural animations or a specific temporal defect; ordinary control/layout checks use targeted native observation. Apply the compression language to relevant pages in their own reviewed slices, not mechanically or in one broad rollout. This slice stops at Collection detail; Collections index/Recent/Pinned and Note workspace remain unchanged.

### Baseline and agreed transformation

Before changing Collection presentation, inspected its real Electron empty and populated states. Created a disposable long-name collection using existing native dialogs, then added the fixture's112 notes using the existing100+12 page-scoped bulk membership controls. No personal data or API mutation smoke. Original detail repeated the collection name in breadcrumb and title, wrapped the long title above actions/search and scrolled all those controls away. Library's only pager was below100 rows, matching the user's screenshot.

Collection now uses the same mounted compression surface/driver. The Library breadcrumb retains its destination while the single collection title migrates beside it; title allocation contracts from two lines to one with ellipsis and full-name hover/accessibility. Pin/Add resource/More remain together. Search stays on a full second row, allowing long names/action widths without competing for a single wide toolbar. Header allocation reclaims72px over the existing160px progress range. No cloned content, duplicate header, additional scrolling owner, new card or new entry/navigation animation. Index-origin motion awaits the separate index slice and stable origin bounds.

Pagination moves once into the existing result-count/search-mode row for Library and Collection detail. Page indicator plus accessible Previous/Next arrows remain available in orientation and working geometry; there is no bottom duplicate or floating footer. Pager bounds are retained while loading another page of the same criteria, but old page rows are never shown for new criteria. Paging/filter/scope changes reset the existing scroll owner to the first result; selection remains page-scoped. Initial query debounce no longer resets a fast page change when the search value has not changed. Other browsing destinations keep their existing pager.

### Validation and tuning

- Native baseline and candidate checks use real Electron and the existing isolated profile. Inspected empty collection before population, long names,112-resource paging,100-resource selection, focused search/continued typing through compression, Files-filter empty results/clear, Add resource's captured collection destination, smaller scroll deltas and repeated larger reversals. Native page arrows switch pages without traversing the list.
- Reviewed normal~1230px-wide OLED, large OLED and short/narrow961×484 Light/Dark geometry. This is targeted coverage, not a full size/theme Cartesian matrix or a new600px minimum certification. Window-menu sizing and native chrome exclusion were checked; drag/control ownership is unchanged.
- Temporarily enabled macOS Reduce motion, exercised collection scroll endpoints, then restored the original off preference. No OS setting or application theme/motion implementation change remains.
- Native narrow review exposed a hard-cut long title: added endpoint ellipsis to the same title, keeping its full accessible/hover name. The title's line-clamp changes only after the second line has already collapsed. Added16px of orientation allocation for the32px pager hit targets, avoiding overlap with selection; compression distance stays unchanged.
- Focused tests initially used obsolete visible Next text; updated to its accessible name. The new pager test exposed the initial debounce/page-reset race and prompted the production fix. The older focus test directly mutated a controlled input; changed it to use the real change/debounce path before checking caret retention.
-15 focused tests pass across LibraryView/LibraryPopover/compression: paging/filter/selection contracts, mounted identity/caret, single retained header pager/page-top reset, long collection identity/actions/breadcrumb, visible collection metadata failure/retry, interruption/popover/pointer locking, reversal/reduced-motion/disposal. Scoped ESLint and fresh desktop UI TypeScript/Vite/staging pass with existing Browserslist/chunk/dynamic-import warnings. No broad suites/API smoke/Docker checks.
- No additional recording for routine pagination/control checks. Collection reuses the user-reviewed Library motion driver; native scrolling/reversal was exercised. Existing Library motion footage remains available above; screenshots establish geometry only, not independent live-feel approval.

No resource/API/backend/schema/dependency or saving behavior change. Integration-sensitive files: LibraryView, BrowseLayout, compression driver and scoped global CSS. This remains an isolated branch review build, with no version/release/installers published. Stop for Collection transformation review before extending to remaining browse destinations or Note workspace.

## Audit of current surfaces

Paths below are relative to the repository. Dimensions are declared CSS values, not measured desktop pixels; density and wrapping can change the result.

| Surface and source | Concrete current behavior / problem | Direction and what to retain |
| --- | --- | --- |
| Library: `components/LibraryView.tsx`, `BrowseLayout.tsx`, `index.css:348` | One `.library-view` scroll owner is good. It has 18px gaps between direct children, up to 40px padding, a 28px title, kicker, filters, summary, selection row and another Resources/count heading. Counts and orientation repeat before the first resource. Title, search, actions and bulk actions all leave with scrolling; there is no compression model. | Transform the same title/search/action elements into one working region. Consolidate repeated counts and selection chrome. Keep server order, bounded pages, explicit saved-content mode, retained queries and one scroll owner. |
| Collections index: `OrganizationViews.tsx` | Reuses the heading, separate search, count and group heading; both the summary and group repeat collections/count. Navigation to a collection changes page identity and triggers a page fade, with no source-to-destination relationship. | Modestly compress orientation; make the selected collection's name provide navigation continuity. Do not turn the collection list into a card grid. |
| Collection detail: `LibraryView.tsx` | Breadcrumb precedes the same Library stack; Pin, Add resource, Return to notes and More compete around a long wrapping title. Filter chips and selected rows add independent bands. No collection description exists in the current contract. | Title and breadcrumb settle into a compact identity group; search/actions share the working geometry. Do not invent collection metadata/features. Keep captured collection destinations and creation semantics. |
| Recent / Pinned: `LibraryView.tsx`, `OrganizationViews.tsx` | Share most list geometry; Pinned has its own heading/filters/summary composition. Repeating a new compression implementation here would fragment the family. | Reuse the proven browsing behavior after Library review; retain mixed note/file/collection pins and recency semantics. |
| Note workspace: `pages/Dashboard.tsx:1408–1623`, `JourneyViewport.tsx`, `ResourceCollections.tsx` | A permanent 52px journey strip sits above a non-scrolling note header. Title/actions, memberships and active-pane tag row consume height independently of reading depth. A single pane is capped at 56rem with 24px outer horizontal padding; multiple panes keep their own header stacks. Active tags appear/disappear on focus, changing available body height. | Keep readable line lengths; reduce surrounding chrome, not document readability. Fold secondary organization into an accessible compact control as reading proceeds. Preserve save failure/retry and rename behavior. |
| Multi-pane: `Dashboard.tsx:1927–1965`, `index.css:746–765` | Two panes remain equal width. Three use 1.2/0.9 flex allocation. Smooth dims inactive panes to .86 and scales the whole editor surface to .98; 170ms transitions include flex. Opening/closing changes sibling geometry without a dedicated structural lifecycle. Rounded surfaces, gaps and an additional separator repeat containment. | Remove editor scaling and opacity as the main hierarchy mechanism. Make allocation and control organization carry focus, without bright rings. Preserve pane IDs, shared documents, individual selections and save-before-departure. |
| Narrow desktop: `useNarrowWorkspace.ts`, `index.css:746–765` | Viewport <=760px changes sidebar presentation; workspace container <=850px for two panes / <=1200px for three hides inactive panes with display:none. Editors remain mounted, a valuable invariant. Multiple independent breakpoints can switch layout while the window is resized. Compact controls reserve 170px for native chrome. | Specify intermediate width behavior and control priority deliberately. Retain mounted editors and device preferences. Test short height as well as narrow width; do not claim a 412px browser viewport represents the native minimum. |
| Sidebar: `Dashboard.tsx:1181–1293`, `SidebarSections.tsx` | Fixed width collapses from 18rem to zero using width/opacity; child layout does not reorganize and the fixed hidden subtree has pointer suppression without explicit inert. Floating sidebar translates an entire glass panel; narrow mode closes it on navigation. Search/navigation/create/filter/footer compete with quick-access content. Tags include an overflow region inside the sidebar scroller, although independent scrolling must be checked in runtime. | Preserve disclosure grid motion and disabled-query behavior. Transform navigation deliberately instead of clipping its full-width content. Audit hidden keyboard access. Keep Search/Create/connection reachable. No mandatory permanent icon rail without review. |
| Side / Floating preview: `PreviewLayer.tsx`, `FilePreview.tsx` | Mode branches render different wrapper depth, so the viewer subtree is recreated when switching mode. Image zoom is local state; PDF iframe/cache URL and scroll context can be lost. Side width changes from full to 60% to 40% at breakpoints and overlays content. Floating is 84vh. Header + memberships + MIME/size + override/status consume separate bands. | One persistent viewer and surface, geometry changing between side and floating. Consolidate redundant metadata, keep Open/Download/retry visible. Preserve existing overlay semantics until explicitly reviewed. |
| Preview content: `FilePreview.tsx` | Outer content scroll plus CSV/code overflow wrappers create potential competing scroll owners. PDF iframe minimum height is based on viewport (`100vh - 9rem`) inside an 84vh floating shell, risking overflow beyond the viewer's actual allocation. Fallback reserves 64px vertical padding and a 48px icon. | Give each renderer one intentional scroll owner; let PDF fill allocated height. Keep legitimate horizontal data overflow and original media colors. Existing preview byte/pixel limits remain. |
| Command palette / search: `modals/CommandPaletteModal.tsx` | Title/mode, input, mode/scope, optional coverage/warnings, results and footer form a tall stack. Overlay starts at 12vh; results alone cap at 48vh, but the total shell has no corresponding viewport-height cap. Long warnings/actions can consume the remaining height. Search-to-Actions changes body content without an explicit stage geometry model. | Keep one command surface with a stable input anchor and bounded total height. Utility motion should be brief. Preserve native Tab order, explicit Actions, captured targets and Escape steps. |
| Settings: `SettingsModal.tsx`, `index.css:583–675` | Already one canvas with flat rows, one scrolling body, contained focus and scoped resets; do not rebuild it. Desktop rows have 22px top/bottom padding, 32px section gaps and 26px/32px content padding. Narrow layout adds a category band and stacked controls. Category transitions are generic fades. | Trim row/section rhythm where it buys actual content height. Keep readable descriptions and aligned controls. No scroll compression is required for a category rail merely because Library uses it. |
| Dialogs / organization / imports / exports / recovery: `modals/AppModal.tsx`, `OrganizationManager.tsx`, `AddExistingResources.tsx`, `WorkspaceTransfers.tsx`, `ResourceLifecycleDialog.tsx`, `RecoveryPanel.tsx` | Generic shell uses 28px corners and 20px/24px padding in header, body and footer; whole dialog scrolls. Organization embeds a max-38vh list, creating a possible nested scroll. Generic modal does not contain focus like Settings does. Existing security/destructive confirmations and pending guards have product meaning. | Compact utility shells; reserve one body scroll for complex dialogs and preserve persistent commit/cancel access. Improve focus containment via existing Escape/restoration ownership. No ornamental morph for unrelated dialogs. |
| Empty / loading / errors: `BrowseLayout.tsx`, `Dashboard.tsx:1661`, `FilePreview.tsx`, boundaries | Browse empty is already compact, though dashed containment is often unnecessary. Welcome uses a 64px icon and centered message; loading uses three 96px skeleton cards. Preview fallback is larger than the message requires. Multiple recovery/navigation/global banners can stack above content. | Use concise contextual guidance, stable loading geometry and actionable local failures. Retain serious unsaved/conflict signals. No entrance animation needed for every empty state or error. |
| Theme: `lib/settings.tsx:162`, `index.css` | Effect immediately applies theme classes/data/color scheme/accent variables. There is no coordinated spatial reveal. Shared per-control transitions cannot establish a global transformation. OLED overrides and original media boundaries already exist. | Centralize one reveal from the trigger, with immediate state application and safe fallback. Keep geometry, contrast, persistence and OS following. |
| Desktop chrome / connections / workspace selector / updates: `DesktopChrome.tsx`, `DesktopRoot.tsx`, `WorkspaceRoot.tsx`, `DesktopNetwork.tsx`, `DesktopUpdates.tsx`, `desktop/src/main.mjs:246` | Frameless window is 1320×900, minimum 600×480. Controls are 34px high at top right, z3100; journey reserves 170px and browsing reserves a 40px top band. Preview gets its own 34px top padding. The native control group remains above ordinary overlays. Connections already has a constrained heading/tabs/body/footer. | Incorporate the safe top-edge area into transformed geometry without adding a title row. Keep native drag/no-drag rules explicit. Test overlays around controls, resize, maximize, tray close and connection errors; do not change trust/hosting workflows. |
| Editor tools / expanded tables: `editor/BlockEditor.tsx`, `TableControls.tsx`, `ManagedImage.tsx`, `SlashMenu.tsx`, `ResourceLinkMenu.tsx` | Existing table expansion preserves the editor; table portals are pane-clipped. These are useful precedents. Slash groups have sticky local headings; menus use bounded scroll, which is justified for utilities. Editor menus have independent entrance classes in addition to shared surface markers. | Preserve table editor/undo identity and contextual positioning. Remove competing decorative animations only when working on the relevant surface. No global redesign of document schema or typography. |

## Motion audit

`lib/motion.ts` centralizes durations and reduced-motion cancellation, but is mainly an entrance/exit system. Page/category changes fade; menus/panels translate, scale and slightly overshoot; six initial rows may stagger. These are not orientation-to-working transformations. Generic hover lift/edge glow in `index.css:726` adds activity without explaining structure. Journey direction has useful meaning, but a forced `offsetWidth` restarts its CSS animation.

The existing body-wide MutationObserver scans added/removed descendants. Pointer/key/resize/captured-scroll listeners measure every tracked surface. Exits clone whole surface trees at z1300. This is a performance and ownership concern for a scroll-driven redesign, not proof of measured jank. Do not extend the observer to implement new structural motion or clone live editor/PDF surfaces. Migrate affected surfaces to explicit lifecycles incrementally; leave unrelated motion in place until its slice.

Reduced-motion CSS and active-animation cancellation already exist. Retain them, while ensuring compact/focused states themselves remain fully usable without animation. Also replace `transition-all` in touched code with named properties. Avoid an unrelated repository-wide cleanup.

## Minimum foundations — Phase 0

1. Extend existing motion tokens with a small geometry vocabulary: control response, layout redistribution, surface transformation; one easing family, Smooth/Snappy and reduced-motion resolutions. No new animation package initially.
2. A component-owned progress driver for browsing compression: one scroll owner, passive signal, rAF-coalesced CSS properties, no React state updates per frame. Progress follows absolute scroll depth; direction reversal reverses it. Measure only on relevant size/content changes, not every descendant on scroll.
3. A small cancellation/retargeting helper for actual bounds transitions, extracted only once a second concrete interaction needs it. Keep editors/iframes live and unscaled. No generic morph engine, universal ghost DOM or global layout observer.
4. Shared desktop exclusion geometry for drag/no-drag/control bounds. Reuse existing constants/tokens where possible; never animate a control through a native hit-test zone.

Phase 0 acceptance: compile and focused timing/cancellation tests; no visible redesign bundled into groundwork. Audit existing motion tests before changing public helpers. Only the Library-owned scroll signal was needed for the approved proof of concept; no generic motion engine or unrelated shared refactor was introduced.

## Proposed interaction specifications

These are reviewable proposals. Pixel targets and durations below are starting ranges to be tuned in Electron, not accepted visual designs. Each major interaction is implemented and reviewed separately.

### Phase 1A — Library orientation becomes working geometry

- **Problem / desired state:** repeated vertical bands obscure the list; essential controls vanish on scroll. Content should claim more height while orientation remains understandable.
- **Orientation:** current title identity, count, broad search, type/search options and useful primary navigation. Remove duplicate count/group narration rather than adding another header.
- **Working:** a small integrated top region contains title identity, condensed count, search, type/options and contextual selection actions. It occupies the same application surface, not a floating card.
- **Moves:** the single title migrates upward and toward its working baseline; actions move into the same alignment; search settles alongside them when width permits.
- **Resizes:** title typography, search width and orientation region height/padding. No scaling of input text; use actual type metrics.
- **Collapses / disappears:** kicker and redundant metadata space collapse; secondary labels simplify only with accessible names/tooltips. No essential control disappears.
- **Persistent:** query, focus/caret, filter state, selection count/actions, resource list identity and pagination. If search or an action group has focus, hold its usable geometry until focus leaves; never move a pointer target during activation.
- **Not sticky:** the expanded header, summary stack and selection row. One compact top geometry may remain accessible; its persistence must result from the single surface's transformation, not a duplicated sticky copy.
- **Motion:** continuous scroll progress, initially explore roughly the first 100–140px. Keep scroll coordinate space stable and account for header height change so collapse cannot feed back into scrollTop or jump the first row. If native proof cannot achieve this, revise the model before shipping; a token height transition is insufficient.
- **Reversal / reduced motion:** reverse continuously with scroll, avoid direction-triggered jitter. Reduced motion applies stable compact/expanded geometry at safe thresholds with anchoring and no spatial sweep; state/access remain immediate.
- **Desktop verification:** realistic 100-row page, keyboard search/selection, forward/reverse wheel and trackpad, active input, rapid filter changes, empty/filtered results; Light/Dark/OLED at normal, large and 600px narrow/480px short windows. Observe motion continuously and verify drag/control exclusions.
- **Risks / files:** scroll anchoring, query refreshes, bulk action focus, wrapped long titles and native drag region. `LibraryView.tsx`, `BrowseLayout.tsx`, `index.css`, small progress helper if needed. Preserve resource APIs and list contracts.
- **Gate:** show the running Electron result and stop for user review before Collection detail or any next major interaction.

### Phase 1B — Collection detail, then Collections / Recent / Pinned

- **Problem / desired:** breadcrumb/title/actions add bands; entering a collection loses spatial context. Keep collection identity through entry, reading and return.
- **Orientation / working:** full collection name with breadcrumb, Pin/Add resource and broad search becomes compact breadcrumb/title plus essentials. Index keeps search/New collection; it needs less compression than detail.
- **Moves:** selected collection name provides a short origin cue into detail; within detail the same title/search/actions migrate as proven in Library. Do not pretend two unrelated resource lists are one morphing object.
- **Resizes / collapses / disappears:** title/padding/search widths change; kicker/repeated count collapse; only redundant labels disappear. Long names truncate in compact form with full-name access.
- **Persistent / not sticky:** collection ID, Pin/Add resource, filters, return context and search remain; no pinned breadcrumb plus separate sticky hero plus filter bar.
- **Motion:** reuse Library progress; entry/return may use a bounded title-origin transition (~240–320ms), only if stable source bounds exist. Otherwise use a brief directional navigation cue, without cloned page content.
- **Reversal / reduced:** return restores source list context; interrupted entry settles to current navigation state. Reduced motion switches immediately and restores position.
- **Desktop verification:** long/Unicode titles, empty/populated collections, filters, selection and creation/import destination, back/return and window resize during entry; same theme/size/focus matrix as Library.
- **Risks / files:** index currently unmounts across destinations and has local query/page state; preserve presentation context explicitly without altering server queries or resource semantics. `OrganizationViews.tsx`, `LibraryView.tsx`, `BrowseLayout.tsx`, `Dashboard.tsx`, session context only if necessary.
- **Gate:** Collection detail transformation review before extending the pattern to the remaining browsing destinations; stop before note work.

### Phase 2A — Note orientation and reading chrome

- **Problem / desired:** title/membership/tags reserve reading height; active tags alter body allocation. A note should retain identity with less permanent chrome.
- **Orientation / working:** title, organization and save controls visible at top; reading depth condenses title/organization into one compact note identity region under the shared journey.
- **Moves / resizes:** same title and actions settle to a smaller baseline; header allocation contracts. Body itself is never scaled. Keep journey shared rather than making one per pane.
- **Collapses / disappears:** expanded membership/tag presentation collapses into labeled organization access with active-count/status cues. Redundant metadata vanishes; save failure never does.
- **Persistent / not sticky:** title editing, save/retry, pin/actions, organization access and journey remain reachable. No sticky expanded note header or floating editing toolbar added.
- **Motion / reversal:** note viewport depth drives its own chrome; focus/rename pins stable control geometry. Restore correct progress with each visit's reading position. Reverse when returning to top.
- **Reduced:** discrete stable density states, no sweeping migration; keep caret and reading anchor.
- **Desktop verification:** long note, long title, 0/many tags/collections, dirty/save-failed note, duplicate views, rename, IME, journey back/forward and table expansion across themes/sizes.
- **Risks / files:** `JourneyViewport` records editor scroll; changing header height must not corrupt visit position restoration or selection. `Dashboard.tsx`, `JourneyViewport.tsx`, `ResourceCollections.tsx`, `SaveIndicator.tsx`, CSS. Do not refactor SaveCoordinator/Tiptap document ownership.
- **Gate:** note-header review before pane motion.

### Phase 2B — Pane focus, opening and closing

- **Problem / desired:** opacity/scale carries hierarchy; open/close lacks an explicit space-yielding relationship. Focus should visibly redistribute workspace allocation.
- **Orientation / working:** peer panes preserve their arrangement; focused pane gains deliberate usable width and clearer controls, siblings remain legible. Prototype the two-pane allocation modestly before tuning three panes.
- **Moves / resizes:** pane boundaries and neighboring allocation move together; close yields the departing pane's space to survivors. Keep editors unscaled, mounted and keyed by pane ID.
- **Collapses / disappears:** secondary header controls compact as width reduces; closed pane disappears only after its existing save barrier succeeds. Hidden narrow panes remain mounted/inert as appropriate.
- **Persistent / not sticky:** save status, title, selection, undo, visit identity and scroll. No bright focus perimeter, boxed pane cards or added sticky pane toolbar.
- **Motion / reversal:** interruptible ~260–340ms geometry redistribution; retarget from current allocation. Avoid reflow on every pointer focus event and test wrapped text stability. Prefer bounded native layout updates over scaling content; revise if measured typing/scroll performance suffers.
- **Reduced:** allocation and focus update immediately, with explicit semantic focus cues.
- **Desktop verification:** repeated focus changes, keyboard Alt navigation, split/duplicate/close with failed save, 1/2/3 panes, resize through 850/1200 container thresholds, table portals/fullscreen and caret stability.
- **Risks / files:** reflow changes reading anchors; pointer activation must not move the clicked target before click completes. `Dashboard.tsx`, pane presentation CSS, `JourneyViewport.tsx`; navigation service only for proven presentation needs.
- **Gate:** user review of focus system and open/close behavior before sidebar.

### Phase 3 — Sidebar and global navigation

- **Problem / desired:** width-to-zero clips content; overlay/hidden focus behavior needs native audit. Navigation should reorganize predictably.
- **Orientation / working:** expanded navigation retains Search/Create and quick access; compact presentation keeps a deliberate entry to navigation, with no mandatory rail decided yet. Focus mode remains explicit.
- **Moves / resizes:** sidebar boundary yields width to workspace; labels align toward their compact positions; floating mode uses its invoking edge as origin.
- **Collapses / disappears:** quick-access/Tags and secondary footer controls compress into accessible disclosure/overflow; hidden contents become inert immediately. Preserve explicit user section preferences.
- **Persistent / not sticky:** Search, create/import, workspace/connection access and current destination remain reachable. No added permanent floating navigation bar or independent scroll for each section.
- **Motion / reversal:** ~240–300ms boundary/label transformation, interruptible hover/pin behavior; preserve scroll in quick access. Disclosure grid is reused where appropriate.
- **Reduced:** immediate correct geometry/inert/focus state, no edge sweep.
- **Desktop verification:** mouse edge reveal, keyboard toggle/Escape, pin/unpin, focus-mode entry/exit, long quick-access lists, narrow auto-close and resize during reveal; native drag zones and overlay layering.
- **Risks / files:** hover timers, hidden tab stops, viewport versus container breakpoints, query suspension and persisted preferences. `Dashboard.tsx`, `SidebarSections.tsx`, `SidebarItem.tsx`, `DesktopChrome.tsx`, CSS.
- **Gate:** sidebar transformation review before previews.

### Phase 4A — One preview surface, two geometries

- **Problem / desired:** mode switch recreates viewer; metadata stacks and PDF viewport sizing waste allocated space. Preserve resource and viewer state through geometry change.
- **Orientation / working:** side at its existing edge or floating at readable central bounds; both are the same surface. Compact chrome prioritizes title, mode, Open/Download and close.
- **Moves / resizes:** one shell interpolates x/y/width/height (~300–380ms); backdrop changes as modal state changes. Do not transform/scale iframe or image pixels to fake resize.
- **Collapses / disappears:** duplicate MIME/size and override narration consolidate; memberships remain through compact access. Only redundant text disappears.
- **Persistent / not sticky:** viewer DOM/iframe, image zoom, scroll position, resource ID and pending file actions. No additional sticky metadata band or floating toolbar.
- **Motion / reversal:** stable ancestor chain and viewer key, retargetable bounds on toggle/window resize. Accessibility/modal state applies immediately, independent of animation.
- **Reduced:** instant geometry change with same viewer node; focus ownership stays correct.
- **Desktop verification:** PDF page/position before and after both directions, zoomed images, long text/CSV/code, in-flight file action, Escape/source focus, 600px width and short height, themes. Observe continuously; inspect viewer-node identity and request/release counts.
- **Risks / files:** Chromium PDF viewer may alter its internal scroll on resize even without remount; same-node persistence must be demonstrated, not assumed sufficient. Native viewer policies and cache ownership remain intact. `PreviewLayer.tsx`, `FilePreview.tsx`, preview-loading markup in `Dashboard.tsx`, CSS.
- **Gate:** review Side ↔ Floating before command palette.

### Phase 4B — Command palette and search stages

- **Problem / desired:** total height is unbounded relative to stacked chrome; stage changes lack spatial explanation. Keep one compact command mode anchored around its input.
- **Orientation / working:** empty search suggests current/open/pinned/recent resources; query shows results; Actions/command step replaces the relevant body inside the same shell.
- **Moves / resizes:** body allocation adapts within a viewport-bounded shell; a brief internal stage cue explains deeper/back navigation. Input keeps its position and focus.
- **Collapses / disappears:** detailed scope/help contracts only where useful; redundant mode narration can disappear. Do not hide saved-content coverage or target identity when material.
- **Persistent / not sticky:** close, query, selected result, Back/Actions and errors; results own one scroll area. No new sticky nested search toolbar.
- **Motion / reversal:** ~160–220ms utility transition with no overshoot or whole-page morph. Preserve previous query/selection on Escape back.
- **Reduced:** immediate stage updates; keyboard behavior unchanged.
- **Desktop verification:** Mod+K, arrows/Enter/Tab/Shift+Tab/Escape, commands/actions, scopes, saved-content warnings, long title/error, short native window, themes and rapid queries.
- **Risks / files:** DOM order intentionally differs from footer visual order; preserve Tab Actions semantics and captured targets. `CommandPaletteModal.tsx`, CSS, existing palette ranking/command logic remains.

### Phase 5A — Settings, dialogs and utility polish

- **Problem / desired:** tall settings rhythm and generic shell padding; nested lists and focus containment differ. Compact utilities should remain clear and predictable.
- **Orientation / working:** retain focused settings canvas/category rail; search shows matching settings. Dialog orientation explains action/scope, working state keeps pending/error/cancel/commit accessible.
- **Moves / resizes:** settings control alignment reorganizes at narrow widths; only related category/body geometry gets a small transition. Dialog body allocation respects actual available height.
- **Collapses / disappears:** reduce redundant section narration and padding; advanced details disclose explicitly. No important destructive scope/warning disappears.
- **Persistent / not sticky:** title, close, save/retry and required action controls. Stable dialog header/footer around one body scroll are justified here; do not pin the entire settings content or add cards.
- **Motion / reversal:** short contextual utility appearance; do not morph unrelated dialogs. Category changes need no elaborate animation. Empty states/loading do not need gratuitous entrances.
- **Reduced:** immediate changes with complete focus/state feedback.
- **Desktop verification:** keyboard focus containment/restore, nested confirmation Escape, pending guards, imports/exports/recovery with disposable data, search/reset and numeric IME; 600×480, normal/large and all themes.
- **Risks / files:** generic AppModal callers have different pending/destructive behavior. Preserve confirmation/save/transfer contracts. `SettingsModal.tsx`, `AppModal.tsx`, touched utility callers and CSS; scoped tests only.

### Phase 5B — Theme enters the workspace

- **Problem / desired:** immediate root recolor has no coherent origin. One coordinated reveal should preserve geometry and text contrast.
- **Orientation / working:** old theme and fully applied new theme are complete visual states, not component-by-component color interpolation.
- **Moves / resizes:** only the reveal mask expands from the actual footer/settings trigger; application geometry does not resize.
- **Collapses / disappears:** old visual snapshot disappears after reveal; no actual UI controls or document content disappear.
- **Persistent / not sticky:** root DOM, focus, selection, scroll, viewer/editor identity and settings persistence. No persistent theme overlay or floating theme control.
- **Motion / reversal:** first test View Transitions against Electron's native PDF/opaque media and custom chrome. One ~300–420ms reveal; state commits immediately, rapid switches cancel/retarget safely. If unsupported/capture fails, update immediately or use a brief whole-surface crossfade. OS-following changes may use a neutral origin/minimal transition.
- **Reduced:** immediate accessible theme application, no radial sweep.
- **Desktop verification:** Light/Dark/OLED/OS, both triggers, repeated switches mid-reveal, fullscreen table/PDF, contrast and native control exclusion, failed settings persistence, reduced-motion change during transition.
- **Risks / files:** pseudo-element stacking versus native control z3100, PDF snapshot behavior, effect timing and first paint. `settings.tsx`, `SettingsModal.tsx`, `Dashboard.tsx`, theme CSS; nativeTheme handling only if evidence requires it.
- **Gate:** explicit theme-transition review before declaring polish complete.

## Validation and delivery boundaries

Each implemented slice: inspect current behavior, agree specification, implement, build, focused risk checks, native visual/continuous-motion review, diff review, documentation update, small commit and push. Do not proceed to the next major interaction until user review. Static screenshots support hierarchy checks only; they do not certify motion.

Native review must include Light/Dark/OLED, normal/large/narrow/short windows, keyboard/hover, both transition directions, interruption/reversal and reduced motion. Use disposable workspaces. Record what actually ran; Windows/macOS native results do not certify each other. Do not repeatedly run unrelated API/Docker/full-suite checks.

Audit documentation requires no installers. Any later shipped desktop behavior follows the standing [release process](../desktop/RELEASE-PROCESS.md), including fresh bundled UI/server, original signing identity, verified platform artifacts and publication gates. Review slices are not permission to integrate active feature branches or publish unavailable platform artifacts.

## Integration-sensitive files

`Dashboard.tsx` is a 1,965-line orchestration owner shared by many workflows. Keep extraction limited to presentation boundaries as each interaction needs it. `index.css`, `settings.tsx`, `LibraryView.tsx` and `PreviewLayer.tsx` are likely integration conflict points. Record changed responsibilities in each coherent commit; never synchronize with another active AI branch on this stream. Preserve resource-based data, structured Tiptap JSON, shared API/settings/design tokens, centralized Escape/focus and all save/recovery barriers.

## Review decision

Library was reviewed and the user authorized Collection detail plus accessible pagination. Those are implemented with evidence and limits above. Stop for Collection review before remaining browse destinations or Note workspace. Panes, sidebar, previews, settings and theme redesign remain separate later gates.
