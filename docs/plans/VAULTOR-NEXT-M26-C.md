# Vaultor Next M26-C direct-upgrade qualification

## Windows release gate

Windows 0.28.0 is the proposed Windows x64 release. The approved transition is a manual install-over with a one-time reset of verified Electron-managed data. Electron notes, attachments, local settings and credentials are intentionally discarded. The packaged installer uses `vaultor-next.exe`, identifier `com.vaultor.next`, and the per-user default install path. The production workspace is `%APPDATA%/com.vaultor.next/Workspace`. Development builds retain their experimental identifier. There is no first-run migration.

Approved predecessors are the original default-path per-user Windows x64 0.27.0, 0.26.0 and 0.25.2 payloads. Their release SHA-256 values are fixed in the disposable qualification driver. The known Electron registration, executable and application package establish identity. Each removed install file must match the hash of an original release payload member. The installer preserves unknown files and refuses reparse traversal. A bounded path- and hash-checked shutdown addresses only the old install's executable images. A post-install helper checks the new payload before claiming the one-time receipt and cleaning specific Electron data roots. Locked, unreadable and unrecognized entries are reported as residuals. Existing Next workspaces never enter the cleanup scope. Later installs share the same Next profile and skip the reset.

The transition installer and update manifest have Next-specific names. The old Electron updater still expects `resources/app/package.json` and relaunches `Vaultor.exe`. It must not see the Tauri installer. Next's Settings update row uses GitHub release discovery and verifies bounded installer downloads with a pinned Tauri key before the normal protected edit and restart barrier. Update signatures are separate from Authenticode.

The published Electron installers were previously verified against the original release trust root. The 15 focused Electron updater checks passed. Synthetic native Windows tests exercised exact-file cleanup, preserving locked and unexpected files, refusing a junction, and preserving its external target bytes. This workstation contains the live installation and was not used for install-over. The separate hosted Windows job is intended to qualify fresh install, the three predecessors, a second Tauri install, protected drafts, managed bytes, and ordinary uninstall in disposable profiles. Publication remains gated on completed native qualification, a genuine signed update round trip and the exact release installer.

The [staged 0.28.0 candidate](../desktop/releases/v0.28.0.md#staged-candidate) records the clean build hash, independent Tauri signature check, tamper refusal and NSIS payload inspection. Next's production frontend and browser bundle compiled. All 79 Rust library tests, 113 Next frontend tests, scoped lint and 17 Help checks passed. The complete frontend rerun used two workers after the first run timed out waiting for Settings focus. The original Electron release selector ignored the staged Next asset set.

The hosted first pass produced a signed fixture, but the Windows file check loaded the helper assembly into the same PowerShell process that subsequently tried to replace it. The second helper compilation failed with a sharing violation. The retry executes the file check in its own PowerShell process. Hosted fixtures use a separate ephemeral signing key with a loopback feed and reduced compile-time optimization. The local production artifact uses the normal optimized profile and fixed production key.

## Android release gate

The published predecessor APK is `0.1.0-alpha.28` / code 32, `com.vaultor.app`, minimum API 36, target API 37 and arm64-v8a/x86_64. The downloaded APK matched SHA-256 `4b87dd8212f03c8db45395ea113e12761c2b1bb45185e1c7e5de6962aaba730b`, and `apksigner` verified the original certificate `af1123bd0be38ee48ce61b4f40f3667c4fe740910b64005d3d21dacd83de2567`.

The production build uses `0.1.0-alpha.29` / code 36, above the published code 32 and reserved Next candidate codes 33–35. The default Gradle build keeps the production ID, signer, SDK, ABIs and Android updater protocol. Its Java protocol-3 route and the Rust mobile-v1 adapter are separate. Old Java host data stays under the original host and workspace generation. A Rust host requires independent pairing and a grant.

The install-over passed on API 36 (`emulator-5592`) and API 37 (`emulator-5590`). The downloaded alpha.28 paired with a fixture using the verified Windows 0.27.0 Java bundle. The old app's verifier accepted the exact signed alpha.29 bytes before Android installed them over alpha.28 with the same package UID. The paired profile, selected source, downloaded note, Review draft, frozen queued Review, decrypted collected original and reader preferences matched before and after upgrade and a cold restart. The upgraded app reconnected with its original pinned host approval and read the same note from the Java host.

The production APK also paired separately with the M26-B Rust host (`96e94860ecdf7f328423b82bf06939be9f5992a0`) and passed Android ZIP approval, rejection, receipt digest and exact restored managed-byte checks on both APIs. The Docker host check verified pinned TLS, workspace ownership, grants, note readback, restart, grant withdrawal and revocation. The named Android update checks verified exact installed APK trust, refusal of same-code and tampered bytes, feed selection and interrupted staging. The published alpha.28 app accepted the production APK through Android's file picker and kept it verified after installation permission was declined. [Android release procedure](../android/ANDROID.md#signing-and-future-updates).

The Help reconciliation covers the Platforms, What's New and Next articles and the Android transfers and update catalogue entry. The previous Mac Help baseline was reconciled against the verified 0.27.0 Mac release record. Android has no Help renderer and neither desktop installer was rebuilt for this release. Help validation covered 43 features and 16 articles, and all 17 Help checks passed.

This change reuses M26-B evidence for protected drafts, archive migration, Restore as New, Merge, PDF export and indexing, and browser organization. The release changes neither the Rust host nor the desktop frontend runtime. [M26-B qualification](VAULTOR-NEXT-M26-B.md).

## Host compatibility

| Host | Android alpha.28 | Android alpha.29 |
| --- | --- | --- |
| Windows 0.27.0 original Java host | Existing supported route, used to seed the upgrade fixture | Same pinned connection retained and verified on API 36 and 37 |
| Vaultor Next Rust host | Unsupported | Separate verified pairing and owner grant in the M26-B engineering runtime |

There is no production Windows Next host release. The Rust qualification used isolated Linux/amd64 Docker and emulator loopback, so physical Android, camera, Wi-Fi and Samsung acceptance remain open.

## Android publication

The clean release source is `f164eba31da75ea0d3f71bfa83f508d2bd49f8ce`. `packageRelease` regenerated the signed APK, and its digest matched the bytes installed during both direct-upgrade tests. The immutable tag is `android/v0.1.0-alpha.29`. The publication script downloaded and byte-compared all three staged assets, then published the [Android-only prerelease](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/android/v0.1.0-alpha.29).

Anonymous downloads of the public APK, `SHA256SUMS.txt` and `android-release.json` matched the release staging files. `apksigner` verified the original certificate and v2 signature. APK inspection confirmed `com.vaultor.app`, versionCode 36, min API 36, target 37 and arm64-v8a/x86_64. The original alpha.28 updater independently discovered the public release, downloaded the APK and verified the production digest on API 36.

On the disposable API 36 predecessor, selecting a byte-identical APK through the system picker and denying install permission preserved the verified candidate. Granting permission and confirming Android's actual Update prompt then replaced alpha.28. Package Manager confirmed the same UID, code 36 and the public APK digest. The upgraded MainActivity cold-launched successfully.

The API 37 grant revocation check used the already-installed production APK after a redundant reinstall stalled in the emulator's package manager. Both installed APKs were digest-checked against the production and instrumentation build files before the test. After owner revocation the Android client's authenticated workspace request returned HTTP 401. No app data was cleared during recovery.
