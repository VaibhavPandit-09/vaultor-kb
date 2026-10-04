# Host HTTPS, owner access and persistent pairing

Reviewed 2026-10-04, D5. This document owns host access contracts. D6 will add desktop sharing/discovery, protected remote profiles, pairing/device management and polished browser trust UX. No accounts, master passwords or encrypted note/archive storage are introduced.

## Connectors and storage

The ordinary HTTP listener binds 127.0.0.1 by default, port 8080 for standalone and an OS-assigned port for Electron. It accepts the main-process `X-Vaultor-Owner` credential or a local owner browser cookie. Every workspace endpoint, static application asset, file, export, diagnostic and future stream is protected. Owner management never works through the LAN connector, even with a valid owner key. Access checks precede workspace mutation admission. Forwarded headers do not establish connector ownership.

Sharing starts off. An owner enables a separate HTTPS listener through `PUT /api/owner/sharing` with `{ "enabled": true }`. It binds IPv4 interfaces on HOST_NETWORK_PORT (8443 default) and accepts only private/link-local/loopback peers. Disabling closes the connector and retains approvals. A failed disable-preference write leaves sharing off for the current process, with an explicit warning that the previous persisted preference may return after restart; fix storage and disable again first. The HTTP owner port must remain private; never publish it on LAN or forward ports to the Internet. Docker internally binds HTTP on 0.0.0.0 because of container networking; Compose publishes only host loopback. HTTPS is not published by default. Docker LAN publication/firewall and desktop discovery remain D6 work.

HOST_ACCESS_PATH defaults to backend `./data/host-access`, Docker `/data/host-access`, or managed desktop `<local-workspace>/host-access`. Its parent `host.json` is the persistent host UUID already used by the launcher. Files in host-access contain owner material, CA/leaf PKCS12, its password, device verifiers and sharing preference. They never enter workspace settings, SQLite, diagnostics or portable archives. A process lock prevents concurrent ownership; atomic flushed replacements and private POSIX permissions/Windows owner ACLs protect host files. Malformed identity/store/trust fails closed and is preserved; never delete it to work around a startup error. Restore the separate host backup. Existing workspace data is untouched.

The desktop generates a separate per-launch owner key in main and provisions it through child environment, independently of the lifecycle stdio proof. JSON, multipart, file preview and download requests add it in main only. Renderer headers cannot supply credentials; profiles, IPC bootstrap snapshots and logs exclude keys. Current remembered non-managed loopback profiles cannot acquire this new owner access automatically; D6 supplies connection onboarding. Existing old servers can still use their original contracts until explicitly migrated.

## Trust lifecycle

Each host creates a unique RSA 3072-bit CA with ten-year validity and a one-year server leaf using [Bouncy Castle 1.86](https://www.bouncycastle.org/download/bouncy-castle-java/). JSSE serves TLS 1.2/1.3. SANs include localhost, loopback and current private interface IPs. Startup and enabling sharing renew a leaf if addresses changed or less than 30 days remain. `POST /api/owner/trust/renew` refreshes addresses/leaf and reloads the TLS connector. An address change during hosting requires this owner renewal or a restart; continuous address discovery follows in D6. IPv6 SANs exist for trust, but the current shared listener is IPv4.

CA fingerprint and host UUID remain stable across leaf renewal, address changes, server restart and workspace replacement. An expired or damaged CA is not silently rotated. Explicit trust replacement is a separate recovery procedure: back up the old host directory, create a new host trust identity deliberately, verify it out of band and reapprove clients. Do not reuse an old approval against changed trust. Desktop certificate pinning/profile storage and user-facing changed-trust handling are D6, not implemented here.

`GET /api/access/host` exposes only host UUID, SHA-256 CA fingerprint, pairing type and TTL. This response alone cannot establish trust. Owner-only `GET /api/owner/trust/certificate` downloads the **public CA PEM**, never private keys. Compare its DER SHA-256 fingerprint using the owner connection/out-of-band transfer before trusting it. Install only that CA deliberately in a browser's applicable OS/profile trust store; remove it explicitly when retiring the host. No code installs trust, changes firewall rules, disables TLS validation or tells clients to routinely bypass certificate warnings. Precise Windows/Mac trust UX is D6.

## Enrollment and approval

1. A client first verifies the host certificate/chain and expected fingerprint. It sends `POST /api/pairings` over shared HTTPS with `name` (1–80 characters), `kind` (`desktop`, `browser` or `agent`), a random 32-byte hexadecimal `nonce`, and the verified CA `fingerprint`.
2. Response: `id`, unguessable `secret`, six-digit `code`, `expiresAt`, `hostId`, and `fingerprint`. The code binds the trust fingerprint, client nonce, request ID and enrollment secret. Store these transiently; never log them.
3. Owner `GET /api/owner/pairings` lists pending names/kinds/codes. Physically compare the code shown on both devices before `POST /api/owner/pairings/{id}/approve` or `/reject` with `{ "code": "the six matching digits" }`. Repeating the same decision is idempotent; a different decision conflicts.
4. Client `GET /api/pairings/{id}` polls with `X-Vaultor-Pairing: <secret>`. Wrong secrets and expired requests are indistinguishable. Approval cannot be inferred or changed by knowing an ID.
5. `POST /api/pairings/{id}/complete` uses the same secret. For desktop/agent it returns a random 256-bit hex credential and device ID; protect it outside renderer/workspace storage. Identical completion retries return the same result within the five-minute enrollment window, without issuing another device. Browser completion sets its cookie and returns only approval/device ID.

Only SHA-256 credential verifiers are persisted, together with random CSRF proof, identity/name/kind/role and approval timestamp. Pending secrets/codes and retryable credentials live in memory until the **original five-minute deadline**; unfinished enrollment must restart after server restart. A device approved but never completed can remain as an unused entry; the owner can revoke it. Completed approvals have no routine expiry and survive workspace replacement and host restarts. Names are labels, not device identity.

`GET /api/owner/devices` returns summaries without verifier/CSRF values. `DELETE /api/owner/devices/{id}` durably revokes and drops related incomplete enrollment; subsequent requests fail. No stream is implemented until D7, and in-flight already-authorized requests are not retroactively cancelled. No Internet pairing or privileged agent bypass exists.

Limits: 16 KiB access-management request bodies, 32 outstanding enrollments, 32 browser tickets, 1,000 approved browser/device records, and 60 public/enrollment/owner access requests per observed source IP per minute. Rate buckets are bounded to 256 active IPs; state expires opportunistically. Poll every two seconds or slower. Problem details use fixed safe messages, stable codes and request IDs; no payload/code/secret/private key is logged. Device-store reads are capped at 2 MiB. Compose logs rotate at three 10 MiB files; desktop logging retains its existing bounds. Standalone stdout needs operator rotation. Sharing/device/trust files are outside transfer cleanup.

## Browsers, local handoff and CSRF

LAN profiles receive `__Host-VaultorClient`: Secure, HttpOnly, SameSite=Strict, Path=/, no Domain. Local owner browser sessions use separate `VaultorOwner`: HttpOnly, SameSite=Strict, Path=/. The local HTTP exception cannot set Secure; its owner role is accepted **only on the HTTP owner connector**. An owner cookie or key cannot grant owner authority on HTTPS. Cookie lifetimes roll to one year on authenticated requests while approval remains valid. Removing site data or losing credentials can require approval again; approval itself is not routinely expired.

`GET /api/access/session` returns current role/device and CSRF proof. Browser mutation adapters cache this per connection epoch, deduplicate concurrent lookups and add `X-Vaultor-CSRF` for application and raw diagnostic mutations. Failed lookups remain retryable and do not send the intended mutation. Both connectors reject foreign Origin and OPTIONS/CORS calls; there is no wildcard CORS. Enrollment and secret-bound completion are independent of an existing cookie's CSRF proof so interrupted completion remains retryable. A one-use bootstrap ticket is its own mutation proof and cannot be redeemed through HTTPS, including by approved peers. Reopening an already approved local browser consumes the new ticket and reuses its existing owner record.

Desktop **Open in browser** privately mints `POST /api/owner/browser-ticket`, then opens `/access#ticket=<one-use ticket>`. Tickets last 60 seconds. The access page removes the fragment from browser history before requests, exchanges it through `POST /api/access/bootstrap`, and sets owner session. Its minimal owner page can approve pending peers without Electron and has Open workspace. The page also provides bounded basic LAN request/code/polling; D6 owns its final UX. Browser/API responses do not claim OS trust or pairing occurred when it did not.

Standalone (while server is running):

```powershell
java -jar backend/target/vaultor-0.0.1-SNAPSHOT.jar --owner-bootstrap=http://127.0.0.1:8080 --host-access=backend/data/host-access
```

Use the actual host path for the working directory/configuration. This command prints only a one-use fragment URL. Open it within a minute; don't post it in logs/chat. No server is launched by this command. Desktop host paths/ports appear in connection Details. Docker, normal port 8080:

```powershell
docker compose exec vaultor java -jar /app/app.jar --owner-bootstrap=http://127.0.0.1:8080 --host-access=/data/host-access
```

For a different published owner port, substitute that port in the printed URL before opening; minting still uses the container's port. Never copy a durable owner key into the URL. Vite development stays on port 5173, proxies `/api` and `/access` to 127.0.0.1:8080, and rewrites only its two exact loopback development Origins. To bootstrap the dev browser, use the same hostname and substitute 5173 in the ticket URL. Other Origins remain rejected. The production proxy does not exist.

## Approved agent use and validation

API agents use the ordinary application endpoints after local owner authorization or LAN approval. Keep owner material on its local machine. For existing disposable smoke scripts, set `VAULTOR_OWNER_KEY_FILE` to that test server's host-access/owner.key. LAN agents instead use `VAULTOR_DEVICE_CREDENTIAL`, `VAULTOR_HOST_CA_FILE` and verified lowercase `VAULTOR_HOST_FINGERPRINT`; the shared built-in Node HTTPS adapter checks CA fingerprint, hostname and chain and forbids cross-origin credential forwarding. It never disables certificate checking. These are opt-in debugging credentials, not permission to mutate a real workspace. `--disposable` remains mandatory; no routine smoke runs were performed for D5.

D5 focused validation: seven backend cases (two host scenarios using real loopback/HTTPS connectors and a real restart, four desktop contracts, one revision/replacement case), ten frontend platform/CSRF cases, nine desktop transport/file/login cases, and one bundled-JVM crash/relaunch/data-preservation/standalone-bootstrap/approved-agent scenario passed. Checks cover denied API/assets/binaries/diagnostics/owner routes, default untrusted certificate rejection, approval/retry/wrong code/wrong secret/expiry/rejection/bounds, browser cookie/CSRF/origin/CORS, bootstrap replay/connector isolation, renewal, generation change and revocation. The file-service test's added assertion initially passed an owner object where a token was required; corrected fixture passed. Frontend compilation/build/lint, backend compilation/package, desktop syntax and OpenAPI reference checks passed. No real workspace, trust installation, Docker rebuild, native/browser visual session or Mac test was performed. D4 manual native save-dialog/OS-login and Mac checks remain pending.
