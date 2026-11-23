# Vaultor Next M26-B engineering qualification

M26-B combines the remaining original-product work and engineering acceptance. The candidate remains on `codex/vaultor-next-m1`. The [canonical parity register](VAULTOR-NEXT-PARITY.csv) retains the original requirements and historical evidence. Production packaging and publication are M26-C.

## Implemented

- Managed PDF body extraction on admission and explicit index rebuild. The native Windows and headless executables run a separate, memory- and time-bounded worker. Encrypted, empty and over-limit results do not supply a body. PDF search has document-level results.
- Owner-local linked PDF indexing and read-only preview. The source scanner checks the pinned identity and grant, withdraws superseded bodies, and publishes verified results to the active workspace. Connected search excludes linked records before counting or paging. PDF files stay external. Archives carry inactive relative descriptors and the observed fingerprint.
- PDF preview Find by matching page. Tab reaches the Find input and controls. Escape closes Find and restores toolbar focus. The password is scoped to the open preview.
- Browser organization commits notify the same mounted desktop workspace. The renderer refreshes saved organization through IPC and keeps its existing editor sessions.
- Normal workspace open refuses internal restore stage directories after an interruption. A subprocess test terminated a restore just before publication and after completion. The prepublication target stayed absent, the abandoned stage refused open, both existing databases passed integrity checks, and the completed original matched its expected bytes.
- The Android offline-export test follows the current Workspace archive label and verifies the selected resource's partial export request. All 112 Android Jest checks passed. The Android product source and APK are unchanged.

## Engineering artifacts

The Windows desktop uses `e21298f7e90d05128182c406282af06afe9229ec`. The standalone Windows host and Linux/amd64 Docker image use `3c4d3790d54cb9caf67b15bee416672e4460007e`. The desktop follow-up scopes the Open Notes drop target to active dragging. The browser build produced byte-identical asset names after the change. Windows uses the optimized Rust profile and the production Vite bundles. The signed Android candidate remains at its M26-A4 application source, `beb1abf4437e2da24845171ad0d820b7711cb445`.

| Artifact | Local path or tag | SHA-256 or image ID |
| --- | --- | --- |
| Windows desktop | `next/src-tauri/target/release/vaultor-next-m26b.exe` | `f7fac0fc085a86b3844dff585dfa82c3f54af728bbbefc96bab43753f2f0c774` |
| Windows standalone host | `next/src-tauri/target/release/vaultor-next-host-m26b.exe` | `4938347be7e229d7ea83e0e9e307c64fb0cdb8ac7e49821792e5e817bf8d0584` |
| Signed Android engineering APK | `mobile/releases/0.1.0-m26a4.1/Vaultor-Next-Android-0.1.0-m26a4.1.apk` | `a60dca6fd1066ab776c22ca2e0810c8283a0f5fe5b7e66ba5989c4e570b30cc2` |
| Linux/amd64 host | `vaultor-next-m26b:local` | `sha256:4cc5d20718333e80504c5d6e1e9e887e848a0215b5151bb7dd0bae755d0fd745` |

## Automated regression and connected acceptance

- Windows Rust tests passed 72 library entries, two desktop binary tests and one worker integration test. The library run includes the process-kill test and its child fixture entry. The worker integration checks multipage text, empty content, malformed input, the page limit and password-protected and empty-password encryption. The Linux/amd64 image worker independently returned the expected third-page text and the encrypted outcome.
- The 113 Next Vitest tests, TypeScript production build, scoped ESLint and 112 Android Jest tests passed. Help governance validated 43 catalogue entries, 16 articles and 17 tests. The production desktop bundle contains the revised Next Help. The parity CSV retains 156 rows and 16 columns.
- Chromium exercised certificate trust for an isolated private CA, pairing and granted sessions, saved edit and reload, organization including nested collections and tags, grant withdrawal and sign-out. Docker exercised ownership, TLS identity and restart, exact managed streaming, scoped Review export, revocation and graceful shutdown. Evidence is in local `benchmarks/tauri-rust/raw/m26b-docker.json`.
- The signed engineering APK passed API 36 instrumentation for a native queued Android ZIP over ADB-reversed Rust HTTPS. The owner previewed, approved and rejected requests, and the test compared the restored managed bytes. This exercised an emulator and a disposable host.
- Docker sampled one minute of idle cgroup use at approximately 0.095% of one core and 9.37 MiB memory. Browser collection and tag creation took about 151 ms and 144 ms in single loopback samples with polling. These timings describe that fixture.

### Windows PDF, host and archive runtime

- WebView2 verified managed import and rebuild, found a third-page phrase, withdrew results in Trash and restored them. A linked change replaced the body under the same identity. Revocation withdrew the result and preview read permission, and the external file matched its original fixture revision exactly. PDF Find navigated to the matching page, exposed a named searchbox and close button in the WebView accessibility tree, and restored toolbar focus on Escape. Wrong-password retry, unlock, navigation, side-to-floating preview, close and reopen passed. Stale preview scope after a workspace switch refused. See local `tauri-rust-2026-11-23T10-24-09.031Z.json`.
- The Windows host probe verified TLS, grant withdrawal and revocation, exclusive workspace ownership, explicit Quit and an independent standalone host. After a browser collection commit, the already-mounted desktop Collections view repainted without a manual refresh. The incoming backup review verified and restored exact original bytes after owner approval. See local `tauri-rust-2026-11-23T10-22-18.180Z.json`.
- The native archive probe exercised nested imports, relative Markdown and managed image conversion, protected Recovery copies, exact original bytes, linked descriptors, Restore as New and Merge replay. A 2 GiB disposable import was interrupted with process termination, then reconciled and replayed. A 256 MiB attempt completed before the kill and did not qualify as an interruption. The original v5 fixture passed restore and merge replay, and an explicitly missing database refused open. See local `tauri-rust-2026-11-23T10-24-09.721Z.json`.
- The native Review probe checked evidence display, non-mutating triage, stale revision display, portable restore and exact-repeat merge. It retained 200 Review rows across the archive and merge scenario. It also checked NTFS descriptor mismatch refusal, exact rebinding, memberships, external original bytes, independent managed duplication, Pinned order and checked native-copy preparation and cancellation. That copy path does not exercise an Explorer drop. See local `tauri-rust-2026-11-23T10-28-45.373Z.json`.
- The same rich fixture produced Markdown, Markdown with assets, Word and PDF. Word XML contained the embedded PNG, horizontal and vertical spans, external link relationship and Unicode text. Markdown contained both spans. Poppler-rendered PDFs showed a material parity gap. Electron lays out headings, inline marks, a merged table, embedded image and link treatment. Next retains selectable text and Unicode in a plain layout and substitutes the image label. The unsupported-glyph fixture refused PDF creation safely.

### Visual, keyboard and motion evidence

The installed Electron 0.27.0 reference from `7b7cf824e5f637b0918c49e8518b11054b1211f1` and Next captured populated Library, Collections, hierarchy and detail, Tags and tag actions, Pinned, Recents, Trash and the managed-note header. Review placement, type-filter labels, footer actions and some toolbar differences remain. Next's Light, Dark and OLED note captures and 900px, 1200px and 1800px layouts stayed horizontally contained at the tested emulated DPR settings. Tag removal returned focus to Add Tag. Settings dismissed under reduced motion without a retained transition element. Library and note comparisons use the `m17-original-*.png` and `m17-next-*.png` captures in local benchmark evidence. The first unpacked reference attempt failed before startup with missing ICU data. Captures use the subsequent successful installed reference.

The final Windows executable passed repeat visual, keyboard and PDF checks. The idle Open Notes end target was absent and the actual linked PDF opened read-only and rendered selectable text. The matching local reports are `tauri-rust-2026-11-23T10-32-16.387Z.json` and `tauri-rust-2026-11-23T10-32-17.369Z.json`.

### Focused performance

On the first optimized Windows build from `3c4d3790`, usable first-profile startup was 613 ms and one restart was 920 ms. The 1020 KiB managed-note fixture measured a 177.65 ms median across 20 opens, 8.00 ms across 100 input-to-frame proxies and 242.60 ms across ten title-search queries including polling. Undo/Redo and persistence across restart passed. The protected-draft probe measured a 30.20 ms median commit across 20 publications and a 151-byte median request. All 24 publications including warmups passed exact readback and draft clearance. Samples are appended to the canonical benchmark CSV. Historical rows and workbook formulas are retained.

The PDF fixture measured approximately 441 ms from managed import through body readback and 329 ms from linked registration to a body match. These single samples include orchestration and polling. The native probe sampled the process tree around repeated preview open and close; a bounded sustained preview-memory comparison remains open.

## Physical acceptance

Use a disposable workspace and a copy of any backup. Record candidate identity, platform version, pass or failure and the action that reproduced a failure.

### Windows

1. Move, resize, maximize and restore the window. Try Snap and the caption controls at laptop scale and a higher display scale. Check narrow Library, editor, Settings and three panes in Light, Dark and OLED.
2. Use only the keyboard to traverse Library, command search, context menus, editor tools, preview Find and dialogs. Verify visible focus, Escape focus return, text selection and an IME composition. Repeat with Windows reduced motion, high contrast and Narrator.
3. Select several resources, drag them to a collection, drop disposable files from Explorer, then drag a managed copy into Explorer and compare its bytes. Exercise native clipboard and duplication. Check Activity taskbar progress, Close to tray, restore and explicit Quit.

### Samsung Galaxy S24 Ultra and real Wi-Fi

1. Install the signed Next engineering APK alongside the original app. On Windows start hosting over the intended private Wi-Fi. Discover the host, scan the QR, compare codes, approve and assign a disposable workspace.
2. Browse and search. Open a rich managed note, image and PDF. Download them, disable Wi-Fi and read the retained copies. Reconnect and check a newly saved revision.
3. Submit Review feedback and verify its evidence in the desktop Inbox. Submit a known workspace ZIP, approve Restore as New and verify its contents. Revoke the workspace grant and check withdrawal.
4. Restart both apps. Check host-address recovery under the same identity, then put the laptop to sleep and resume. Record camera, connection, focus, TalkBack and any meaningful tactile behavior observed on hardware.

## Remaining engineering gates

Rich PDF layout is a functional blocker. Full rendered Word coverage, combined deep source and Review portability, force-kill during merge, and abandoned stage cleanup are open. The restore test covers termination on both sides of publication. The native probes cover selected application and OS integrations. Physical Windows Explorer drops, Snap, IME, live display scaling and screen-reader testing are pending, as are Samsung camera, real Wi-Fi and sleep/resume. Broad theme contrast and high-contrast accessibility, the remaining original-versus-Next screens and a sustained preview-memory comparison remain unqualified.

Destructive in-place replacement is intentionally omitted. Electron ZIP v9–10 remain refused where linked identity evidence cannot be verified. Review triage leaves document content untouched. These decisions are distinct from open functional and qualification work.
