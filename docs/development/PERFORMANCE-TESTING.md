# Local Windows performance tests

Reviewed 2026-10-27. This is developer tooling, with no app feature, release, installer or version change.

From PowerShell in the repository:

```powershell
npm run perf:test
npm run perf:test -- --smoke
npm run perf:test -- --smoke --size=1024
npm run perf:test -- --extended
npm run perf:test -- --baseline
npm run perf:test -- --suite=structures
npm run perf:test -- --suite=structures --smoke
npm run perf:test -- --suite=structures --case=code
```

The normal command needs no Codex session, manual application setup, clicks, admin rights or external runner. It installs missing locked frontend/desktop dependencies with `npm ci`, builds production UI and the bundled Java/native server when source fingerprints change, launches Electron, exercises the editor, saves reports and exits. Node.js 22+ and Windows x64 are required; a Java 25 JDK on PATH is required when preparing/rebuilding the server. Initial dependency/runtime/Maven downloads need network access. See [desktop setup](../desktop/DESKTOP-SETUP-TROUBLESHOOTING.md). Subsequent unchanged runs reuse prepared components; `--rebuild` forces preparation. Keep the benchmark window unobstructed and avoid other heavy work or interacting with it during measurement.

## Runtime and isolation

The tested runtime is the repository's pinned Electron executable loading the **production-built** `desktop/ui`, with the verified bundled Java server, native LinkedHost, real Markdown worker and actual NTFS Save path. It is a local production-equivalent **unpackaged shell**, not the installed application or the Gate 1 browser lab. This avoids modifying/installing into the personal packaged app merely to load tooling scripts. Reports identify this distinction and the actual Electron/Chromium/Java versions. Browser results are never substituted.

The launcher extends `native-chrome-smoke.mjs` and the existing `native-large-markdown-check.mjs` workload, using Electron `sendInputEvent` and the existing editor bridge rather than adding Playwright or another framework. Only native folder-picker selection is supplied by the test, as in existing native checks. Production consent, confinement, revision, validation and publication gates still execute.

Each round creates a fresh temporary profile and a separate sibling source folder under a uniquely allocated `vaultor-perf-*` temporary directory. Both are removed afterward; no installed-app profiles, personal workspace, real linked documents or credentials are read or changed. Inherited Vaultor/host test settings, dev URLs and credential environment variables are excluded. The profile uses a fixed light theme, 1200×820 window, zoom 1 and disabled LAN sharing. Only one performance run may execute at once.

`perf-process.ps1` places the wrapper in an unnamed Windows kill-on-close Job Object **before** Electron launches. All Electron/Java descendants die when that wrapper exits, including on crashes/timeouts. Timeouts terminate only the launched process tree. Temporary deletion checks its resolved path/prefix and never deletes repository or personal data. An interrupted run's stale lock is reclaimed only if its owning process no longer exists. OS-level hard termination may leave a disposable temporary directory; ordinary completion, operation failure and handled interruption clean it automatically. Failed cleanup is a harness failure with the path/error recorded. No machine policy is changed by the wrapper's process-local PowerShell execution-policy option.

## Workload and boundaries

The default deterministic fixture builder reuses the prose-heavy 1 MiB native qualification shape: BOM, mixed CRLF/LF, frontmatter, headings, paragraphs, lists, links/references, tables, fences and mixed formatting. Fixtures are exactly 64/256/512 KiB and 1,044,480 bytes (1 MiB minus 4 KiB edit headroom). SHA-256 identities are recorded. These fixtures and their default sample counts are unchanged. Their measured edits are in three prose paragraphs; merely including fences and tables did not previously qualify editing inside those structures. Unexpected fallback for an editable fixture now fails the run. Intentionally over-limit fixtures must refuse safely, with unchanged-source verification and no editable editor or enabled Save; their editing metrics remain unavailable.

Normal mode uses three fresh application rounds, all four sizes, six native keystrokes at each beginning/middle/end marker, Undo/Redo and two three-position edit/Save passes. A reversible edit/worker acknowledgement/frame is the warm-up for each fixture. Smoke mode uses one 64 KiB round, two keys per position and one Save pass. Extended mode uses five rounds, twelve keys per position and three Save passes. The normal run is intended to take several minutes; poor performance can lengthen it. Each operation waits for observable readiness with a 60-second deadline; the outer application deadline is ten minutes per normal/smoke round and twenty minutes per extended round. Builds have ten-minute deadlines. These are warm application file opens with fresh profiles, not cold OS cache measurements.

Recorded metrics and limitations:

- **Open:** sidebar click through mounted editor containing the end marker. **Usable:** same start through focus, successful warm-up edit, completed worker validation and next frame callback. The app startup/bootstrap is outside file-open measurements. Three normal open samples per size; one in smoke mode.
- **Typing:** native keydown through the next `requestAnimationFrame` callback, p50/p95. This is an input-to-frame-callback responsiveness proxy, **not** compositor paint, screen presentation or physical-key latency. Inputs are sequential, waiting for each frame; this is not a fast continuous-typing burst benchmark.
- **Editing/history:** beginning/middle/end edit-to-acknowledgement and full typed-workload Undo/Redo, with restored marker assertions and natural history-group counts (slow typing may create multiple groups); synchronous selection/cursor dispatch and `view.dispatch` durations. Dispatch includes editor/plugin processing but does not measure the complete asynchronous React/render pipeline. Native pointer-selection paint latency is not measured.
- **Worker:** existing renderer Markdown-worker `validationMs` and `patchMs`, observed by a test-only Worker wrapper. Does not include independent main-host validation or worker scheduling/IPC latency. No production editor instrumentation is enabled or changed.
- **Long tasks:** renderer PerformanceObserver entries ≥50 ms, with opening/warm-up and measured editing/Save tasks recorded separately in raw JSON. **Memory:** foreground JS heap after each fixture, when available; neither process/worker/native memory nor peak memory.
- **Save:** explicit Save click through completed UI receipt and complete expected file-byte readback. Includes automation/polling overhead (readiness polling is 25 ms), not a filesystem-only syscall timing. Every Save compares the entire source against only the intended insertions; the adjacent linked Markdown file must also remain byte-exact.

Metrics use nearest-rank p50/p95 with sample counts in JSON. Short runs are diagnostic, not statistically precise guarantees. Missing/unsupported values stay null/unavailable. Slowness produces warnings and a successful exit when correctness checks pass; failed typing/history/persistence, unexpected renderer/worker errors, hangs, startup/build or cleanup failures exit nonzero.

## Structural qualification

`--suite=structures` uses the same preparation, native runner, isolation, cleanup and metric boundaries. Its compact matrix is:

| Case | KiB | Expected admission | Distinctive workload |
| --- | ---: | --- | --- |
| prose | 1024 (minus 4 KiB) | editable | Long paragraphs, sections, inline formatting and links |
| tables | 256 | editable | Distributed 3–7 column / 3–13 data-row tables |
| code | 512 | editable | Six language identifiers; short and long fences below the existing code-block limit |
| dense | 256 | editable | Many short headings, marked links, and four-level nested lists |
| mixed | 1024 (minus 4 KiB) | editable | Prose, tables, fences and nested lists |
| complexity-refusal | 512 | safe fallback | Many small marked blocks exceeding existing complexity bounds |
| size-refusal | 1025 | safe fallback | Source exceeding the unchanged 1 MiB admission limit |

Each editable case retains beginning/middle/end prose edits. Tables, code and dense cases additionally type, select, Undo/Redo and explicitly Save inside middle data cells of multi-row/column tables, the middle of long TypeScript/JSON/Java fences, or fourth-level list items distributed through the document. Mixed adds one cell, one long JSON block and one nested list item. The runner asserts the selected ProseMirror ancestor type before editing. Every Save verifies the entire expected source, including BOM, mixed newlines, alignment/fence formatting, protected syntax and unrelated bytes. Fixture tests also pass these actual full-size sources through the production parser/admission and source-patch engine; native runs still establish actual editability independently.

Structural normal mode uses two fresh rounds, four keys per target and one Save pass; extended uses three rounds, six keys and two passes. Structural smoke uses one round, two keys and one pass, shrinking the five editable cases to 64 KiB while retaining both full refusal cases. It verifies infrastructure/correctness, **not** full-size structural performance. `--case=<id>` restricts either structural mode to one matrix row. JSON records case identity, type, byte/hash identity, lexical complexity and actual mounted ProseMirror node/root-block/depth counts. New workloads are baseline candidates; no latency targets are invented before full local qualification. Cold-cache loads, physical selection latency, peak renderer/process memory, IME/paste and every table/list structural command are outside this performance matrix; existing correctness tests remain required for those behaviors.

Cases run in a fixed deterministic order inside each fresh application round. Retained drafts, caches, GC and warm native state accumulate between cases, just as in the original size suite. Do not attribute a sequential Save difference solely to Markdown structure; use `--case` for a bounded independent investigation when needed.

The final seven-case smoke (`2026-10-27T10-10-20.436Z`) passed 54 native keys, 27 byte-exact Saves, history/selection and both expected refusals. Editable 64 KiB typing p95 ranged 9.5–14.2 ms. Mixed worker validation p95 was 30.1 ms versus prose 1.9 ms, tables 8.6 ms and code 9.7 ms. Long JSON edits encounter the engine's conservative full-document parsing for bracket-bearing regions; that source-safety rule remains intact. Full-size structural/native latency, including these context-sensitive costs, is not established by the smoke run.

### Bounded typing diagnostics

```text
npm run perf:test -- --smoke --size=512 --diagnostics
npm run perf:test -- --smoke --size=64,256,512 --diagnostics
npm run perf:test -- --smoke --size=512 --diagnostics --cpu-profile
```

Diagnostics adds renderer-clock key-frame records (target/index/start/end), worker send/reply timestamps and synchronous dispatch intervals to raw JSON. Size-suite diagnostics retains six keys and two Save passes to reproduce the normal per-document workload, but only one round of the selected sizes. Optional `--cpu-profile` captures renderer CPU samples during typing/history only, using Electron's existing debugger; profiles are timestamped under `performance-results/` and linked from raw documents. CPU profiling changes scheduling and must not be treated as uninstrumented qualification. These test-only probes record no source contents or native source paths, do not change the keydown-to-frame boundary and do not run in ordinary application usage. Diagnostics requires smoke, cannot pin a baseline, and writes `latest-diagnostics.*` separately.

The October 27 structural milestone traced the old 512 KiB outlier to the middle marker's third key in all three full rounds (61.5/51.0/66.7 ms). A bounded normal-count 64/256/512 KiB sequence reproduced it at 79.9 ms (`2026-10-27T09-51-35.010Z`): synchronous dispatch was 1.9 ms, and no worker send/reply occurred inside that key interval. CPU captures attributed about 96 ms of sampled foreground time to resize-driven compression overflow measurement after frame writes, alongside React's full native-selection traversal. Moving the overflow read to resize delivery, before deferred writes, removed that sampled hot path in a follow-up CPU capture. The same unprofiled sequence then recorded typing p95 52.5→16.5 ms at 256 KiB and 79.9→29.1 ms at 512 KiB (`2026-10-27T09-55-57.194Z`). The measured key boundary and polling cadence were retained; the outlier was not dropped. This is evidence of an application geometry/scheduling collision with the sequential input workload, not evidence against the previous Save change.

These are single-round diagnostics, not full-run qualification or presentation timing. Renderer tasks around the middle-position scroll still reached 63–64 ms after the change, and CPU-profiled runs have substantially higher overhead. React selection traversal, normal full-document layout, retained draft/native Save cost and peak process memory remain limitations. The original pinned baseline remains unchanged; the user owns complete normal and full-size structural qualification.

The structural smoke also caught a fidelity regression: renderer-only trailing empty paragraphs prevented literal cell patches and caused table serialization to normalize spacing. Matching canonical root semantics fixes that path without dropping reparse validation. Its newly enabled literal path initially compared the same parsed candidate twice; request-local reuse of that exact projection's complete semantic key removes the duplicate comparison (a writer fallback still computes its own key). The final normal-order, one-round diagnostic (`2026-10-27T10-06-26.673Z`) measured near-1MiB opening 2,227.4 ms, usability 2,714.4 ms, typing p50/p95 44.5/51.5 ms, worker validation p95 29.6 ms and Save p95 2,151.4 ms; 512 KiB typing p95 was 26.5 ms. All edits/history/Saves passed. These are observations from 18 keys per size, not a substitute for the complete three-round qualification. A first-document near-1MiB run during investigation reached 5.41 s usability; first-open/JIT/cache effects remain distinct from the warmed normal sequence and are not certified by these runs.

Save investigations can additionally time main-owned protection, independent-validator requests, native `draft`/`save`/`ack-save` calls and registry persistence. These nested intervals overlap: do not add parent and child timings. The workload waits for renderer edit validation before clicking Save, so renderer patch generation belongs to edit acknowledgement; Save still includes independent host validation. Native-call intervals include pipe framing/queueing and Java work; kernel-open and flush timings do not isolate physical storage latency. The October 27 Save investigation used temporary numeric-only probes and Java Flight Recorder, removed afterward; normal report fields, workload, compatibility logic and Save boundaries are unchanged. JFR startup logging must be suppressed when profiling a private-pipe Java host (`-Xlog:jfr+startup=off`), because stdout belongs exclusively to its protocol. Use only disposable benchmark data and never log frame payloads, source paths or credentials.

## Reports and comparison

Git-ignored `performance-results/` contains `latest.json`, shareable `latest.md`, timestamped JSON/Markdown summaries and a separate `<timestamp>.raw.json` with per-round operations, samples, long tasks and limitations. Failures also produce reports and retain partial measurements. Reports record commit/dirty state, app version, Windows build, machine/CPU/RAM, Node/Electron/Chromium and Java runtime identity. Do not commit generated reports.

The launcher searches newest-first for the previous **successful compatible** run. Compatibility requires the same fixture hashes, mode/workload, harness/instrumentation bytes, machine/OS/hardware and runtime toolchain. Commit/app version differences are permitted so application improvements can be compared. Source build fingerprints remain recorded separately. There is no comparison against the old browser-lab/packaged qualification numbers. Admission changes are not compared as equivalent metrics. Machine load, power/thermal state, OS caches and driver differences cannot be normalized; results are observations rather than causal guarantees.

`--baseline` explicitly pins/replaces `baseline.json` after a successful default run; structural runs use `baseline-structures.json` and `latest-structures.json/.md`, leaving the original pinned baseline and `latest.*` untouched. Timestamped reports/raw files share the existing directory. Comparison also requires the same suite and case identity; equal sizes from different structures cannot be compared. Smoke/normal/extended histories remain separate. The structural extension changes the strict harness fingerprint, so old size-only reports remain readable but are not automatically compared across this tooling revision; the original fixture bytes, sample counts and timing definitions are retained. No historical baseline is rewritten or compatibility check bypassed. Relative regression warnings require **both >20% and >20 ms** p95 growth, to limit small/noisy warnings. Typing p95 >50 ms is also disclosed. Warnings do not fail the harness. Delete only selected report/baseline files if you wish to reset history; no benchmark database or cloud service exists.
