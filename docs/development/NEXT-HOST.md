# Vaultor Next experimental HTTPS host

Reviewed 2026-11-21. This workflow applies to the M24-D engineering candidate. The published Electron and Android host contracts remain in [Host access](../security/HOST-ACCESS.md) and [Android](../android/ANDROID.md).

## Windows desktop

In **Settings → Hosting**, choose a private IPv4 address from the list or leave **This computer only** selected. Start hosting explicitly. Windows generates the host CA and protects its private key with current-user DPAPI in the app profile. The public CA is `ca.pem` in the certificate directory under advanced settings. The leaf key stays in memory. Existing manually configured profiles keep their PEM-based setup. [Windows DPAPI documentation](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)

The managed listener issues a leaf for the selected IP at startup. The leaf lasts up to 30 days. While running, Vaultor checks hourly and replaces the leaf in the live TLS configuration once the remaining validity reaches seven days. It preserves the CA and host UUID. Upon renewal failure, Vaultor preserves the last valid configuration and retries. A damaged CA or locked key requires restoring the original host profile under its Windows account, or deliberately starting with a separate identity and reapproving devices. Workspace archives exclude host material.

**Start hosting on launch** is an explicit preference for the active workspace and effective address. **Recover address changes** follows an eligible new IPv4 address only on the selected interface and subnet. The new leaf uses the same CA and host UUID. A missing or ambiguous address suspends hosting until recovery or manual address selection. Custom addresses remain explicit. Close to tray leaves hosting active, Quit preserves the opt-in preference, and **Stop hosting** clears it. If Windows Firewall prompts, limit the exception to the private interface and intended peers. Vaultor does not change firewall policy itself.

**Discoverable on this network** advertises the host name, public UUID, port and protocol with `_vaultor._tcp.local.` on the listening interface. Android treats advertisements as address hints. The pairing QR contains the endpoint, UUID, public CA SHA-256 fingerprint and five-minute validity. Pairing still requires the matching code and owner grant. Recovery verifies CA, TLS hostname and UUID before Android sends the remembered credential.

## Standalone and custom certificate configuration

Use a private, owner-controlled directory separate from the workspace. On Windows use the account's private app-data directory and verify its ACL, including inherited access. On Linux use mode `0700`; limit the PEM private key to the host account. The host expects these files.

| File | Contents |
| --- | --- |
| `ca.pem` | Public host CA certificate |
| `chain.pem` | Server leaf first, any intermediates, then the same host CA |
| `server-key.pem` | The server leaf's PEM private key |

Provision them using your existing private PKI. Include the exact listening IP in the leaf SAN and server authentication in the leaf's extended key usage. Configure the client to trust only the verified public CA and check the hostname/IP. The listener validates its chain and SAN before reporting ready. A changed CA requires a separately initialized identity and new approvals. Replace the leaf/key under the original CA and restart hosting to renew the certificate.

```powershell
npm --prefix frontend ci
npm --prefix frontend run next:browser
cargo build --locked --release --manifest-path next/src-tauri/Cargo.toml --no-default-features --features host --bin vaultor-next-host
$vaultorHost = 'next/src-tauri/target/release/vaultor-next-host.exe'
& $vaultorHost init $vaultorAccess "$vaultorAccess/ca.pem"
& $vaultorHost $vaultorWorkspace $vaultorAccess "$vaultorAccess/chain.pem" "$vaultorAccess/server-key.pem" "$vaultorAccess/ca.pem" '127.0.0.1:8443'
```

Set `$vaultorAccess` to the existing private directory and `$vaultorWorkspace` to the workspace path first. The headless process accepts an empty or existing Next workspace and acquires the same exclusive lock as desktop. Windows owner commands run in the foreground process's interactive terminal. On Linux, use `vaultor-next-host owner ACCESS_DIR COMMAND ...` through the private Unix socket.

For an external certificate on desktop, initialize the certificate directory shown under **Settings → Hosting → Advanced hosting settings** before first starting the listener. Enter the matching IP and port under **Custom listening address**. Stop hosting before switching workspaces or changing the address.

## Approve a protocol client

1. Verify the host CA fingerprint out of band. Use a client that verifies the CA and address on every connection.
2. Submit an enrollment and compare the six-digit code displayed by the client and the owner independently. In desktop Settings, check **Codes match** before approving. At the console use `pending`, then `approve ID CODE` or `reject ID CODE`.
3. Completion returns a device credential over HTTPS. Keep it in the client's protected credential store. Approving a device creates no workspace grant. Select **Grant access**, or find the device with `devices` and run `grant ID`.
4. Use **Withdraw grant** or `withdraw ID` for the currently hosted workspace. **Revoke device** or `revoke ID` removes the device's entire approval. Future requests and ongoing stream production recheck authority. Data already received can remain with the client.

## Versioned client API

The descriptor and pairing exchange reuse the legacy non-browser shapes. The remaining routes use the explicit `/api/next/v1` prefix. Send `Authorization: Bearer …` on protected calls.

| Route under `/api/next/v1` | Behavior |
| --- | --- |
| `GET /workspaces` | Currently hosted workspace, if granted |
| `GET /workspaces/{workspace}/resources` | Managed resources and FTS search. Optional `query`, `collection`, `limit`, and `cursor` containing URL-encoded JSON from the previous `next` field |
| `GET /workspaces/{workspace}/notes/{id}` | Saved structured note and numeric revision |
| `GET /workspaces/{workspace}/files/{id}` | Protected managed original, including a single byte range |
| `GET /workspaces/{workspace}/changes` | SSE `reset` on connection and shared Library-generation changes. Refetch saved state on reset. Heartbeats and a bounded stream lifetime allow reconnect; there is no replay journal |
| `PUT /workspaces/{workspace}/resources/{id}/review/{operation}` | M23 Review submission. The saved revision, resource and operation UUID must match captured evidence. Identical retries receive the same receipt |
| `GET /workspaces/{workspace}/resources/{id}/review/{operation}` | The authenticated device's Review receipt |

Linked-source originals and protected drafts stay local.

## Browser trust and sessions

Distribute the public CA through an authenticated owner channel and verify its SHA-256 fingerprint from Windows Settings or the private PKI inventory. The device or browser administrator can trust it in the intended client profile after informed authorization, for example through a managed browser policy. Keep the private keys on the host. Use the private IP in the certificate. Open Hosting after the browser accepts the chain and endpoint. If the address changes, visit the new HTTPS origin and pair again when it has no current cookie. [Chromium certificate management](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/cert_management.md)

The matching-code page serves `/access` and the bundled React workspace serves `/`. Rust issues a random browser-only credential in an HttpOnly, Secure, SameSite=Strict host cookie with 24-hour expiry. Browser completion consumes its pairing proof. Mutations require the exact HTTPS origin and a CSRF header. Authorized browsers can browse and search saved Library data, render notes, preview and download managed files, and explicitly save existing notes. Rust checks the grant and expected revision and refuses saves while a protected desktop draft exists. Owner operations stay local. Sign out revokes the browser approval. Original resource creation, organization and local browser handoff remain open.

## Android M24-C projection

The host descriptor advertises `protocol: vaultor-next/1` and `mobileProtocol: 1`. Android preserves the legacy Java protocol 3 route set for its original hosts and uses `/api/next/mobile/v1` for Next protocol 3-shaped DTOs. The public descriptor and pairing paths are shared. Legacy APKs and pre-M24-C Next hosts cannot use this projection. Profile trust requires the out-of-band SHA-256 CA fingerprint for Next enrollment and a matching owner-approved code. The profile pins the CA and checks the connection address through normal TLS on every request. The user can update an address manually under the same CA and host UUID.

The read routes expose the currently hosted granted workspace, managed Library/collection/tag summaries, saved Tiptap documents, FTS and original filename search, managed relationships and ranged originals. Bearer authorization and the optional explicit `X-Vaultor-Workspace` scope are checked by Rust. Empty grants produce an empty workspace list; protected routes distinguish device refusal and grant refusal. Workspace identity and generation share the Rust workspace UUID. Reset events invalidate saved reads and browse state and trigger reconciliation on reconnect. The stream has no replay journal.

Android retains verified checkpoints in its existing native store. Rust prepares short-lived, device-owned snapshots with a pinned SHA-256 manifest. Saved note bytes are fixed at capture. Managed file streams must match the captured length and hash. Changed or missing originals require a fresh checkpoint, preserving the existing active mobile copy. The host admits one preparation at a time and four prepared checkpoints with a 15-minute lifetime. Selection is bounded to 1,000 resources, 12 MiB of accumulated note/inventory data, 64 MiB per original and 2 GiB total. Hosts discard preparation state across restart.

Collected imports accept an original or a reviewed text or Markdown conversion, with a 64 MiB transport limit and 256 KiB conversion limit. The Rust managed-original reservation and SQLite owner check generation, bytes and SHA-256, then persist a device-owned receipt for exact retries. Legacy workspace ZIP submissions remain outside Next.

Connected exports reuse the Rust portable archive and note exporters, cap four artifacts at 256 MiB each for 15 minutes, and return a checksum and length. Retry after restart prepares the immutable request again from the current saved workspace. Archives are bounded to eligible managed resources and exclude owner settings and Reviews. User-selected linked-depth traversal remains open.

Review submission maps the Android operation UUID, workspace generation, captured revision, resource, original evidence and comment to M23. Rust derives the author from authenticated device approval. Retries and receipts use the same operation and target IDs. See [Android setup and candidate delivery](../android/ANDROID.md) and the [same-Wi-Fi Help procedure](../help/next-foundation.md#connect-android-on-the-same-wi-fi).

## Docker candidate

Set `VAULTOR_NEXT_TLS_DIR` to the private TLS directory. Grant container UID 10001 read access to the required files. For the supplied Compose network, include both `127.0.0.1` and `172.30.244.2` in the leaf SAN. Resolve subnet overlap by choosing a different private subnet and updating the static service address, health check and certificate together.

```powershell
docker compose -f next/compose.yaml build
docker compose -f next/compose.yaml run --rm vaultor-next init /data/access /tls/ca.pem
docker compose -f next/compose.yaml up -d
docker compose -f next/compose.yaml exec vaultor-next vaultor-next-host owner /data/access pending
```

Use the same `owner /data/access` prefix for approvals and grant changes. The provided mapping publishes HTTPS on host loopback. Workspace and private host data use separate named volumes. TLS stays in a read-only mount. The Linux/amd64 image builds and embeds the browser assets. Use the browser trust procedure above for this address. The supplied deployment uses explicit bind configuration. The [M24 qualification](../plans/VAULTOR-NEXT.md#m24--rust-server-trusted-lan-hosting--android-connectivity) records verified Linux/amd64 loopback HTTPS and restart persistence with disposable volumes.
