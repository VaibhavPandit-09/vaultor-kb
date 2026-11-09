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

The generated M1 vs M2 tab filters exact sources and experiment IDs. Historical Electron comparison remains intact. Failed attempts stay in CSV and are excluded from comparison; raw diagnostic bodies are ignored. The migration tracker owns product contracts and deferred M3 scope.

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
