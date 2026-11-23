# Vaultor Next M26-B engineering qualification

M26-B combines the remaining original-product work and engineering acceptance. The candidate remains on `codex/vaultor-next-m1`. The [canonical parity register](VAULTOR-NEXT-PARITY.csv) retains the original requirements and historical evidence. Production packaging and publication are M26-C.

## Implemented

- Managed PDF body extraction on admission and explicit index rebuild. The native Windows and headless executables run a separate, memory- and time-bounded worker. Encrypted, empty and over-limit results do not supply a body. PDF search has document-level results.
- Owner-local linked PDF indexing and read-only preview. The source scanner checks the pinned identity and grant, withdraws superseded bodies, and publishes verified results to the active workspace. Connected search excludes linked records before counting or paging. PDF files stay external. Archives carry inactive relative descriptors and the observed fingerprint.
- PDF preview Find by matching page. Tab reaches the Find input and controls. Escape closes Find and restores toolbar focus. The password is scoped to the open preview.
- Browser organization commits notify the same mounted desktop workspace. The renderer refreshes saved organization through IPC and keeps its existing editor sessions.
- Normal workspace open refuses internal restore stage directories after an interruption. A subprocess test terminated a restore just before publication and after completion. The prepublication target stayed absent, the abandoned stage refused open, both existing databases passed integrity checks, and the completed original matched its expected bytes.
- The Android offline-export test follows the current Workspace archive label and verifies the selected resource's partial export request. All 112 Android Jest checks passed. The Android product source and APK are unchanged.

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
