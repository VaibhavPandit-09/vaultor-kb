# Linked Markdown Gate 3 — integration, recovery and runtime

Reviewed 2026-10-25. Authoritative Gate 3 tracker and continuation point. Starting source is clean fetched master/origin `dc869971ae15fae98357e79bb4e0c1b2f9370117` (remote rechecked October25; unchanged). **Gate 3: BLOCKED.** The proposed original-object writer failed an actual hardlink confinement experiment; RWH oplocks also failed to prevent the demonstrated alias write. Source Save, repair and restore are now refused by the private desktop host. No public activation, release, version/protocol/archive change or real-project source writes. All mutating qualification uses disposable directories.

| Phase | Status | Objective / acceptance | Work, evidence, limitations and next action |
| --- | --- | --- | --- |
| G3-A Private desktop integration | Blocked | Actual Electron picker/private Java channel, independent validator, scoped opaque capabilities; forged/replayed/stale/context-switched requests refused; lifecycle keys/disposal | Real picker and mounted private-host round trip demonstrated. Five integration assertions passed before publication was rejected. Lifecycle, generation changes and adversarial renderer coverage remain unfinished. |
| G3-B Publication/metadata/recovery | Failed | Explicit B/L/V/D inspection/export/guarded restore; actionable missing-path/metadata interruption; metadata preserved or write refused | Rejected original-object writer:25 native assertions passed,1 mandatory hardlink assertion failed,1 explicit-label fixture unavailable. RWH lock granted but alias creation and content modification succeeded. Bridge refuses Save/repair/restore; no silent return to Gate2 publication. |
| G3-C Integrated editing/recovery | Blocked | Real mounted BlockEditor-to-disk workflow, versioned receipts, safe clean refresh/dirty conflict, focus/caret/remount/multiple panes, accessible comparison/recovery | Reuses BlockEditor/SharedNoteDocuments and actual PaneNavigation with transient linked IDs. Earlier native picker/edit/Save and Undo/Redo demonstrated. Latest recovery/restart/pane/departure changes remain partial or unqualified. |
| G3-D Runtime/fault/long-session | Blocked | Actual bundled Windows JRE/Electron, independent writers, faults, resource retention and measured sustained behavior | Actual bundled Temurin and development Electron used;7 real process-halt windows tested. Sustained resource/input/save latency, physical input, actual full volume/VM, privileged metadata and independent review remain unqualified. |
| G3-E Readiness/roadmap | Passed (assessment only) | Independent assessment of ten requested dimensions, exact limits and staged Gate 4 plan | BLOCKED assessment and prerequisites below. This phase status describes the assessment, not acceptance of the combined system. Stop for architecture review; no Gate4/release. |

## Initial decisions and risks

Keep authoritative B (original), L (validated source), V (visual draft) and D (fresh disk) separate. The host must never accept renderer source as validated. Native Save consumes a one-use host-created candidate. Trusted validation must reproduce source transitions using the existing engine, not merely parse arbitrary renderer replacement bytes. Scope includes workspace/generation, connection epoch, document epoch and edit version. Renderer receives opaque capabilities and display names only.

Gate 2's missing-path exclusive publication and incomplete metadata window are not accepted as finished user recovery. A production-relevant workflow requires explicit recovery actions with fresh root/identity/destination checks, retained evidence and no automatic publication replay. Gate 2's directory-pin failure remains historical evidence: all source targeting and notifications must stay handle-relative.

UI work follows the fully read UI philosophy: audit the existing lab before changes, specify states, then implement a compact development-only surface with shared editor/modal/focus primitives. Comparison/recovery is a contextual disclosure around the active document, not permanent diagnostic chrome. Reduced-motion correctness is immediate; no correctness waits for animation.

## Continuation

Stop for review of G3-B's failed confinement assumption. Do not enable the original-object writer or silently restore Gate2 publication. The next authorized continuation must resolve the publication/metadata contract first, then finish G3-A/C/D. This is an isolated engineering checkpoint, not an accepted release subsystem. Initial observations below are historical and superseded by the explicit rejection that follows.

## Implementation decisions and early evidence

The private integration lives under `desktop/qualification/linked-markdown/`, with a separate `markdown-g3.html` build. Normal main/preload/App never import it. Launch requires an unpackaged Windows executable, explicit environment gate and a marked scratch directory; even native picker choices outside that disposable fence are refused. Keys are random per native child and travel only over inherited pipes. The host-owned validator runs the actual bundled engine in a separate Node worker, reproduces JSON transitions and requires exact equality with the foreground's admitted source before signing. Merely parsing renderer replacement bytes or receiving an absent foreground source cannot mint a candidate.

The new publication candidate opens the original leaf by parent handle with READ+WRITE and no read/write/delete sharing, checks identity/hash/metadata, flushes B/L/V and a complete stage, then writes/flushes the same inode. No source rename or security descriptor copy occurs. Pathname and attached metadata therefore remain; partial content after a process/write failure is an explicit recovery condition. Initial bundled-runtime tests prove actual independent writers/rename are refused, and a writable memory mapping remains exclusionary even after its creating file handle closes. [CreateFile sharing semantics](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew) support this choice; process tests do not establish power-loss durability. A failed exclusive lease refuses Save rather than bypassing another editor. Gate2's capture/exclusive-publish implementation remains for historical recovery/fault evidence.

Early failures preserved: top-level `await app.whenReady()` in the ESM entry hung Electron44 before its ready event; moving startup into a non-awaited async function produced the actual window/host round trip. The initial public context included internal role fields, and strict request validation correctly refused its spread-back request; public context is now limited to token/workspace/generation/epoch. The first replay-test runner reused one ID after a refused request and was itself refused as replay; test IDs were corrected without relaxing replay protection. Windows accessibility-index actions were unreliable for owned dialogs; fresh screenshot coordinates after target activation completed the real native selections. No other app was intentionally automated.

## Blocking finding: original-object publication rejected

The hypothesis was that a READ+WRITE handle with sharing0 would prevent new aliases while the journaled original inode was edited. An independent Java process successfully called `Files.createLink` during `original-before-write`. The mandatory refusal test failed. A link can appear **before source bytes are written**, extending that write outside the consented root.

An RWH oplock was investigated with an asynchronous source handle, FSCTL_REQUEST_OPLOCK0x90240,12-byte input (version1, level7, REQUEST1),24-byte output and32-byte OVERLAPPED on x64. ERROR_IO_PENDING997 indicated a granted request. Nevertheless, the hardlink child completed before release, the alias existed, and output flags remained0. A subsequent overlapped write changed the outside-root alias from `Base` to `Edit`. Cancellation/completion was drained before releasing native memory. See [oplock-hardlink-failure.log](../../../../native/linked-markdown/evidence/g3/oplock-hardlink-failure.log), `OplockProbe.java`, and the original [hardlink-lease-failure.log](../../../../native/linked-markdown/evidence/g3/hardlink-lease-failure.log). The failed guard remains in `Gate3Tests.java`.

This rejects the tested mitigation; it does not prove every native strategy impossible. A final link-count/hash check cannot undo an out-of-root write. Oplocks are not treated as a security boundary. Microsoft documents [grant/completion](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ni-winioctl-fsctl_request_oplock) and [operation-dependent break semantics](https://learn.microsoft.com/en-us/windows-hardware/drivers/ifs/breaking-oplocks); the decision rests on the observed bypass.

**Containment:** `PrivateHost` unconditionally refuses source `save`, `repair` and `restore` with `G3_PUBLICATION_UNQUALIFIED`; it does not fall back to Gate2. `useOriginalObjectWrites` and `exclusiveWriter` also require the expressly unsafe native-probe JVM property, which only the rejected candidate test runner sets. The normal harness does not. Its UI announces the blocked state. Inspection, draft journaling and explicit CREATE_NEW exports remain isolated development facilities. Normal production main/preload/backend routes do not import this harness.

## Revision and recovery checkpoint

- B is original bytes/identity/SHA-256/metadata; L is last independently validated source; V is current visual JSON plus bounded source-edit/session metadata; D is a fresh native snapshot. A newer unvalidated V revokes the candidate while preserving prior L. Renderer flags cannot authorize Save.
- Native checkpoint sequence is separate from editor transaction version. Targeted-source text and reading metadata can be journaled without inventing editor transactions. The private validator reproduces transitions and requires exact foreground-source equality; a pending source textarea produces no write proof.
- Review tickets are bounded, expire after60seconds, bind scope/root epoch/reviewed D and are single use. Same-path replacement remains an independent occupant even with matching bytes. Experimental repair preserves reviewed D as new journal B, but source repair is now refused by the bridge.
- Native recovery exports B/L/V, reviewed immutable D and raw captured/staged artifacts. CREATE_NEW owner-only exports cannot overwrite an existing name. A full100-operation quota permits lifeboat export and explicit reviewed resolution; unresolved evidence is never automatically purged. Damaged tails permit prior-valid export but refuse repair; fully corrupt records permit raw artifact export only.
- Legacy missing-path restoration was tested against captured identity and fresh destination checks; reused names are never overwritten. Bridge restoration remains disabled pending an accepted publication design.
- Native notifications remain invalidation signals plus periodic authoritative checks. Close/revoke/disconnect unregister monitor handles. Checksummed UI-view references bind exact scope/root/relative/file identity; renderer consumption and restart restoration remain unfinished.
- Inspection found a clean-refresh race that could discard newer local work. Refresh now prepares, then freezes and checks version/disk before committing, with abort support. Latest code has compilation evidence, not mounted race acceptance. A normal-window journal-drain barrier is still missing; unjournaled edits at termination are not guaranteed recoverable.

## Actual evidence and limitations

Windows11 x64, fixed local NTFS, actual bundled Temurin25.0.4.1+1-LTS, system javac25, Electron44.5.1 / Chromium152.0.7977.130 were used. Mutation fixtures are under ignored `native/linked-markdown/.scratch/`. No real project documentation or user workspace was mutated. Installed Vaultor was neither updated nor terminated.

| Experiment | Actual result | Meaning |
| --- | --- | --- |
| Rejected writer `Gate3Tests` |25 passed,1 failed,1 unqualified | Mandatory hardlink failure; runner intentionally exits nonzero. |
| RW mapped buffer after channel closes | Save refused, map retained | Positive exclusion evidence for this case only. |
|7 independent process halts | B/partial/L path present; B/L/V retained; explicit reviewed repair tested | Process-crash evidence only. |
| Independent writer/rename under source lease | Refused | Does not establish metadata-only exclusion. |
| Metadata fixtures | Owner/group/inherited DACL/default-label hash, creation time and real NTFS EA retained | Rejected candidate only; last-write time intentionally changes. |
| Explicit integrity-label fixture | icacls exit5 under nonadmin token | Positive explicit-label guard fixture unqualified; no elevation attempted. |
| RWH hardlink probe | Granted997; hardlink completed; source write modified alias | Reproduced confinement failure. |
| Actual Windows pickers + mounted editor |5 assertions; zero page errors; one Save UI receipt196.75ms | Historical candidate before rejection, not current Save availability/performance acceptance. |
| Final private-host refusal |1 bundled-runtime test passes | Save/repair/restore refused; channel close clears key arrays/pending requests. |

The earlier mounted workflow used real OS folder/file dialogs and real keyboard input, independently validated and journaled the source, saved, compared exact bytes, then exercised Undo/Redo without automatic disk writes. Actual trusted-renderer IPC refused forged context, arbitrary paths, raw validation flags and replay. See [roundtrip.json](../../../../native/linked-markdown/evidence/g3/roundtrip.json). Its original `electron` field contained the Chromium version; the evidence now distinguishes those fields. Later sequence/version/recovery changes were not fully rerun mounted; adapt `roundtrip.mjs` to current monotonic request envelopes before reuse.

The representative diff between [before](../../../../native/linked-markdown/evidence/g3/roundtrip-before.md) and [after](../../../../native/linked-markdown/evidence/g3/roundtrip-after.md) adds only `Edited ` to a paragraph. CRLF, frontmatter, relative link, comment and table remain exact. No whole-document Markdown serializer was introduced. Gate1's256KiB/shape/input limits are unchanged; larger sources remain read-only. G3 sustained performance at that limit is unqualified.

Recovery UI is partial: compare/export primitives exist, but V reopening, disk-export/resolution controls, focus/reading restoration and accessible end-to-end conflict flows are not accepted. Source availability/watch behavior retains Gate2 evidence; combined desktop stress is outstanding. Physical IME, OS clipboard, long sessions, actual disk-full/quota volumes, OS termination, power loss and independent security review were not performed. Injected ENOSPC after an actual partial write is not a full-volume test.

### Final checkpoint checks and reproduction

Focused frontend regression: **129/129** across8 files (`src/lib/markdown`, `sharedNoteDocuments.test.ts`, `fillPaneNavigation.test.ts`). TypeScript compilation passed. ESLint on both qualification entry points passed after fixing a harness component export; the isolated G3 Vite build passed with existing chunk-size/dynamic-import/Browserslist warnings. All desktop qualification modules passed Node syntax checks. Native Java compilation passed. Original Gate2 safety tests passed **68/68 on the bundled runtime**, with historical Gate2 evidence restored byte-for-byte; new output is `evidence/g3/gate2-bundled-*`. Final refusal test passed1/1. The rejected writer suite was rerun and remained25 passed /1 failed /1 unqualified, as expected; its failure is not included in a passing aggregate.

Reproduce from the repository root (PowerShell), compiling before any native command:

```powershell
javac -d native/linked-markdown/build native/linked-markdown/src/vaultor/linked/*.java native/linked-markdown/test/vaultor/linked/*.java
node --test desktop/qualification/linked-markdown/bridge-refusal.test.mjs
& desktop/bundle/runtime/bin/java.exe --enable-native-access=ALL-UNNAMED -cp native/linked-markdown/build vaultor.linked.OplockProbe
# Rejected candidate characterization: expected exit1, mandatory hardlink failure.
& desktop/bundle/runtime/bin/java.exe --enable-native-access=ALL-UNNAMED -cp native/linked-markdown/build vaultor.linked.Gate3Tests
```

`Gate3Tests` explicitly enables an unsafe experiment property within its own process and only mutates generated disposable fixtures. Do not enable it in the private host or a normal app. The historical `roundtrip.mjs` Save workflow is deliberately incompatible with the now-refusing bridge and is not a current acceptance runner. The controlled harness is built with `npx vite build --config vite.markdown-g3.config.ts` in `frontend`, then launched with `node desktop/qualification/linked-markdown/launch.mjs`. It cannot authorize sources outside its marked scratch directory. The owned harness process used for the earlier workflow was closed before this checkpoint; the user's installed app was left running.

### Metadata and durability policy

**No G3 write-capable metadata envelope is accepted.** Original-object writes avoided metadata copying but failed confinement. Gate2 replacement retains missing-name/incomplete-metadata windows. A replacement must preserve or refuse owner/group/DACL/inheritance/SACL/labels, flags, timestamps/creation metadata, EAs/streams and filesystem-specific attributes before publication. Content hashes are insufficient. Explicit labels and case-sensitive directories are conservatively refused by the experiment; positive guard fixtures remain incomplete. Unknown SACL/privilege state cannot be called metadata parity.

Process halts were tested; OS/power/controller failures were not. Flush completion does not establish power-loss durability. A safe follow-up uses a disposable Windows VM and bounded NTFS volume: snapshot known B/L/V/D, cut VM power at instrumented stages, cold boot, inspect content/metadata/journals, exercise explicit recovery. Real quota/full-volume faults require a disposable volume; do not fill the host volume or elevate this session to obtain one.

## Readiness decision

| Dimension | Assessment |
| --- | --- |
| Source fidelity | Existing G1 bounded contract retained; early integrated byte example passed. Latest integration not fully requalified. |
| Rich-text usability | G1 subset retained; mounted insert/Undo/Redo demonstrated; full combined workflow unaccepted. |
| Native confinement | **Failed for proposed writer; final bridge refuses publication.** |
| Revision/conflict | Native review/conflict experiments passed; no accepted combined publisher. |
| Crash/recovery usability | Native B/L/V experiments positive; UI/restart/departure unfinished. |
| Metadata | Partial original-inode evidence; no accepted publisher/full SACL policy. |
| Installed runtime | Bundled JRE/development Electron exercised; packaged installation unqualified. |
| Long sessions | Not measured; no invented p95/memory-growth claim. |
| Workspace/session lifecycle | Scoped code exists; picker changes, restart, pane and departure adversarial qualification incomplete. |
| Security/platform | Windows local NTFS evidence only, no independent certification; no other write-capable platform. |

**BLOCKED.** The replacement publication assumption failed a core confinement guarantee. This triggers the requested stop-for-review condition. The private integration is useful evidence, not a foundation accepted for public activation.

## Exact continuation and Gate 4 plan

Authorize a focused G3-B architecture review first. Reproduce both hardlink probes using the bundled runtime. Investigate replacement-inode publication preserving displaced bytes/metadata without an overwrite race, or a demonstrably stronger native mechanism. Do not treat hash-check/rename as CAS, remove the failed assertion or accept out-of-root effects. Contract changes require explicit review. Keep bridge writes refused until independent-process safety tests establish the replacement. Revalidate Gate2 hardlink/reparse behavior and every metadata transfer primitive.

Then finish G3-A/C/D: protect validator/native build assets; test picker/workspace/generation races; complete stable view restoration, departure journaling, targeted fallback, refresh/dirty-conflict and capability teardown; implement current-V reopening and accessible compare/export/manual resolution. Offer three-way merge only with validated correctness. Run bundled-runtime native faults, disposable-volume exhaustion, installed development-package acceptance, sustained worker/Java/handle/journal/watch measurements, physical input and independent review. Define quotas while keeping unresolved evidence exportable.

Gate4 requires separate authorization after accepted G3 evidence, with these stages:

1. Source consent/management, unavailable/reconnect/revoke states and owner-local write capabilities.
2. Linked Sources tree with external ownership, identity-safe relative Markdown links/images and missing-target behavior.
3. Open Notes/panes/journeys/reading restoration; rich-text/source fallback; explicit Save, external-change/dirty indicators; managed-note regression acceptance.
4. Ordinary collection references without copying ownership; bounded source-aware search/indexing and availability states.
5. Contextual accessible recovery, version comparison/export/manual conflict resolution and interrupted-operation consent; no silent merge/overwrite.
6. Workspace external-dependency/portability reporting; preserve existing archive schemas unless separately authorized; no host credentials or implicit source ownership transfer.
7. Installed Windows local-NTFS acceptance: fidelity, attacks/faults, lifecycle, physical input, long-session quotas and security review. Other OS/filesystems read-only until independently qualified.
8. Separate release authorization, immutable version/tag, original signer, verified installers/updater and recovery handoffs. No Gate4 implementation or release is authorized here.
