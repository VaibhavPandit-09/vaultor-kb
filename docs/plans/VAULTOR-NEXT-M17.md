# Vaultor Next M17 acceptance record

Engineering status: **partial; ready for scoped user UI evaluation**. User UI acceptance remains open. Continue `codex/vaultor-next-m1` from `805d6947`. No merge, tag, installer or publication.

This record supplements the existing UI/functional registers. Initial corrections restore active title treatment, original supported resource-action order, a single full Tags heading with header-owned creation, and IME command ownership. Native evidence and its limitations are recorded below. Historical M16 findings remain unresolved until supported by new evidence.

The populated original/Next comparison identified missing inline collection pins and original tag-chip gradients/removal. These now use existing organization contracts; no new pin or assignment store. Managed three-view switching and restart passed through the native directory picker with Windows injected input (`tauri-rust-2026-11-15T19-11-46.291Z.json`, later harness selector syntax failure retained). Mixed three-view switching also passed (`raw/m17-mixed-workspace.json`): managed pending content saved, linked draft protected, old views destroyed, source unchanged, linked restore deferred to Recovery. Its final Save was refused as an unrepresentable edit before publication; that case does not independently prove the revision-conflict path.

Shared Redo investigation reproduces a click/focus boundary: programmatic scrollIntoView starts header compression, then the immediate click lands on the moving header and leaves body focused while all three editors still have Redo available (`19-04-23.363Z`). Stable geometry and asserted focus pass six rotating cycles (`19-06-41.854Z`, `19-14-03.398Z`). The original M16 timeout lacked those diagnostics and cannot be retrospectively attributed with certainty. No editor history or persistence rewrite was justified.

## Delivered build and validation

- Branch: `codex/vaultor-next-m1`; application source: `3b84bf81c86e76d99e8746c9e70d87801846adb8`. Subsequent delivery commits contain evidence, drivers and documentation only.
- Optimized executable: `C:\GitDev\vaultor-kb\next\src-tauri\target\release\vaultor-next-m17.exe`; 13,645,824 bytes; SHA256 `0e691b47265eede1b6bdee99a7e5561fb9539f9e418d4ad044ae78fb237b943c`.
- Final native presentation: `raw/tauri-rust-2026-11-16T03-28-25.825Z.json`. Inline collection pin/unpin, note tag removal/focus return/reassignment, one heading/New tag owner, populated catalogue/detail/resource states, three responsive viewport/DPR cases, Light/Dark/OLED tags and reduced-motion ghost cleanup pass.
- Final native safety: `raw/tauri-rust-2026-11-16T03-23-26.505Z.json`. Managed draft acknowledgement → forced termination → Recovery restore/autosave; competing managed revision refusal; linked bytes unchanged before explicit Save; supported publication; competing linked revision refusal with text/draft retained.
- Windows SendInput/UIA: `raw/m17-native-keyboard.json`; Settings/palette shortcuts and Escape, visible palette Tab focus, native maximization, one retained editor and no body horizontal overflow. UIA focused-element reporting was stale; DOM focus is recorded separately. This is not physical-keyboard certification.
- Frontend: 87-case focused regression run passes; subsequent collection-pin and tag-removal/focus cases pass. Rust preference/session tests: 3 pass. TypeScript/optimized Vite, scoped lint and Help/catalogue validation: 43 features/16 articles pass. No unrelated legacy full suite or release qualification.
- Help: Next foundation Library/note presentation and Notes/collections; M17 in-app revision; experimental catalogue description. No published-platform availability change.

## Acceptance classification

| Target | Implemented / functionally tested | Visual comparison | Motion / keyboard | Remaining |
| --- | --- | --- | --- | --- |
| Note header | Active title, supported action order, original bounded tag pills/removal; native pin/tag actions pass | Original/Next matched expanded note, Light; Next Dark/OLED captures | Focus returns to Add Tag; header folding/disclosure exercised | Unsupported Review/graph actions omitted; full transition fidelity unverified |
| Collections | Inline stable collection pins in All/Hierarchy; existing navigation retained | Populated All, expanded Hierarchy and detail matched | Existing shared compression retained; keyboard pin regression passes | Original detail action grouping/breadcrumb disclosure differs |
| Tags | One full-browser heading; header creation; contextual management and accessible navigation names | Populated catalogue, resources and creation matched | Composing Enter/arrows and title legacy229 regressions pass | Original sort options, exact total count and creation placement differ; physical IME unverified |
| Sidebar / other browsers | Mixed pins and Quick Access preserved; Sources, Recent and Trash exercised | Mixed Pins compared; Next populated Sources/Trash captured | Original controller/motion owners preserved | Original populated Sources/Trash comparison and additional utilities remain open |
| Workspace protection | Three managed views switch/return/restart; mixed protected managed/linked switch preserves drafts and destroys old editors | Representative three-pane captures retained | Six rotating shared Undo/Redo cycles pass in final-source controlled run | Historical M16 timeout causality remains uncertain; full unavailable-source matrix open |
| Responsive / access | 900×650/DPR1,1200×800/DPR1.25,1800×1000/DPR1.5 bounds pass; native maximized window observed | Touched note surfaces captured | Injected Windows Settings/palette/Tab/Escape; reduced-motion cleanup pass | Physical 100/125/150 scaling matrix, touchpad, IME and screen-reader speech unverified |

[Local comparison gallery](../../benchmarks/tauri-rust/raw/m17-comparison.html) is supplementary; the actual workspace-relative path is `benchmarks/tauri-rust/raw/m17-comparison.html`. Compact durable evidence is in `summaries/m17-native-windows.json`. Original reference: `raw/electron-java-2026-11-15T19-27-03.501Z.json`, desktop/ui0.27.0 assets identified in the unchanged M16 record. Static screenshots do not establish motion acceptance. Pane-allocation/browser geometry and reduced-motion cleanup are scoped evidence; broad subjective original motion remains unverified.

## Controlled performance

Same isolated-profile protocol,1800×1000/DPR1,three managed notes ×50 paragraphs. Five-second settling then ten-second untouched role snapshots; no forced GC. Each return cycle performs six note opens,six pane split/close and four Settings round trips. M16 source `b6027cbb` versus delivered M17 source `3b84bf81`; exact binaries/role snapshots and intermediate30c93776 observations remain in canonical records.

| Phase | M16 private MiB | Final M17 private MiB | Final M17 GPU private MiB | Final M17 JS heap MiB |
| --- | ---: | ---: | ---: | ---: |
| Fresh startup | 267.22 | 264.61 | 151.72 | 5.55 |
| One pane | 307.52 | 306.85 | 171.48 | 6.40 |
| Two same-document views | 623.45 | 611.69 | 466.29 | 7.23 |
| Three same-document views | 643.30 | 634.27 | 485.32 | 7.62 |
| Three distinct notes | 620.32 | 582.68 | 403.43 | 9.14 |
| Returned one,cycle1 | 387.86 | 377.36 | 197.59 | 10.05 |
| Returned one,cycle2 | 390.42 | 387.18 | 198.71 | 10.63 |

Measurement limitation: the driver retains `window.m17OldEditors` references to three destroyed views during return sampling. Both sources share this diagnostic condition; these numbers are not a clean uninstrumented idle/leak qualification. Fifteen lightweight parked sessions remain after the two cycles;only one editor is mounted. The driver was dirty during qualification and exact per-run script fingerprints were not recorded.

Final returned M17 working set550.36MiB; short post-churn CPU7.18% of one logical core versus8.25% baseline. These are not five-minute idle measurements or an improvement claim. One editor and zero popup portals remain; parked view metadata grows with explicit split sessions. The diagnostic script also retains references to destroyed editor objects in `window.m17OldEditors`; both binaries use that instrumentation. This limits interpretation as clean production idle or a retention/leak test. No application cache purge,animation removal or speculative persistence change was justified. Uncontrolled desktop/power/cache,n=1 per source/phase,no preview churn,and the earlier expanded-DPR804MiB observation remain limitations.

Evidence: `raw/tauri-rust-2026-11-15T19-28-18.792Z.json` baseline; `19-31-19.837Z` intermediate; `19-38-04.256Z` final. Summary: `summaries/m17-performance.json`. Canonical CSV10582 records;10097-record historical prefix unchanged. All failed measured observations remain;64 evidence runs are invalidated. The19-sheet workbook preserves1072 checked historical cells,panes and object/validation counts; exact-source means/counts and saved-file formula-error checks pass. Dashboard/Scenarios renders inspected; native Excel recalculation unverified.

M17 remains engineering-partial for the individual differences and unverified gates above. The executable is useful for another user evaluation; this does not close the UI phase or constitute user acceptance. No merge,tag,installer,installation over Electron or publication.

Classification: **Different** — Tags sort/count/placement,sidebar utilities and collection-detail disclosures. **Intentionally improved** — full Tags creation is owned by its shared transforming header to remove the duplicate section and keep the action reachable during compression. **Unverified** — broad original motion,populated original Sources/Trash and physical input/scaling/speech. No screen or user acceptance is newly marked Accepted merely because original code/styles were reused.

Final driver guard follow-up: `raw/tauri-rust-2026-11-16T03-41-07.013Z.json` passes the same direct native safety checks after disposable-root ownership validation was added. This developer-only guard does not change the delivered executable.
