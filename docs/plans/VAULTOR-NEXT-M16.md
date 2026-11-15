# M16 workspace UI and interaction qualification

Reviewed 2026-11-15. Continues `codex/vaultor-next-m1` from `dd2dff41`. Engineering-partial UI acceptance candidate; user acceptance is pending. No merge, tag, installer or production publication.

## Implementation and qualification

Three-pane host contracts now extend the original pane navigation/layout rather than a separate workspace implementation. Explicit split creates a session/visit identity over the same authoritative document, inserts after the active pane, and refuses capacity overflow. Capacity reduction protects displaced views and retains the active view plus available peers; other sessions remain in Open Notes. Session receipts accept at most three assignments and reject colliding identities. Slot weights are bounded metadata in the existing root-bound receipt, with legacy two-pane ratio support. Two pointer/keyboard resize boundaries affect adjacent slots only, retain reasonable minimum widths, preserve reading anchors, and cancel on Escape, pointer cancellation, window blur or window resize. Original compact/focus/reduced-motion layout and M15 scroll containment remain the presentation owners.

Focused automated and scoped native qualification are recorded below. Full comparison,physical scaling/input and user acceptance remain open. This ledger supplements the existing UI/functional registers and does not close their unresolved findings.

## Qualification record

Application source before final typography: `f205f6a5ba617c933ff56e5b15c1e9a6268524ab`, SHA256 `ecbe345e9990934cf6f0305e056cdcc72029f12e359aaf61d61db3ca72132296`. Typography checkpoint: `d410af6`. The subsequent responsive action-group checkpoint is `b6027cb`; the delivered artifact and final measurement are recorded below. Earlier observations remain attributed to their executable; they are not silently relabelled as final styling.

| Target | Implemented / functional evidence | Visual / motion evidence | Keyboard / remaining qualification |
| --- | --- | --- | --- |
| Three views and shared state | Native WebView2: three session/slot identities, shared text, one autosave revision/journal, shared Undo/Redo; existing editor nodes survive third-pane creation | Original and Next use original allocation/depth;650ms native geometry windows for1→2→3 | Injected Ctrl+Alt+PageDown/PageUp reaches each same-resource view; physical keyboard remains user-owned |
| Pane navigation/layout | Middle-pane resource link/Back leaves siblings unchanged; pointer first boundary, keyboard second boundary, weighted restart,3→2→1 capacity parking | Original widths compact peers at narrow size; no horizontal application viewport | Focus/resize interruption unit tests include Escape, blur and width changes; broad physical interruption acceptance remains open |
| Shared presentation | Fixed narrow journey-strip overlap (UI-72), composition-aware Save (UI-73), obsolete editor body typography selector (UI-74) | Matched original/Next Light browser and Light/Dark/OLED Settings captures; header action grouping remains different | Touched controls preserve existing Escape/focus ownership; no global wheel interception |
| Browsers/overlays | Library, Collections, Tags, Linked Sources, Recent, Pins, Trash, Settings, Help, palette, Activity captured | Equivalent three-note fixture; catalogue empty states are not populated detail qualification | Existing M15 populated/selection/drag evidence is retained; complete detail/filter/menu combinations not newly certified |
| Responsive |900×650,1200×800,1800×1000; DPR1,1.25,1.5,2; native maximized Windows workspace | Four emulated cases reject overlapping toolbar controls and body overflow | DPR emulation is not Windows100/125/150/200% scaling qualification |
| Data safety | Existing M14 recipe reused on M16 executable: durable managed draft/termination/restart/restore; competing managed commit refused; linked source unchanged before explicit Save; external revision conflict retains newer bytes and draft | Final artifact: `tauri-rust-2026-11-15T17-22-45.385Z.json` | Typography changes no service/persistence contracts; final artifact checks recorded below |
| Accessibility / input | Mounted Save regression yields to composition, legacy229, AltGraph and handled editor events | Windows UIA names Settings dialog, Search commands combobox, buttons, editor region/body | Windows SendInput Settings/Tab/Escape/palette/maximize pass; no physical-input or screen-reader speech claim |

Evidence under `benchmarks/tauri-rust/raw/`:

- `tauri-rust-2026-11-15T16-56-57.445Z.json`: scoped M16 native functional/geometry/responsive pass before typography, including three-view keyboard/journey checks.
- `electron-java-2026-11-15T17-05-16.461Z.json`: original Electron three visible notes and Settings/1→2→3 geometry windows. Original UI bundle: `desktop/ui/assets/index-Deqz7MeN.js`, `index-TEQAzOrz.css`; executable is generic Electron, not a complete frontend source identity.
- `m16-native-keyboard.json`, `m16-next-native-maximized.jpg`: actual Windows SendInput/UIA and native maximized capture. A temporary blank right margin after clearing CDP device emulation repainted on native maximize; this instrumentation state is not asserted as a production defect.
- `m16-comparison.html`: local paired capture index; static states establish layout, not whole-application motion parity.

Native layout checks use disposable workspaces and isolated WebView2 profiles. No personal workspace is changed. Actual installed input methods are English US/India (US keyboard). A language-composition IME, physical Precision Touchpad and screen-reader speech are unverified. No Windows display-scale setting was changed.

## Remaining differences / qualification gates

1. Original note-header action order, Review/Links-and-mentions disclosures and certain primary/sidebar utility controls still differ. Unsupported Review Inbox/graph operations remain excluded and visible in the functional register.
2. Original rich editor/table/CSV and linked-source/full-text capabilities retain their individual functional gaps. The supported Next code/table/link tools are not the complete Electron editor.
3. Populated collection/tag detail, import/export/recovery overlay matched visual states and full file-preview/menu variations were not all compared in M16. Earlier evidence remains historical, not a new all-screen pass.
4. Motion samples cover pane allocation and representative Settings/browser changes. Full reversal/rapid interruption/focus continuity across every popover, preview and browser transition remain unverified. No application-wide motion parity claim.
5. Physical keyboard/trackpad, language IME, screen-reader speech and Windows100/125/150/200% scaling remain acceptance gates. Viewport/DPR and injected-input tests do not close them.
6. Native/GPU memory retention remains a bounded observation, not a diagnosed leak or a proven performance improvement. No cache purge, hidden-editor workaround, animation removal or acceleration change is introduced.

Help `next-foundation` and its Feature Catalogue task now describe three views, protected capacity reduction, numbered pointer/keyboard resizing and narrow peers. UI-only typography/toolbar and shortcut-ownership fixes introduce no additional Help controls. The156-item functional inventory is preserved; current gaps are updated in place, historical milestone status columns remain historical. Engineering delivery remains partial; the user owns UI acceptance.

Typography checkpoint source `d410af607ab26387642d089f77550a06b617c835` builds SHA256 `59472c0742297dde19c1b730a9b1c1e0b5df1ae5a1aa2a7d2cb053af9b0d3691`. Native scoped pass `tauri-rust-2026-11-15T17-11-46.533Z.json` confirms16px editor body,three views/shared edits/Undo/Redo,numbered boundaries,keyboard journeys,restart,capacity parking,responsive controls and separate horizontal code/table ranges. The exact same artifact passes final safety recipe `tauri-rust-2026-11-15T17-12-51.618Z.json`,including durable recovery,managed competing revisions,linked explicit Save and external conflict protection. Frontend/Rust application code is unchanged by subsequent evidence/docs/tooling commits.

Original bundled JS SHA256 `e1168ae5557ecc1a7c75c2fbaf1691c0c8b623dddf511b6a9ebbe90efa3be346`; CSS SHA256 `259238940bb8a75f8ee0c72101a0aca075b121824870a8dd92c9c7a4de4a9975`. These identify the actual reference assets,independently of generic Electron executable identity.


## Delivered candidate

Application source `b6027cbbbfde9c389589307e4625f3db359181f7`; optimized Windows executable `C:\GitDev\vaultor-kb\next\src-tauri\target\release\vaultor-next-m16.exe`; SHA256 `315aaaa70148f9bd081926ba9f3e5ac9f69cc4c6b66193c9eccdf4462fb63d86`. Later commits contain qualification tooling/evidence/docs only. No installer,master merge,tag or release. Close an older Next instance normally before launching;choose Settings → Workspace → Maximum visible panes →3 to enable the third assigned view.

The final action grouping restores original narrow-pane structure for managed/linked identities,including contextual formatting in the same cluster. Original action order and unsupported Review/graph disclosures still differ. Final native pass `tauri-rust-2026-11-15T17-21-41.542Z.json` verifies below-title action bounds and shared-session behavior. Final safety `tauri-rust-2026-11-15T17-22-45.385Z.json` verifies recovery,managed competing revisions and linked source preservation. Final measured pass `tauri-rust-2026-11-15T17-30-57.760Z.json` additionally records reduced-motion/rapid Settings interruption cleanup and focus/redo diagnostics. Final Windows SendInput/UIA capture `tauri-rust-2026-11-15T17-38-54.386Z.json` and `m16-native-keyboard.json` checks keyboard Settings/palette,visible Tab focus,Escape return to the actual Settings trigger and native maximization.

Five-minute final idle:0.287% of one logical core,515.98MiB aggregate working set,803.69MiB private memory. The common returned endpoint before the expanded responsive/code/table pass was498.35MiB working set/380.63MiB private,versus M15 baseline494.62/386.90MiB. Initial one/two/three role snapshots and JavaScript heap are separated in `benchmarks/tauri-rust/summaries/m16-performance.json`. Three-pane GPU private bytes were592.30MiB;after normal navigation the common one-pane GPU private snapshot was221.44MiB. Final expanded UI private memory remains high and unresolved;the extra UI/DPR/code-table workload differs fromM15. There is no improvement,plateau or leak-freedom claim.

One measured shared-redo timeout (`tauri-rust-2026-11-15T17-28-09.495Z.json`) was not reproduced by the diagnostic retry. The successful retry records editor1 focused,redo available in all3 views after Undo,and redo applied in all3. The failed run remains excluded from comparison and UI-76 remains unverified;this does not close physical keyboard qualification.

Validation: controller/fill43 focused cases,plus pane sizing/divider/receipt/capacity regressions pass;mounted interaction28 and editor/linked7 cases pass after grouping,with formatting portal5-case editor suite separately passing. Shared-document6 cases passed before the presentation-only changes. Rust desktop preference/receipt3 tests pass. TypeScript/Vite optimized UI,scoped lint and Help/catalogue validation43 features/16 articles pass. No unrelated legacy suites or release qualification claimed.

The canonical CSV retains its9670-record historical prefix and adds427 M16 records,including failed attempts;the existing156-item functional inventory remains intact. Workbook qualification is recorded below. Scoped user evaluation is useful now,but engineering delivery remains partial because the individual physical/full-screen/full-motion/IME/accessibility gates and the unverified timeout remain open.


Workbook qualification:10097 canonical records,including427 M16 records;9670-record historical prefix unchanged after line-ending normalization. All19 worksheets,1072 checked historical cells,freeze panes and object/validation counts are preserved. Exact-source M15/M16 returned-endpoint means/counts and MiB units pass independent checks;Artifact Tool and saved XLSX formula-error scans find0 errors. Dashboard/scenario renders were inspected. Native Excel recalculation is unverified. `summaries/m16-workbook-validation.json` records saved-file checks;the Dashboard10s returned-endpoint comparison must not be confused with the expanded-fixture five-minute totals above.

Native switching to another workspace with three pending managed/linked views was not newly qualified. Existing root-bound receipt and stale-startup protections are preserved;this broader switching matrix remains open rather than inferred from restart tests.
