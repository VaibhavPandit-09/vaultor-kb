# Vaultor Next M26-B engineering qualification

M26-B combines the remaining original-product work and engineering acceptance. The candidate remains on `codex/vaultor-next-m1`. The [canonical parity register](VAULTOR-NEXT-PARITY.csv) retains the original requirements and historical evidence. Production packaging and publication are M26-C.

## Closure candidate changes

- The paged Rust PDF renderer uses selectable text, licensed Noto font faces, real table spans and verified managed images. The render and flush run as an Activity job before publication. Missing-glyph and corrupt-image fixtures refuse publication. [Export contract](../workspace/NOTE-EXPORTS.md#vaultor-next-pdf).
- A Windows Rust subprocess harness force-killed Merge at seven actual Activity boundaries, from before archive open through committed publication before stage cleanup. Each run reopened the database, checked integrity and destination drafts, verified original bytes, and retried without another set of resources. Restore was terminated before and after publication. Restart reconciled the registered stage and preserved an unrelated same-prefix directory. Locked, access-denied and identity-mismatched stages retained their receipts. The NTFS denial fixture preserved the staged bytes, recovered after permissions were restored and passed repeated cleanup. [Recovery contract](../workspace/WORKSPACE-TRANSFERS.md#verification-boundary).
- The owner can explicitly bind archived references to one selected local root as a batch. Vaultor opens exact relative files, checks their revisions and competing ownership, and applies the group in one transaction. The reader and scan start from committed identities. The [Review portability contract](../workspace/REVIEWS.md#vaultor-next) specifies evidence/status mapping and private data boundaries.
- Product source `5c247c1af937c7a8c7bbb34fbdd67f7a91b6bff8` passed 76 Rust host library tests plus the PDF worker integration and both Vite builds. Source `96e94860ecdf7f328423b82bf06939be9f5992a0` adds a tested boundary so paired PDF and Word exports cannot reveal the availability of owner-local linked files. The closure frontend passed 113 Next tests and scoped ESLint. Two original Java renderer tests generated the comparison fixtures. Help governance validated 43 catalogue entries, 16 articles and 17 checks. Next Help covers importing and exporting, workspace management and archive recovery. The final desktop Vite bundle contains the updated article.

### Rendered original and Next note exports

The same structured note, 240 × 80 PNG and saved title were rendered with the original Java exporter and optimized Windows Next `5c247c1a`. Both PDF pages are portrait A4 and were rasterized at 105 dpi. The images, Greek/accented text, inline marks, checked-list line, numbered list start, code lines, spanning cells, missing reference label and external link were present. Both PDFs have selectable text, contain a raster of the original dimensions and carry an annotation for the same external link. The page images show more compact vertical spacing in Next. The text and cell content stay readable within the page. Evidence is in local `m26b-closure-original-pdf.png`, `m26b-closure-final-next-pdf.png` and `m26b-closure-final-export-comparison.json`.

Microsoft Word also loaded and rendered the original and updated DOCX fixtures. Next now includes the saved title, a styled heading, highlight, bordered horizontal and vertical merges, an embedded managed image and web-link styling. The rendered image is left aligned on this fixture in Next and centered in the original. The visual check uses local `m26b-closure-original-word-1.png` and `m26b-closure-final-next-word-1.png`. The native fixture in `tauri-rust-2026-11-23T14-28-36.203Z.json` measured the rich PDF at 184 ms of Activity time, or 223 ms through the receipt including polling. The unsupported-glyph case refused publication.

The final `96e94860` candidate repeated the single-page structure checks and rendered a second matched fixture with 75 additional table rows. The original used five pages and Next used four. Extracted rows were present in sequence and once each. Next repeated the two column headings on every table page. Both preserved the original embedded image and last external link. The table and page-end image were visually inspected at 90 dpi. Local files include `m26b-original-multipage-*.png`, `m26b-qualified-multipage-*.png`, `m26b-qualified-multipage-comparison.json`, `m26b-qualified-next-pdf.png` and `m26b-qualified-export-comparison.json`. The final Windows reports are `tauri-rust-2026-11-23T14-40-34.640Z.json` and `tauri-rust-2026-11-23T14-43-48.522Z.json`. The latter verified that an unsupported-glyph attempt left the existing successful PDF byte-exact.

### Combined portability and native recovery

The optimized Windows `f062e562` fixture passed a combined archive with 100 Review rows, three inactive linked descriptors, nested collection memberships, a tag, a pin, a managed reference note and an exact 32 MiB managed original. The checked archive manifest was `be731b5903b661c1664a39927a6931427f86048496e832bd0e9c74349f446d89`. The managed original SHA-256 was `20f364a23762cb1a2e4f14f7036e9718ed806447caad2881a27fc4af14050415`. Restore preserved IDs in the new workspace. Merge mapped imported managed/linked resources and Review targets into an independently created destination and retained its parked draft. Exact replay reused the receipt and resource set. The saved author label, target metadata, captured revision, selection, comment, locator, current triage and timestamps survived, including after the mapped Review target entered Trash.

The native linked check compared encoded paths, URL fragments, two occurrences of one reference-style link and its backlink, raster asset bytes and a rename within a deep source tree. Exact NTFS roots worked after explicit authorization. A mismatched file left the entire binding group inactive. Revocation withdrew access. The linked source's Markdown files and PNG stayed byte-exact. See local report `tauri-rust-2026-11-23T14-10-50.715Z.json`.

The final optimized Windows candidate passed the same combined matrix. The run used archive manifest `d90672857b59037a07b2238dbe85e20fe61de4bc1d3b2fa51f7fa345c4dab626` and the same managed-original hash. The local report is `tauri-rust-2026-11-23T14-40-32.025Z.json`.

The Windows archive fixture passed nested file and folder import, original and derivative outputs, legacy v5 ZIP handling, Restore as New, Merge replay, a parked Recovery copy and a force-terminated 2 GiB import followed by successful reconciliation and retry. The first rich smoke exposed a corrupt CRC in the benchmark's tiny PNG. The renderer rejected that image before publication. The valid fixture rerun passed. See local report `tauri-rust-2026-11-23T14-09-55.077Z.json`. The staging test recovered space by removing the registered directory and confirmed repeat cleanup had nothing further to remove.

### Visual and accessibility follow-up

Matched Electron and Next captures used equivalent 100-note fixtures at 1200 × 820, DPR 1. Library expansion, compression, selection, note and Appearance matched their primary geometry. Settings was viewed in Light, Dark and OLED at 65% opacity, with additional 800 × 650 and 760 × 540 containment checks. Next presents added installed-app settings, Hosting and a Reduced motion option. The Next fixture passed shared two-pane editing, Settings preserving mounted editors, Escape returning focus, the shortcut context menu, Command palette and the bundled Help flow. The Library resource button, Opacity slider, Theme radio group, archived-source dialog and its three checkboxes appeared with accessible names in the WebView2 tree. Space selected a descriptor and Escape returned focus to the Workspace transfers trigger. A focused Library row stayed visibly outlined with forced colors in the WebView2 emulation. See local `m13-*` and `m26b-closure-archived-references.png` captures, `electron-java-2026-11-23T14-02-46.648Z.json` and `tauri-rust-2026-11-23T14-21-21.626Z.json`.

The optimized editor probe additionally opened a 181 × 12 table, code, repeated image placements and mixed content. Filtering and clearing preserved saved content, TSV paste and shared Undo/Redo worked, and restart readback was exact. See `tauri-rust-2026-11-23T14-10-35.251Z.json`. The M13 probe initially used retired save, navigation and pane selectors. Corrected driver runs passed. An initial archived-source assertion counted background AX nodes and was corrected to inspect the actual dialog subtree.

Matched Settings motion ran both installed Electron and Next through 32-frame samples for opening, changing categories and closing. Light, Dark and OLED were exercised. The native Next Settings title pixel sample gave approximate contrast ratios 10.1, 17.7 and 17.1 respectively at 65% opacity. That sample covers one title and its composited background. See the two `2026-11-23T14-31-40.698Z` reports and `m26b-closure-settings-contrast.json`.

The native duplicate-view run verified Ctrl+Alt+PageDown/PageUp focus switching between two views of the same note, both views surviving restart, and closing one while the other remained editable. Its later pointer reorder condition timed out. The final linked-source probe passed discovery, paging, scoped search, encoded paths and repeat references, a source-to-Pinned pointer gesture, large Markdown editing with explicit Save, exact CRLF bytes, protected revision conflict, moved-root reauthorization and revocation. Earlier driver attempts acted before the organization commit completed or encountered a live NTFS root lock. The corrected fixture waits for that commit and can move the disposable root during a closed process interval after the lock clears. See `tauri-rust-2026-11-23T14-34-45.310Z.json` and `tauri-rust-2026-11-23T14-54-18.601Z.json`.

### Closure preview and performance

The `5c247c1a` native preview probe exercised PDF indexing, Find, side-to-floating expansion, a wrong password and repeated unlock, workspace-scope refusal, and checked linked-file revocation. Twelve linked PDF cycles reached 477.96 MiB of process-tree private commit before settling at 316.69 MiB from 387.88 MiB. Six protected PDF cycles finished at 594.92 MiB from 738.58 MiB. Six managed PDF/image/audio and dense-pane cycles peaked above 1 GiB of sampled private commit and settled at 518.69 MiB and 253.82 MiB working set after 30 seconds. At that endpoint the WebView2 renderer held 238.68 MiB private, the GPU process 194.61 MiB private, and the process tree held 3,905 handles. Sampled settled CPU was 2.28% of one core. The elevated in-cycle values fell after idle. These bounded observations do not establish hours-long leak freedom. See `tauri-rust-2026-11-23T14-30-03.029Z.json`.

On the same optimized build, the protected-draft commit was 151 bytes per measured request, at a 34.8 ms median across 20 timed commits, with exact saved readback and draft clearance for all 24 including warmups. The 1020 KiB note measured 255.65 ms median from an on-screen open through editability and the next frame, and 9.20 ms median across 100 input-to-frame probes. Startup measured 1,370 ms for the first profile and 1,277 ms median across three restarts. Those samples ran during other qualification jobs and were slower than the earlier checkpoint samples. The native PDF fixtures measured 438 ms for managed import through saved body readback and 275 ms for linked admission through an indexed match, including polling and fixture work. Historical CSV rows and workbook formulas are retained.

Sequential optimized runs used the same 1020 KiB note recipe on the previous `e21298f7` and final `96e94860` builds. The first pair measured 185.10 ms and 318.25 ms median across 20 opens, 910 ms and 991 ms median warm restart, and 243.45 ms and 239.35 ms median visible title-search results. The diagnostic repeat measured 185.35 ms and 180.70 ms median opening, and three direct read round trips of 295.8/21.4/20.6 ms and 234.5/28.2/19.1 ms. The slower candidate opening did not reproduce. The measurements leave variation in whole-app readiness and exclude physical input latency. See `tauri-rust-2026-11-23T14-43-12.668Z.json`, `tauri-rust-2026-11-23T14-40-46.871Z.json`, `tauri-rust-2026-11-23T14-45-41.966Z.json` and `tauri-rust-2026-11-23T14-46-11.789Z.json`. The canonical CSV retains its 17,730 historical observations and appends 2,725. Workbook files are retained.

### Closure engineering artifacts

Windows desktop, standalone host and Linux/amd64 Docker use `96e94860ecdf7f328423b82bf06939be9f5992a0`, with the optimized Rust profile and production Vite assets. Android's signed M26-A4.1 APK uses `beb1abf4437e2da24845171ad0d820b7711cb445`. These are engineering artifacts.

| Artifact | Local path or tag | SHA-256 or image ID |
| --- | --- | --- |
| Windows desktop | `next/src-tauri/target/release/vaultor-next-m26b-qualified.exe` | `a0855c6a6511a28cdcaa53582cf6fd2c91103311b13a683d28383894bf169d0b` |
| Windows standalone host | `next/src-tauri/target/release/vaultor-next-host-m26b-qualified.exe` | `55449bdf1ccf5ff76de2f4beff591181a65d2aaa705fbbc00e09509170d9fc7b` |
| Signed Android engineering APK | `mobile/releases/0.1.0-m26a4.1/Vaultor-Next-Android-0.1.0-m26a4.1.apk` | `a60dca6fd1066ab776c22ca2e0810c8283a0f5fe5b7e66ba5989c4e570b30cc2` |
| Linux/amd64 host | `vaultor-next-m26b-qualified:local` | `sha256:1543f81bc522bbb6c8ea8f155dd124f5bd4362098008094e87f7b66725cfaf9f` |

The final Windows host verified TLS, matching grants, exclusive ownership, independent headless service, an owner-approved ZIP and a browser collection change visible in already-mounted desktop Collections. See `tauri-rust-2026-11-23T14-40-33.974Z.json`. The final Docker and Chromium run passed isolated CA trust, pairing, cookie scope, saved edits, derivative PDF digest, Review evidence, grants, organization, restart and graceful stop. See `m26b-qualified-docker.json`. The same signed Android APK passed API 36 instrumentation against the preceding `5c247c1a` Docker build with approval, rejection and byte-exact managed restore. See `m26b-closure-final-docker.json`.

## Previous checkpoint evidence

The following checkpoint observations use the separately identified builds. They provide the baseline for the closure checks.

### Implemented

- Managed PDF body extraction on admission and explicit index rebuild. The native Windows and headless executables run a separate, memory- and time-bounded worker. Encrypted, empty and over-limit results do not supply a body. PDF search has document-level results.
- Owner-local linked PDF indexing and read-only preview. The source scanner checks the pinned identity and grant, withdraws superseded bodies, and publishes verified results to the active workspace. Connected search excludes linked records before counting or paging. PDF files stay external. Archives carry inactive relative descriptors and the observed fingerprint.
- PDF preview Find by matching page. Tab reaches the Find input and controls. Escape closes Find and restores toolbar focus. The password is scoped to the open preview.
- Browser organization commits notify the same mounted desktop workspace. The renderer refreshes saved organization through IPC and keeps its existing editor sessions.
- Normal workspace open refuses internal restore stage directories after an interruption. A subprocess test terminated a restore just before publication and after completion. The prepublication target stayed absent, the abandoned stage refused open, both existing databases passed integrity checks, and the completed original matched its expected bytes.
- The Android offline-export test follows the current Workspace archive label and verifies the selected resource's partial export request. All 112 Android Jest checks passed. The Android product source and APK are unchanged.

### Engineering artifacts

The Windows desktop uses `e21298f7e90d05128182c406282af06afe9229ec`. The standalone Windows host and Linux/amd64 Docker image use `3c4d3790d54cb9caf67b15bee416672e4460007e`. The desktop follow-up scopes the Open Notes drop target to active dragging. The browser build produced byte-identical asset names after the change. Windows uses the optimized Rust profile and the production Vite bundles. The signed Android candidate remains at its M26-A4 application source, `beb1abf4437e2da24845171ad0d820b7711cb445`.

| Artifact | Local path or tag | SHA-256 or image ID |
| --- | --- | --- |
| Windows desktop | `next/src-tauri/target/release/vaultor-next-m26b.exe` | `f7fac0fc085a86b3844dff585dfa82c3f54af728bbbefc96bab43753f2f0c774` |
| Windows standalone host | `next/src-tauri/target/release/vaultor-next-host-m26b.exe` | `4938347be7e229d7ea83e0e9e307c64fb0cdb8ac7e49821792e5e817bf8d0584` |
| Signed Android engineering APK | `mobile/releases/0.1.0-m26a4.1/Vaultor-Next-Android-0.1.0-m26a4.1.apk` | `a60dca6fd1066ab776c22ca2e0810c8283a0f5fe5b7e66ba5989c4e570b30cc2` |
| Linux/amd64 host | `vaultor-next-m26b:local` | `sha256:4cc5d20718333e80504c5d6e1e9e887e848a0215b5151bb7dd0bae755d0fd745` |

### Automated regression and connected acceptance

- Windows Rust tests passed 72 library entries, two desktop binary tests and one worker integration test. The library run includes the process-kill test and its child fixture entry. The worker integration checks multipage text, empty content, malformed input, the page limit and password-protected and empty-password encryption. The Linux/amd64 image worker independently returned the expected third-page text and the encrypted outcome.
- The 113 Next Vitest tests, TypeScript production build, scoped ESLint and 112 Android Jest tests passed. Help governance validated 43 catalogue entries, 16 articles and 17 tests. The production desktop bundle contains the revised Next Help. The parity CSV retains 156 rows and 16 columns.
- Chromium exercised certificate trust for an isolated private CA, pairing and granted sessions, saved edit and reload, organization including nested collections and tags, grant withdrawal and sign-out. Docker exercised ownership, TLS identity and restart, exact managed streaming, scoped Review export, revocation and graceful shutdown. Evidence is in local `benchmarks/tauri-rust/raw/m26b-docker.json`.
- The signed engineering APK passed API 36 instrumentation for a native queued Android ZIP over ADB-reversed Rust HTTPS. The owner previewed, approved and rejected requests, and the test compared the restored managed bytes. This exercised an emulator and a disposable host.
- Docker sampled one minute of idle cgroup use at approximately 0.095% of one core and 9.37 MiB memory. Browser collection and tag creation took about 151 ms and 144 ms in single loopback samples with polling. These timings describe that fixture.

#### Windows PDF, host and archive runtime

- WebView2 verified managed import and rebuild, found a third-page phrase, withdrew results in Trash and restored them. A linked change replaced the body under the same identity. Revocation withdrew the result and preview read permission, and the external file matched its original fixture revision exactly. PDF Find navigated to the matching page, exposed a named searchbox and close button in the WebView accessibility tree, and restored toolbar focus on Escape. Wrong-password retry, unlock, navigation, side-to-floating preview, close and reopen passed. Stale preview scope after a workspace switch refused. See local `tauri-rust-2026-11-23T10-24-09.031Z.json`.
- The Windows host probe verified TLS, grant withdrawal and revocation, exclusive workspace ownership, explicit Quit and an independent standalone host. After a browser collection commit, the already-mounted desktop Collections view repainted without a manual refresh. The incoming backup review verified and restored exact original bytes after owner approval. See local `tauri-rust-2026-11-23T10-22-18.180Z.json`.
- The native archive probe exercised nested imports, relative Markdown and managed image conversion, protected Recovery copies, exact original bytes, linked descriptors, Restore as New and Merge replay. A 2 GiB disposable import was interrupted with process termination, then reconciled and replayed. A 256 MiB attempt completed before the kill and did not qualify as an interruption. The original v5 fixture passed restore and merge replay, and an explicitly missing database refused open. See local `tauri-rust-2026-11-23T10-24-09.721Z.json`.
- The native Review probe checked evidence display, non-mutating triage, stale revision display, portable restore and exact-repeat merge. It retained 200 Review rows across the archive and merge scenario. It also checked NTFS descriptor mismatch refusal, exact rebinding, memberships, external original bytes, independent managed duplication, Pinned order and checked native-copy preparation and cancellation. That copy path does not exercise an Explorer drop. See local `tauri-rust-2026-11-23T10-28-45.373Z.json`.
- The same rich fixture produced Markdown, Markdown with assets, Word and PDF. Word XML contained the embedded PNG, horizontal and vertical spans, external link relationship and Unicode text. Markdown contained both spans. Poppler-rendered PDFs showed a material parity gap. Electron lays out headings, inline marks, a merged table, embedded image and link treatment. Next retains selectable text and Unicode in a plain layout and substitutes the image label. The unsupported-glyph fixture refused PDF creation safely.

#### Visual, keyboard and motion evidence

The installed Electron 0.27.0 reference from `7b7cf824e5f637b0918c49e8518b11054b1211f1` and Next captured populated Library, Collections, hierarchy and detail, Tags and tag actions, Pinned, Recents, Trash and the managed-note header. Review placement, type-filter labels, footer actions and some toolbar differences remain. Next's Light, Dark and OLED note captures and 900px, 1200px and 1800px layouts stayed horizontally contained at the tested emulated DPR settings. Tag removal returned focus to Add Tag. Settings dismissed under reduced motion without a retained transition element. Library and note comparisons use the `m17-original-*.png` and `m17-next-*.png` captures in local benchmark evidence. The first unpacked reference attempt failed before startup with missing ICU data. Captures use the subsequent successful installed reference.

The final Windows executable passed repeat visual, keyboard and PDF checks. The idle Open Notes end target was absent and the actual linked PDF opened read-only and rendered selectable text. The matching local reports are `tauri-rust-2026-11-23T10-32-16.387Z.json` and `tauri-rust-2026-11-23T10-32-17.369Z.json`.

#### Focused performance

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

The four original P0 cases passed the documented fixtures. The wider M26-B engineering gate remains open. Remaining cases include native pointer reorder, additional matched original-versus-Next workflow frames and motion, visual contrast across interactive states, and screen-reader behavior beyond the checked AX controls. Staging qualification exercises real termination, a live lock, NTFS access denial and an identity replacement. A standalone cleanup-versus-concurrent-import scenario was not run. The [physical checklist](#physical-acceptance) covers Explorer drag and drop, Snap, IME, live scaling, Narrator, Samsung camera and TalkBack, real Wi-Fi and sleep/resume.

This M26-B build remains available for engineering review and the user-owned physical checks. The separate [M26-C qualification](VAULTOR-NEXT-M26-C.md) records the production install-over and publication gates by platform.

Destructive in-place replacement is intentionally omitted. Electron ZIP v9–10 remain refused where linked identity evidence cannot be verified. Review triage leaves document content untouched. These decisions are distinct from open functional and qualification work.
