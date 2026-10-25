# Current Mac release qualification handoff

Reviewed 2026-10-24. Mac arm64 0.18.1 qualification is complete and published. Both Windows x64 and Mac Apple Silicon pairs are fully qualified and published on the immutable `v0.18.1` release (`f8bd4743c2ee4225cc1597ddc16ddcfee06bca8e`), and the release is promoted to Latest. See [0.18.1 release ledger](releases/v0.18.1.md) for full qualification evidence, hashes, and platform verification.

## 0.18.2 pending qualification

Windows0.18.2 is published from immutable v0.18.2 / 6dc689e0065a0b6636fbccc7a77223a568eef14a; native Mac access was unavailable on2026-10-24 (trusted endpoint connection timed out). Keep complete-platform Latest at0.18.1. On arranged Apple Silicon access, check out immutable v0.18.2 and verify its exact source hash against the release ledger. Preserve package/lock0.18.2 and original signing identity. Build fresh UI/server/arm64 runtime and DMG using RELEASE-PROCESS.md. Run packaged native-navigation-check (Fill/reuse, real browser delivery classification, genuine error/save conflict, resize/scroll, reduced motion and restore), native-session-check, native-collection-check, first/save/PDF/relaunch, mount/codesign and original-key sidecar verification. Add only the absent DMG/sidecar using --publish --add-platform from that tag. Download/verify both public platform pairs and updater discovery before explicitly promoting Latest. Do not move the tag or replace Windows bytes; source corrections require another version. No Mac0.18.2 result is claimed.

## 0.18.1 Mac qualification summary

On an arranged Apple Silicon Mac mini (macOS 27.0.0 arm64, Temurin OpenJDK 25+36, Node v22.16.0), verified clean immutable `v0.18.1` source. Obtained the matching original private release key privately outside Git. Built fresh UI, embedded backend JAR and pinned arm64 JRE into original-key `Vaultor-0.18.1-mac-arm64.dmg` (280,180,540 bytes, SHA256 `ac61e4d95d3c8d2ff0e54eec63165b70f49f04cdd54dcddddfe105f1c9d41712`) and `.dmg.vaultor.json`. Verified ad-hoc codesign (`codesign --verify --deep --strict`), valid DMG CRC32 checksums (`hdiutil verify`), read-only mount, Applications symlink and standard Gatekeeper consent.

Native qualification passed:
- Packaged first/save/PDF/relaunch (`native-owned-smoke.mjs`) with system Java removed from PATH (`/usr/bin:/bin`). Verified bundled runtime auto-start, note creation, typing, save indicator, PDF export and native PDF rendering, close-to-tray and session restoration across relaunch.
- Packaged native collection qualification (`native-collection-check.mjs`): 100 direct resources, immediate children, nested collections (`docs/android/releases`), 180 animated frames sampled during scroll reversals (no breadcrumb/title collisions, no overflow, `titleTop >= navBottom - 1`), Path disclosure dialog, Escape key handling, 1320/680/440px window sizes, prefers-reduced-motion emulation, All vs Hierarchy directory presentation, keyboard tree expansion (ArrowRight), server-persisted view preference verified across reload, and deep ancestry with 9 parent nodes and long 2-line title.
- Native folder qualification (`native-folder-check.mjs`): 204 files, empty directories, managed links, backlinks, code preservation, bounded review, themes/narrow layout, export and renderer restart.
- Native review qualification (`native-review-check.mjs`): review triage, counts/paging, original revision preservation, scoped entry, Escape, themes (Light/Dark/OLED), narrow layouts, preview switching (side/floating).
- Native transfer and workspace qualification checks: staged ZIP preview, commit, open, refresh, isolated destinations, workspace selection.
- Absent Mac pair uploaded using `npm --prefix desktop run publish:release -- --publish --add-platform --notes docs/desktop/releases/v0.18.1.md`. All four public release assets verified via GitHub metadata and SHA256 digests. Release promoted explicitly to Latest via `gh release edit v0.18.1 --draft=false --latest`.

## Next handoff guidance for future releases

For future releases requiring native Mac qualification: fetch and verify clean immutable tag against the GitHub release source commit; package/lock must agree. Obtain the matching original private release key privately outside Git; preserve `desktop/release-trust.json`. Follow RELEASE-PROCESS.md: npm ci; BUILD_VERSION/VITE_BUILD_VERSION; fresh UI, embedded JAR and pinned arm64 runtime; original-key DMG and `.dmg.vaultor.json`. Verify ad-hoc codesign, mount/Finder installation and normal Gatekeeper consent. Never disable security or replace existing Windows assets/tag.

Run compilation/shared regressions and disposable native checks appropriate to the release scope. After native qualification and original-key verification, add only the absent Mac pair from the exact tag with the documented `--publish --add-platform` route. Verify public assets, update ledgers, and explicitly edit to Latest only when the complete-platform gate is met.

## Compatibility and earlier exact-source records

Published Mac0.13.0 contains the accepted spatial desktop UI and host0.11 contracts (protocol3/archive3), without Reviews or full5/partial6. [Its ledger](releases/v0.13.0.md) preserves native mount/codesign/first/relaunch/PDF/tray and signed-asset evidence; [0.7.1](releases/v0.7.1.md) preserves earlier complete-platform evidence. A Windows client update cannot update the Mac host. Never open newer workspace databases or archives in an older host as rollback; preserve stopped-host private recovery data.

Earlier missing-platform records remain in their versioned release ledgers, including [0.8](releases/v0.8.0.md), [0.9](releases/v0.9.0.md), [0.10](releases/v0.10.0.md), [0.11](releases/v0.11.0.md), [0.12](releases/v0.12.0.md), [0.14](releases/v0.14.0.md), [0.15 candidate](releases/v0.15.0.md) and [0.16](releases/v0.16.0.md). They are compatibility/evidence records, not parallel active release queues. Backfilling any absent platform pair needs that exact clean immutable tag, original key and native qualification; a source fix always needs a higher version. The unpublished0.15 candidate is not a release tag to publish as an update. The0.16.1 editor security correction makes affected0.16.0 non-equivalent.

Real two-device acceptance, when arranged, must cover normal CA trust/code approval, workspace grants/revocation/generation, dirty-note conflicts, saved-change reconciliation, host shutdown/reconnect/sleep and source-bound transfers/Reviews. Loopback emulators or separate local hosts do not certify Wi-Fi/mDNS/firewall/OS behavior across actual Mac and Windows devices. Samsung/One UI/TalkBack/tactile/OEM acceptance remains user-owned; no agent phone access.


## 0.19.0 pending qualification

Windows0.19.0 is published from immutable ad10135a6defc11e4b1836f4f4223f05112f885f/v0.19.0 and adds owner-local linked folders; no Mac filesystem-writing support is claimed. Use exact immutable v0.19.0 after Windows publication, preserve version/lock and original signer, and build fresh UI/server/native arm64 runtime/DMG on Apple Silicon. Confirm Linked sources registration is unavailable and remote/portable references grant no filesystem authority. Run native-navigation, native-session, native-collection and owned first/save/PDF/restart checks, themes, mount/codesign and sidecar verification. Only then add the absent original-key DMG/sidecar with --add-platform and verify public pairs/updater before promoting Latest. No Windows evidence substitutes for native Mac checks. Never move the tag or repair code underneath it.
