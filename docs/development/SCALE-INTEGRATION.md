# Sprint 5 — measured scale and integration

Reviewed 2026-10-08. Same Windows machine/atlas-2026-10-v1 corpus as ATLAS-BASELINE.md: Core Ultra 7 255HX, 16,573,128,704 bytes RAM, Windows 10.0.26300. Verified ZIP SHA-256 d95d7224bd1190104eafd18c97b9cef2380d5f808399d7dc623678ca2cf8f0f6. All tests use protected, independently owned disposable storage; personal and original Atlas profiles are unchanged. No Docker or broad API smoke.

## Scale observations and corrections

A fresh 5,000-resource/1,000-file import completed in 32.75 seconds. Its 263 operation-status samples had median 18.60 ms/max 28.42 ms, with no busy retries or 500/30-second pool timeout. Active immutable snapshots avoid the long transaction's SQLite connection. Import and initial observation overlapped local packaging/focused checks; timings are observations, not controlled speedups.

Full file extraction settled after 323.28 seconds: 330 indexed, 650 unsupported, 20 no-text, zero queued/indexing/failed/invalid/encrypted/limited. This corpus does not certify every unsupported/malicious fixture; focused Sprint 4 tests own those limits. Eleven parent-JVM working-set samples ranged 529.8–564.8 MiB; extractor children and continuous peaks are excluded. Restart reused complete cache coverage.

The initial 100-row incoming-reference page exceeded the 15-second client timeout. The service repeated full traversal once per row. Batched window retrieval and relationship-ID candidate selection keep traversal to three passes per page, with complete totals and at most 20 occurrences per row. The same 200-source fixture subsequently returned all counts; seven-sample warm median 209.5 ms/max 233.1 ms. The initial failed observation is retained in the private report rather than presented as successful.

| Query (100-row bound) | First ms | Six warm median ms | Warm max ms |
| --- | ---: | ---: | ---: |
| Mixed Library | 34.3 | 16.7 | 25.2 |
| Recent | 22.4 | 13.5 | 28.9 |
| Mixed pins | 39.0 | 22.2 | 29.7 |
| Notes | 17.6 | 15.0 | 19.6 |
| Dense collection | 26.4 | 23.3 | 30.4 |
| Title field | 20.0 | 16.4 | 23.9 |
| Saved content observations | 141.3 | 91.4 | 100.6 |
| Saved content habitat | 77.6 | 80.9 | 101.6 |
| Paged tags | 46.4 | 33.4 | 36.3 |
| Full 250 tags | 24.0 | 7.1 | 8.5 |
| Incoming references, 200 sources | 178.9 | 209.5 | 233.1 |

A separate 100 sequential warmed samples per endpoint produced empirical median/p95/max: content **91.4/112.8/147.6 ms**, references **198.3/309.6/425.7 ms** (nearest-rank p95). These are sampled sequential loopback results, not production percentiles or concurrency certification. The final protected run made 381 requests including 102 startup maintenance retries and 200 tail samples; the initial import/observation made 401, and the first corrected-reference restart 179. Six warm samples elsewhere support median/max only. OS/disk caches were not flushed; first requests are not cold measurements. Baseline APIs/shapes changed, so no general speedup ratio is asserted.

## Final packaged Windows session

0.7.1 new process → 100-row usable Library: **23.28 s**, with **zero manual connection retries** (baseline 20.71 s with six). Bounded approved handshake retries improve readiness reliability, not startup speed. Recent 132.4 ms, Pinned 251.8 ms, image-heavy note/editor DOM 423.8 ms, 199 links to 200 retained visits 29.73 s, duplicate shared views 482.1 ms. Image readiness is not all-image decoding.

Shared edits and undo from the other pane passed. At 412×915, both editors remain mounted, one focused pane is visible at 396px width; Pane selection changes focus, sidebar Menu/Escape restores trigger focus. Widening restores both panes. Refresh preserved exact pane IDs and journey length; stored theme preferences were untouched by temporary Light/OLED token frames. Reduced motion and safe host stopping passed. Nine successful frames were captured; shared wide and Light/OLED compact frames were inspected. Harness corrections targeted the row's real open button, cleared retained query through the UI, and waited for a new document after reload; early harness failures were not product restoration failures.

| Process-tree sample | Working set MiB | Private bytes MiB |
| --- | ---: | ---: |
| Library usable | 1,037.7 | 900.5 |
| Image-heavy note | 1,153.5 | 1,007.9 |
| Shared views / long journeys | 1,620.6 | 1,459.6 |
| Settled Library after refresh | 1,356.1 | 1,204.8 |

Working-set sums can double-count shared pages; private bytes are not resident memory. These snapshots and retained mounted editors do not prove a leak or full cache release. High memory and startup latency remain explicit follow-up concerns. No speculative cache/pool/dependency rewrite was undertaken. Full-tag enumeration and the 2.83 MB JS chunk remain documented limitations; the 250-tag sample alone does not justify an unrelated rewrite.

## Focused checks and remaining gates

Frontend compilation/scoped lint and **67 focused frontend cases**, **17 backend cases**, **15 desktop cases** passed. Coverage includes mapped uploads/retries, shared transactions/undo, save failures, recovery/conflicts/generation isolation, stale responses, refresh stability, motion, revision/lifecycle/archive consistency, 120-source two-page occurrence bounds, status snapshots/failure visibility, update barriers and authenticated SSE. Two disposable local HTTPS hosts passed approved pairing, TLS pinning, reconnect, copied-workspace isolation and revocation; this is not Windows–Mac LAN verification. Final 0.7.0→0.7.1 disposable installer upgrade/repair/uninstall/reinstall preserved separate sentinels and restored prior shortcuts. Fresh renderer/embedded browser and packaged main/preload/policy bytes match; original-key preflight passed.

Mac/two-device sleep/resume/discovery/browser trust, physical touch/Android/IME/clipboard and OLED hardware remain unavailable. The user requested the exact Mac AI handoff. Narrow side previews, long-running concurrent clients, cold-cache/continuous peak measurements and Android platform lifecycle are future gates. No offline sync, OCR, scheduled backups, APK or paid account was added. ANDROID-READINESS.md contains the contract matrix and separately authorized prototype scope.

Reproduce using sprint5-scale.mjs and atlas-native.mjs as documented in OPERATIONS.md; private reports are under marked temp/cache directories, never GitHub. Historical partial extraction results remain in FILE-SEARCH-MEASUREMENTS.md.
