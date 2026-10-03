# Platform and connection boundary

Reviewed 2026-10-04, desktop sprint D1. Browser is the only shipped platform. Electron, bundled server, remote-host selection and LAN pairing remain later sprints; see [the tracker](desktop-network-plan.md).

## Transport and compatibility

`frontend/src/lib/platform.ts` owns `PlatformServices` (Axios-compatible request adapter, blob save/open, clipboard, optional future change stream) and a `ConnectionIdentity` (profile ID, browser/local/remote kind, optional host/workspace/generation). Browser currently has one same-origin profile. Optional identities are contracts for the future shell, not newly persisted server identifiers.

`configureConnection` is a shell code boundary, not a user-facing server switcher. Each activation increments an epoch and aborts old requests/streams. Caller and connection cancellation are combined; late responses and messages are ignored. Native adapters must honor signals/timeouts, release resources, preserve status/headers/problem details, serialize multipart/binary input, and validate paths again in main. No credentials or native IPC exist yet. Stream handles close idempotently; no stream is implemented or opened by D1.

Application APIs, preview binary/text requests, note/workspace/file downloads and API-spec downloads share this boundary. Display-only object URLs for already-fetched preview blobs remain renderer-owned with cleanup. API paths reject absolute/external, protocol-relative, backslash and traversal destinations; the browser adapter always uses `/api`. Bootstrap and diagnostic batches share raw transport without the application's error interceptor, preventing recursive logging. Structured HTTP errors and response request IDs survive; cancellation is not a UI failure. Requests include `X-Request-ID`. The transport never retries ambiguous mutations automatically.

`ConnectionGate` checks capabilities before mounting settings/workspace providers. The application client also checks compatibility before dispatch. One handshake per epoch is shared and cached; failed checks can retry, with a 10-second timeout. No settings migration/edit is sent to an incompatible server. Protocol **1** requires server metadata `serverBuild`, `apiProtocolVersion`, `minimumClientProtocolVersion`; supported client versions lie between the minimum and current protocol inclusive. Missing/old metadata asks for a server update; a higher minimum asks for an app update. Build strings are not compatibility versions. Deploy frontend/backend together: old servers without the contract are intentionally rejected.

## Files and diagnostics

Browser saving returns **requested**, not proof of a completed disk write; native saving may return **saved** or **cancelled**, with errors throwable. Note-export cancellation retains the prepared operation for download retry. Browser anchors detach and URLs are revoked after initiation. Blob opening uses a separate window with its opener cleared; blocked popups report failure. Native save dialogs/OS opening remain D4.

Client build uses `VITE_BUILD_VERSION`, default `desktop-d1`; backend uses `BUILD_VERSION`, default `desktop-d1`. Health/capabilities, request/background logs and diagnostic reports use these versions. Capabilities `build` remains the server-build alias. Diagnostic events include client build, observed server build, client protocol and ephemeral connection epoch; no note-body/binary logging is added.

The frontend queue retains 100 events, batches 20, times out after five seconds and drops a batch after three failures. Delivery requires an accepted handshake and never recursively logs its failure. Old-epoch queued events are discarded rather than forwarded to a new host; bounded local history remains in reports. Backend retention remains 200 events / 24 hours / process lifetime. Persistent notifications/multi-host UI recovery arrive later.

## Keyboard boundary

Sidebar default is **Ctrl+Alt+B** (Windows/Linux) / **Cmd+Option+B** (Mac). Bold keeps Ctrl/Cmd+B; Quote keeps Ctrl/Cmd+Shift+B. Shared metadata drives help/settings. Frontend/backend normalization migrate old sidebar `Mod+B` to `Mod+Alt+B`; a custom binding identical to that shipped default cannot be distinguished and migrates too. Other stored custom values survive; newly assigning Bold/Quote combinations is rejected with guidance.

Mac Option-letter events match physical letter codes because Option may produce a different character. Workspace shortcut handling ignores composition. No capture handler steals formatting keys.

## Verification

D1 focused tests cover incompatible protocol/no workspace mount, Retry/no premature mutations, shared handshake, blob/multipart/request IDs, structured failure without retries, cancellation/stale responses, diagnostic bounds/no recursion/host isolation, stream ownership, download cleanup, default/custom shortcut migration, real Tiptap formatting/sidebar dispatch and Mac Option matching. Backend cases cover capabilities, logs/request IDs, bounded versioned diagnostics and settings migration. Exact results are in CODEBASE and the tracker. No native launch, browser visual session, Docker rebuild or broad API smoke is claimed.
