# Primary synthetic workspace: Vaultor Lab — Atlas

Reviewed 2026-10-08. Sprint 1 is implemented. Atlas is the primary manual/performance workspace; small disposable fixtures remain preferable for focused mutation tests. See [actual baseline results](ATLAS-BASELINE.md) and [execution tracker](../plans/resource-lifecycle-plan.md). This is test infrastructure, not a new app release.

## Open Atlas

From `C:\GitDev\vaultor-kb`:

```powershell
node desktop/scripts/atlas.mjs open
```

This launches `desktop/releases/win-unpacked/Vaultor.exe` (currently 0.4.1) with its own profile and **Vaultor Lab — Atlas** connection. Separate host data/trust and a dynamic loopback port preserve personal storage and the normal app's selected connection. The launcher does not build/update the app. Return to personal work through your usual shortcut/window. Do not import Atlas into your personal workspace.

Quit Atlas through its app menu/tray before generation, verification, reset or native measurements; closing a window may leave it running. Never run two hosts against its database. If first connection reports **Server check failed (409)** during search-index startup, wait and retry Connect. This scale finding belongs to Sprint 5; no security check was bypassed.

Optional launcher: `desktop/scripts/atlas-open.ps1`. If PowerShell policy prevents it, use the Node command; do not bypass policy. To use an installed app instead:

```powershell
$env:ATLAS_APP='C:\path\to\Vaultor.exe'
node desktop/scripts/atlas.mjs open
Remove-Item Env:\ATLAS_APP
```

Use an absolute existing executable path. Native measurement currently targets the unpacked Windows build only.

## Storage and reset

Generated data is ignored under `C:\GitDev\vaultor-kb\desktop\cache\atlas`:

| Relative path | Purpose |
| --- | --- |
| `atlas-owner.json` | Root/seed/profile guard |
| `manifest.json` | Stable IDs, checkpoints, hashes, expected results and generation time |
| `profile/local-workspace` | Mutable database/files and separate host trust/logs |
| `profile` | Desktop connection/session/preferences |
| `media/media.json` | Synthetic original-file fingerprints |
| `media/faults/manifest.json` | Explicit unimported limit/invalid samples |
| `baseline.zip`, `archive-preview.json` | Portable baseline and normal import review |
| `baseline-report.json`, `native-report.json`, `atlas-*.png` | Local timings/memory/screenshots |

After quitting Atlas:

```powershell
node desktop/scripts/atlas.mjs reset --discard-lab-changes
node desktop/scripts/atlas.mjs verify
```

Reset discards **all Atlas additions/edits**, including user test additions. It verifies marker/hash, previews the baseline through protected APIs, commits confirmed workspace replacement, verifies results and reseeds Recent. It does not recursively delete files or wipe session storage; normal replacement-generation invalidation applies. Foreign roots, missing/mismatched markers and symlinked storage are refused; the existing host lock refuses concurrent ownership.

Transfer `baseline.zip` to another device only for import into a separately created disposable workspace. It contains logical manifest/workspace data and original `files/`, excluding device preferences, sessions, host identity/trust and credentials. Never copy live profiles/databases or pairing secrets. Generated artifacts remain outside GitHub.

## Generate or resume

Requires Node, the existing verified `desktop/bundle` Java/server pair, and Python with Pillow/ReportLab. Use the normal desktop bundle preparation procedure if absent; no Docker/global Java is required.

```powershell
$env:ATLAS_PYTHON='C:\path\to\python.exe'
node desktop/scripts/atlas.mjs generate
Remove-Item Env:\ATLAS_PYTHON
```

Seed `atlas-2026-10-v1`, marker/fixture version 1. Media is generated locally; no downloaded/copyrighted corpus or remote images. Stable multipart import UUIDs, source fingerprints and atomic checkpoints permit resume without duplicate resources. Organization uses protected APIs and membership batches of at most 100, not raw SQL. Only pre-admission Busy rejections retry mutations automatically; uncertain imports recover through their existing retry-safe identity.

First resource/organization population took 188.34 seconds after host start, excluding media generation and later archive/native checks. An identical file import was replayed after removing its local checkpoint; counts stayed 5,000. Fixture changes require a new reviewed seed/version/root, not silently changed bytes under existing import IDs or archive snapshots.

Small profile:

```powershell
$env:ATLAS_ROOT='C:\GitDev\vaultor-kb\desktop\cache\atlas\small'
$env:ATLAS_PYTHON='C:\path\to\python.exe'
node desktop/scripts/atlas.mjs generate --small
node desktop/scripts/atlas.mjs verify --small
node desktop/scripts/atlas.mjs reset --small --discard-lab-changes
Remove-Item Env:\ATLAS_ROOT
Remove-Item Env:\ATLAS_PYTHON
```

Small has 40 notes, 30 files, 8 collections, 12 tags and 20 pins. Generation and replacement after deliberately adding an extra note restored 70 resources. The full corpus is not a routine CI requirement.

## Actual corpus

| Kind/category | Count | Coverage |
| --- | ---: | --- |
| Notes | 4,000 | Eight research topics, structured headings/lists/code/tables; 50 long and 200 image-heavy notes |
| Image files | 600 | 150 each PNG/JPEG/WebP/GIF; animated GIFs, varied sizes; one 39,992,000-pixel PNG |
| PDF files | 200 | 100 distinct templates imported under 200 IDs; 20 image-only resources and two 30-page resources |
| Text files | 150 | Plain text/Markdown/CSV/JSON/Python, Unicode and literal markers; never executed |
| Other files | 50 | 25 WAV and 25 explicitly unsupported binaries; no video encoder was available |

80 collections include four empty, dense and overlapping membership; 250 tags include a long name; 300 pins comprise 280 resources and 20 collections. Recent uses 24 alternating note/file open calls rather than fabricated timestamps. Link graph includes `0 → 1 → 2 → 0`, longer chains and an image shared by 200 source notes with repeated placements. Duplicate/Unicode/RTL/emoji/long titles and literal punctuation are explicit fixtures. `atlasbeacon0317` identifies note 317 in saved-body search and is absent from title search. `filecompass021` is a **future** file-search assertion: current FTS does not search file bodies.

900 unique source files total 11,668,841 bytes. Baseline archive: 10,452,524 bytes, SHA-256 `d95d7224bd1190104eafd18c97b9cef2380d5f808399d7dc623678ca2cf8f0f6`. Mutable host storage was 78.18 MiB; entire lab including small profile, screenshots and faults about 154.3 MiB at handoff. Logs/operation history grow.

Separate, unimported faults: 20,311,475-byte PNG below 20 MiB, 8001×5000 PNG above 40 MP, invalid PDF, unsupported inline SVG. Encrypted PDFs, video, malformed documents and trashed/deleted destinations are not generated. Trash fixtures require Sprint 2's domain contract. Drafts/journeys are session scenarios, not saved archive content.

## Measurement and future fault scenarios

After quitting Atlas, `node desktop/scripts/atlas.mjs benchmark` records seven calls per case (first plus six warm samples, median/max). `node desktop/scripts/atlas-native.mjs` exercises Library/Recent/mixed pins, images, 200 journeys, duplicate live views/shared undo and a 412×915 desktop viewport. It changes recency/session and performs edit/undo; reset before strict baseline verification afterward. It stops only its owned host/app. Reports do not imply cold OS caches, continuous peak memory, complete image decoding or Android certification.

Sprint 5 uses small fixtures for retained drafts on host stop/restart, generation replacement, competing revisions and delayed/out-of-order responses. Slow-network measurement is **not implemented/verified** here: add bounded delay at the actual transport boundary in a disposable harness. Renderer throttling alone cannot model main-process IPC HTTP. Preserve auth/TLS/revisions. Real paired Windows/Mac/Android checks remain separate gates.

Focused commands: `node --test desktop/test/atlas.test.mjs`, `node --check desktop/scripts/atlas.mjs`, `node --check desktop/scripts/atlas-native.mjs`, plus Python syntax/media/PDF checks when changing generators. No shipped runtime/schema/dependency changes or installer are required for this sprint.
