# Vaultor Next experimental HTTPS host

Reviewed 2026-11-20. This workflow applies to the M24 engineering candidate. The published Electron and Android host contracts remain in [Host access](../security/HOST-ACCESS.md) and [Android](../android/ANDROID.md).

## Configure a host

Use a private, owner-controlled directory separate from the workspace. On Windows use the account's private app-data directory and verify its ACL, including inherited access. On Linux use mode `0700`; limit the PEM private key to the host account. The host expects these files.

| File | Contents |
| --- | --- |
| `ca.pem` | Public host CA certificate |
| `chain.pem` | Server leaf first, any intermediates, then the same host CA |
| `server-key.pem` | The server leaf's PEM private key |

Provision them using your existing private PKI. Include the exact listening IP in the leaf SAN and server authentication in the leaf's extended key usage. Configure the client to trust only the verified public CA and check the hostname/IP. The listener validates its chain and SAN before reporting ready. A changed CA requires a separately initialized identity and new approvals. Replace the leaf/key under the original CA and restart hosting to renew the certificate.

```powershell
cargo build --locked --release --manifest-path next/src-tauri/Cargo.toml --no-default-features --features host --bin vaultor-next-host
$vaultorHost = 'next/src-tauri/target/release/vaultor-next-host.exe'
& $vaultorHost init $vaultorAccess "$vaultorAccess/ca.pem"
& $vaultorHost $vaultorWorkspace $vaultorAccess "$vaultorAccess/chain.pem" "$vaultorAccess/server-key.pem" "$vaultorAccess/ca.pem" '127.0.0.1:8443'
```

Set `$vaultorAccess` to the existing private directory and `$vaultorWorkspace` to the workspace path first. The headless process accepts an empty or existing Next workspace and acquires the same exclusive lock as desktop. Windows owner commands run in the foreground process's interactive terminal. On Linux, use `vaultor-next-host owner ACCESS_DIR COMMAND ...` through the private Unix socket.

To run the listener inside the Windows app, use the certificate directory shown in **Settings → Hosting** as `$vaultorAccess`. Initialize it once, enter the IP and port, and select **Start hosting**. To allow private LAN requests, use the host's private IP rather than loopback and provision a certificate for it. Configure any firewall exception explicitly for the private interface and intended peers. Stop hosting before switching workspaces or changing the address. Close to tray keeps an active listener running and Quit stops it. A fresh app launch starts with hosting off.

## Approve a protocol client

1. Verify the host CA fingerprint out of band. Use a client that verifies the CA and address on every connection.
2. Submit an enrollment and compare the six-digit code displayed by the client and the owner independently. In desktop Settings, select **Refresh devices** and check **Codes match** before approving. At the console use `pending`, then `approve ID CODE` or `reject ID CODE`.
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

Linked-source content and protected drafts stay local. The Android reader expects the original protocol 3 DTOs, companion snapshots and Review statuses. The versioned API does not complete that adapter. Browser session cookies and the hosted browser application remain open.

## Docker candidate

Set `VAULTOR_NEXT_TLS_DIR` to the private TLS directory. Grant container UID 10001 read access to the required files. For the supplied Compose network, include both `127.0.0.1` and `172.30.244.2` in the leaf SAN. Resolve subnet overlap by choosing a different private subnet and updating the static service address, health check and certificate together.

```powershell
docker compose -f next/compose.yaml build
docker compose -f next/compose.yaml run --rm vaultor-next init /data/access /tls/ca.pem
docker compose -f next/compose.yaml up -d
docker compose -f next/compose.yaml exec vaultor-next vaultor-next-host owner /data/access pending
```

Use the same `owner /data/access` prefix for approvals and grant changes. The provided mapping publishes HTTPS on host loopback. Workspace and private host data use separate named volumes. TLS stays in a read-only mount. The [M24 qualification](../plans/VAULTOR-NEXT.md#m24--rust-server-trusted-lan-hosting--android-connectivity) records verified Linux/amd64 loopback HTTPS and restart persistence with disposable volumes.
