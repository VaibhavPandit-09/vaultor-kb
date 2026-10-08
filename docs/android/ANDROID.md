# Vaultor for Android

Reviewed 2026-10-09. A1 implementation and emulator gates passed; publication is the remaining release gate. [The tracker](../plans/android-plan.md) owns sprint scope. This guide owns the implemented mobile boundary, local setup and APK delivery. Desktop/Mac 0.7.1 remains unchanged.

## Prototype boundary

`mobile/` contains React Native 0.87.1 / React 19.2.3, WebView 14.0.1 and a locally bundled Tiptap 3.31.4 editor. Permanent package `com.vaultor.app`, first version `0.1.0-alpha.1`, versionCode 1. Minimum API 36 (Android 16); compile/target API 37 (Android 17). Android-only tags use `android/v…`; desktop versions/update feeds are separate.

A1 implements manual private IPv4 HTTPS enrollment, matching-code host approval, remembered native credentials, capability/workspace identity checks, the first 30 note titles, conditional editing and one protected local draft. Native code owns transport and AndroidKeyStore AES-GCM/AtomicFile storage in noBackupFilesDir; credentials never enter React state, WebView, URLs or logs. Android backup is disabled. The observed host CA is enrollment-only: no HTTP or credential is sent through the observation socket. All actual requests validate the selected CA chain, hostname and host identity; redirects and public addresses are refused. Approval must be matched on the host. A1 uses the existing server's `desktop` enrollment kind with the explicit device name **Vaultor Android**, avoiding a server contract change.

The bundled `file:///android_asset/editor.html` has a restrictive CSP and bounded, typed bridge. Network/image loads and arbitrary navigation are disabled; native API operations are allowlisted. Current schema nodes/marks/attributes are retained. Unsupported JSON is kept and unsafe editing/saving is blocked. Image placements currently show descriptive placeholders, preserving their resource IDs and attributes; real image previews/insertion belong to A4. Saves require If-Match; failures retain the journal. An acknowledged save clears only its exact edit version. A conflicting draft blocks editing instead of overwriting either version; A2 adds recovery choices and complete lifecycle handling.

This is a narrow prototype, not desktop parity. No discovery, binary/SSE adapter, full browsing, host switching, note creation, image upload, complete recovery UI or in-app updater exists yet. One retained draft must be resolved/reopened before editing another note. No offline synchronization or Android-hosted server. Themes/motion/mobile browsing follow their planned gates.

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

`mobile/android/local.properties` contains the local SDK path and is ignored. Gradle's preBuild task builds the editor from declared source/lock inputs: generated HTML/JS assets are intentionally ignored. `build-release.ps1` resolves Windows Store filesystem virtualization, isolates React Native plugin outputs from automatic IDE imports and uses in-process Kotlin compilation and a non-reused Gradle daemon. Do not stop unrelated IDE daemons or change editor settings to solve tool-path collisions. It privately reads the original Android signer, builds release/application-test APKs, and stages verified public artifacts under ignored `mobile/releases/<version>/`.

```powershell
. mobile/scripts/android-env.ps1
& mobile/scripts/build-release.ps1
# Start exactly one AVD; all subsequent ADB commands need its explicit serial.
Start-Process "$env:ANDROID_HOME/emulator/emulator.exe" -WindowStyle Hidden -ArgumentList '-avd','Vaultor_API36','-port','5554','-no-window','-no-audio','-no-snapshot','-gpu','swiftshader','-memory','2048'
& "$env:ANDROID_HOME/platform-tools/adb.exe" -s emulator-5554 install -r mobile/releases/0.1.0-alpha.1/Vaultor-Android-0.1.0-alpha.1.apk
```

The dot-sourced environment includes signing credentials: never print environment variables. The build helper removes its password variable afterward. Configure ignored local.properties for a different machine's SDK; the checked-in wrapper pins Gradle distribution/checksum. Android 17 uses AVD Vaultor_API37 and explicit port 5556/serial emulator-5556, after stopping the other emulator. Its image has 16 KiB pages. API36/37 emulator WebViews were 133.0.6943.137/145.0.7632.218.

`mobile/scripts/fixture-host.mjs` starts only an isolated disposable protected host using the existing 0.7.1 bundled runtime (or VAULTOR_BUILD_BUNDLE). It creates two notes and a private temporary data directory. Run with an interactive stdin, read its public address/port, and reverse that port with `adb -s emulator-5554 reverse tcp:<port> tcp:<port>`. Install `mobile/android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk`; run `adb -s emulator-5554 shell am instrument -w -e fixtureAddress https://127.0.0.1:<port> com.vaultor.app.test/androidx.test.runner.AndroidJUnitRunner` against a clean **disposable** app profile. The test emits only a public comparison code in logcat tag VaultorPrototypeTest. Match it before sending `{"approve":"<six digits>"}` to the fixture helper. This is actual host approval, not a TLS/access bypass. `{"readNote":true}` reports only this fixture's saved body/revision; `{"stop":true}` gracefully stops its owned host. Storage tests temporarily replace/restore the fixture app's encrypted local state; do not run against real data.

## Signing and future updates

Release signing is independent of desktop signing. Public certificate SHA-256: `af1123bd0be38ee48ce61b4f40f3667c4fe740910b64005d3d21dacd83de2567`; policy is in `mobile/release-trust.json`. The keystore and password are outside Git under the local toolchain's owner-restricted `signing` directory. An owner-restricted, byte-verified private backup exists at `C:\Users\Vaibhav\.vaultor-private\android-signing`; it is a separate path on the same laptop, **not** an off-device disaster backup. Loss of both copies prevents compatible upgrades. Never log/upload private files, replace the key or use template debug signing for published APKs. The checked-in template debug key is public development-only; debug uses a different application ID.

Release builds use VAULTOR_ANDROID_KEYSTORE and VAULTOR_ANDROID_KEY_PASSWORD environment values, read privately by Gradle. Increment versionCode for every new shipped APK; keep versionName/package/lock/Gradle consistent. Verify APK signature, package, version, minimum API and SHA-256 before publication. Publish an Android-only GitHub prerelease from a clean pushed immutable source tag, with verified APK/checksum and bounded compatibility notes. A source push, debug APK or draft release is not completed delivery.

Agents own each Android release. Complete the authorized sprint's installed-APK checks and update this guide/tracker/CODEBASE and `docs/android/releases/<version>.md`; commit/push the intended source and immutable `android/v<version>` tag. Build fresh from that tagged source, run `node mobile/scripts/verify-apk.mjs`, install the exact staged bytes in both emulator generations, then run `node mobile/scripts/publish-apk.mjs` for read-only preflight and again with `--publish`. It requires clean tagged/pushed source, original public signer/package policy and checksum, creates a prerelease draft, uploads APK/SHA256SUMS.txt/android-release.json, downloads and compares all assets, then publishes. Existing assets are immutable: identical retries are accepted, differing bytes refused. Never move a published tag. Record actual final checksum/URL/results in a documentation-only follow-up. Desktop stable updater ignores this Android prerelease; no desktop installer is rebuilt for mobile-only changes.

A6 will use credential-free HTTPS update metadata plus expected Android APK signing identity, package and monotonically increasing versionCode. Metadata alone never authorizes installation; Android signature verification and user installation consent remain required. No silent installation is promised. Before then, download the APK directly from its published release and install over the existing app; do not uninstall as an update instruction because that removes protected local data. The first install may require Android's per-source APK permission. Check Android version is at least 16 before installation.

## User-only S24 prototype check

Use a disposable workspace for this early milestone. Download the **single APK** from the Android release; JSON/checksum files are verification metadata, not install inputs. Install it, allow APK installation for that download source if Android requests it, and keep the desktop host awake with Sharing enabled on the same Wi-Fi. Enter its private IPv4 HTTPS address shown in Hosting. Allow local-network access if requested, compare the six-digit code with the host and approve **Vaultor Android**, then tap **I approved the matching code**. The host must support protocol 3 (current 0.7.1 Windows/Mac does); no desktop update is required for A1.

1. Confirm Android 16 or newer in the phone's own About phone screen; no agent connection is needed.
2. Open an ordinary fixture note, type with Samsung Keyboard, select text, use bold/italic and Undo/Redo, and tap Save. Confirm the edit on desktop.
3. Type another edit, wait for **protected on this device**, close/force-stop and reopen the app, then choose **Reopen protected draft**. Confirm recovery before saving.
4. Check keyboard/caret visibility and rotation. Report screenshots or descriptions voluntarily; agents do not control the phone.
5. Disconnect the host briefly during an edit, confirm Save fails without losing the protected draft, reconnect and retry Save. Reopening must not require repeat pairing.

There is no autosave, complete recovery/conflict choice UI, full Library, image display/upload, host switching or updater yet. Save explicitly. A revision conflict retains the draft and blocks editing; A2 supplies recovery choices. Do not uninstall/clear data to resolve a conflict. Image blocks are placeholders; their original JSON remains intact. Samsung/One UI 9 acceptance stays open until the user reports it.

## Actual validation ledger

On 2026-10-08–09: release/application-test Kotlin/Java/native/JS compilation, TypeScript, 3 Jest bridge tests and editor schema round-trip/unknown-content/Save-lock checks passed. Scoped lint: zero errors, nine existing no-void warnings. AndroidJUnitRunner/UI Automator: 3 tests passed on each emulator (matching-code pairing/editor plus 2 storage/address-policy checks). API37 permission denial and retry passed on the 16 KiB-page image; APK zip alignment/signature/package/API/arm64+x86_64 checks passed.

Installed release interactions passed: remembered approval after restart, actual Android16 software-keyboard taps/composition, undo/redo, protected unsaved draft recovery after force-stop, rotation with live content, keyboard/caret frames, unsupported-attribute Save refusal, renderer termination with safe retained draft state, conditional server save, Android17 force-stop/recovery/save, and failed Save followed by successful Retry after restoring emulator transport. A phantom update on Save lock/unlock was found and fixed (`setEditable` emits no content update); stale journal acknowledgements cannot mark newer edits protected. Same-signer install-over candidate retains state, but this first public APK has no earlier published version for a real version upgrade. Captured portrait/IME/landscape frames were inspected. Synthetic long input is not a performance or full IME certification. CJK/full Samsung selection, real LAN/Mac host, large fonts/Atlas scale, physical OLED and One UI8.5/9 remain unverified and belong to later/user gates.

Windows Store path virtualization/IDE Gradle collisions were solved with physical tool resolution and isolated plugin/in-process compilation. A corrupt cached Gradle ZIP was refused and replaced with checksum-verified official bytes. No OS security/firewall changes or phone access. Tooling still reports braces/sprintf-js advisories in RN/Metro/Jest chains (npm audit: 5 moderate/48 high records); no compatible fix is currently applied and forced RN downgrades are refused. This is an explicit build-tool limitation, not an all-clear security claim. Desktop/server/API/schema/archive/protocol 3 remain unchanged. [React Native release guidance](https://reactnative.dev/blog/2026/08/11/react-native-0.87) and [Android local-network permission guidance](https://developer.android.com/privacy-and-security/local-network-permission) informed setup; actual Vaultor evidence is the checks above.
