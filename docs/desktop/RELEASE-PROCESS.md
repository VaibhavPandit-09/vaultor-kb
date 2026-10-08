# Agent-owned release process

Reviewed 2026-10-08. This is the authoritative implementation-agent checklist. The user-facing steps are in [INSTALLATION-AND-UPDATES.md](INSTALLATION-AND-UPDATES.md); updater contracts/recovery are in [UPDATES.md](UPDATES.md). Agents must read this when making an installed-app change, and carry release preparation through to usable GitHub artifacts whenever access permits. Do not merely tell the user to rebuild.

## Scope and standing authorization

The user has authorized agents to own necessary version bumps, checks, packaging, Git commits/pushes, release tags, GitHub draft assets and publication for completed Vaultor updates. This does not authorize changing GitHub visibility, publishing user workspaces/credentials, replacing signing identity, disabling approval/TLS, paid services, installing on other devices, or declaring unverified platforms ready. Preserve unrelated changes. Never collect unrelated work into a release commit.

- UI, behavior, icons, bundled server, runtime/dependency or desktop configuration changes that affect installed apps require a higher stable `desktop/package.json` version and matching lockfile version. A build with no version bump is not a new update.
- Documentation-only changes and test-only changes with no shipped behavior do not need a new installer/tag. Commit/push their source and report that distinction.
- A development rebuild is only a local preview. Installers are snapshots; an old installer does not acquire new source changes.
- Use patch for compatible fixes/polish, minor for compatible new capabilities, and an explicitly reviewed major release for breaking contracts. Assess API protocol compatibility separately; do not increment protocol just because the app version changes.
- Release Windows x64 and Mac arm64 from the same source commit and version. Unsupported Linux/Mac Intel/Android packages are not promised. A partial platform release must be explicitly labeled and must not be advertised as a complete Windows/Mac release.

## Before building

1. Read CODEBASE, inspect `git status`, current version, original public key, latest GitHub release/tag and local artifacts. Review the actual requested change and docs. Never overwrite unrelated work or recreate the original private key.
2. Record intended version, source commit, supported targets, actual checks and blockers in release notes using [RELEASE-NOTES-TEMPLATE.md](RELEASE-NOTES-TEMPLATE.md). Keep notes under `docs/desktop/releases/vVERSION.md`; this is public metadata only.
3. Obtain native Windows and Apple Silicon build access. The Mac mini is available when arranged; if access is absent, prepare an exact [MAC-HANDOFF.md](MAC-HANDOFF.md) addition, and state that Mac artifact publication is blocked. Do not claim a Windows-produced DMG is verified.
4. Original private key normally lives in ignored `desktop/cache/release-signing/private.pem`, or at `VAULTOR_RELEASE_KEY`. The checked-in `desktop/release-trust.json` must remain unchanged. Transfer the key to the Mac privately only when authorized, outside Git with owner-only permissions. Never put it in release assets, logs, issues, chat, renderer state, portable archives or ordinary docs. Do not configure CI key storage implicitly. No key means no signed release for that machine.

## Version and build commands

From repository root, bump both package and lock versions once:

```text
npm --prefix desktop version patch --no-git-tag-version
npm --prefix frontend ci
npm --prefix desktop ci
```

For a planned minor/major, substitute the deliberately chosen version. Confirm package/lock agree. Do not bump independently on Mac; it checks out the agreed source version.

Windows PowerShell, from repository root:

```powershell
$releaseVersion = (Get-Content desktop/package.json | ConvertFrom-Json).version
$env:VITE_BUILD_VERSION = $releaseVersion
$env:BUILD_VERSION = $releaseVersion
npm --prefix desktop run build
npm --prefix desktop run prepare-server
npm --prefix desktop run package:release
npm --prefix desktop run publish:release
```

Apple Silicon macOS shell, from repository root, with Node, Java 25 and free Apple command-line developer tools:

```sh
npm --prefix frontend ci
npm --prefix desktop ci
export VITE_BUILD_VERSION="$(node -p "require('./desktop/package.json').version")"
export BUILD_VERSION="$VITE_BUILD_VERSION"
npm --prefix desktop run build
npm --prefix desktop run prepare-server
npm --prefix desktop run package:release
npm --prefix desktop run publish:release
```

`build` stages a clean UI directory and retains the previous copy under ignored desktop/cache, preventing accumulated obsolete asset hashes in installers. `prepare-server` follows `build`: the backend JAR embeds browser assets, so UI-only app releases still need a fresh JAR. The script uses pinned, checksum-verified platform Java runtimes. Installed apps need no system Java or Docker. `package:release` verifies the original signing identity and writes installers plus signed sidecars under ignored `desktop/releases/`; it never publishes automatically. `publish:release` without flags is a local signature/size/checksum/version preflight, not a GitHub mutation.

Run compilation and focused checks for the changed failure-prone behavior, plus package verification. Use native build/install checks on each target as appropriate; don't repeat broad API/Docker suites by default. Actual installation/native validation is separate from artifact-byte validation. Read the Mac handoff and existing installer/native scripts before invoking anything that affects the OS; use disposable storage. Never uninstall the user's real installation as a test.

## Commit, tag and draft publication

1. Finish tests and public release notes. Commit only intended changes, including docs/version/lockfile. Push the release commit to the intended branch; record its hash. GitHub login with repo access is required.
2. Ensure the final commit is checked out on both build machines. Rebuild if a post-build code/version change means artifacts no longer describe that commit. Preserve exact artifact pairs and actual native results. Signing and hash checks cannot prove source provenance, so the agent owns this correspondence.
3. Create and push an immutable version tag from the release commit (replace VERSION and BRANCH):

```text
git push origin BRANCH
git tag -a vVERSION -m "Vaultor VERSION"
git push origin vVERSION
```

Do not move an existing tag or overwrite any existing release asset. A correction gets a new version. The sole same-version exception is adding a previously absent, verified platform pair from the exact existing tag with --add-platform; byte-identical retries are allowed.

4. From repository root, stage the local target into a draft using reviewed notes:

```text
npm --prefix desktop run publish:release -- --publish --notes docs/desktop/releases/vVERSION.md
```

The helper verifies original-key signatures, exact size/checksum, package version, clean tree and remote tag pointing to HEAD; it discovers the repository through `gh`. It creates a draft and uploads only the installer and its `.vaultor.json`. It reuses identical existing draft assets on retry and rejects different bytes. Published releases require explicit --add-platform for missing-platform delivery or identical retries; normal upload refuses them. It never uploads application storage, host backups or private keys. GitHub availability/permissions failures leave publication incomplete and must be reported.

5. On the other native machine, check out the same tagged commit, build/verify, and run the same publisher to add that platform pair to the existing draft. If transferring already verified artifacts to one publishing machine, use `--platform darwin` or `--platform win32` to preflight/upload that target; this is not native validation.
6. Inspect the draft and its downloaded pairs. Require four assets for a complete release: Windows EXE + sidecar and Mac DMG + sidecar. Confirm version, commit, source trust, actual platform checks, compatibility, warnings and recovery directions. Update draft notes if necessary using `gh release edit vVERSION --notes-file docs/desktop/releases/vVERSION.md`.
7. When the supported-platform release gate is met, publish from the checked-out root:

```text
gh release edit vVERSION --draft=false --latest
```

If only one target can ship, explicitly name it in notes, describe the missing target and choose a non-latest partial release with `--latest=false`; never imply it updates the other platform. Publication is authorized for complete requested releases; stop only for real missing access/keys/validation, not a routine new permission request. Record a blocker and a concrete handoff instead of silently publishing an incomplete release as complete.

## Handoff to the user

Return the published GitHub release URL, new app version, exact available platform files, meaningful validation results and remaining limitations. From installed Windows 0.4.1+, the user's normal work is Updates → Update and restart; the app discovers/fetches the published signed platform pair. Earlier apps need one manual transition (EXE with app fully quit, or signed pair import for its backup flow). Mac/portable automatic replacement remains gated; describe its actual installer-opening flow. Windows completes its installer; Mac manually replaces the app from the DMG. If no artifact was published, say so plainly. A source push, draft, stale artifact or successful development launch is not a released update.

The 0.4.1 updater discovers stable public GitHub platform pairs regardless of the global latest flag, supports bounded allowlisted asset redirects and never sends workspace credentials. Publishing the correct original-key pair enables discovery without another custom feed file; finish checking its public asset metadata after publication. Custom HTTPS feeds still reject redirects. There is one normal-startup check and checks on opening Updates, no repeating polling, continuous deployment or silent Mac installation. No GitHub Actions workflow or hosted private signing key is configured by this process.

## After release

Preserve the original private key and prior artifact pairs privately for recovery; don't erase the build output before retaining the previous version. Keep CODEBASE, UPDATES, installation guide and tracker synchronized with actual publication and platform state. Reconnect/host instructions must maintain revision/TLS/pairing checks. Do not mutate user data or roll back a database blindly. If a release is broken, stop recommending it, publish a new fixed version and document recovery; do not replace bytes under its existing signed version/tag.


## Add a missing platform after Windows-first publication

On the native Mac, check out the immutable vVERSION source and retain its package/lock versions. Obtain the matching original private key privately, build fresh UI/server and DMG, then perform the required native checks. Read the versioned notes and handoff, preflight, and upload:

```text
npm --prefix desktop run publish:release
npm --prefix desktop run publish:release -- --publish --add-platform --notes docs/desktop/releases/vVERSION.md
```

The helper requires the existing release, clean tree, remote tag at HEAD and original-key verified pair. It adds only absent installer/sidecar assets; existing assets are downloaded and checked for identical SHA-256 before retry reuse. It never overwrites existing bytes, moves the tag or changes release notes/publication status. After successful Mac verification/upload, update public release notes with actual results through GitHub; maintain living documentation in a subsequent documentation-only commit. Do not commit code repairs under the immutable tag: repairs need a new version for both platforms.

If the development app locks desktop/bundle on Windows, set VAULTOR_BUILD_BUNDLE to an absolute new directory inside desktop/cache before prepare-server and package:release. Both scripts use that verified directory; the installed app still receives resources/bundle normally. Existing bundles are retained instead of deleted, and no user process needs to be terminated.
