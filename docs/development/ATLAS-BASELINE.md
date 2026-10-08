# Atlas baseline — 2026-10-08

[Launch/reset and fixture identity](PRIMARY-TEST-WORKSPACE.md). These are actual observations, not performance targets. Windows app 0.4.1, host build `desktop-d8`, protocol 2; Intel Core Ultra 7 255HX, 16,573,128,704 bytes RAM, Windows 10.0.26300. Local C: workspace storage; disk model and flushed-cache measurements unavailable. Seed `atlas-2026-10-v1`: 5,000 resources, 80 collections, 250 tags, 300 mixed pins.

## Protected local API measurements

Seven sequential requests per query: first plus six warm samples. Prior generation/verification warms caches; first is not cold. Six samples support median/max, not reliable p95 or speedup claims. 70 timed requests plus capability read; durations include parsing and loopback transport. Bounded page size 100 except existing full-tag/backlink APIs.

| Query | First ms | Warm median ms | Warm max ms |
| --- | ---: | ---: | ---: |
| Mixed Library | 10.69 | 6.27 | 19.75 |
| Mixed Recent | 6.19 | 6.58 | 22.83 |
| Mixed pins | 23.56 | 21.38 | 23.70 |
| Notes | 16.16 | 15.48 | 17.81 |
| Dense collection | 14.70 | 12.00 | 17.69 |
| Title `field` | 9.37 | 8.31 | 12.68 |
| Saved-note `observations` | 81.27 | 87.90 | 100.43 |
| Paginated tags | 29.20 | 30.40 | 32.37 |
| Full tag list | 12.53 | 9.20 | 10.58 |
| Unpaged backlinks, 200 sources | 174.50 | 90.97 | 120.55 |

Backlinks return full source DTOs including note content; acceptable timing does not make this bounded for Android. Paginated usage belongs to Sprint 3. Renderer request totals are unavailable because desktop HTTP uses main-process IPC.

## Native baseline and findings

One completed unpacked Windows run, after fixing harness selectors and responding to actual startup Busy rejection:

| Scenario | Actual result |
| --- | --- |
| Process start → 100-row Library usable | 20.71 s, including six explicit connection retries during startup FTS 409 |
| Recent destination | 134.66 ms |
| Pinned destination | 126.56 ms |
| Image-heavy editor/image DOM readiness | 455.54 ms; not all-image decoding |
| 199 link transitions to 200 retained visits | 29.89 s total; cycle preserves distinct visits |
| Two views of the same note | 435.37 ms; edits mirrored, undo from the other view removed the edit from both |
| Owned host stop/save barrier | Passed |

Memory samples include Electron child processes and Java. Sums of working sets can include shared pages; private bytes are not private resident memory. These are snapshots, not continuous peak or verified cache release:

| Snapshot | Working set MiB | Private bytes MiB |
| --- | ---: | ---: |
| Library usable | 1,038.3 | 897.8 |
| Image-heavy note | 1,143.1 | 1,000.0 |
| Shared views after 200 visits | 1,648.3 | 1,488.6 |

Growth merits repeated settled/cache-release measurement in Sprint 5; three samples do not prove a leak. Screenshots confirmed images, structured code/table content and the named isolated connection. At 412×915 with sidebar and two panes, notes collapse into unreadable narrow columns: a recorded layout defect, not Android readiness. No Mac/Linux/physical Android, slow-network, draft-conflict or hardware OLED verification occurred. New processes retained Atlas session state; OS/disk caches were not flushed.

## Verification and next gates

Two Node tests passed identity/structured fixtures and ownership/checkpoint guards. Full API verifier passed counts, title/body separation, interleaved Recent, shared-image sources, original byte hashes, mixed alphabetical pins and dense/empty collection counts. Identical import replay retained 5,000 resources. Small generate/reset removed an extra note and restored 70. ZIP inspection found only manifest/workspace/files (1,002 entries), excluding host/profile/credential filenames. Import review reported expected counts and an organization summary, without unsupported archive warnings. Two representative generated PDFs were rendered and visually inspected; not all pages. Python/Node syntax and whitespace passed.

Sprint 5 must address startup connection readiness and narrow panes, then measure memory retention/cleanup. Sprint 2 introduces safe lifecycle/Trash; Sprint 3 bounded usage/categories; Sprint 4 saved file extraction. Invalid/oversized fixture outcomes, slow-network and recovery conflicts remain future tests. No app runtime change or 0.4.2 installer occurred in this fixture-only sprint.
