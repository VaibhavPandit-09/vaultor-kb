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

Windows and Docker source is `3c4d3790d54cb9caf67b15bee416672e4460007e`. Windows uses the optimized Rust profile and embeds the production Vite bundles. Docker targets Linux/amd64. The signed Android candidate remains at its M26-A4 application source, `beb1abf4437e2da24845171ad0d820b7711cb445`.

| Artifact | Local path or tag | SHA-256 or image ID |
| --- | --- | --- |
| Windows desktop | `next/src-tauri/target/release/vaultor-next-m26b.exe` | `2a016de2c4c36a179928fcd1e0b8c127ee5a358f1eb281064e2e51e1b75090eb` |
| Windows standalone host | `next/src-tauri/target/release/vaultor-next-host-m26b.exe` | `4938347be7e229d7ea83e0e9e307c64fb0cdb8ac7e49821792e5e817bf8d0584` |
| Signed Android engineering APK | `mobile/releases/0.1.0-m26a4.1/Vaultor-Next-Android-0.1.0-m26a4.1.apk` | `a60dca6fd1066ab776c22ca2e0810c8283a0f5fe5b7e66ba5989c4e570b30cc2` |
| Linux/amd64 host | `vaultor-next-m26b:local` | `sha256:4cc5d20718333e80504c5d6e1e9e887e848a0215b5151bb7dd0bae755d0fd745` |

## Automated regression and connected acceptance

- Windows Rust tests passed 72 library entries, two desktop binary tests and one worker integration test. The library run includes the process-kill test and its child fixture entry. The worker integration checks multipage text, empty content, malformed input, the page limit and password-protected and empty-password encryption. The Linux/amd64 image worker independently returned the expected third-page text and the encrypted outcome.
- The 113 Next Vitest tests, TypeScript production build, scoped ESLint and 112 Android Jest tests passed. Help governance validated 43 catalogue entries, 16 articles and 17 tests. The production desktop bundle contains the revised Next Help. The parity CSV retains 156 rows and 16 columns.
- Chromium exercised certificate trust for an isolated private CA, pairing and granted sessions, saved edit and reload, organization including nested collections and tags, grant withdrawal and sign-out. Docker exercised ownership, TLS identity and restart, exact managed streaming, scoped Review export, revocation and graceful shutdown. Evidence is in local `benchmarks/tauri-rust/raw/m26b-docker.json`.
- The signed engineering APK passed API 36 instrumentation for a native queued Android ZIP over ADB-reversed Rust HTTPS. The owner previewed, approved and rejected requests, and the test compared the restored managed bytes. This exercised an emulator and a disposable host.
- Docker sampled one minute of idle cgroup use at approximately 0.095% of one core and 9.37 MiB memory. Browser collection and tag creation took about 151 ms and 144 ms in single loopback samples with polling. These timings describe that fixture.

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

Full legacy export rendering, deep source/Review portability and interrupted transfer/merge qualification are open. The restore test covers process termination on both sides of publication. Recovering or cleaning abandoned stages outside a disposable test directory and additional interruption points require verification. Original-versus-Next visual and motion comparison and platform accessibility remain screen-specific. Physical Windows and Samsung acceptance are user-owned.

Destructive in-place replacement is intentionally omitted. Electron ZIP v9–10 remain refused where linked identity evidence cannot be verified. Review triage leaves document content untouched. These decisions are distinct from open functional and qualification work.
