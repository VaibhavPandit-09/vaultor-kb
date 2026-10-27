# Local Windows performance tests

Reviewed 2026-10-27. This is developer tooling, with no app feature, release, installer or version change.

From PowerShell in the repository:

```powershell
npm run perf:test
npm run perf:test -- --smoke
npm run perf:test -- --smoke --size=1024
npm run perf:test -- --extended
npm run perf:test -- --baseline
```

The normal command needs no Codex session, manual application setup, clicks, admin rights or external runner. It installs missing locked frontend/desktop dependencies with `npm ci`, builds production UI and the bundled Java/native server when source fingerprints change, launches Electron, exercises the editor, saves reports and exits. Node.js 22+ and Windows x64 are required; a Java 25 JDK on PATH is required when preparing/rebuilding the server. Initial dependency/runtime/Maven downloads need network access. See [desktop setup](../desktop/DESKTOP-SETUP-TROUBLESHOOTING.md). Subsequent unchanged runs reuse prepared components; `--rebuild` forces preparation. Keep the benchmark window unobstructed and avoid other heavy work or interacting with it during measurement.

## Runtime and isolation

The tested runtime is the repository's pinned Electron executable loading the **production-built** `desktop/ui`, with the verified bundled Java server, native LinkedHost, real Markdown worker and actual NTFS Save path. It is a local production-equivalent **unpackaged shell**, not the installed application or the Gate 1 browser lab. This avoids modifying/installing into the personal packaged app merely to load tooling scripts. Reports identify this distinction and the actual Electron/Chromium/Java versions. Browser results are never substituted.

The launcher extends `native-chrome-smoke.mjs` and the existing `native-large-markdown-check.mjs` workload, using Electron `sendInputEvent` and the existing editor bridge rather than adding Playwright or another framework. Only native folder-picker selection is supplied by the test, as in existing native checks. Production consent, confinement, revision, validation and publication gates still execute.

Each round creates a fresh temporary profile and a separate sibling source folder under a uniquely allocated `vaultor-perf-*` temporary directory. Both are removed afterward; no installed-app profiles, personal workspace, real linked documents or credentials are read or changed. Inherited Vaultor/host test settings, dev URLs and credential environment variables are excluded. The profile uses a fixed light theme, 1200×820 window, zoom 1 and disabled LAN sharing. Only one performance run may execute at once.

`perf-process.ps1` places the wrapper in an unnamed Windows kill-on-close Job Object **before** Electron launches. All Electron/Java descendants die when that wrapper exits, including on crashes/timeouts. Timeouts terminate only the launched process tree. Temporary deletion checks its resolved path/prefix and never deletes repository or personal data. An interrupted run's stale lock is reclaimed only if its owning process no longer exists. OS-level hard termination may leave a disposable temporary directory; ordinary completion, operation failure and handled interruption clean it automatically. Failed cleanup is a harness failure with the path/error recorded. No machine policy is changed by the wrapper's process-local PowerShell execution-policy option.

## Workload and boundaries

The deterministic fixture builder reuses the prose-heavy 1 MiB native qualification shape: BOM, mixed CRLF/LF, frontmatter, headings, paragraphs, lists, links/references, tables, fences and mixed formatting. Fixtures are exactly 64/256/512 KiB and 1,044,480 bytes (1 MiB minus 4 KiB edit headroom). SHA-256 identities are recorded. Safe shape/complexity refusals are reported separately with exact unchanged-source verification, not treated as harness failures. Editing metrics for refused documents are unavailable.

Normal mode uses three fresh application rounds, all four sizes, six native keystrokes at each beginning/middle/end marker, Undo/Redo and two three-position edit/Save passes. A reversible edit/worker acknowledgement/frame is the warm-up for each fixture. Smoke mode uses one 64 KiB round, two keys per position and one Save pass. Extended mode uses five rounds, twelve keys per position and three Save passes. The normal run is intended to take several minutes; poor performance can lengthen it. Each operation waits for observable readiness with a 60-second deadline; the outer application deadline is ten minutes per normal/smoke round and twenty minutes per extended round. Builds have ten-minute deadlines. These are warm application file opens with fresh profiles, not cold OS cache measurements.

Recorded metrics and limitations:

- **Open:** sidebar click through mounted editor containing the end marker. **Usable:** same start through focus, successful warm-up edit, completed worker validation and next frame callback. The app startup/bootstrap is outside file-open measurements. Three normal open samples per size; one in smoke mode.
- **Typing:** native keydown through the next `requestAnimationFrame` callback, p50/p95. This is an input-to-frame-callback responsiveness proxy, **not** compositor paint, screen presentation or physical-key latency. Inputs are sequential, waiting for each frame; this is not a fast continuous-typing burst benchmark.
- **Editing/history:** beginning/middle/end edit-to-acknowledgement and full typed-workload Undo/Redo, with restored marker assertions and natural history-group counts (slow typing may create multiple groups); synchronous selection/cursor dispatch and `view.dispatch` durations. Dispatch includes editor/plugin processing but does not measure the complete asynchronous React/render pipeline. Native pointer-selection paint latency is not measured.
- **Worker:** existing renderer Markdown-worker `validationMs` and `patchMs`, observed by a test-only Worker wrapper. Does not include independent main-host validation or worker scheduling/IPC latency. No production editor instrumentation is enabled or changed.
- **Long tasks:** renderer PerformanceObserver entries ≥50 ms, with opening/warm-up and measured editing/Save tasks recorded separately in raw JSON. **Memory:** foreground JS heap after each fixture, when available; neither process/worker/native memory nor peak memory.
- **Save:** explicit Save click through completed UI receipt and complete expected file-byte readback. Includes automation/polling overhead (readiness polling is 25 ms), not a filesystem-only syscall timing. Every Save compares the entire source against only the intended insertions; the adjacent linked Markdown file must also remain byte-exact.

Metrics use nearest-rank p50/p95 with sample counts in JSON. Short runs are diagnostic, not statistically precise guarantees. Missing/unsupported values stay null/unavailable. Slowness produces warnings and a successful exit when correctness checks pass; failed typing/history/persistence, unexpected renderer/worker errors, hangs, startup/build or cleanup failures exit nonzero.

## Reports and comparison

Git-ignored `performance-results/` contains `latest.json`, shareable `latest.md`, timestamped JSON/Markdown summaries and a separate `<timestamp>.raw.json` with per-round operations, samples, long tasks and limitations. Failures also produce reports and retain partial measurements. Reports record commit/dirty state, app version, Windows build, machine/CPU/RAM, Node/Electron/Chromium and Java runtime identity. Do not commit generated reports.

The launcher searches newest-first for the previous **successful compatible** run. Compatibility requires the same fixture hashes, mode/workload, harness/instrumentation bytes, machine/OS/hardware and runtime toolchain. Commit/app version differences are permitted so application improvements can be compared. Source build fingerprints remain recorded separately. There is no comparison against the old browser-lab/packaged qualification numbers. Admission changes are not compared as equivalent metrics. Machine load, power/thermal state, OS caches and driver differences cannot be normalized; results are observations rather than causal guarantees.

`--baseline` explicitly pins/replaces `baseline.json` after a successful run; later runs additionally compare against it if compatible. Smoke/normal/extended histories remain separate. Relative regression warnings require **both >20% and >20 ms** p95 growth, to limit small/noisy warnings. Typing p95 >50 ms is also disclosed. Warnings do not fail the harness. Delete only selected report/baseline files if you wish to reset history; no benchmark database or cloud service exists.
