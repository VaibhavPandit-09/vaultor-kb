# Sprint 4 saved-file extraction observation

Reviewed 2026-10-08. This is a bounded observation on the same Windows machine and atlas-2026-10-v1 corpus as the [Atlas baseline](ATLAS-BASELINE.md), not a completed Sprint 5 comparison.

A verified synthetic baseline ZIP was imported into a new protected temp workspace; the user's original Atlas profile and personal workspace were untouched. 5,000 resources were verified, including 1,000 active Files. The first 5,000-resource replacement completed, but polling operation status hit the single Hikari connection's 30-second timeout during its long committing transaction. This failure is retained as a Sprint 5 limitation; it is not fixed in Sprint 4. The marked completed disposable copy was restarted to observe indexing.

| Measurement | Actual result |
| --- | --- |
| Query | Explicit saved-content search for habitat, while file indexing was active |
| Six protected HTTP samples | 74.0, 223.6, 104.3, 248.2, 229.4, 99.4 ms |
| Median / maximum | 164.0 / 248.2 ms |
| Initial file coverage | 2 indexed, 992 queued, 1 indexing, 5 unsupported |
| After 60 seconds | 63 indexed, 800 queued, 1 indexing, 133 unsupported, 3 no-text, 0 failed |
| Main JVM sampled working set | 323.8 → 312.7 MiB |
| Whole observation after restart | 74.0 seconds |

These are two parent-JVM working-set samples, excluding extractor children; they are not peak/total application memory measurements. Six warm query samples are not a p95. Parsing throughput depends on unsupported-file mix and JVM startup; the entire corpus was not drained. No cold filesystem cache, UI startup, simultaneous remote clients or speedup claim is made. The final release adds environment sanitization and an equivalent factored timeout helper after this observation; the same extraction algorithm/limits apply. Full throughput, memory/cache growth, import status availability and multi-device responsiveness remain Sprint 5.

The small final packaged fixture settles two supported files plus unsupported/invalid/oversized examples and checks restart reuse, title exclusion, scoped body matches and native Library/Ctrl+K excerpts. It is separate from this partial Atlas observation. [SEARCH.md](../workspace/SEARCH.md) owns limits and semantics.
