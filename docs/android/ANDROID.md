# Vaultor for Android

Reviewed 2026-10-23. Current published APK: **0.1.0-alpha.28 / versionCode32**, package com.vaultor.app, original signer, minAPI36/target37, protocol3, production diagnostics disabled. Use [Windows0.16.1](../desktop/releases/v0.16.1.md) for the current compatible host; imports/partial6 need the0.16 host contracts, Reviews need reviews:1 and downloads companionSnapshots:1. Install the host first, then the [Android prerelease](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/android/v0.1.0-alpha.28) over the existing app. Never uninstall/clear data as an upgrade or repair procedure. [Alpha.28 ledger](releases/0.1.0-alpha.28.md) owns exact artifact evidence; [R10 qualification](../development/qualification/R10.md) records completed integration/scale checks and unqualified physical/platform cases. W1–W3/R1–R10 engineering is complete; no next sprint is implicitly authorized.

## Responsibilities and authority

Android is a source-bound reader and collecting/Review companion, without a local Java host or independently writable workspace. React Native0.87.1/React19.2.3 owns product UI/motion; thin Kotlin owns pinned transport, protected credentials, stores, platform files/updates and semantic haptics. Restricted reader/media WebViews construct safe DOM from structured documents; no editable Tiptap engine mounts. build:editor is a compatibility command for generating reader assets. Unknown nodes retain original JSON and show a fallback; CSP/navigation restrictions prevent arbitrary scripts, HTML, styles, credential access and remote image fetching.

The general native apiFor boundary permits GET plus bodyless recency POST only. Separate narrowly scoped adapters admit checkpoint preparation, immutable Review delivery and confirmed collected imports/exports. They never grant original note/title/image-placement/organization/lifecycle writes or desktop Review status changes. Imports create new host resources through exact intent/receipt contracts; Share does not insert into a focused note. Native identity is host/workspace/generation/resource, never a name/address. JSON, files, SSE and asynchronous jobs retain their captured scope/epoch. Pinned TLS and workspace grants apply throughout; no redirects or approval bypass.

## Workflow ownership

- [Shell/source navigation](SHELL-NAVIGATION.md): Home/Library/Review, quick Sources separate from management, contextual Aa/settings, retained browsing/reader and centralized Back/focus.
- [Reader and legacy recovery](READER.md), [reader context](READER-CONTEXT.md), [media](MEDIA.md): safe saved-document rendering, journeys/anchors/find, temporary viewers and original-file output.
- [Offline reading](OFFLINE.md): hash-verified atomic checkpoints, native search, budgets and persistent source locks.
- [Review capture](REVIEW-CAPTURE.md) and [delivery/status](REVIEW-SYNC.md): protected drafts, frozen queued bodies, durable exact-source retries and desktop triage reconciliation.
- [Collected imports](IMPORTS.md): cold/warm Share and pickers, owned encrypted bytes, explicit destination, independent native queue, host conversion/provenance and owner-approved ZIP import-as-new.
- [Exports/connections/updates](EXPORTS-AND-CONNECTIONS.md): connected-only host full ZIP, partial6/offline Markdown with honest coverage, SAF/Share consent, discovery candidates and cryptographically verified APK updates.
- [Interaction foundations](INTERACTION-FOUNDATIONS.md): hybrid motion/theme/haptic implementation; [Android UI philosophy](../design/ANDROID_UI_PHILOSOPHY.md) is the design contract. [Capture trace](HAPTIC-CAPTURE-TRACE.md) is a build-gated diagnostic procedure.

## Storage and upgrade invariants

The evictable saved-note cache (12notes/8MiB,32sessions), retained companion SQLite/files, encrypted legacy recovery, protected Review AtomicFile, collected-import SQLite/encrypted originals, export derivatives and updater staging are separate owners. Evicting downloads/temporary previews cannot acknowledge or delete pending Reviews/imports/legacy bytes. Reading files/local indexes rely on Android sandbox/device encryption; protected journals/credentials use Keystore encryption. Unsupported/corrupt stores fail visibly without clearing data. Key loss is not fixed by resetting journals.

Legacy recovery retains all draft versions, exact uncertain sent bodies/base revisions, pending creation/organization/lifecycle UUIDs and encrypted media-input originals. It never replays writes on reconnect/source change or acknowledges recovery on export. Its private plaintext ZIP contains readable Markdown, exact JSON/identities and retained original bytes, excluding credentials/profiles/CA/device tokens. An uploaded resource ID does not prove a note placement succeeded. Compare host state before manual recovery on desktop; never overwrite originals automatically. Removed hosts/old generations remain recoverable. See [READER.md](READER.md) for formats and meaning.

Production diagnostics default off; explicit -Diagnostics builds alone expose bounded native probes. API36/37 emulator evidence cannot certify Samsung motion/haptics, One UI/keyboard/providers, TalkBack speech, OEM background behavior, real Wi-Fi/LAN or Mac. Those remain user-owned/native-platform checks. Agents must never access or ADB-pair the user's phone.

## Windows development

Agents must never access, USB/wireless ADB-pair or install to the user's phone. Use explicit emulator serials on every ADB operation. Samsung/One UI results are user-only; stock Android tests do not certify Samsung Keyboard, actual Wi-Fi, gestures or hardware OLED.

Local isolated toolchain: `%LOCALAPPDATA%/VaultorAndroidDev`, SDK under `sdk`, Temurin JDK 17.0.20.1+1 under `java`, Gradle 9.4.1 under `gradle`. Desktop Java 25 is untouched. SDK command-line tools 15859902, build-tools 37.0.0, platforms android-36/android-37.0, NDK 27.1.12297006 and CMake 3.22.1. Android Studio GUI is not required or installed by this setup. Wrapper distribution SHA-256 is checked in. SDK licenses were accepted; WHPX acceleration is usable without OS/security changes.

AVDs: Vaultor_API36 (`android-36;google_apis;x86_64`) and Vaultor_API37 (`android-37.0;google_apis_ps16k;x86_64`). Run one at a time with 2 GiB RAM initially; use an explicit emulator port. Keep build logs/fixtures/screenshots outside Git.

```powershell
$dev = Join-Path $env:LOCALAPPDATA VaultorAndroidDev
$env:JAVA_HOME = "$dev/java/jdk-17.0.20.1+1"
$env:ANDROID_HOME = "$dev/sdk"
npm --prefix mobile ci
npm --prefix mobile run build:editor
npm --prefix mobile run check
npm --prefix mobile test -- --runInBand
npm --prefix mobile run test:editor
```

`mobile/android/local.properties` contains the local SDK path and is ignored. Gradle's preBuild task builds the reader from declared source/lock inputs: generated HTML/JS assets are intentionally ignored. `build-release.ps1` resolves Windows Store filesystem virtualization, isolates React Native plugin outputs from automatic IDE imports and uses in-process Kotlin compilation and a non-reused Gradle daemon. Do not stop unrelated IDE daemons or change editor settings to solve tool-path collisions. It privately reads the original Android signer, builds release/application-test APKs, and stages verified public artifacts under ignored `mobile/releases/<version>/`.

```powershell
. mobile/scripts/android-env.ps1
& mobile/scripts/build-release.ps1
# Start exactly one AVD; all subsequent ADB commands need its explicit serial.
Start-Process "$env:ANDROID_HOME/emulator/emulator.exe" -WindowStyle Hidden -ArgumentList '-avd','Vaultor_API36','-port','5554','-no-window','-no-audio','-no-snapshot','-gpu','swiftshader','-memory','2048'
& "$env:ANDROID_HOME/platform-tools/adb.exe" -s emulator-5554 install -r mobile/releases/0.1.0-alpha.28/Vaultor-Android-0.1.0-alpha.28.apk
```

The dot-sourced environment includes signing credentials: never print environment variables. The build helper removes its password variable afterward. Configure ignored local.properties for a different machine's SDK; the checked-in wrapper pins Gradle distribution/checksum. Android 17 uses AVD Vaultor_API37 and explicit port 5556/serial emulator-5556, after stopping the other emulator. Its image has 16 KiB pages. API36/37 emulator WebViews were 133.0.6943.137/145.0.7632.218.

`mobile/scripts/fixture-host.mjs` starts only an isolated disposable protected host using a freshly prepared compatible bundled runtime (VAULTOR_BUILD_BUNDLE overrides the fixture bundle). It creates two notes and a private temporary data directory. Run with an interactive stdin, read its public address/port, and reverse that port with `adb -s emulator-5554 reverse tcp:<port> tcp:<port>`. Install `mobile/android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk`; run `adb -s emulator-5554 shell am instrument -w -e fixtureAddress https://127.0.0.1:<port> com.vaultor.app.test/androidx.test.runner.AndroidJUnitRunner` against a clean **disposable** app profile. The test emits only a public comparison code in logcat tag VaultorPrototypeTest. Match it before sending `{"approve":"<six digits>"}` to the fixture helper. This is actual host approval, not a TLS/access bypass. `{"readNote":true}` reports only this fixture's saved body/revision; `{"stop":true}` gracefully stops its owned host. Storage tests temporarily replace/restore the fixture app's encrypted local state; do not run against real data.

R1 checks use explicit ReaderUpgradeTest methods (seed against the previous APK before install-over; verify against the new APK) and ReaderUiTest after matching-code pairing. Older Prototype/Organization/Media editing instrumentation remains historical; do not run it as the reader acceptance suite. Always use disposable emulator state and explicit serials.

## Signing and future updates

Release signing is independent of desktop signing. Public certificate SHA-256: `af1123bd0be38ee48ce61b4f40f3667c4fe740910b64005d3d21dacd83de2567`; policy is in `mobile/release-trust.json`. The keystore and password are outside Git under the local toolchain's owner-restricted `signing` directory. An owner-restricted, byte-verified private backup exists at `C:\Users\Vaibhav\.vaultor-private\android-signing`; it is a separate path on the same laptop, **not** an off-device disaster backup. Loss of both copies prevents compatible upgrades. Never log/upload private files, replace the key or use template debug signing for published APKs. The checked-in template debug key is public development-only; debug uses a different application ID.

Release builds use VAULTOR_ANDROID_KEYSTORE and VAULTOR_ANDROID_KEY_PASSWORD environment values, read privately by Gradle. Increment versionCode for every new shipped APK; keep versionName/package/lock/Gradle consistent. Verify APK signature, package, version, minimum API and SHA-256 before publication. Publish an Android-only GitHub prerelease from a clean pushed immutable source tag, with verified APK/checksum and bounded compatibility notes. A source push, debug APK or draft release is not completed delivery.

Agents own each Android release. Complete the authorized sprint's installed-APK checks and update this guide, CODEBASE and `docs/android/releases/<version>.md`; commit/push the intended source and immutable `android/v<version>` tag. Build fresh from that tagged source, run `node mobile/scripts/verify-apk.mjs`, install the exact staged bytes in both emulator generations, then run `node mobile/scripts/publish-apk.mjs` for read-only preflight and again with `--publish`. It requires clean tagged/pushed source, original public signer/package policy and checksum, creates a prerelease draft, uploads APK/SHA256SUMS.txt/android-release.json, downloads and compares all assets, then publishes. Staged assets are downloaded independently to avoid the observed bulk-transfer stall; exact-byte checks remain mandatory. Existing assets are immutable: identical retries are accepted, differing bytes refused. Never move a published tag. Record actual final checksum/URL/results in a documentation-only follow-up. Desktop stable updater ignores this Android prerelease; no desktop installer is rebuilt for mobile-only changes.

The implemented updater uses credential-free official GitHub metadata, bounded private staging, apksig verification of the original signer/package/increasing versionCode and signed compatibility, followed by explicit Android installation permission and consent. Metadata/checksums alone never authorize installation. See [exports/connections](EXPORTS-AND-CONNECTIONS.md). Manual fallback: download the published APK and install over the existing app without uninstall/clear-data. Android16/API36+ is required.


## Focused verification

Use current reader/Review/import/export/source-boundary/update tests against disposable hosts and explicit emulator serials. Retired editing Prototype/Organization/Media instrumentation is historical and must not be used as current reader acceptance or weakened to permit old writes. Install-over checks seed nonempty protected state before upgrade and verify exact identities/bytes afterward. Test ordinary pinned approval, grant loss/replacement, uncertain delivery/process death and recovery independently of UI animation.

test-reading.ps1 supports explicit emulator-5554/5556 and the disposable HTTPS reader fixture; -Install installs staged release/test APKs without clearing data, and -Stage all runs services, reading/media/journeys/cold restore/OS/reduced motion/legacy recovery. Build-release.ps1 checks TypeScript before original-key compilation and staged APK verification. [R6](../development/qualification/R6.md), [R7–R9](../development/qualification/R7-R9.md) and [R10](../development/qualification/R10.md) retain actual installed results and corrected failures. Versioned ledgers under releases/ describe that release or candidate only; old stop gates and editing UI are not current instructions.
