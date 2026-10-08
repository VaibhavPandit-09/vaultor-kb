# Android client readiness

Reviewed 2026-10-09. A1 Android prototype is published and A2 durable editing/recovery is implemented. Offline synchronization remains deferred. Current mobile implementation and validation are authoritative in [ANDROID.md](../android/ANDROID.md). The current browser/Electron boundary is authoritative in [PLATFORM.md](PLATFORM.md). The completed shared-work results are tracked in [resource-lifecycle-plan.md](../plans/resource-lifecycle-plan.md). The authoritative six-sprint Android scope, Windows-only agent testing, APK milestones and physical-device acceptance boundary are in [android-plan.md](../plans/android-plan.md); A3–A6 remain unstarted.

## Product boundary

Keep the Windows/Mac-hosted workspace authoritative and browser access available. An Android client connects to an approved host on the LAN; it does not bundle the Java server. Reuse stable resource IDs, structured Tiptap JSON, revisions, scoped organization, paged APIs and saved-change streams. Do not share Electron IPC, filesystem paths, browser credentials or transient preview URLs as Android contracts.

Resource actions and Trash/Restore now use protocol 3, metadata summaries and per-item revision/UUID identities; archives use format 3. 0.6.0 adds platform-neutral categories, paginated saved references and bounded authenticated thumbnails; 0.7.0 adds bounded saved PDF/UTF-8 extraction and scoped coverage. See [REFERENCES.md](../workspace/REFERENCES.md) for category acknowledgment and validated occurrence locators. Keep view selection, drafts and preview/cache state local to a client. Host identity/workspace generation scope caches and recovery. Unsupported content must remain intact and block unsafe editing rather than be stripped and saved.

## Required design checks in current sprints

- Separate domain actions/capabilities from React UI and native adapters. Keep authenticated uploads/downloads/thumbnails cancellable and bounded; support progress/error/retry without browser-only handles in API responses.
- Preserve atomic conditional saves, idempotent create/import/restore and explicit purge semantics. Handle connection epochs, cancelled requests, stale notifications and offline/conflicting drafts. A recovery journal is not offline synchronization.
- Keep title/content/category/collection queries paginated with honest totals. Usage endpoints return metadata and occurrence locators rather than entire note bodies; unknown locators fall back safely.
- Support touch without hover dependence, accessible labels and narrow single-column surfaces. Keep desktop keyboard/focus behaviors. Reduced motion and Android system theme need adapter support later; responsive browser checks do not certify Android hardware.
- Pairing/trust/storage remain platform implementations: approved device access, pinned host identity/TLS, protected credential storage, revocation and no tokens in URLs/logs/archives. Never disable TLS/Gatekeeper/firewall to make a mobile demo work.

## Decisions before the Android prototype

| Decision | Recommended starting direction | Evidence/gate needed |
| --- | --- | --- |
| Shell | React Native client with a platform adapter; no Electron dependency | Pin/build toolchain on Windows; primary user device is S24 Ultra / One UI 8.5, with One UI 9 compatibility required |
| Note editor | Evaluate embedding the existing structured editor in a constrained WebView first | Agent-run emulator IME/selection/bridge/keyboard checks and user-only Samsung acceptance; retain a native-editor alternative if the gate fails |
| First scope | Pair/connect, browse/search, note read/edit/save, file preview and image insertion | Small end-to-end prototype on the synthetic workspace before duplicating every desktop screen |
| Host discovery | Remembered/manual address always available; discovery as a convenience | Android network permissions, background limits and changing addresses tested in emulators; Samsung/real LAN checks are user-only |
| Authentication | Host-approved persistent device identity with protected native storage | Decide mobile TLS/CA trust flow and revocation/re-pair recovery; no desktop secret-copy shortcut |
| Background/offline | Reconnect and retain drafts; defer full offline synchronization | Document app suspension/process death, journal persistence and conflict recovery |
| Distribution/updates | Personal installable APK route first; no paid store requirement | Device install approvals, reproducible signed builds, privately preserved signing identity and verified update path |
| Workspace switching | Save or explicitly retain scoped drafts before switching | Exercise unavailable hosts and generation changes without crossing credentials/drafts |

A1 selected React Native 0.87.1, a restricted Tiptap 3.31.4 WebView, original-key APK signing and manual pinned HTTPS enrollment. A2 adds scoped sessions/recovery and native notifications; discovery and updater remain A6. The remaining entries are planned gates, not completed parity claims. Do not promise a seamless React Native editor merely because the desktop editor already exists. Use shared contracts and extract reusable logic where it helps; do not undertake a speculative whole-codebase rewrite.

## Prototype acceptance and handoff

After separate authorization, agents validate the built APK on Windows Android 16/17 emulators against disposable hosts; the user alone validates the S24 Ultra. Agents must not access, pair ADB with or control the user phone. Distinguish emulator results from Samsung/One UI acceptance for: first pairing/relaunch, title/content/scope search, editing/revision conflict, image upload/original download, Trash/Restore updates, host shutdown/reconnect, rotation, IME, back-button/modal ownership, app suspension/process death and bounded caches. Test reduced motion and at least dark/light/OLED surrounds without altering image pixels.

The handoff must contain actual endpoint/capability matrix and minimum protocol, supported document nodes, client storage/security model, deferred behaviors, fixture seed/results and platform build/signing instructions. No host startup dependencies, file paths, trust secrets or restore generations enter portable archives. Android work does not unblock unverified Mac release binaries automatically.

Atlas Sprint 1 now provides [5,000-resource and 70-resource fixtures](../development/PRIMARY-TEST-WORKSPACE.md). Its [baseline](../development/ATLAS-BASELINE.md) exposed unreadable side-by-side notes with the sidebar at 412px, startup FTS connection retries and unpaged legacy usage payloads (the current UI now uses bounded references). [SCALE-INTEGRATION.md](../development/SCALE-INTEGRATION.md) records completed Windows Sprint 5 fixes/measurements; Android emulator/Samsung IME, slow-network and mobile clipboard checks remain unrun. Transfer the logical archive into disposable host storage rather than copying desktop credentials or sessions.

0.7.0 hosts add scoped saved PDF/UTF-8 content results and fileCoverage, paginated file-index status/retry. Android can reuse these metadata/snippet contracts without decoding files locally; no offline/OCR/native client is implemented. Search must stay opt-in and display pending/unsupported/limited coverage. [SEARCH.md](../workspace/SEARCH.md) owns limits.

## Current contract matrix — Sprint 5

Protocol/minimum client **3**, logical archive **3**, and updater protocol **1** are independent. All paths below start with `/api`. Capability handshake precedes editor mounting. Read-only handshake retries only authenticated `409 WORKSPACE_BUSY`, with a bounded wait; never replay a mutation or ignore approval errors.

| Capability | Shared contract | Android responsibility / gate |
| --- | --- | --- |
| Identity | `GET /capabilities`, `/workspace/identity`; opaque ID/generation | Scope sessions/caches/recovery; reject incompatible hosts |
| Approval | `/access/host`, pairing request/code approval/completion and revocation | Protected native credentials and pinned TLS; desktop safeStorage is not portable |
| Browse/search | `/resources` title metadata, `/resources/query` explicit saved content; paged scope/category filters | One mixed list; preserve query/scope; discard stale responses; show fileCoverage |
| Organization | `/organization/pins`, `/collections`, memberships, paged tags | Collections are destinations/shortcuts; avoid full-tag enumeration |
| Documents | `/resources/{id}`, `PUT /resources/{id}/note`, `PATCH /resources/{id}/title`; revision/If-Match | Durable local draft journal; retain both versions on 412 |
| Notifications | `/changes?cursor=…`; bounded metadata SSE, reset on gaps/restart | Suspension/reconnect; refresh clean state; never replay commands/downloads |
| Lifecycle | `/resources/trash`, `/resources/{id}/usage`, `PUT /resources/lifecycle` bounded UUID/revision operations | Same-ID Trash/Restore; distinguish placement/membership removal; explicit purge |
| References | `/resources/{id}/references?direction=incoming|outgoing&page=…&size=…` | Metadata/occurrences; validate revision/path or fall back |
| Images/files | Retry-safe `PUT /resources/imports/{uuid}`, authenticated original download, `/image-info`, `/thumbnail`, `/image-png` | Native picking/share/clipboard, cancellation, bounded caches; original bytes unchanged |
| Transfers | `/imports/preview`, `/imports/{id}/commit`, `/exports`, `/operations/{id}` | Poll retained status without replay; active snapshots remain readable during commit |

The editor schema comes from BlockEditor/extensions, not arbitrary host JSON acceptance. Preserve doc/paragraph/text, headings, lists/tasks, blockquote, code, horizontal rules, tables/cells/headers, resourceLink, managed image and their supported marks/attributes. Validate the complete schema: unknown nodes/marks retain original JSON and block unsafe saving. Do not downconvert desktop documents to plain text. Image JSON contains resource IDs/placement attributes, never transient URLs, credentials or bytes.

## Separately authorized Android prototype milestone

1. Follow android-plan.md: user-owned S24 Ultra / One UI 8.5 acceptance, Android 16/17 emulator coverage, selected React Native toolchain, private APK signing identity and free GitHub APK distribution. No agent phone access or paid store/account.
2. Implement an adapter for pinned LAN JSON/binary/SSE, protected credentials, system appearance/reduced motion, image picking/share and recovery. Manual address entry remains independent of discovery.
3. Prove the constrained WebView editor against the full schema: IME/composition, selection/undo, touch scrolling, clipboard/share, bridge origin restrictions and process death. Retain a native-editor alternative if this fails.
4. Prototype pair/connect, scoped title/content browsing, note read/edit/conditional save and image upload/preview on Small, then Atlas. Measure caches/startup; never copy Electron IPC or host paths.
5. Test conflicts, shutdown/reconnect, generation changes, revoke/re-pair, rotation, Android Back/modal ownership and suspension recovery on emulators before expanding feature parity; user-only physical acceptance remains separately recorded.

A1 implements the trust/editor/journal prototype; native and installed-release gates passed on Android16/17. [ANDROID.md](../android/ANDROID.md) records exact evidence, APK delivery and remaining prototype limits. The remaining items are future sprint scope, not authorization to start A2–A6. Offline synchronization, OCR, scheduled backups and Android hosting remain deferred. A 412px desktop check cannot certify Android IME, touch, network permissions or lifecycle behavior.
