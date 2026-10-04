# Platform and connection boundary

Reviewed 2026-10-04, desktop sprint D5. Browser and the Electron development shell share these interfaces. This computer now owns a bundled loopback Java server; paired remote-host selection and LAN trust remain later sprints. See [the tracker](desktop-network-plan.md) and [DESKTOP.md](DESKTOP.md).

## Transport and compatibility

`frontend/src/lib/platform.ts` owns `PlatformServices` (Axios-compatible request adapter, blob save/open, clipboard, optional future change stream) and a `ConnectionIdentity` (profile ID, browser/local/remote kind, optional host/workspace/generation). Browser currently has one same-origin profile. D2 persists local desktop profile identities; authenticated remote host identities remain future contracts.

`configureConnection` is used by D2's loopback picker after destination verification and a save/recovery barrier. Each activation increments an epoch and aborts old requests/streams. Caller and connection cancellation are combined; late responses/messages are ignored. Native IPC serializes multipart/text input and restores response bytes/status/headers/problem details; main owns validation/timeouts/cancellation. D5 adds main-injected owned-server access and host CA/device services; protected remote-profile credentials and certificate pinning remain D6. Stream handles close idempotently; no change stream is implemented or opened.

Application APIs, preview binary/text requests, note/workspace/file downloads and API-spec downloads share this boundary. Browser object URLs remain renderer-owned with cleanup; desktop PDFs/images use main-owned bounded preview-cache handles. API paths reject absolute/external, protocol-relative, backslash and traversal destinations; the browser adapter always uses `/api`. Bootstrap and diagnostic batches share raw transport without the application's error interceptor, preventing recursive logging. Structured HTTP errors and response request IDs survive; cancellation is not a UI failure. Requests include `X-Request-ID`. The transport never retries ambiguous mutations automatically.

`ConnectionGate` checks capabilities before mounting settings/workspace providers. The application client also checks compatibility before dispatch. One handshake per epoch is shared and cached; failed checks can retry, with a 10-second timeout. No settings migration/edit is sent to an incompatible server. Protocol **1** requires server metadata `serverBuild`, `apiProtocolVersion`, `minimumClientProtocolVersion`; supported client versions lie between the minimum and current protocol inclusive. Missing/old metadata asks for a server update; a higher minimum asks for an app update. Build strings are not compatibility versions. Deploy frontend/backend together: old servers without the contract are intentionally rejected.

## Files and diagnostics

Browser saving returns **requested**, not proof of a completed disk write; native saving may return **saved** or **cancelled**, with errors throwable. Note-export cancellation retains the prepared operation for download retry. Browser anchors detach and URLs are revoked after initiation. Blob opening uses a separate window with its opener cleared; blocked popups report failure. Desktop uses native dialogs, streaming saveApiFile/openApiFile/previewApiFile and opaque pick/read tickets. Previews are cancellable, connection-scoped file-cache handles with explicit release. Browser fallback still uses the shared API and blob services. Main owns disk completion, size limits and approved paths; see DESKTOP.md.

Client build uses `VITE_BUILD_VERSION`, default `desktop-d2`; backend uses `BUILD_VERSION`, default `desktop-d1`. Electron's package version is reported separately as desktopBuild. Health/capabilities, request/background logs and reports distinguish these values. Capabilities `build` remains the server-build alias. Diagnostic events include client build, observed server build, client protocol and ephemeral connection epoch; no note-body/binary logging is added.

The frontend queue retains 100 events, batches 20, times out after five seconds and drops a batch after three failures. Delivery requires an accepted handshake and never recursively logs its failure. Old-epoch queued events are discarded rather than forwarded to a new host; bounded local history remains in reports. Backend retention remains 200 events / 24 hours / process lifetime. Persistent notifications/multi-host UI recovery arrive later.

## Keyboard boundary

Sidebar default is **Ctrl+Alt+B** (Windows/Linux) / **Cmd+Option+B** (Mac). Bold keeps Ctrl/Cmd+B; Quote keeps Ctrl/Cmd+Shift+B. Shared metadata drives help/settings. Frontend/backend normalization migrate old sidebar `Mod+B` to `Mod+Alt+B`; a custom binding identical to that shipped default cannot be distinguished and migrates too. Other stored custom values survive; newly assigning Bold/Quote combinations is rejected with guidance.

Mac Option-letter events match physical letter codes because Option may produce a different character. Workspace shortcut handling ignores composition. No capture handler steals formatting keys.

## Verification

D1 focused tests cover incompatible protocol/no workspace mount, Retry/no premature mutations, shared handshake, blob/multipart/request IDs, structured failure without retries, cancellation/stale responses, diagnostic bounds/no recursion/host isolation, stream ownership, download cleanup, default/custom shortcut migration, real Tiptap formatting/sidebar dispatch and Mac Option matching. Backend cases cover capabilities, logs/request IDs, bounded versioned diagnostics and settings migration. Exact results are in CODEBASE and the tracker. No native launch, browser visual session, Docker rebuild or broad API smoke is claimed.

## Browser and owned-host access (D5)

Browser mutation adapters obtain /access/session using raw same-origin GET, deduplicate lookups per epoch, add X-Vaultor-CSRF, and retain retry after lookup failure without sending the mutation. Diagnostic batches use this adapter too. Native renderer requests cannot supply owner/Authorization headers: DesktopTransport and NativeFiles add a main-owned key, only for the managed profile; changing profiles clears that transport credential. Bootstrap snapshots never contain it. Open in browser gets a fresh short-lived ticket via main and launches a fragment handoff, rather than exposing a durable credential. See [HOST-ACCESS.md](HOST-ACCESS.md) for connector roles, origin/cookie rules and current onboarding limits.

## Browser and owned-host access (D5)

Browser mutation adapters obtain /access/session using raw same-origin GET, deduplicate lookups per epoch, add X-Vaultor-CSRF, and retain retry after lookup failure without sending the mutation. Diagnostic batches use this adapter too. Native renderer requests cannot supply owner/Authorization headers: DesktopTransport and NativeFiles add a main-owned key, only for the managed profile; changing profiles clears that transport credential. Bootstrap snapshots never contain it. Open in browser gets a fresh short-lived ticket via main and launches a fragment handoff, rather than exposing a durable credential. See [HOST-ACCESS.md](HOST-ACCESS.md) for connector roles, origin/cookie rules and current onboarding limits.
