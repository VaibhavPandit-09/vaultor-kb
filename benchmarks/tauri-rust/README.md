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
