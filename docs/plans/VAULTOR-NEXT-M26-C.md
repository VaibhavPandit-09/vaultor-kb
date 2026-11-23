# Vaultor Next M26-C direct-upgrade qualification

## Windows release gate

The verified predecessor set is Windows x64 0.27.0, 0.26.0 and 0.25.2. GitHub lists a canonical installer and signed protocol-1 sidecar for each. The installed 0.27.0 is a per-user Electron application. Its package identity is `personal.vaultor.desktop`, executable is `Vaultor.exe`, and the installer leaves AppData on ordinary uninstall. The Electron owner resolves the managed workspace relative to its user-data directory. Profiles, protected renderer state, linked grants, and update journals have their own local stores.

The original updater discovers only a stable version with the canonical Windows asset pair. It waits for the original process to exit, rechecks the staged installer bytes, passes `/S --updated /currentuser /D=<existing install directory>`, then reads `resources/app/package.json` and compares its version to the signed manifest before relaunching `Vaultor.exe`. The Next target is `com.vaultor.next.experimental` with bundling disabled and a separate AppData/SQLite owner. Giving it the old asset names or an original-key signature would satisfy neither the installed-version check nor the workspace migration requirement.

The existing legacy ZIP reader protects source data and admits compatible versions 1–8. It refuses legacy Review rows lacking the captured numerical revision and rejects formats 9–10 when linked descriptors lack the identity evidence required for rebinding. That path covers a reviewed import of eligible archives. A production install-over still needs a read-only migration from actual Electron profiles, ownership checks, staged SQLite and managed-byte verification, durable completion and an original installation recovery route. Host credentials and external grants require separate authority.

This workstation has the real Vaultor installation and lacks a verified disposable Windows installation surface. No installer was run against the live installation. Windows publication is gated on an isolated installed-upgrade run and a working migration, including explicit failure and restart recovery. Use an isolated Windows machine or VM containing an installed original predecessor and a disposable nonempty profile. Seed data using the original application and preserve its database and external originals for byte comparison. Qualify manual install-over first. Advertise automatic handoff only if the unchanged predecessor updater passes it. Keep all Next packages outside the existing stable feed until those checks pass.

The focused predecessor updater/security checks passed 15 tests. They exercise the real helper's refusal of changed bytes and missing installed executable, release discovery, staged signature/checksum verification, backup and failure recovery. These tests establish the existing contract. The install-over route requires independent native evidence.

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
