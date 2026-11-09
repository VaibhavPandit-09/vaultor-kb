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
