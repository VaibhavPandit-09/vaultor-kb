# Linked Markdown Gate 2 — native filesystem safety

Continuation: [Gate 3 integration/recovery/runtime](LINKED-MARKDOWN-G3.md) is separately authorized from `dc86997`; the historical Gate 2 stop and limitations remain evidence.

Reviewed 2026-10-24. Authoritative Gate 2 contract, evidence and continuation point. Starting source: clean fetched `master`/`origin/master` at `faee732`, including unrelated desktop corrections. Gate 1's bounded CONDITIONAL contract was accepted for continued engineering only. **Gate 2 verdict: CONDITIONAL.** No public activation, release, version, protocol, archive, managed-resource, collection, Open Notes or updater change.

## Phase gates

| Phase | Status | Acceptance and actual evidence | Remaining limitations / next action |
| --- | --- | --- | --- |
| G2-A Revision/draft contract | Passed | Distinct B/L/V/D, versioned scope/epochs, single-use source-region tokens, latest validated source only. Six new frontend regressions, five actual browser checks, worker-to-native bridge. | Divergent rejected drafts require Undo to a validated projection before source-region editing. Production private bridge remains uninstalled. |
| G2-B Native ownership | Passed within Windows envelope | Owner-local signed picker consent, opaque capabilities, handle-relative access/publication, protected storage exclusion. Real junction, ADS, hardlink, traversal and root-reuse attacks refused. | Directory pins alone failed reparse mutation; replaced below. Bundled runtime/provider/other-platform review required. |
| G2-C Durable Save | Passed within process-crash envelope | Immutable B/L/V journals, flushed stage, captured original, exclusive publication; 11 actual process halts, newer V/old receipt and corruption tests. | Missing-path and metadata-restoration windows. Recovery is read-only evidence access, not automatic restoration/merge. |
| G2-D Reconciliation | Passed within bounded proof | Notifications invalidate; periodic authoritative rechecks also work without notifications. Rapid/atomic writes, actual folder move, own writes, dirty drafts and reconnect tested. | Explicit reopen after epoch change; no automatic retarget/rebase. Production session-load latency/memory unqualified. |
| G2-E Qualification | Conditional | 68/68 native, 7/7 consent, 156/156 frontend, 5/5 actual browser checks. Real external JVM writers/locks/junctions and Windows ACL/stream cases. | Physical disk full/power loss, installed runtime, providers, mapped writers and long-session acceptance unqualified. No core loss/authorization failure remains in the tested envelope. |

Authorized implementation is complete. **Stop after Gate 2.** A future session should verify the current baseline, read this contract/evidence, and address the decisions at the end. Do not infer authority to install IPC, register real roots, restore source files or begin full UI integration/release.

## Scope and trust boundary

The isolated reusable Java25 Windows x64 library lives in [native/linked-markdown](../../../native/linked-markdown/). It is not a Spring bean, backend endpoint, preload handler or startup task. Its tests explicitly use `--enable-native-access=ALL-UNNAMED`; no native flag/runtime or packaged component was added to the shipped app. Normal builds exclude this directory and the separate Markdown lab.

The Java host owns capabilities, SHA-256 revisions, journals and receipts. [desktop-consent.mjs](../../../native/linked-markdown/desktop-consent.mjs) is an **unregistered** main-process adapter with injected native picker/owned-host callbacks. It verifies local-owned/main-frame/workspace/generation/connection epoch before and after the dialog/host call. Renderer requests carry context tokens, never paths. Its 60-second HMAC picker proof binds selected path, scope and one-use nonce. Browser/Android/remote-desktop scopes are denied. JS-to-Java proof interoperation is tested; an actual Electron dialog and production pipe are not installed or claimed tested.

Separate host-injected consent and validation keys (minimum32 bytes, distinct values) have no production default. The demonstration validator bridge exchanges its key through private child stdin, never argv/renderer/HTTP/archive. A production bridge must itself run the accepted validator and guard scope/version before signing exact L/V. Renderer SHA-256/envelope is not authorization. An in-process Java `Scope` is trusted host configuration, never a deserialized renderer role.

The threat model includes untrusted renderer input, competing application saves and hostile source-path/reparse races. It trusts the host process, keys and host-private per-workspace storage namespace; this is not an OS sandbox against malicious same-user/admin code modifying that namespace or injecting into the host. Host-owned/private roots and their ancestors are excluded from linking. A changed protected-root catalog requires a fresh store/authorization context. No persistent root registry is implemented.

Protected catalog entries must themselves have a canonical no-reparse existing ancestor. An aliased host-storage entry or unavailable protected volume fails ownership initialization rather than concealing a physical exclusion or silently dropping it. Both are actual passing tests. The future host catalog must enumerate all real storage locations; this is not a recursive scan for arbitrary aliases inside managed storage.

## G2-A: frozen revision and draft API

| Value | Authority and lifetime |
| --- | --- |
| B | Exact original bytes; volume/file-index/creation-time identity; SHA-256 content and owner/DACL/attribute hash. Neither path nor timestamp alone is a revision. |
| L | Latest fully validated source-preserving bytes, at most256KiB and within Gate1 shape/input limits. Native independently rejects malformed UTF-8; engine admission owns syntax/BOM/encoding correctness. |
| V | Current visual draft, including rejected/unvalidated work. Journal UTF-8 payload limit1MiB; caller retains work when a journal request fails or exceeds admission. V is never silently substituted by L. |
| D | Fresh leased disk revision; never silently substituted for B or V. |
| Context | Workspace/generation, opaque root/document, epoch, monotonic edit version, one-use candidate and operation UUID. Reconnect rotates epoch; old documents require explicit reopen. |

Frontend `prepareExplicitSave` exports only ready-session bytes, computes SHA-256 asynchronously, and refuses superseded versions/mutated bindings. Pending/failed/composing/needs-source drafts cannot export writable bytes. Native accepts neither raw renderer source writes nor `validated:true`.

```text
authorizeSelectedRoot(scope, selectedPath, nonce, expires, pickerProof) -> root capability
openRelative(scope, root, trustedIndexedRelativeName) -> document, epoch, B
journalDraft(scope, document, epoch, version, V, L-or-null, validationProof-or-null)
    -> one-use candidate-or-null, only after durable journal acknowledgement
save(scope, document, epoch, candidate, operationUUID) -> versioned receipt
reconcile(scope, document) -> state, D-or-null, dirty, retained V
disconnect / reconnect / revoke; recover; readRecoveryArtifact; readChunk; close
```

`openRelative` is a trusted host-indexer entry point, not renderer path authority. Proof binds document/epoch/version, B identity/content/metadata, SHA-256(L) **and SHA-256(V)**. A newer draft observation revokes the older candidate even if its validation/journal subsequently fails. Only successful durable validated journaling mints a candidate. Invalid proof/oversize/I/O are refusals, not durable acknowledgements: caller retains V and shows failure. Unvalidated V can be journaled without a candidate. Unavailability/disconnection does not prevent private draft protection; revoked/disconnected/stale epochs cannot mint write authority.

Save consumes the candidate and snapshots B/L/V/version at admission. Receipt acknowledges only that version; a newer V stays dirty and must revalidate against the new B. No autosave. Operation UUID reuse is refused, not replayed. Ambiguous response requires recovery inspection, not blind retry with a new UUID.

### Mandatory source-region correction

Gate1's ordinal targeting after rejected structural edits is independently guarded and corrected at the worker boundary. Region lookup requires the latest validated editor node to match the canonical source projection and yields a random bounded single-use token. Accepted source/history changes invalidate tickets. The coordinator also binds tickets to editor version, invalidates on submission and refuses lookup while V diverges. Worker source writes use tickets, never ordinals from rejected drafts. Direct engine `editSource` remains an internal trusted/test primitive, not a worker/native endpoint.

Actual mounted Edge tests delete a protected block (rejected structural draft), attempt fallback/Save export, Undo, and invalidate an open dialog with a subsequent real transaction. Wrong targets/replay/stale edits refuse while exact source and V survive. Recovery currently requires Undo to a validated document before fresh region review. This restriction is explicit and is not counted as ordinary visual editing support. Ambiguous fallback cannot authorize native Save.

## G2-B: confinement and rejected security assumption

[WindowsFiles.java](../../../native/linked-markdown/src/vaultor/linked/WindowsFiles.java) implements native primitives; [LinkedStore.java](../../../native/linked-markdown/src/vaultor/linked/LinkedStore.java) owns policy. Admit fixed local NTFS, Windows x64, direct canonical DOS paths, same-volume recovery and same-owner ordinary files. Refuse traversal, absolute/ADS/device names, `.git`, deep paths, aliases, symlinks/junctions, multiple hardlinks, alternate streams, readonly and unqualified attributes including ordinary EFS/compression/reparse forms. Private marker binds workspace/generation; owner lock denies duplicate hosts. Identity mismatch never silently retargets based on equal content.

**Failed security experiment retained:** no-delete ancestor pins block rename but do **not** block a directory-write handle or `FSCTL_SET_REPARSE_POINT`. A separate process junction-mutated a pinned empty directory just as it did the unpinned control. Path-based publication plus rechecks was rejected. [ReparseProbe](../../../native/linked-markdown/test/vaultor/linked/ReparseProbe.java) reproduces this; [probe output](../../../native/linked-markdown/evidence/reparse-probe.txt) records it. Acceptance was not weakened: source escape remains forbidden.

Replacement walks one component at a time with **NtCreateFile, RootDirectory=held parent**, no-follow opening and post-open type checks. Reads/leaf leases use that parent. Capture/publication use **NtSetInformationFile/FileRenameInformation**, a held target-directory handle, one leaf name and `ReplaceIfExists=false`. Source security/creation metadata use handle-based Get/SetSecurityInfo and Get/SetFileInformationByHandleEx. No absolute source-path rename or pathname ACL-copy fallback. Pins still block ancestor renames and detect mutation for conservative recovery; they are not the authority for resolving final targets.

Final tests actually convert the source directory to a junction in separate processes at `captured` and **after the final reparse check** at `publication-boundary`. No source filename appears outside the authorized directory; receipt is RECOVERY_REQUIRED and L remains durable. This proves confinement independently of a favorable check-to-use interval. Canonical parent-chain and reused-root tests also pass. Nonzero/pending NTSTATUS is refused; asynchronous completion is not assumed.

API references: [CreateFile sharing/no-follow](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew), [NtCreateFile](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntcreatefile), [rename structures](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_rename_info), [GetSecurityInfo](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-getsecurityinfo). These describe semantics, not certification of FFM ABI/layout or provider behavior. Only the exercised runtime/platform is qualified here.

## G2-C: durable explicit Save and recovery

States: `DRAFT -> PREPARED -> STAGED -> CAPTURED -> PUBLISHED -> COMMITTED`, with CONFLICT, RECOVERY_REQUIRED or refusal at a boundary. Checksummed immutable binary records include B/L/V/context. Stage/records are flushed before destructive actions. New private files/stage are owner-only before bytes are written. Captured original retains its original ACL: preservation of original access semantics, **not** owner-only confidentiality of an originally shared preimage. Private-parent access is separate.

1. Journal intent; acquire source READ+DELETE lease denying competing write/delete opens. Fresh D identity/content/metadata must equal B. Existing incompatible handles cause refusal, never forced access.
2. Stage/flush L privately on the same volume, verify it and reserve bounded recovery quota before capture.
3. Rename leased original into unique private `captured.md`; B is also in the already-flushed journal.
4. Publish stage by exclusive handle-relative rename. If another process fills the gap, its file remains untouched and Vaultor retains B/L/V. Recheck scope, directory state and final source.
5. Restore owner/DACL/creation metadata through the staged handle, record publication, authoritative final check, then COMMITTED. Changed postpublication D is conflict evidence; mismatch/failed check cannot be clean Save.

This is **not atomic cross-process compare-and-swap**. The deliberate missing-path window trades uninterrupted visibility for exclusive publication and retained preimages. Other editors may observe absence. A crash after publication but before metadata restoration may leave L owner-only pending reviewed repair. No automatic restore/repair. Same-volume private storage is mandatory; policy for additional drives requires production design.

| Actual process termination point | Source after restart | Recoverable evidence |
| --- | --- | --- |
| prepared, stage-chunk, stage-before-flush, staged, before-capture | B at original path | Full B/L/V journal; partial stage does not replace journal L |
| captured-before-journal, captured | Original path absent | Captured B plus B/L/V; recovery does not recreate path |
| published-before-metadata | L at path, metadata may be restricted | Captured B and B/L/V; review/repair required |
| published-before-journal, published, committed | L at path | Captured B and B/L/V; last stage marker alone cannot establish live state |

All 11 child processes actually call `Runtime.halt(73)` and restart under a new host. Interrupted recovery uses another real halt74 and repeated read-only recovery. Tail corruption/truncation keeps prior valid records; total corruption returns CORRUPT_REVIEW and bounded raw capture/stage/external export, never a candidate. Recovery never deletes/mutates source/evidence or replays a publish. It provides three-way/conflict evidence, not an implemented merge/restoration UI.

Competing in-place writer, replacement writer, gap atomic save, hardlink interloper and postpublication writer are separate JVMs. Preflight mismatch preserves D with CONFLICT; gap collision retains interloper and returns RECOVERY_REQUIRED; postpublication conflict retains B/L/V/D. Root revocation between capture/publication prevents publishing. Real watched folder move retains dirty work and requires identity-checked reconnection/reopen.

## G2-D: bounded invalidation and reconciliation

[ChangeMonitor.java](../../../native/linked-markdown/src/vaultor/linked/ChangeMonitor.java) treats handle-bound ReadDirectoryChangesW events as invalidation, with periodic authoritative rechecks (50–10000ms testable period). One scheduler coalesces work without an unbounded queue;64 documents/directories maximum. Notifications-disabled is a passing test. Own Save events are rechecked, not suppressed with a timed ignore window.

A final confinement audit rejected pathname-based Java WatchService registration, even though event names were never exposed: registration itself could resolve a mutable ancestor. The replacement opens an asynchronous notification handle relative to the already-confined parent and verifies directory identity. Buffers are4KiB, filenames are never interpreted/exposed, and overflow/errors trigger authoritative polling. Actual junction mutation leaves the subscription bound to the original inode;30 repeated arm/cancel cycles close event/directory handles within the measured process-handle bound. Cancellation is drained before freeing OVERLAPPED/buffer memory, following [ReadDirectoryChangesW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-readdirectorychangesw) and [CancelIoEx](https://learn.microsoft.com/en-us/windows/win32/api/ioapiset/nf-ioapiset-cancelioex). Unexpected uncertain kernel completion retains the bounded buffer allocation and refuses new subscriptions until process restart; polling continues. That exceptional kernel/provider failure path is defensive code, not a reproduced fault qualification.

States distinguish SOURCE_UNAVAILABLE, ROOT_REPLACED, DOCUMENT_MISSING, DOCUMENT_REPLACED, EXTERNAL_CHANGED, dirty CONFLICT, BUSY_RETRY, stale epoch and unqualified/too-large source. Unavailable ancestors are not confirmed file deletion. Root unavailability rotates epoch; reconnect checks original root identity. A reused filename is never automatically rebound. Returned D never overwrites/rebases/merges V, even when source was clean. Large files are read-only descriptors/chunks and cannot mint candidates.

## G2-E: actual evidence and reproducibility

| Check | Result / evidence |
| --- | --- |
| Windows ownership/save/watcher/fault | **68 passed, 0 failed**; [ledger](../../../native/linked-markdown/evidence/native-tests.txt), [log](../../../native/linked-markdown/evidence/native-run.log). Final externalBusyRetries=0. |
| Main-process consent | **7 passed, 0 failed**; [log](../../../native/linked-markdown/evidence/consent-tests.log). |
| Focused engine/corpus/mounted/history/table/recovery | **156 passed,12 files**, including6 new G2 regressions; [log](../../../native/linked-markdown/evidence/frontend-tests.log), [machine results](../../../native/linked-markdown/evidence/frontend-tests.json). |
| Actual compiled lab/module worker, headless Edge | **5 passed,0 page errors**; [evidence](../../../native/linked-markdown/evidence/browser-regions.json). Not installed Electron/physical input certification. |
| Compilation/lint | Java library/tests compilation, frontend lint, TypeScript/ordinary Vite and separate lab build passed. Frontend unchanged since those checks. |
| Interoperation | Actual bundled worker rejects underline V, validates intended L, then private test bridge signs exact L/V and Java saves only the valid candidate. Actual JS picker HMAC verified by Java. |

All native fixtures are disposable `.scratch` directories, never real project documentation or installed workspaces. Equality tests compare exact byte arrays (Unicode/UTF-8/CRLF), identity and metadata. Original Gate1 corpus/locality/diff evidence remains authoritative; native work does not regenerate Markdown. Region checks compare exact untouched source around protected edits. [environment.json](../../../native/linked-markdown/evidence/environment.json) records runtime/platform/worker digest.

Tests also exercise real ACL READ_DATA denial, readonly attributes, independent locks, actual PowerShell NTFS ADS, Unicode directory/filename, eight saves/restart, foreign scope/duplicate host, quota exhaustion, close/revoke, newer draft during receipt, malformed UTF-8 and offline draft journaling. Disk-full handling is **injected SIMULATED_ENOSPC before capture**, not a physically filled volume. Periodic read leases may transiently block an external writer; bounded explicit busy handling/retries are recorded, never concealed as successful merge.

Initial26/35 run failures are retained in [initial-failures.txt](../../../native/linked-markdown/evidence/initial-failures.txt): child Unicode argument transport was wrong, corrected with UTF-8 Base64. Later watcher contention assumptions and incorrect colon-path ADS helper failed; bounded busy handling and actual NTFS stream creation corrected the test mechanisms. The substantive pinned-directory security failure is preserved above. Win32 SetFileInformationByHandle relative rename returned error87 and was rejected; NtSetInformationFile is tested instead. No Java pathname move or whole-document serialization substitutes for failed experiments.

Reproduce from repository root with Java25/Node/dependencies installed:

```powershell
.\native\linked-markdown\run.ps1
# Builds separate worker, compiles Java, runs native and consent checks.
# -SkipWorkerBuild requires an already matching separate worker build.
Set-Location frontend
npm test -- src/lib/markdown --reporter=default --reporter=json --outputFile=../native/linked-markdown/evidence/frontend-tests.json
npm run lint
npm run build
npx vite build --config vite.markdown-g1.config.ts
```

For browser checks, preview the separate lab build on e.g.5176; set VAULTOR_G2_URL and VAULTOR_PLAYWRIGHT_PACKAGE to the available Playwright module; run `node native/linked-markdown/test/browser-regions.mjs` from repo root. No broad backend/API/workspace smoke, installed-app modification or release was needed/performed: those paths are unchanged. Gate1 physical IME/OS clipboard and long-session memory acceptance remain mandatory.

## Limits, verdict and next authorization

Hard bounds:8 roots,64 docs,128 consumed consent nonces/store; relative names1000 characters/depth32; writable B/L256KiB, V1MiB; chunks64KiB, recovery reads8MiB; store256MiB/100 operations/1000 files. Quota exhaustion refuses work without deleting evidence. No auto-pruning, production close-document lifecycle or persistent authorization registry. Recovery loads a bounded set, but peak memory/latency and long-session quota management are **not production-qualified**. Oversized descriptors use READ_ONLY_LARGE, not a cryptographic full-file revision; chunks are live reads, not one atomic snapshot/export. They cannot become writable.

Qualified proof: recorded Oracle Java25 Windows local NTFS x64. Unqualified: installed bundled Temurin, other Windows versions/filesystems, additional-volume recovery, macOS/Linux, SMB/removable/cloud providers and filter combinations. Attribute checks are not complete cloud certification. Existing mapped writers, hostile same-user private-store tampering, sudden power loss, NTFS directory flush ordering and controller durability were not proven. Flush plus process halt cannot establish stronger guarantees.

Metadata preservation evidence covers owner, DACL/protection, ordinary attributes and creation time. Group/SACL/integrity-label/NTFS extended-attribute preservation is not qualified or comprehensively filtered by this library. Before real-file activation, preserve or explicitly refuse any unsupported metadata class; do not interpret a passing default-ACL fixture as complete NTFS metadata fidelity. The retained original inode remains available for review. This is an additional reason the isolated writer is not ready for ordinary-user authority.

**CONDITIONAL:** editor/native admission, confined exclusive publication, tested competing-revision preservation, process-crash recovery and dirty-draft reconciliation work within this envelope. The failed reparse assumption was replaced and retested. Public direct editing stays inaccessible. Before integration/activation:

1. Accept or replace missing-path publication and metadata-restoration windows. Implement reviewed B/L/V/D export/merge/restore using fresh revision/consent checks; never automatically recreate a missing/reused path.
2. Integrate/security-review private owner-host validator/consent channel, ephemeral keys, workspace revocation, protected-root catalog and capability disposal. Preserve no-network/no-renderer-path authority; no HTTP shortcut.
3. Requalify FFM ABI and late reparse behavior on the actual bundled Windows runtime/supported providers, with independent security review. Other platforms refuse writes until tested.
4. Qualify realistic durable-volume failures, bounded recovery memory/latency, retention/export/quota UX and read-only unavailable/large-source behavior. Define sudden-power-loss guarantees honestly.
5. Carry Gate1 physical IME/clipboard, long-session memory and accepted256KiB shape/input limits into release acceptance. No new editing parity or capacity claim here.

Recommended next instructions, **only after explicit authorization**: review these decisions; keep activation gated; connect the isolated API through a private desktop-local owner channel to a disposable-data recovery/session harness; implement explicit conflict/recovery actions against B/L/V/D; qualify bundled Windows runtime and pane/workspace/restart revocation; rerun fault/security/mounted checks before any full linked-folder UI or release. Passing this isolated suite does not broaden filesystem authority.
