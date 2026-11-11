# Tauri/Rust benchmark record

`benchmark_runs.csv` is canonical and append-only. Initial CSV and tracker were copied from the current user's Downloads; originals are unchanged. The workbook is regenerated from CSV, never maintained as independent measurements.

Build production Electron UI/bundled host with existing desktop scripts and optimized Tauri with `npm --prefix next run build`. Run sequentially without interacting with the windows:

```powershell
node benchmarks/tauri-rust/run.mjs electron-java
node benchmarks/tauri-rust/run.mjs tauri-rust
```

Both use disposable profiles, 100 notes in one collection, two approximately 64 KiB structured documents, three opens, twelve CDP native text insertions, scripted scrolling and saved-content readback after restart. Setup is outside measured operations. Production authorization and persistence gates remain active; credentials stay inside the disposable renderer. The original Electron linked-source smoke failed at native source approval; no historical numbers replace it.

Instrument `m1-cdp-v2` normalizes the rendering viewport to 1200×820 at device scale 1 and emulates a light OS theme for both runtimes. Native outer-window dimensions still differ; display refresh and power are not controlled. Earlier v1 exploratory rows are retained separately. Dashboard includes an instrument filter. `--qualify` adds Tauri UI, shared-pane memory, motion and failure/close checks outside the comparable workload.

Startup is spawn through mounted Library/ready commands (50 ms polling). First-profile is **not cold OS startup**. Restart retains fixtures, but session restoration differs between apps. Open is visible DOM click through selected title/end marker (10 ms polling). Input is CDP delivery through beforeinput to next rAF, not physical input or compositor presentation. Scroll samples are rAF intervals. Process working sets include shared pages; private bytes are separate. A 500 ms CIM sampler can miss peaks. CPU is tree CPU/wall time: 100% = one logical core. Short idle is not five-minute steady state. Java working set is measured; heap is unavailable. Power is uncontrolled.

Electron has many more capabilities. Compare only disclosed implemented workflows; lower foundation memory does not establish overall product improvement. Counts are diagnostic. Missing metrics stay missing. Do not compare different instrument versions without qualification.

Each CSV row records source, machine/OS, fixture hash, iteration, unit, validity and evidence. Work-in-progress runs identify their base commit; newer raw records also identify dirty state and executable SHA-256. Validity accepts true/false or Y/N. A `run_failure` invalidates its run in derived reports. Append corrections as `run_invalidated` rows referencing the original evidence path; original measurements remain intact. Workbook generation applies these corrections without rewriting CSV.

Bulky traces/screenshots/process series are ignored in `raw/`. Git-tracked `summaries/` retains sanitized metadata/measurements/checks with corresponding basenames. Temporary fixture folders remain outside Git for diagnosis. Any cleanup must target the exact disposable folder, never personal data.

Refresh via `update-workbook.ps1 -RuntimeRoot <bundled-workspace-dependencies>`, using the runtime returned by Codex's loader. It uses bundled Artifact Tool, preserves template tabs, imports the entire CSV, normalizes validity and updates Dashboard formulas. Filters select architecture/device/scenario/dataset; blanks mean unmeasured combinations. Future milestones append results and refresh summaries/workbook.

## M2 protocol extension

Use `node benchmarks/tauri-rust/run.mjs tauri-rust --m2 --qualify --idle-five`. The existing runner/instrument is retained. `m2-managed-notes-v1` separates the milestone's saves (now including draft protection) from M1 while preserving the100-note/64KiB workload and input/open/frame measurement boundaries. `VAULTOR_BENCH_EXECUTABLE` selects an explicitly retained executable for the unchanged M1 baseline; its actual SHA-256 is recorded.

`--idle-five` waits30seconds after the shared editing workload, then leaves the app untouched for300seconds, with no renderer polling/input/CDP sampling. The existing external process sampler captures tree CPU/memory; its own process is outside the measured app tree. CPU uses actual timestamps inside that five-minute window and one-core percentage units. No builds or heavy qualification run during the idle interval. M1's retained executable measured0.684% of one logical core over299.4sampled seconds, so the earlier short-idle spike did not establish an idle loop. Neither run controls power mode or guarantees compositor presentation.

M2 qualification uses disposable UI-created collections/notes for hierarchy, rename, identity-preserving memberships, normal-close pending input, protected-draft taskkill, restore, discard, conflict refusal, parking/restart and explicit reviewed replacement. Larger1000/5000fixtures are seeded through ordinary commands, then exercise UI paging/scroll/editor continuity and metadata-only full cursor walks. One/two-pane and eight-reopen memory observations are separate scenarios; they do not claim settled retention/leak measurements. Recovery restarts are killed/closed before sampler cleanup, so cleanup cannot accidentally permit autosave before the intended crash. M1 and M2 use incompatible experimental schema markers by design; both get fresh workspaces.

The generated M1 vs M2 tab filters exact sources and experiment IDs. Historical Electron comparison remains intact. Failed attempts stay in CSV and are excluded from comparison; raw diagnostic bodies are ignored. The migration tracker owns current product contracts and remaining scope.

### M2 observations

The final optimized source is `d2106c2` (EXE SHA-256 `a4e088e428f61b52fe361ed24bc1d0b7a20a4baf278aa07bb33410dfafd09a17`,11,269,632bytes). Retained M1 source `52b84ee` uses the unchanged M1 EXE hash recorded in its summary. Both five-minute runs used the same device,1200×820/light rendering,100-note fixture and64KiB editing workload. Each idle result is one300second window after30seconds settling, not a statistical guarantee.

| Comparable observation | Retained M1 | M2 |
| --- | ---: | ---: |
| Settled CPU, one-core percent | 0.684% | 0.173% |
| End-of-idle process-tree working set | 336.8 MiB | 321.1 MiB |
| End-of-idle process-tree private bytes | 214.1 MiB | 226.2 MiB |
| Note-open median,3samples | 35.4 ms | 29.9 ms |
| Input-to-rAF median,12inputs | 2.20 ms | 2.10 ms |
| First-workspace startup,1sample | 818 ms | 840 ms |

The earlier short-idle CPU spike was mostly a settling/sample-window issue; no permanent idle loop was found. A real event-path defect was fixed: editability changes emitted Tiptap updates and caused phantom saves. M2 disables those emissions, requires doc-changing transactions, defers JSON capture to protection, and avoids parent notifications for every edit. The observations do not isolate each fix causally. Private bytes increased about12MiB with recovery/organization; no universal memory reduction is claimed. Browser/profile caches, OS residency and power are uncontrolled.

M2-only scenarios:1000/5000-note page turns measured15.3/18.2ms with100rows mounted. At5000notes, one/two-pane working sets were611.1/611.5MiB; after eight pane reopen cycles615.4MiB and after eight distinct-note switches587.8MiB. At1000notes the same progression was527.6/538.1/560.9/591.9MiB. These are immediate observations after fixture setup and recovery operations, not settled leak tests; GC/residency and cumulative setup affect them. Do not compare them with the100-note idle memory. Larger fixtures contain metadata/empty ordinary notes plus the original two populated64KiB notes; this establishes Library scalability, not5000simultaneous large-document editing. The dataset hash identifies the shared populated document; scenario names encode fixture size.

Final native assertions pass for100/1000/5000fixtures,50unique metadata cursor pages, UI hierarchy/rename/memberships, normal-close pending edits, forced termination after a durable draft receipt, restore/discard/park and explicit conflict replacement, exact journal cleanup, shared panes and no phantom revisions from navigation. Theme/pane motion was sampled across40/20frames; light/dark, reduced-motion endpoints and bundled M2 Help were exercised and captures reviewed. Physical IME/accessibility and subjective motion acceptance remain unclaimed.

## Milestone 1 observations

Final v2 runs on source `969d5f3`, Windows build 26340, Core Ultra 7 255HX, 20 logical CPUs, 15.4 GiB RAM. Electron 44.5.1/Chromium 152 and Tauri 2.12.5/system WebView2 use production UI; Rust 1.99.1 MSVC builds an 11,108,864-byte optimized executable. JSON summaries record exact executable hash and webview versions. Build outputs are ignored, not installers.

| Metric | Electron/Java | Tauri/Rust |
| --- | ---: | ---: |
| First-profile startup (one sample) | 7,751 ms | 619 ms |
| Restart (one sample; restoration differs) | 7,561 ms | 562 ms |
| Working set after editing | 1,284 MiB | 500 MiB |
| Private bytes after editing | 1,141 MiB | 272 MiB |
| Note-open median (3 samples) | 106.4 ms | 32.4 ms |
| Input-to-rAF median (12 inputs) | 15.95 ms | 2.35 ms |
| Input-to-rAF nearest-rank p95 | 56.4 ms | 12.9 ms |
| Short-idle CPU mean (two observations, one-core scale) | 2.14% | 11.13% |

These are small-sample workflow observations, not full-product improvement claims. Tauri's higher short-idle CPU needs a longer settled-idle investigation; no idle CPU win is claimed. Its small-note shared-pane check sampled 454.9→483.0 MiB for one→two panes, with no equivalent Electron pane-impact sample. Java working set after editing was 338.6 MiB; heap was not collected. True cold OS startup, compositor presentation, long steady idle and full linked-source workflows remain unmeasured.

Actual native checks pass for collection/note creation via UI, Unicode input, JSON save/readback, shared two-pane content, theme reveal sampled across 40 frames, pane motion across 20 frames, reduced-motion endpoints, offline Help, immediate pending-edit normal close/reopen and revision-conflict close refusal. Captures were reviewed. Subjective motion, physical keyboard/IME, full accessibility and full product parity are not certified.


## M3 interaction and retention protocol

Run `node benchmarks/tauri-rust/run.mjs tauri-rust --m3 --qualify --idle-five` against an optimized Windows executable. Qualification and idle measurement may also run sequentially as `--m3 --qualify` and `--m3 --idle-five`; final M3 evidence uses this separation. The common 100-note/64KiB workload, viewport, instrument and five-minute settled-idle method remain unchanged; `m3-managed-notes-v1` identifies the additional interaction code. Compare only matching scenarios/dataset/device. The runner records source, executable SHA-256, dirty state and actual failures; failed attempts remain append-only and are excluded from derived comparisons.

M3 qualification uses native CDP pointer/key delivery for Ctrl/Shift/additive ranges, checkboxes, page Select All, editor/dialog shortcut ownership, right-click/keyboard menus and focus return. Bulk add 5/20/100 and move/remove 100 measure the UI driver action through receipt and list refresh, not just SQL duration. Pointer delivery waits for finite layout motion before targeting a control; these new UI/page proxies include that preparation time and must not be compared directly with M2 DOM-click page latency. Identity, other memberships, revision/content and persisted restart are checked. Protected-draft taskkill/restore remains a focused regression.

A separate 5,000-note mixed-churn scenario runs three rounds of eight note switches, four pane cycles, four selection/menu cycles and page/collection visits, followed by 30 seconds settling and 60 seconds idle. Working set/private bytes are snapshots of the entire app tree, with no forced GC. The recipe hash is in the summary. This bounded observation can expose continuing growth, but cannot certify leak freedom. Light/dark/reduced-motion captures and runtime pane/frame samples cover the touched surfaces; physical input, IME and assistive-technology qualification remain unclaimed.

### M3 results

Validated native interaction evidence: `tauri-rust-2026-11-09T13-11-23.806Z.json`; independent idle/common-workload evidence: `tauri-rust-2026-11-09T13-13-44.630Z.json` (sanitized copies under summaries). Both tested source `2243300`, application implementation `eceb6d1`, optimized EXE SHA-256 `a1f2fdff4030314f4162967c448e3cb631babef68a72af76ce8dd7ffffe9995e`, 11,300,864 bytes. Dirty state records benchmark/docs-only output; product inputs were committed. Device and fixture match M2; power/OS caches remain uncontrolled.

| Comparable observation | M2 | M3 final idle run |
| --- | ---: | ---: |
| Five-minute CPU, one-core percent | 0.173% | 0.528% |
| End working set | 321.1 MiB | 357.0 MiB |
| End private bytes | 226.2 MiB | 238.8 MiB |
| Note-open median, 3 samples | 29.9 ms | 57.8 ms |
| Input-to-rAF median, 12 samples | 2.1 ms | 2.9 ms |

M3 did not improve these observations: CPU, RAM and opening latency increased. The idle sample spans299.0seconds within the untouched300second window. A bounded owner review found no new idle timer, database polling, repeated full-document capture or concrete listener/document leak; no speculative optimization is claimed. Note-opening/render work and the CPU difference merit focused follow-up. The workbook uses exact-source scenario-filtered arithmetic means (and counts); this table uses medians for editing proxies from the final run, so those values deliberately differ.

New workloads: Select All100 took22.4ms with39 rAF intervals (median4.2/max12.5ms); bulk add5/20/100 and move/remove100 UI receipts ranged160.7–179.2ms including motion-settling target preparation. The5,000-note page proxy median was165.0ms under that same driver, not comparable to M2 DOM-click18.2ms. In three mixed-churn rounds working set was596.8→602.0→603.4MiB and private bytes391.7→396.5→397.0MiB; after30+60seconds idle they fell to512.1/281.1MiB. Growth approached a plateau in this bounded session, then released memory; this does not certify leak freedom or represent a comparable M2 workload. Post-churn CPU0.487% is a separate60second observation.

Windows assertions passed for all M3 native selection, menus/focus, transactions, recovery and normal restart paths; light/dark/reduced-motion captures were reviewed and pane geometry sampled in motion. Failed driver attempts remain excluded and historical CSV bytes are preserved. No physical IME, screen-reader, native Excel recalculation or whole-product visual parity is certified.

## M4 indexed search and performance protocol

Use `node benchmarks/tauri-rust/run.mjs tauri-rust --m4 --qualify` for Windows search acceptance and the new search/churn scenarios, then `--m4 --idle-five` for a separate untouched common-workload comparison. The100-note/64KiB click-to-editable-end-marker, input/rAF and startup boundaries are unchanged. Search is an added workload under `m4-managed-notes-v1`; no content-search timing is compared to older unindexed navigation.

`--profile-open` is a short external diagnostic only: a MutationObserver counts Library DOM changes over three opens, then disconnects; independent64KiB read commands measure renderer→IPC/SQLite/serialization roundtrip, not isolated SQL. It neither changes ordinary builds nor identifies individual React/Tiptap mount costs. An explicitly retained M3 EXE reproduced a57.0ms median and4243 mutations; the M4 diagnostic measured28.8ms/70 mutations with the same boundaries. Read roundtrips remained around3ms. Profiles are separate exact-source/hash records; final unprofiled measurements own the milestone comparison.

Search fixtures grow from100 to1000 to5000 managed notes using ordinary commands. Added notes contain short structured text and every tenth contains Nebula archive; the two64KiB common documents remain. Query/type/count/size and boundaries are recorded in measurement notes. Three command samples include IPC, SQLite and serialization; visible readiness starts at native insertText and includes220ms debounce. Setup/options are outside the query timing. Collection scope, cursor invalidation, rapid replacement, result keyboard navigation, error/empty states, save/recovery/index restart and theme/Help are checked. The bounded retention session performs two rounds of ten opens, pane cycles, queries and page navigation, then30+60seconds idle without forcedGC. This differs from M3 churn and must not be presented as an equivalent before/after workload. Database+WAL size includes note data as well as the index.

### M4 results

Core/native run: summaries/tauri-rust-2026-11-09T14-10-25.208Z.json. Independent idle run: summaries/tauri-rust-2026-11-09T14-13-21.749Z.json. Both tested committed source595c0ae, EXE SHA-25618f201dd9f6ffa526f99b2cc48fa293b4d3433f5e47389c01f87004d629a995d. The final popup-only MenuAction refinement is source8f344bd, EXE f8b1370fe94ce98a6c05256e00260ad478583d8e202dc38203f32e207cc0c351 (11,366,912bytes); its focused Windows/readiness/restart evidence is summaries/tauri-rust-2026-11-09T14-22-27.456Z.json. The full search/recovery campaign and five-minute window are reused for that presentation-only change. Dirty flags identify benchmark/docs output and driver-only changes; executable hashes distinguish the two builds. No measured value is relabelled as coming from a different executable.

| Comparable observation | M3 independent idle run | M4 independent idle run |
| --- | ---: | ---: |
| First-profile startup,1 sample |577.2ms|547.9ms|
| Restart startup,1 sample |610.8ms|596.2ms|
| Note opening median,3 samples |57.8ms|31.1ms|
| Input-to-rAF median,12 samples |2.9ms|1.8ms|
| Five-minute CPU,one-core scale |0.528%|0.506%|
| End working set |357.0MiB|471.2MiB|
| End private bytes |238.8MiB|240.8MiB|

The299.6second sampled span lies within the300second untouched window after30seconds settling. Opening recovered near M2's29.9ms sample; the final presentation-only build also measured27.5ms over3 opens. No statistically established CPU improvement is claimed, and M2's0.173% was lower. Working set increased114.2MiB while private bytes increased2.0MiB: the working-set rise remains unexplained, and cannot be attributed to index allocations or declared harmless from this evidence. No new idle timer, polling loop or concrete retained-document leak was identified in the bounded review. Future milestones should recheck the trend with process breakdown if it persists. Power, OS page residency and cache conditions are uncontrolled; working sets sum shared pages. Workbook comparisons are exact-source arithmetic means/counts; this table uses final-run editing medians.

| New search scenario | Query / results | Command median,3 samples | Visible readiness,1 sample |
| --- | --- | ---: | ---: |
|100 titles|`Bench note 099` / 1|2.7ms|285.6ms|
|1000 titles|Search note /899|2.0ms|250.2ms|
|5000 title+content|nebula /489|6.6ms|265.2ms|
|5000 collection content|Paragraph /2|3.0ms|247.5ms|

Visible timings include220ms debounce, CDP delivery and readiness polling; command timings include IPC/serialization and are not isolated SQL timings. Rapid replacement of three queries reached the final result state in294.7ms. Search fixture recipe and growth are bound to the committed qualifier; dataset_sha256 in these rows identifies the common64KiB base document, not a hash of the entire grown database. Exact query strings, counts and sizes are in canonical measurement notes.

The new mixed search/navigation session sampled working set587.8→610.6→629.7MiB, then555.6MiB after30+60seconds idle; private bytes362.8→384.6→403.7→321.0MiB. The separate60second CPU observation was0.717% of one core. Notes+index+WAL occupied8.56MiB at5000notes; this is not isolated index size. This session released memory at idle but does not establish leak freedom and is not comparable to M3's different churn recipe.

Actual Windows checks passed search, ordering/paging, scope exclusion/no-results with an open editor, rapid updates/errors, keyboard ownership, selection/context/bulk no-op, save/taskkill/restore/index cleanup and normal restart. Light/dark/refined-options/reduced-motion captures were reviewed. Existing pane/theme motion owners are unchanged and retain M3 runtime evidence; full motion, physical IME and assistive-technology qualification are unclaimed. Historical CSV records and failed diagnostic attempts remain appended and excluded where invalid.

### M5 linked Markdown and memory follow-up

Run `node benchmarks/tauri-rust/run.mjs tauri-rust --m5 --qualify` after the optimized build. Select only the printed disposable `external-md` folder in the real native picker. `--fixture-registration` bypasses that human/automation picker step for subsequent isolated checks; it does not qualify native selection. `--m5-presentation --idle-five` performs the supplemental presentation/common five-minute run. No instrumentation enters the ordinary application. `process-breakdown.ps1` records the exact root process tree with CIM commit/working set and PerfProc private resident counters; raw per-PID output stays ignored, summaries group sanitized roles. Working set minus private resident is only an approximate shared-resident component, not unique physical memory.

Core linked acceptance: source2d77f6b, EXE SHA256917750e5b7ced42dd0fd2ca87525749bda6b2f419531d50584ab1d8a67fc2b09, `summaries/tauri-rust-2026-11-09T16-16-58.813Z.json`. The native picker passed in the preceding16:14:01 attempt; its later oversized fixture failed safely. Final review/Help presentation: source1b197d1, EXEd3b6a583f0a551b156cd046d37f7b25b7405f2f2a54e1513ae7265588d74ed46, `summaries/tauri-rust-2026-11-09T16-22-28.170Z.json`. Dirty flags identify driver/results changes; publication code is unchanged between these binaries. Windows x64 build10.0.26340, Core Ultra7 255HX/20logical CPUs/~15.4GiB RAM; cache/power uncontrolled. No new Electron run is claimed.

| Common managed workload | M4 independent run | M5 fresh independent run |
| --- | ---: | ---: |
| First-profile startup,1 |547.9ms|797.5ms|
| Restart,1 |596.2ms|551.0ms|
| Opening median,3 |31.1ms|30.1ms|
| Input-to-rAF median,12 |1.8ms|2.2ms|
| Five-minute CPU,one-core |0.506%|0.256%|
| End working set |471.2MiB|320.1MiB|
| End private bytes |240.8MiB|229.2MiB|

The common100-note/64KiB fixture and event boundaries are unchanged. These small observations do not establish universal improvement or diagnose the old M4 working-set difference. Workbook comparisons use exact-source means/counts; the table uses medians for editing. M5 pane-motion rAF median4.2ms over30 intervals is a refresh-clock proxy, not compositor presentation or full visual parity.

New linked fixtures:303byte BOM/CRLF/frontmatter/reference/table/code source,154701byte ordinary Markdown and1048576byte read-only source. Three command roundtrips each measured medians9.2/38.0/106.9ms, including lease/hash/read/parse/metadata/IPC. Native-pointer visible readiness153.9/177.9/1235.4ms (2/1/1 observations) includes animation preparation and cannot be compared directly with managed DOM-click opening. Two-pane input-to-rAF6.4ms median (5); explicit small-file Ctrl+S through verified visible receipt127.0ms (1). The1MiB case is not editable and its source presentation remains a refinement opportunity. Native accessibility inspection was attached during this acceptance session, so these timings are condition-specific.

The bounded linked/managed churn sampled working set658.6→737.0→706.9MiB across two rounds, then548.5MiB after30+60seconds idle; private commit441.2→516.6→470.1→301.2MiB, private resident377.8→453.6→396.9→240.2MiB. Memory released at idle; leak freedom is unproved. At the final snapshot host working set/private commit was33.1/7.0MiB, WebView browser155.8/60.0, renderer138.9/87.1, GPU149.3/124.5; utilities/crash reporting account for the remainder. Most memory resides in WebView2, with a substantial shared-resident component in summed working sets. M4 did not measure private residency, so its historical increase cannot be retroactively attributed to shared pages.

The same accessibility-attached60second observation showed32.6% CPU, mostly browser work (18.6CPU-seconds) while the renderer used0.016seconds. After releasing native accessibility inspection, the fresh300second window measured0.256%. Both observations remain canonical. This supports instrumentation-condition sensitivity but does not prove the precise cause; no application polling/leak was identified or speculative optimization added. Failed selector/picker/oversized-fixture driver attempts remain appended and excluded from comparisons. The successful runs verify byte-exact explicit Save/no-op, no autosave, conflicts, taskkill/recovery/discard, source disappearance, relative Unicode links, directory paging/keyboard, registration-only removal, shared panes, settled themes/reduced motion, Help and restart. Uncertain-publication/real-junction/ADS/permission boundaries are covered by focused Windows Rust tests rather than another large fault campaign.

### M6 desktop reconstruction methodology

Use `node benchmarks/tauri-rust/run.mjs tauri-rust --m6 --qualify` for desktop navigation, real sidebar/pane geometry, shared Undo, managed crash recovery, linked explicit Save, mixed churn, native window bounds and restart. `--m6-core --qualify` stops after core/churn checks; `--m6-window --qualify` exercises the window/restart portion independently, avoiding repetition after a driver-only window failure. The common100-note/two64KiB-document measurements precede qualification. The core recipe then adds one1KiB reference note and one recovery note, a nested CRLF Markdown fixture, two rounds of eight note/Library returns and companion changes, followed by30+60seconds idle. This is a new workload, not equivalent to M5 churn. `--m6 --idle-five` runs the common workload with30seconds settling and300seconds untouched, independently of the visual driver. No instrumentation runs in ordinary builds.

M6 uses `WEBVIEW2_USER_DATA_FOLDER` pointing to the disposable profile. A personal M5 app remains running and was preserved; a shared WebView profile refused conflicting debug arguments. First-profile WebView caches therefore differ from M1–M5 and startup percentages are suppressed for that scenario in the comparison sheet. Background applications/power/cache are uncontrolled, and process-tree totals exclude the personal app. No new Electron performance baseline is claimed. The retained production-equivalent Electron renderer was launched separately with100 disposable notes for visual reference; `summaries/m6-visual-reference.json` records runtime and renderer hashes separately.

Common note opening still measures DOM click to visible mounted document text, with return-to-Library preparation outside the interval. New `desktop-navigation-m6` observations distinguish click-to-Tiptap-mount from completion of finite animations. Neither is isolated database latency. `desktop-pane-motion-m6` and `desktop-sidebar-motion-m6` record90rAF intervals plus assertions on intermediate widths; these are refresh-clock proxies, not compositor presentation measurements. Library/editor scroll compression writes CSS progress directly; pane resizing writes geometry during drag and commits React state on release. No animation is removed for benchmarking.

Fresh independent common run: application source`ffc4979`, EXE SHA-256`6482080678eb31fb0cea4cb8d01766606c015094844b41184401639e638f991d`, `summaries/tauri-rust-2026-11-09T20-14-19.651Z.json`. Hardware remains Windows x64 build10.0.26340, Core Ultra7 255HX/20logical CPUs/~15.4GiB RAM. Driver/results edits explain the dirty flag; the optimized application source is unchanged. The workbook uses exact-source means/counts across valid runs; this table uses the independent run's editing medians.

| Common managed workload | M5 fresh independent run | M6 fresh independent run |
| --- | ---: | ---: |
| First-profile startup,1 |797.5ms|463.1ms (profile differs) |
| Restart,1 |551.0ms|517.3ms |
| Opening median,3 |30.1ms|36.5ms |
| Input-to-rAF median,12 |2.2ms|5.0ms |
| Five-minute CPU,one-core |0.256%|0.856% |
| End working set |320.1MiB|339.1MiB |
| End private bytes |229.2MiB|275.2MiB |

The299.5second sampled span lies inside the300second untouched window. Idle CPU, private commit and editing proxies increased; these are recorded regressions, not a performance improvement claim. The bounded review found no new interval/database poll or continuously rescheduled React frame loop. New timers are request/transition scoped and observers/listeners have cleanup. Theme/pane/sidebar motion remains intact. Different WebView profile/cache conditions and a preserved personal M5/background session prevent attributing the changes solely to M6 presentation. No speculative cache or animation removal was introduced. The60scroll rAF intervals had median4.2ms/max8.5ms; physical input/presentation and leak freedom remain unmeasured.

Complete native desktop acceptance passes in `summaries/tauri-rust-2026-11-09T20-22-23.595Z.json`, using the same executable; supplemental window acceptance is `summaries/tauri-rust-2026-11-09T20-13-48.421Z.json`. The final core recipe hash/mode is recorded in its summary. Three reference-note navigations measured29.3ms median to editor mount and251.2ms through finite transition completion. Pane/sidebar motion each yielded90rAF intervals with4.2ms median/8.4ms max and intermediate-width assertions. The two-pane snapshot was673.4MiB working set/454.4MiB private commit. These new scenarios are not replacements for the common64KiB measurements.

The final mixed session sampled working set622.0→691.3→725.1MiB, then636.7→627.0MiB after30+60seconds idle; private commit420.9→473.8→506.8→410.6→402.5MiB. Memory was released on return to idle, without establishing a long-term plateau or leak freedom. The separate60second CPU observation was0.923% of one core. Editor instances are absent in Library, history/shortcut metadata is bounded, and acknowledged capture closures are released. No concrete unbounded retained-document/listener leak was identified. This workload and profile differ from M5's linked/search churn, so no percentage comparison is made.

The canonical CSV retains failed native/driver attempts and excludes their measurements from workbook aggregates. A managed-pane index key exposed by native acceptance was fixed and regression-tested. Driver-only failures involved readiness before the create lock released and incorrect Tauri size serialization; the complete final run covers the corrected paths. Physical OS drag/Snap-hover, accessibility/IME, full editor parity and whole-product visual/motion qualification remain unclaimed. Personal files were not used; all mutating acceptance ran against disposable storage.

## M7 managed transfers and Activity

Run `node benchmarks/tauri-rust/run.mjs tauri-rust --m7 --idle-five --qualify` for the common baseline plus transfers. Native picker acceptance is separate: use `--m7 --qualify --native-pickers` or `--native-workspaces` and operate only the printed disposable paths. Native waiting allows human dialog interaction; benchmark task receipt polling exists only in this driver. Normal Activity receives coalesced Rust events and has no idle polling worker.

Independent source `47cbbaa` / EXE SHA-256 `ad0f5d65a2b72006361a699569eab4bc55b46ce68db0e4321cae80ca4f1db9ec`: [transfer/performance summary](summaries/tauri-rust-2026-11-10T06-32-05.167Z.json). Windows10.0.26340 x64, Core Ultra7 255HX/20 logical CPUs,16.57GB installed RAM. The personal M6 app and other background work remain untouched. Isolated WebView profiles, uncontrolled power/cache and small samples limit causal comparisons. Accessibility inspection was attached only after this independent run.

| Common workload | M6 | M7 |
| --- | ---: | ---: |
| First-profile startup,1 |463.1ms|853.2ms|
| Restart,1 |517.3ms|538.1ms|
| Note-opening median,3 |36.5ms|32.8ms|
| Input-to-rAF median,12 |4.95ms|4.95ms|
| Five-minute CPU,one-core |0.856%|2.607%|
| Settled working set |339.1MiB|345.1MiB|
| Settled private bytes |275.2MiB|303.6MiB|

Both use the common100-note/two~64KiB fixture and the existing event boundaries. CPU/private commit increased; no new polling or perpetual frame loop was found in bounded review. No cause or regression fix is claimed. The workbook's exact-source arithmetic means/counts differ from the medians above. Native acceptance records contain extra instrumentation and are not the independent baseline.

| New M7 workload,1 run each | Rust task duration | Invoke→terminal receipt |
| --- | ---: | ---: |
|100 UTF8 files,970–971bytes each|1647ms|1677.0ms|
|Nested folder,3 mixed files/3directories|42ms|See CSV|
|16×8MiB original files,128MiB|411ms|451.1ms|
|One committed64KiB note export|17ms|See CSV|
|Workspace export,219resources/119originals/~128.1MiB|556ms|584.4ms|
|Restore as new workspace|411ms|436.5ms|
|Immediate supported import cancellation|15ms|Not separately measured|

Discovery/hash review precedes execution timing. Task durations exclude queue/renderer readiness; receipt polling is25ms in the driver. Three editor inputs overlapped the running128MiB import: beforeinput→rAF24.1/9.7/7.6ms, a different scenario from common idle editing. Working-set/private-byte peak samples were813.9/562.1MiB, using a500ms process-tree loop plus CIM overhead over transfer/navigation through restart; brief spikes may be missed and shared resident pages are summed. **Live process**, before restart: working set813.9→571.4→583.9MiB and private bytes562.0→310.4→318.3MiB after30+60seconds idle. The60second CPU observation was1.307% of one core. Memory was released; this bounded workload cannot establish long-term stability or leak freedom.

Final application source `4c33793` only fixes review portal placement relative to this measured build. Final EXE SHA-256 `712a67bc07fb19733db0f5562f48066982abd4daffc709c9f34b0e844c9f43a7`. [Native pickers](summaries/tauri-rust-2026-11-10T07-04-42.627Z.json) cover multiple-file/folder reviews, keyboard resource export/native destination, archive Save and digest inspection. [Native workspace sequence](summaries/tauri-rust-2026-11-10T07-21-24.455Z.json) covers archive selection/verified restore review, new parent selection, restored-workspace navigation, creation, existing-folder opening and restart/history. Main qualification also checks duplicate skips, source-byte preservation, no-overwrite failure, corrupt manifest refusal, linked explicit Save and restored external-authority exclusion. Activity light/dark/OLED snapshots and shared motion were inspected; full subjective/native-platform parity remains open.

Historical rows are untouched. `06-21-38.977Z` is explicitly invalidated by an appended row because its retention samples followed restart; it is superseded by the live-process run above. Failed selector/readiness/native-driver attempts remain marked failed and excluded from aggregates. `07-01-17.887Z` was output-only: its original check label overclaimed file/folder coverage; the sanitized summary corrects metadata, while the later combined picker run supplies that evidence. Raw fixture metadata described intended128MiB inputs even in native modes; summaries explicitly exclude that unexercised workload. CSV-prefix verification against M6 confirms append-only history. The generated workbook and sanitized summaries derive from this CSV; bulky raw traces/screenshots stay ignored.

## M8 organization and lifecycle

Use `node benchmarks/tauri-rust/run.mjs tauri-rust --m8 --qualify` for the changed workflow recipe, and `--m8 --idle-five` for the independent common measurement. `--m8 --qualify --m8-presentation-only` checks the final labels/icons/search-clear/focus surfaces separately. All fixtures are generated in a unique temporary workspace; personal documents and the existing personal Next app remain untouched.

Core native qualification passes on application source6062dcb, EXE SHA-256`44e658dfdc7b54308c4782ab471ea665ff4512563f4ad76182aab02b6128ebde`, [summary](summaries/tauri-rust-2026-11-10T12-29-17.218Z.json). It covers tag create/color/rename/delete, keyboard assignment to two resources, tag/pin navigation, Trash/Restore,205-resource all-pages Empty Trash, managed-file source preservation, hierarchy keep-default/shared memberships, portable v2 restore and restart persistence. Final presentation on de8ccc5 passes in [its summary](summaries/tauri-rust-2026-11-10T12-39-18.119Z.json): active tag rename/delete labels,Trash/Pinned headings,sidebar icons/highlights,scope-preserving search clearing,dark/OLED/reduced-motion states. Static native screenshots were inspected; full subjective motion/accessibility/IME qualification remains open.

| New M8 workload, one sample | Receipt time |
| --- | ---: |
| Search among1000 tags,99 results |3.49ms|
| Assign tag to100 resources |6.51ms|
| Pin100 resources |4.95ms|
| Trash100 resources |6.29ms|
| Restore100 resources |5.11ms|
| Empty Trash205 resources |281ms Rust task;311.1ms confirmation→terminal|

Organization receipts include IPC/SQL/serialization, not rendered readiness. Empty Trash uses25ms task polling only in the driver. The full session then performs two rounds of five note opens/Library returns. Live working set764.1→626.8→618.2MiB and private bytes525.2→378.5→365.8MiB after30+60seconds show release, not proof of long-term stability. Its60second one-core CPU was0.895%. This1000-tag/organization workload differs from M7's128MiB transfer workload and is not a direct retention comparison.

The bounded review found no new idle interval, database polling or perpetual frame loop. Activity workers exit when their queue drains; history/status delivery is event driven. Existing pane cleanup already released inactive clean bodies; M8 consolidates guarded cleanup without claiming a leak fix. Recent recording now returns its compact list in the same receipt, removing an avoidable opening round trip. No specific cause of M7's CPU increase is established. Independent source de8ccc5 / EXE SHA-256`50315ec59e4debbc48435fd42f52af19abe7c0f530aed07fbdb8553a25490377` passes in [the common summary](summaries/tauri-rust-2026-11-10T12-40-00.561Z.json). A final isolated picker-focus patch reuses this baseline because it leaves common workflows unchanged. Fresh Activity history contained0 tasks. Same Windows x64/Core Ultra7 255HX/20logical CPU/~15.4GiB machine,isolated profile,power/cache/background apps uncontrolled; no accessibility inspection/build/workbook authoring in the idle window.

| Common workload | M7 | M8 independent |
| --- | ---: | ---: |
| First-profile startup,1 |853.2ms|550.1ms|
| Restart,1 |538.1ms|558.8ms|
| Opening median,3 |32.8ms|45.4ms|
| Input-to-rAF median,12 |4.95ms|4.95ms|
| Five-minute one-core CPU |2.607%|1.034%|
| Settled process-tree working set |345.1MiB|575.7MiB|
| Settled private bytes |303.6MiB|320.4MiB|

Working-set/private-memory and opening regressions are recorded honestly. M8 additionally persists actual Recents on open; one redundant IPC was removed,without isolating its numerical effect. Summed working sets include shared resident pages; no cause for the higher residency or M7 CPU difference is established. Small uncontrolled samples and different post-operation workloads cannot support a leak-freedom or whole-product improvement claim. Workbook values use exact-source means/counts; this text uses independent-run medians.

Failed attempts remain excluded by their evidence path, including initial Enter dispatch without WebView character delivery, missing waits for asynchronous confirmations, fixture metadata requiring reload, and a corrected assertion that initially omitted the fixture's existing Benchmark membership. Earlier failed M8 failure-marker rows inherited an M6 experiment label; their evidence IDs still invalidate the corresponding M8 measurement rows. Historical CSV content is preserved.

Final source0357453,EXE SHA-256`0a2af4f32fdd434df03bb025daf53b3b3f8936208f40b6b312d19d8c1d78af9a`,passes [focus/presentation acceptance](summaries/tauri-rust-2026-11-10T12-51-08.333Z.json). A focused tag option stays focused while its durable assignment is pending. Confirmed picker-query readiness was138.8ms including100ms debounce (1 tag/1 result;one sample). This is a visible UI boundary,distinct from the3.49ms backend1000-tag query. The final change is isolated to the picker and bundled Help text; the de8ccc5 independent common/idle measurement is reused.

## M9 editor and desktop measurements

Use `node benchmarks/tauri-rust/run.mjs tauri-rust --m9 --qualify` for the bounded rich editor/membership/image/native-WebView workflow, and `--m9 --idle-five` for a separate common100-note/two64KiB comparison without accessibility inspection attached. `--m9 --inspect --native-m9` holds an isolated fixture for the observed Windows picker/SendInput pass; its launch samples are inspection diagnostics, excluded from canonical comparisons. No user workspace is used.

M9 opening combines draft detection and Read into one SQLite-owner receipt; Recents persistence remains authoritative. New editor/membership churn is a separate workload from M8 organization retention. Individual failed driver runs remain in CSV and are excluded by evidence ID. Early M9 failure-marker rows inherited the M6 experiment label; evidence-based invalidation still applies. The driver now waits for editable editors, focuses/selects actual input fields before text injection and waits for asynchronous native clipboard publication. The actual Windows slash/picker pass additionally exposed a real Selection-getter anchor bug, fixed with a shared helper regression check.

Record coexistence metadata: M8 had the renamed personal M6 reference process open; M9 may not. Shared resident pages, cache/power/background activity and the differing feature workload prevent causal or whole-product improvement claims. Source/executable hashes and separate UI/backend boundaries remain mandatory.


### M9 findings (2026-11-11 local time)

Final common source f2e9f6d (application implementation3cdc36e),EXE SHA-256 d68eb2122836321028cda7a5cee939f4cadc891c5c95a72127a621c71a983878: [recorded comparison](summaries/tauri-rust-2026-11-10T18-41-16.286Z.json). Same100-note/two64KiB recipe and event boundaries as M8; M8 had a coexisting personal reference process whereas this run did not. No OS-cache flush or controlled power/background load.

| Metric | M8 reference | M9 final observation |
| --- | ---: | ---: |
| First-profile startup,1 |550.1ms|563.7ms|
| Restart,1 |558.8ms|625.5ms|
| Note opening median,3 |45.4ms|39.7ms|
| Input-to-rAF median,12 |4.95ms|4.80ms|
| Five-minute CPU,one-core scale |1.034%|0.657%|
| Settled working set |575.7MiB|387.2MiB|
| Settled private bytes |320.4MiB|323.8MiB|

Opening removed one IPC hop; the entire numerical difference cannot be attributed to it. Warm startup was slower in this single observation. Shared-page residency and private commit are different measures; these samples do not establish whole-product improvement or leak freedom.

Use the workbook's **M8 vs M9** sheet for the exact-source comparison. Its editing scenario uses source-filtered means:41.98→43.70ms opening (6 M8 samples across two runs;3 M9 samples), whereas the table above uses the independent-run medians (3 each). These different aggregates do not establish a uniform latency improvement. The legacy Dashboard retains broad historical architecture filters and mixes milestones/conditions; it is not the current-build comparison.

The first same-executable post-inspection run (ce9de38,[evidence](summaries/tauri-rust-2026-11-10T18-28-56.087Z.json)) measured19.641% one-core CPU,552.9MiB working set,352.7MiB private bytes and79.6ms opening. Windows inspection helpers were observed afterward and exited after resetting the inspection kernel. The unchanged executable's repeated five-minute run measured0.657%,with no Windows inspection helper detected before or after. Browser-process cumulative CPU fell59.6→2.34seconds and Rust-host CPU8.91→0.36seconds. This strongly indicates material inspection overhead; it is not an application-code optimization or a controlled proof of the sole cause. Accessibility-client performance remains a qualification gap. Both observations remain valid historical rows under their exact source/conditions; the comparison workbook defaults to the final source.

An after-window process-role snapshot found7.6MiB private commit in the Rust host,85.9MiB in the renderer,167.1MiB in the GPU process and40.1MiB in the WebView browser. Canonical role rows are grouped/unit-converted from the recorded CIM snapshot; they are not heap allocations or per-role window utilization. Missing counters remain missing.

The new rich-workload run on179f6ba ([scope](summaries/tauri-rust-2026-11-10T17-59-58.391Z.json)) recorded table insertion18.1ms,selected-prose Bold→rAF9.3ms,code input→rAF9.0ms,sibling-preserving link navigation79.1ms,two-resource membership Cut2.56ms,selected-group pointer drop26.2ms and897,388-byte512×512 PNG upload→visible99.8ms (one sample each). UI measurements include driver round trips and differ from backend receipts. Focused verification overlapped early integrated timing; these are small uncontrolled workload observations,not budgets or like-for-like M8 comparisons.

Ten alternating rich/empty note opens and Library returns showed working set761.5→798.0→668.9MiB and private bytes534.2→552.7→416.4MiB after30seconds settling. Inspection tooling remained present in that session; it shows release but does not quantify normal media cost or establish a retention plateau. A longer uninfluenced soak remains later work.

[Actual native scope](summaries/m9-native-windows.json) includes file selection,mapped placement,searchable resource insertion,keyboard navigation,original preview,Windows Photos and Explorer reveal. Physical cross-window Explorer drag-in remains unverified because the automation tool rejects endpoints outside the source window; OS drag-out and full Snap/IME/accessibility remain unqualified. Earlier failed drivers and their invalidated measurements are retained. The CSV is canonical; the workbook and summaries are derived.
## M10 full browsers, Settings and sessions

`node benchmarks/tauri-rust/run.mjs tauri-rust --m10 --qualify` exercises full browsers, linked nested browsing, Settings/custom bindings and protected session restoration. `--m10-session-only` reuses the earlier browser/linked/header evidence and focuses the final pane/session/navigation owners. `--native-m10` holds that isolated app for an observed Windows pass until its printed fixture-local `m10-native.done` marker appears. Inspection-assisted workload timings are separate from `--m10 --idle-five`, which uses the unchanged common100-note/two64KiB recipe with no inspection helper attached.

Driver failures remain canonical and are excluded by evidence ID. Corrected drivers wait for navigation/save and query receipts, focus actual controls before key injection, and query an unambiguous command label. A real compact-header containment failure was fixed by allowing intermediate header height and reducing compact input padding. Source a16f567 separately corrects active destination highlights; earlier browser/search/linked results are reused rather than claimed as a complete final-source rerun. The final scoped run covers the changed owners.

Use **M9 vs M10** in the generated workbook for exact-source comparisons. The historical Dashboard mixes conditions. Startup now includes session metadata readiness; restored-editor readiness is a separate metric. Browser/command values include driver round trips and are not backend SQL latency. Bounded churn snapshots do not establish leak freedom. Windows/power/cache/background activity remain uncontrolled; the earlier M9 post-inspection19.641% observation is retained rather than used as a clean baseline.

Final common measurement [e76723d](summaries/tauri-rust-2026-11-10T23-34-12.375Z.json),EXE SHA-2567d4f8d14fb9ea0cf7bebb642aef1dea2beefff55332833b73158ca5330661226,had no inspection helper before/after. The later same-workspace,editor-binding,pane-preference,profile-ownership and Help refinements leave this default-preference common recipe unchanged;their final executable is identified separately in the tracker rather than pretending this older hash is the final build.

| Common workload | M9 | M10 observation |
| --- | ---: | ---: |
| First-profile startup,1 |563.7ms|598.8ms|
| Restart,1 |625.5ms|665.0ms|
| Opening median,3 |39.7ms|42.5ms|
| Input-to-rAF median,12 |4.80ms|6.25ms|
| Five-minute one-core CPU |0.657%|0.940%|
| Settled working set |387.2MiB|480.5MiB|
| Settled private bytes |323.8MiB|289.8MiB|

CPU,working set and responsiveness proxies regressed in these small samples;private commit fell. New session writes use a700ms one-shot debounce and navigation/preferences remain event driven;no new polling or demonstrated leak was found. There is no causal attribution or claim of overall improvement. M10 startup includes session-readiness metadata in addition to the prior bridge marker. M9/M10 first profiles,power/cache and background conditions remain uncontrolled.

[Final navigation/session scope](summaries/tauri-rust-2026-11-10T23-26-07.561Z.json) measured Collections57.4ms,Tags17.0ms and Sources14.1ms to matching header DOM (one each),with inspection tooling present. Two restored panes were ready5.3ms after bridge/metadata readiness;this excludes process startup and is not a total restore time. Five palette/collection/Settings rounds showed working set484.8→608.7→568.3MiB and private bytes275.4→388.1→322.4MiB after30seconds. Memory partly released;this is not a plateau or leak-freedom proof.

[Palette focus pass](summaries/tauri-rust-2026-11-10T23-31-13.931Z.json) on ec75a7c recorded8.8ms median command opening→focused input and4.6ms median native text→ranked DOM (3 each). Only these command-palette rows from inspection mode enter canonical CSV;its launch/memory diagnostics are excluded from comparisons. Actual Windows typing/Enter verified the fixed search-focus contract. Static reference comparison and observed wheel compression/re-expansion are scoped in [native acceptance](summaries/m10-native-windows.json);full original visual/motion parity remains open.

Final source5eaacc3,EXE SHA-256d6fc84eb9706e57518bbd0b42727057af01049d83167e3ff6ac118d4586fb216,passes [a separate native functional smoke](summaries/tauri-rust-2026-11-11T00-01-55.924Z.json). Its native picker reopened the current fixture while retaining the editor/session;palette autofocus,visible keyboard selection and Escape passed. Inspection startup/memory diagnostics do not enter canonical comparisons. The generated workbook contains8706 canonical records and52 invalidated runs;actual comparison formulas pass source-filtered mean/count and missing-scenario checks with no formula errors. M9/M10 opening means43.70/47.83ms differ from the independent medians reported above. Two M6 summaries gained only CSV-derived eligibility annotations;historical measurements remain unchanged.


## M11 shared original React presentation

Run the existing common recipe with `node benchmarks/tauri-rust/run.mjs tauri-rust --m11 --idle-five --qualify`. The common100-note/two64KiB dataset and DOM end-marker/input/rAF boundaries are unchanged from M10. Startup includes the existing session-ready marker. Inspection uses `--m11 --inspect --native-m11` with disposable100-row fixtures and a10-minute native inspection window; its diagnostics do not enter CSV comparisons. `electron-java --m6 --inspect --reference-m6` reuses the isolated original-production visual recipe.

The M11 qualifier adds five Library/header/note/shared-pane rounds and process-tree snapshots before,after and30seconds later. It contains explicit250+220ms settling per round,so its round duration must not be compared with note-open latency. Neither this bounded sequence nor allocator retention establishes leak freedom. Raw captures and failed/preliminary inspection output remain Git-ignored. The generated M10 vs M11 workbook tab uses source/scenario/dataset/device filters; empty scenarios remain blank.

Final common source dd88e20 / EXE1dc01eb2:opening62.3ms median(3),input-to-rAF6.0ms median(12),first-profile909.6ms(1),restart637.1ms(1),settled one-core CPU0.120%,working set339.5MiB and private bytes319.3MiB. The initial ac281d3 run's159.6ms opening median remains canonical. The final row-action correction only gates unsupported Trash pin/open-beside controls and is identified separately in native evidence;it does not change this managed-note recipe.

Five M11 rounds ended in two views of the same64KiB note;before had one pane. Working set544.7→1173.0→791.1MiB and private bytes316.2→933.7→547.5MiB(after30s) indicate high transient/retained memory. These are different endpoint views and not equivalent to the M10 palette/browser churn. They do not establish a plateau or leak freedom. M12 should profile matched pane endpoints. Both common runs had no inspection helper before/after;cache,power and competing applications remain uncontrolled. M10's42.5ms opening median remains faster,and private memory/startup also regress in the small sample.

M11 workbook refresh:8910 canonical records,52 historical invalidated runs;M10 vs M11 source/scenario mean/count and missing-data recalculation passed,zero formula errors,and rendered comparison inspected. Git confirms204 appended lines and zero historical deletions from M10;normalized historical CSV prefix is unchanged.


## M12 matched-state investigation

Run `node benchmarks/tauri-rust/run.mjs tauri-rust --m12 --idle-five --qualify`. Common100-note/two64KiB end-marker and input-to-rAF boundaries remain unchanged. The qualifier separately records independent IPC/read latency and rAF-sampled content/interactivity/root-transition readiness. These boundaries must not be subtracted or compared as identical measurements.

Three churn rounds open distinct notes,two panes,close the sibling and inactive sessions,dismiss organization,and return to the same Bench099 one-pane state. Natural30s JS heap,DOM/listeners and process-role samples precede diagnostic-only collection/WeakRef inspection. Forced collection never contributes to ordinary idle RAM claims. Recovery/conflict checks follow all memory samples and have separate qualification startup rows. Native inspection uses `--m12 --inspect --native-m12`;`--geometry-only` limits a correction check to shared header/pagination/path lanes. Inspection diagnostics are excluded from canonical comparisons.

The matched M11 baseline uses source6c3904c/EXE72d528be with only benchmark scripts dirty:65.8ms opening median(3),JS heap~9MiB,stable4190nodes/819listeners,and natural settled working set812–819MiB. Diagnostic collection leaves one of13observed editors alive,none destroyed;GPU private commit dominates the retained increase. This bounded observation does not establish leak freedom. Final comparison and exact build are recorded below after measurement.

Qualified M12 source ae397e8 / EXE c237f518,with documentation/driver-only changes dirty:opening70.0ms(3),input6.3ms(12),first-profile661.6ms(1),restart749.4ms(1),five-minute CPU0.907%,working set607.7MiB,private391.8MiB. Neither inspection-helper flag is set. Compared with M11's62.3ms/0.120%/339.5MiB/319.3MiB,this does not establish performance recovery. Independent read5.8ms,content/interactivity58ms and observed transition275.2ms have distinct boundaries. M12 churn settles822.4/780.7/776.6MiB WS with stable~9.5MiBJSheap,4193nodes/819listeners;diagnostic1live/0destroyed editors. GPU private commit96.7→357.6MiB versus renderer128.6→131.6MiB. Additional boundary probes precede the baseline;cross-run churn differences are not a controlled improvement claim. The first stale-Recovery-selector failure is preserved and excluded;the corrected full run passes.

M12 workbook refresh:9350canonical records,53failed/invalidated runs excluded. Exact-source editing means/counts and missing-scenario recalculation pass;zero formula errors. Comparison and matched-churn views were rendered and inspected,including a heading-only readability repair. Native Excel recalculation is not claimed. Historical8910-record CSV prefix is unchanged.
