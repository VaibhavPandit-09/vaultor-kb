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
