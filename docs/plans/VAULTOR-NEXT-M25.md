# Vaultor Next M25 performance qualification

## Verdict

Keep Tauri/Rust as the engineering direction. In the matched Windows managed-note workload, Next restarted much faster, used less process-tree private commit, and had a faster typing proxy and near-1 MiB document opening. The measured desktop durability optimization cut the protected commit stage roughly in half. Electron still returned exact-title search results sooner and had a better scroll tail in the 64 KiB run. Working-set return varied materially between Next binaries. The observations support continued development and scoped engineering qualification. Feature-complete and production acceptance remain open.

## Baselines and candidate

The Windows packaged original is Vaultor 0.27.0 from `7b7cf824e5f637b0918c49e8518b11054b1211f1`. It is the newer installed release and includes the original Help Center. The published source and signed installer are documented in the [0.27.0 ledger](../desktop/releases/v0.27.0.md). The retained 0.26.0 release is historical context. The M24-D optimized Next desktop executable matches source `ef81de68565e7c75d0e867b712581d8612fe20df`. The M25 desktop and standalone Windows executables were built from `6ce65c5fe1081339c6c83c14e4269dd293d547de` using Rust 1.99.1, the optimized release profile and production Vite desktop and browser bundles.

| Artifact | Repository-relative file | SHA-256 |
| --- | --- | --- |
| Original installed 0.27.0 | `Vaultor.exe` in the 0.27.0 installation | `f4be60af2a8d24959ec6d16b1ff3ac2ad96a590d4839db6a0694b0191eb9a463` |
| M24-D desktop | `next/src-tauri/target/release/vaultor-next-m24d.exe` | `52b42f2fee32db1c3f67441f3fd29184b324c3f31f9dddf73256e4cf8ca0eddc` |
| M25 desktop | `next/src-tauri/target/release/vaultor-next-m25.exe` | `f2a0522ae58a691d8004ce5bdd996f3c1f7f7bb30bc82c6b9046b1170663fcec` |
| M25 standalone host | `next/src-tauri/target/release/vaultor-next-host-m25.exe` | `1778bba2ac98661019fdb1e86653be471cd4b91410cb06f3d5f6f158f1a2b37a` |

Android implementation and signer were untouched. The retained M24-D APK matches `b9c3a882f332e0e2e77d6917322f2d92a0fe6aee1db7e0b01a983ea65e1a0e37`, source `78b4bda4adab5b46dccdd2f5e883203efb1a1c6a`. These builds are local engineering candidates. The milestone does not create an installer, Git tag or public release.

The previous standalone Windows binary was copied to `next/src-tauri/target/release/vaultor-next-host-m24d.exe` before rebuilding the standard output path. Its M24-D digest remains `4a93957c30e7eb8af50b4fcaa41a6fa026496f0abe54ab5a37835d9ecc9675f1`.

The Windows 11 x64 benchmark ran on build 26340 with a Core Ultra 7 255HX, 20 logical CPUs and 15.43 GiB OS-visible RAM. Windows reported Intel graphics at 2560 × 1600 / 240 Hz and an NVIDIA RTX 5050 Laptop GPU. The physical display scale and the GPU selected by each app were unmeasured. The Acer power plan remained selected. The driver set both runtimes to a 1200 × 820 light viewport with nominal DPR 1. Electron 44.5.1 used Chromium 152.0.7977.130 and the bundled JDK 25.0.4.1+1 manifest `4c0ba354fd627fae3682fcea1fb18654c276f4750541628509fddd243675d66d`. Next used Tauri 2.12.5 and WebView2 157.0.4341.60. Cache, thermal, background activity and power limits were uncontrolled. No builds or emulators ran during the matched measure-and-settle sequence.

## Protected managed-note publication

The production renderer already persisted a validated document in the recovery journal before saving. The subsequent commit reserialized and resubmitted that document. The SQLite owner then serialized it again and compared it with the journal body. M25 lets the desktop reference the already protected document by resource ID, revision, journal token and sequence. The SQLite owner resolves the exact protected record and publishes its content with the existing revision compare-and-set, FTS and relationship triggers, and transactional cleanup. Both protection and publication use the existing WAL database with `synchronous=FULL`. A failed or stale commit leaves the draft recoverable. The browser still submits its own document and follows the existing authorization and revision checks. The linked source pipeline is unchanged.

The matched Windows loopback-free Tauri IPC probe used the same approximately 1 MiB ASCII JSON and 20 measured saves after four warmups per configuration. Every sample required the exact next revision, complete committed document and an empty draft journal afterward. The same-candidate echo probe exercises the retained document-bearing route and controls for the binary change. `p95` uses nearest rank. These timings include IPC and SQLite publication, with no autosave delay or UI rendering in this timer.

| Publication probe | Draft protection p50 / p95 | Commit p50 / p95 | Commit request median |
| --- | ---: | ---: | ---: |
| M24-D document echo | 32.8 / 47.3 ms | 60.4 / 88.1 ms | 1,044,123 B |
| M25 protected reference | 34.1 / 56.5 ms | 30.9 / 39.8 ms | 151 B |
| M25 document echo control | 38.1 / 74.6 ms | 65.1 / 133.7 ms | 1,044,123 B |

The protected commit reduced the median by 29.5 ms (49%) and the observed p95 by 48.3 ms (55%) against M24-D. On the same M25 build the protected commit was 34.2 ms faster at the median. Protection still sends and validates the complete document. Its measured timings vary across runs. The UI retains the same scheduling and durability contract.

## Matched Windows desktop measurements

Each run used the same 100-note collection, the same two prose documents, one view, the same one-second autosave setting, and the same driver and measured readiness conditions. The [benchmark instructions](../../benchmarks/tauri-rust/README.md#m25-comparable-windows-workloads) specify timing boundaries, warmups, fixture hashes and process accounting. These are serial measurements from one Windows machine. The repeated observations within an app session characterize that session.

| 64 KiB workload | Original 0.27.0 | Initial Next M24-D | Optimized Next M25 | Samples per build |
| --- | ---: | ---: | ---: | ---: |
| Fresh profile to usable | 7,954.5 ms | 1,703.8 ms | 1,354.2 ms | 1 |
| Warm profile restart p50 / p95 | 8,363.5 / 10,778.7 ms | 739.0 / 1,015.2 ms | 736.3 / 1,035.2 ms | 10 |
| Visible note open p50 / p95 | 75.8 / 102.2 ms | 97.1 / 118.8 ms | 62.3 / 89.1 ms | 20 |
| Typing proxy p50 / p95 | 9.7 / 13.5 ms | 3.1 / 7.9 ms | 2.6 / 3.9 ms | 100 |
| Undo / Redo command to frame | 9.6 / 9.6 ms | 5.3 / 5.5 ms | 3.7 / 3.5 ms | 1 each |
| Redo to Saved indicator | 1,071.6 ms | 1,039.2 ms | 1,025.8 ms | 1 |
| Title search p50 / p95 | 226.2 / 235.8 ms | 247.3 / 251.8 ms | 244.3 / 248.5 ms | 10 |
| Scripted scroll frame interval p50 / p95 | 4.2 / 8.4 ms | 8.3 / 12.6 ms | 4.2 / 12.5 ms | 60 |

Next had a substantially shorter restart and input-to-frame proxy in this workflow. The page debugger was reachable around 315–350 ms at the median across all three builds, while the remaining work through usable startup varied widely. That interval includes Java startup and Library hydration in Electron. Native window construction, Java startup, SQLite and renderer startup were not individually timed. The observed difference between M24-D and M25 note opening does not isolate a navigation optimization. The candidate's visible exact-title search and scroll tail were slower than Electron in this run. The title-search path intentionally waits 220 ms in Next and 200 ms in the original, which accounts for a difference on the scale measured here. The benchmark preserves both shipped debounce policies and measures visible readiness, so it does not isolate either database query.

| 64 KiB process-tree measurement | Original 0.27.0 | Initial Next M24-D | Optimized Next M25 |
| --- | ---: | ---: | ---: |
| Sampled workload peak working set | 1,281.3 MiB | 868.2 MiB | 890.3 MiB |
| Last five-minute working set | 725.8 MiB | 427.0 MiB | 699.1 MiB |
| Last five-minute private commit | 793.5 MiB | 390.4 MiB | 453.5 MiB |
| Last process count / handles | 6 / 2,817 | 7 / 3,406 | 7 / 3,270 |
| One-core CPU in stable sampled intervals | 2.15% | 0.52% | 0.81% |
| Stable intervals / observed span | 297.90 / 299.40 s | 294.92 / 299.35 s | 294.81 / 299.17 s |

Each column contains one idle window after a 30-second settle. Process membership changed briefly in all three, so the full-window CPU end-minus-start observations are invalid. The reported CPU divides the sum of adjacent CPU counter deltas by the span of those same intervals, using matching PID creation identities. The observed contributions over the full sampled span were at least 2.14%, 0.52% and 0.80% of one core respectively. This leaves the missing intervals and activity between snapshots unresolved. Electron includes its Java process and renderer children. Next includes the WebView2 renderer, GPU and utility descendants. Resident sets may count shared pages more than once. Private committed memory measures a different quantity and can exceed resident memory.

The optimized candidate used 43% less settled private commit than Electron. It settled 272 MiB higher in working set and 63 MiB higher in private commit than the initial Next run. Initial Next working set fell from 712 to 427 MiB during the window. M25 moved from 704 to 699 MiB. This is a material variance in observed memory return. A single comparative idle round cannot attribute it to the Save change or establish a leak.

| Larger managed prose workload | Original 0.27.0 | Initial Next M24-D | Optimized Next M25 | Samples per build |
| --- | ---: | ---: | ---: | ---: |
| 512 KiB open p50 / p95 | 145.2 / 198.1 ms | 101.1 / 127.8 ms | 108.9 / 136.9 ms | 20 |
| 512 KiB typing p50 / p95 | 13.5 / 17.5 ms | 3.4 / 4.7 ms | 3.6 / 4.9 ms | 100 |
| 512 KiB Redo to Saved | 1,115.8 ms | 1,092.6 ms | 1,050.6 ms | 1 |
| 1,020 KiB open p50 / p95 | 297.8 / 337.0 ms | 164.7 / 218.6 ms | 164.6 / 209.7 ms | 20 |
| 1,020 KiB typing p50 / p95 | 18.5 / 22.4 ms | 6.2 / 8.0 ms | 6.2 / 8.0 ms | 100 |
| 1,020 KiB Undo / Redo to frame | 18.1 / 14.2 ms | 14.9 / 10.7 ms | 5.2 / 5.8 ms | 1 each |
| 1,020 KiB Redo to Saved | 1,184.3 ms | 1,147.8 ms | 1,089.9 ms | 1 |

All nine desktop scenarios completed Undo/Redo and restart readback of the complete expected text. M25 opened the largest managed note about 45% faster at the median than Electron under this repeat-open fixture. M24-D and M25 were similar on the near-1 MiB opening and typing boundaries. The measured commit improvement has a clearer isolation than the single UI Save observation. Prose timings do not generalize to dense tables, long lines, linked Markdown parsing or mixed attachment workspaces. The experiment does not attribute large-note latency to a single filesystem, database or layout stage.

## Preview and multi-pane memory investigation

The M25 Windows candidate completed six cycles of three distinct dense editors with PDF, image and audio previews in 48.7 seconds. The fixture uses 181 × 12 editable tables, a three-page PDF, a small raster and a 36-second WAV. Each cycle returned to the visible Library with no mounted editor or preview. The driver then allowed 30 more seconds of natural settling. Separate checks exercised three shared panes, muted audio seek and playback, video first frame and playback, PDF page text, side-to-modal expansion, workspace-switch capability refusal and Markdown paste cancellation and Undo. The full run took about 173 seconds from launch through the final evidence file.

| Editor/preview state | Working set | Private commit | JS heap | Processes / handles |
| --- | ---: | ---: | ---: | ---: |
| Fresh Library | 455.1 MiB | 243.8 MiB | 6.7 MiB | 7 / 3,120 |
| Three distinct loaded dense notes | 1,368.9 MiB | 1,086.2 MiB | 34.3 MiB | 8 / 4,009 |
| Final return to Library after short sample settle | 1,377.3 MiB | 1,094.8 MiB | 33.1 MiB | 8 / 4,008 |
| Final Library after additional settling | 740.9 MiB | 451.8 MiB | 14.9 MiB | 8 / 3,971 |

The sampled workload peak was 1,466.7 MiB resident. Short post-close samples reproduced the elevated M19 range, at 1,352–1,449 MiB across six Library returns. The final longer settle released 636 MiB of working set and 643 MiB of private commit. GPU-process private commit fell from 551 to 200 MiB and renderer private commit fell from 455 to 163 MiB. The Rust desktop process ended at 12.4 MiB private commit. These are process roles, not measurements of GPU VRAM or allocator ownership. The observed decline without forced GC and the non-monotonic cycle endpoints demonstrate substantial delayed release. The remaining elevation and additional process leave retention across longer workdays and larger real previews unresolved. No application leak was established in this test.

## NTFS linked sources and background indexing

The existing 2,051-document Windows fixture completed initial indexing in 17.5 seconds. Across 23 snapshots in that window the process tree used 58.2% of one logical CPU and peaked at 450 MiB resident. The earlier attempt took 35.0 seconds to index and encountered a benchmark error after restart because the driver only accepted the managed Library as ready. Both attempts remain in the canonical record. The wide range and different run outcomes leave initial indexing variability open.

Single-file create, edit, rename and deletion became searchable or withdrew from results in roughly 292–319 ms each. A 24-file burst converged in 454 ms. Renaming a folder produced its first searchable moved path in 349 ms and finished the full scan in 7.37 seconds. Those boundaries include event coalescing and 30 ms readiness polling. Global and combined FTS searches measured 4.47 / 4.80 ms and 4.23 / 4.75 ms p50/p95 over five IPC observations each. The near-1 MiB linked editor reached readiness in 237 ms and completed explicit Save in 240 ms, one observation each. The driver verified exact CRLF-preserving source publication, Undo/Redo, clean external reload, dirty conflict protection, source removal and reconnect, restart, and search withdrawal after revocation. The original Electron linked-source benchmark uses another fixture and timing contract. A matched linked-document verdict is still open.

## Optional Windows hosting and standalone host

The same M25 Windows candidate used one saved note, a disposable CA and a loopback listener. Idle conditions use one three-minute window each. The enabled idle window had no clients. CPU uses stable sampled intervals for the disabled result, which covered 177.92 of 179.37 sampled seconds. The enabled result covers 178.74 sampled seconds. The later enabled window followed the disabled window. Its lower resident and private values therefore include natural process settling, and do not demonstrate a memory saving from starting the listener.

| Desktop condition | One-core idle CPU | Final resident / private | Local note IPC p50 / p95 |
| --- | ---: | ---: | ---: |
| Hosting off | 0.55% | 591.6 / 345.8 MiB | 3.70 / 8.18 ms (8) |
| Hosting on, no clients | 0.48% | 483.6 / 233.2 MiB | 3.35 / 9.00 ms (8) |
| Hosting on, four in-flight authenticated reads | — | — | 10.61 / 11.86 ms (12) |

Listener activation took 24.5 ms and stop through TCP refusal took 11.3 ms, one observation each. The pairing script took 20.9 ms, excluding time for a person to compare the codes. New verified TLS connections for saved-note read and search measured 4.80 / 5.23 ms and 5.79 / 6.42 ms p50/p95 respectively, 12 requests each. A concurrent burst of four saved-note reads and one local IPC read completed in 12.71 / 14.74 ms across 12 measured bursts. The local IPC latency increase is a scoped contention signal. This fixture did not time simultaneous editing, downloads or indexing under the same load.

The optimized Windows standalone host reached a verified descriptor in 76.1 ms. Its process tree was 19.8 MiB resident and 3.9 MiB private commit. The CPU counter showed no resolved increase over 61.5 seconds of idle. This is a one-workspace, one-host observation. The runtime rejected an already owned workspace and refused an anonymous workspace request. Desktop loopback checks passed matching-code approval, scoped reads, grant withdrawal and device revocation. Local note IPC remained usable after hosting stopped. Native desktop Quit closed the listener, and the Windows standalone measurement ended with fixture termination. The Windows standalone test does not certify graceful process shutdown.

## Android emulator and saved-change delivery

The unchanged M24-D APK installed in a disposable read-only API 36 AVD and the installed SHA-256 matched. Five `am start -W` process-cold runs with OS caches intact measured 1,178 ms p50 and 1,752 ms p95 through the Android activity boundary. The signed app took 5,795 ms to display the manual pairing code, 3,727 ms to display its workspace after restart, 4,710 ms through the Library action, and 4,793 ms from the Library action to a visible rich-note body. These are individual emulator observations with ADB reverse and UIAutomator overhead.

The app trusted the verified CA fingerprint, paired with the matching displayed code, retained approval across restart, and displayed the granted note with its heading, table, code, image and links. The M25 desktop protected commit advanced the fixture to revision 3 while the reader was open. The Android view displayed the updated text within 3,977 ms of starting the desktop driver, including IPC, driver startup, ADB and UIAutomator polling/scroll. The fixture device was revoked and the emulator was shut down. This run qualifies a scoped existing-APK pairing, restore, read and saved-change path with M25. Android offline/export/Review delivery use the earlier M24-D qualification. Physical Samsung and real-LAN timings, camera QR and Wi-Fi discovery remain open.

## Linux/amd64 Docker and Chromium

The unchanged [Dockerfile](../../next/Dockerfile) built `vaultor-next-m25:local` with the M25 application source label and the optimized headless Rust profile. The exercised Docker Desktop Linux engine was 29.9.3. The local image ID was `sha256:428ca53bb3f54304b3146be75632d9bc4670a77813f9f354c83739a26559c0fa`. The optional browser experiment used an isolated Chromium container with its own NSS trust store. Container accounting is separate from Windows process-tree metrics.

| Docker or Chromium boundary | Result | Samples |
| --- | ---: | ---: |
| Container run through verified TLS descriptor | 667.4 ms | 1 |
| Idle one-core CPU across 60 seconds | 0.051% | 1 window |
| Linux cgroup `memory.current` at idle | 9.4 MiB | 1 |
| Authenticated saved note p50 / p95, fresh TLS | 5.91 / 6.75 ms | 20 |
| Two concurrent 8 MiB downloads p50 / p95 | 129.7 / 139.2 ms | 6 |
| Aggregate verified transfer rate, median | 123.4 MiB/s | 6 batches |
| Short text import through durable receipt | 15.0 ms | 1 |
| Markdown export request through verified download | 315.1 ms | 1 |
| Chromium approval through rendered Library | 2,097.8 ms | 1 |
| Chromium Library click through rendered note body | 139.5 ms | 1 |

The transfer fixture verified the full length and SHA-256 of both originals in every batch. These are same-machine Docker-network timings that include fresh TLS and test-driver work. The runtime also verified non-root operation, exclusive workspace ownership, anonymous refusal, matching-code approval, scoped transfer, restart identity and grants, grant withdrawal, revocation and graceful SIGTERM. Chromium exercised pairing, cookie isolation, a saved-note edit, reload, grant withdrawal and sign-out. Concurrent transfer and local editing on a real network remain unmeasured. Test containers and volumes were cleaned up, and the local image was retained.

## Regression checks and retained interaction issues

- Rust `cargo test --all-targets --locked` passed 61 library and 2 Windows desktop tests. The new regression checks exact proof binding, conflict and rebase, injected draft-cleanup failure and full rollback, restart, draft removal and the committed FTS body. Existing browser CSRF/scope/revision, paired TLS and authorization, Windows linked-source, search, managed files, archives and review tests passed.
- Next Vitest passed all 112 cases across 22 files with two workers. TypeScript and ESLint passed for the affected frontend. Windows production desktop and browser assets and both optimized executables built successfully. Existing Vite chunk-size and mixed import warnings remain.
- The prior M24-D logs reproduced two failures on unchanged M24-C. The per-session journey and inactive-session case timed out at five seconds. The styled note tags and stable-assignment case could not find the remove-tag button. Their product code and assertions were untouched, and both passed in the M25 suite. The historical failures are consistent with timing-sensitive interaction tests. A specific root cause remains unconfirmed and both cases stay in M26's qualification scope.
- The changed commit carries the same user-visible saving and recovery states. User Help and the Feature Catalogue remain applicable as written. Help validation covered 43 features and 16 articles, and all 17 governance tests passed.

## Canonical benchmark evidence

The [canonical CSV](../../benchmarks/tauri-rust/benchmark_runs.csv) and [workbook](../../benchmarks/tauri-rust/vaultor_tauri_rust_benchmark_tracker.xlsx) contain 14,703 observations. The M25 tail adds 2,767 records, including retained invalid attempts and stable-interval CPU derivations. Verification matched the 11,936 historical records against the M24-D checkout, all workbook run IDs against the CSV, and all appended metric values and validity fields. The workbook has 475 formulas and zero cached cell errors. All workbook parts outside Raw Runs are byte-identical to the earlier workbook. A rendered excerpt of the appended proof rows showed the preserved column widths, metric values, units and validity controls. The [sanitized summary](../../benchmarks/tauri-rust/summaries/m25-performance.json) records group counts, p50, p95, artifact hashes, fixture/tool fingerprints and exact runtime boundaries.

## M26 readiness

- Expand the matched dataset beyond two prose documents in a 100-resource workspace. Cover large mixed workspaces, dense/long-line content, internal links, attachments, tables, CRLF linked Markdown, source churn and long active sessions. Capture renderer and native layout, search and durability stages separately where the workload warrants it.
- Keep the original functional backlog open. It includes browser resource creation and organization and owner handoff, legacy Android workspace ZIP intake, linked-depth and Review export fidelity, cross-interface address recovery, safe in-place workspace replacement and crash-tested rollback, legacy Electron archives, PDF extraction/index/preview gaps, exact linked-occurrence navigation and Word/PDF export fidelity.
- Complete physical Windows Explorer drag-out and physical Samsung camera/QR/Wi-Fi, permissions, DHCP and sleep/reconnect. Finish security qualification across real clients and network transitions, shared editor and native interaction acceptance, keyboard/IME and assistive technology coverage, and a full visual and motion comparison.
- Qualify the exact installer and supported platform releases before production publication. The M25 builds are optimized local executables. The original release remains the published desktop baseline.
