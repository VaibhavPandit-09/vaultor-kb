# Android client readiness

Reviewed 2026-10-08. Planning requirements; no Android client, native verification or offline sync is implemented. The current browser/Electron boundary is authoritative in [PLATFORM.md](PLATFORM.md). Upcoming shared work is tracked in [resource-lifecycle-plan.md](../plans/resource-lifecycle-plan.md).

## Product boundary

Keep the Windows/Mac-hosted workspace authoritative and browser access available. An Android client connects to an approved host on the LAN; it does not bundle the Java server. Reuse stable resource IDs, structured Tiptap JSON, revisions, scoped organization, paged APIs and saved-change streams. Do not share Electron IPC, filesystem paths, browser credentials or transient preview URLs as Android contracts.

Resource actions, Trash/Restore, categories, usage paging and saved-content coverage must be platform-neutral. Keep view selection, drafts and preview/cache state local to a client. Host identity/workspace generation scope caches and recovery. Unsupported content must remain intact and block unsafe editing rather than be stripped and saved.

## Required design checks in current sprints

- Separate domain actions/capabilities from React UI and native adapters. Keep authenticated uploads/downloads/thumbnails cancellable and bounded; support progress/error/retry without browser-only handles in API responses.
- Preserve atomic conditional saves, idempotent create/import/restore and explicit purge semantics. Handle connection epochs, cancelled requests, stale notifications and offline/conflicting drafts. A recovery journal is not offline synchronization.
- Keep title/content/category/collection queries paginated with honest totals. Usage endpoints return metadata and occurrence locators rather than entire note bodies; unknown locators fall back safely.
- Support touch without hover dependence, accessible labels and narrow single-column surfaces. Keep desktop keyboard/focus behaviors. Reduced motion and Android system theme need adapter support later; responsive browser checks do not certify Android hardware.
- Pairing/trust/storage remain platform implementations: approved device access, pinned host identity/TLS, protected credential storage, revocation and no tokens in URLs/logs/archives. Never disable TLS/Gatekeeper/firewall to make a mobile demo work.

## Decisions before the Android prototype

| Decision | Recommended starting direction | Evidence/gate needed |
| --- | --- | --- |
| Shell | React Native client with a platform adapter; no Electron dependency | Confirm toolchain, physical Android device and free distribution route |
| Note editor | Evaluate embedding the existing structured editor in a constrained WebView first | Real IME/composition, selection, clipboard, image paste/share, bridge security, keyboard/scroll and accessibility tests; retain a native-editor alternative if this fails |
| First scope | Pair/connect, browse/search, note read/edit/save, file preview and image insertion | Small end-to-end prototype on the synthetic workspace before duplicating every desktop screen |
| Host discovery | Remembered/manual address always available; discovery as a convenience | Android network permissions, background limits and changing LAN addresses tested natively |
| Authentication | Host-approved persistent device identity with protected native storage | Decide mobile TLS/CA trust flow and revocation/re-pair recovery; no desktop secret-copy shortcut |
| Background/offline | Reconnect and retain drafts; defer full offline synchronization | Document app suspension/process death, journal persistence and conflict recovery |
| Distribution/updates | Personal installable APK route first; no paid store requirement | Device install approvals, reproducible signed builds, privately preserved signing identity and verified update path |
| Workspace switching | Save or explicitly retain scoped drafts before switching | Exercise unavailable hosts and generation changes without crossing credentials/drafts |

These are recommendations, not settled implementation claims. Do not promise a seamless React Native editor merely because the desktop editor already exists. Use shared contracts and extract reusable logic where it helps; do not undertake a speculative whole-codebase rewrite.

## Prototype acceptance and handoff

After separate authorization, validate on a real Android device against a Windows/Mac host: first pairing/relaunch, title/content/scope search, editing/revision conflict, image upload/original download, Trash/Restore updates, host shutdown/reconnect, rotation, IME, back-button/modal ownership, app suspension/process death and bounded caches. Test reduced motion and at least dark/light/OLED surrounds without altering image pixels.

The handoff must contain actual endpoint/capability matrix and minimum protocol, supported document nodes, client storage/security model, deferred behaviors, fixture seed/results and platform build/signing instructions. No host startup dependencies, file paths, trust secrets or restore generations enter portable archives. Android work does not unblock unverified Mac release binaries automatically.

Atlas Sprint 1 now provides [5,000-resource and 70-resource fixtures](../development/PRIMARY-TEST-WORKSPACE.md). Its [baseline](../development/ATLAS-BASELINE.md) exposed unreadable side-by-side notes with the sidebar at 412px, startup FTS connection retries and unpaged usage payloads. These are findings to resolve/measure before a native prototype; no Android device, IME, slow-network or mobile clipboard check has run. Transfer the logical archive into disposable host storage rather than copying desktop credentials or sessions.
