# Linked Markdown architecture and fidelity qualification

Reviewed: 2026-10-24. **Qualification only; production implementation and releases are not authorized by this investigation.** This is the single authoritative phase tracker and eventual feasibility report. Prototype code and generated evidence live under `experiments/linked-markdown/`; no production import path may reference them.

Baseline: clean `master`, `4c760e43dbec1c72e4b4fe3f886d321426579709`, matching fetched `origin/master`. Other worktrees were inspected but are outside scope. Preserve managed resources, Tiptap JSON, protocol3, archives and all existing data.

## Phase gates and progress

### Phase 1 — Architecture and library investigation

- Status: Passed.
- Objective/scope: inspect actual editor, conversion, host, revisions, sessions, links, storage and portability; evaluate existing source-aware tooling before custom infrastructure.
- Acceptance: identify reusable/replaced components with source references; compare parser alternatives and offset semantics; select a bounded, falsifiable prototype architecture with documented risks before implementation.
- Completed: baseline/worktree inspection; living guide, index, development and UI contract review; initial Markdown and shared-history source inspection.
- Evidence: frontend `markdownUtils.ts` converts through marked HTML and exports best-effort JSON; backend `ImportMarkdown.java` converts CommonMark to owned JSON without source provenance. Neither is a lossless linked-file save path.
- Decisions: external bytes remain authoritative; experiment will not enable production filesystem writes or change managed-note saving.
- Limitations/risks: source positions alone do not map decoded entities/escapes, list indentation, reference dependencies, or editor node boundaries. mdast selected with raw-byte authority; no serializer-fidelity assumption.
- Next: Phase 2 is justified with the bounded mapping approach below. No claim of fidelity before experiments.

## Phase 1 findings and recommendation

The baseline has no linked-directory registry, persistent OS file identity or content-directory watcher. `desktop/src/files.mjs` acquires temporary native import tickets and rejects folder symlinks/junctions using lstat/realpath; it copies/imports content rather than maintaining external authority. `HostFiles.write` flushes a private temporary file then requests atomic replacement; it has no external revision precondition and is intended for host-owned storage. Neither provides external cross-process CAS.

`BlockEditor.tsx` uses StarterKit3.31.4, custom code blocks, WorkspaceTable, SharedHistory, task lists, resource links/images and symbol replacement. Its onUpdate exports JSON after a delay, losing individual steps. `sharedNoteDocuments.ts` already broadcasts original/appended steps and history across views sharing a schema. Capture transactions **before** JSON debounce in a separate linked-document controller, once per logical document, retaining per-view selections. Reuse visual surfaces/history conventions, not the existing autosave callback. Disable unqualified slash, rich table, automatic symbol and managed-image mutations for linked documents.

`markdownUtils.ts` marked→HTML import and best-effort Markdown helper discard lexical details; nested lists/table/link export is especially unsuitable. `folderImports.ts` converts through inert DOM and remaps batch references into resource IDs, intentionally creating managed notes; it cannot back linked authority. Java `ImportMarkdown` parses CommonMark without source spans, preserves HTML as text, flattens unsupported links to text and does not enable GFM extensions. `NoteRenderer` produces derivative exports (including HTML tables), not original source. Replace all three conversion/save paths for linked documents, leaving managed behavior intact.

`ResourceService`/Resource revisions use SQLite/JPA optimistic versions and If-Match, protecting managed mutations within a single host. They cannot detect disk edits made by Git/editors. `SaveCoordinator` coalesces writes; `NoteRecovery` stores revision-bound JSON drafts in IndexedDB and acknowledges matching versions. Reuse version/epoch/late-response protection ideas, but require raw base/local source plus a native durable journal for linked files. Existing journal best effort and memory-only undo are documented limitations. Sessions/journeys use resource UUIDs and numeric positions; links are atomic `resourceLink` nodes whose stored labels and IDs drive relationships. Linked identity/navigation needs a tagged target model rather than converting Markdown paths to managed IDs. `FileContentIndex` is a derived managed-resource index. Archives/checkpoints copy owned originals and JSON and exclude private paths/drafts/credentials: never smuggle linked roots or writable copies into these contracts.

### Tooling comparison (primary sources checked 2026-10-24)

| Candidate | Evidence and fit | Decision |
| --- | --- | --- |
| [mdast-util-from-markdown](https://github.com/syntax-tree/mdast-util-from-markdown) / micromark | CommonMark semantic AST with source positions, extension ecosystem for GFM/frontmatter/directives. AST does not retain all lexical tokens; raw source must remain separate. Already transitively present through ReactMarkdown. | Recommended semantic parser for initial bounded prototype; retain raw bytes plus leaf ranges and protect non-bijective mappings. |
| [Lezer Markdown](https://github.com/lezer-parser/markdown) | Compact concrete syntax ranges and incremental fragments; documentation explicitly says references are parsed without definition validation. No source-preserving Tiptap bridge or writer. | Run comparative experiment; promising later CST/incremental layer and targeted CodeMirror source control, not semantic authority alone. |
| [commonmark-java](https://github.com/commonmark/commonmark-java) | Source spans can be enabled and extensions exist, but current converter does neither. Java does not supply PM-position mapping. | Host validation candidate; avoid two disagreeing grammars for initial proof. |
| [mdast-util-to-markdown](https://github.com/syntax-tree/mdast-util-to-markdown) | Configurable AST serializer, not source patch engine. | Negative control only; never a linked-save fallback. |
| marked/current HTML pipeline | Tokens/HTML useful for import, no stable source→editor mapping after normalization. | Retain owned imports; reject for linked saves. |

### Prototype decision before implementation

Use immutable UTF-8 Buffer authority, strict decoding, mdast extensions and a Tiptap-derived schema. Map exact literal leaves to PM text positions; expose raw/unmapped constructs as inert protected nodes. Apply real PM replacement steps only inside one bijective leaf; construct one byte patch, reparse the entire candidate and compare its projected PM document to the intended transaction document. Reject any mismatch, preserving both candidate editor draft and last validated source. No heuristic whole-document serialization. Formatting text within existing marks is a first target; new markup/structural changes are deliberate negative cases before adding broader grammar-specific writers.

PM counts text in UTF-16 code units plus structural node tokens; JavaScript/mdast offsets must be experimentally checked, never treated as bytes. Build validated UTF-16→UTF-8 boundaries; refuse surrogate splits and invalid UTF-8; preserve BOM and original line endings. Raw AST value equality is necessary but not sufficient: entities/escapes/continuation indentation need token-level maps or protected representation. Whole-candidate semantic projection comparison catches downstream grammar effects but requires projection completeness; raw protected payloads participate in equality. Production must additionally verify source-span/dependency invariants and bound parser work.

Phase 1 gate: **Passed** for architecture selection and falsifiable experiments, not production reliability. Material choice: rich-text-first with protected unsupported regions and explicit rejection is compatible with the requested direction; universal unrestricted Tiptap commands are not assumed safe.

### Phase 2 — Source-preserving visual editing

- Status: Passed.
- Objective/scope: isolated parser/source map, real ProseMirror transactions, minimal byte patches and reparse validation; synthetic and repository fixtures.
- Acceptance: no-op byte equality; exact unaffected byte ranges; successive edits and real history undo/redo; supported and rejected cases for all requested constructs; record diffs/failures and timing. Never whole-document serialization.
- Completed/evidence: isolated pinned npm experiment, mdast extension parser, Tiptap-derived schema, literal source mapping, byte patch/reparse guard and real PM history tests. First run: 46/52 passed; six failures retained here as evidence.
- Decisions/limitations/risks: BOM was excluded from parser offsets and required explicit +1 mapping; two LF/CRLF nested-list expectations were actually lazy continuation text (a nested ordered list interrupt must start at1). Corrected fixture plus a protected-continuation regression. Unmatched `*` remains literal, so corrected the grammar-change negative case to paired emphasis. These are not reasons to relax byte-preservation or semantic-validation gates.
- Next: Phase 3 justified. Final fidelity run at this gate: **58/58 passed**, including42 replacement mutation trials inside one test, five actual repository documents, byte-prefix/suffix checks, real PM Undo/Redo, multi-step all-or-nothing rejection, BOM correction and Lezer/serializer negative controls. Exact safe subset is deliberately limited to literal-leaf replacements; final-leaf deletion is protected to retain reverse mapping. No DOM/native/editor visual qualification is claimed. Performance and representative diffs will be generated for final evidence.

### Phase 3 — Filesystem revisions, conflicts and recovery

- Status: Passed.
- Objective/scope: disposable filesystem harness for base/local/disk hashes, durable journals, conditional writes, conflict comparison, injected failures and recovery.
- Acceptance: demonstrate stale-base conflict, nonoverlap/overlap decisions, deletion/replacement, watcher reconciliation and crash windows; expose unavoidable cross-process race; never claim universal atomic CAS or power-loss durability.
- Completed/evidence: **28/28 passed** in `phase3.test.mjs`: external child-process races, real native ReplaceFileW backup/sharing cases, five abrupt worker exits, SHA/identity conflict checks, durable pre-Save drafts/late acknowledgement, captured preimages, deletion/rename, journal corruption, actual junction refusal, hardlink refusal, watcher invalidation,20 rapid replacements, conservative three-way merge and injected storage/permission/full-disk failures.
- Decisions/limitations/risks: conventional check→rename was proven unsafe. Capture-and-exclusive-publication retains intervening bytes but temporarily removes the target path. Native Windows ReplaceFileW retains the displaced file without that deliberate gap; it is a candidate for production, not a CAS guarantee. Native API first run had23/25 passing because this PowerShell environment lacks Get-FileHash; removed that unnecessary helper, retained Node SHA assertions, then25/25 passed before adding three draft/fault tests. Windows local-volume evidence cannot qualify other filesystems/platforms, power loss or hostile ancestor swaps.
- Next: Phase 4 justified. Preserve displaced revisions and classify uncertain outcomes before acknowledging Save; qualify platform native replacement/confinement in production work. Do not ship the Node harness as the save engine. Final review added deletion-after-commit and invalid-UTF8 merge regressions, yielding30/30 filesystem cases. Missing-path restoration now requires explicit recovery review even after an interrupted capture; it is never an automatic source recreation.

### Phase 4 — Integration and compatibility

- Status: Passed.
- Objective/scope: map qualified architecture to host ownership, Open Notes, panes/journeys, links/search/collections, source availability, backup/security and explicit Save UX.
- Acceptance: component-level integration/compatibility matrix; no writable-copy model; explicit remote/native boundary; state/transition contract aligned with UI philosophy; separate managed-note behavior and unchanged protocols.
- Completed/evidence: rechecked ResourceService/ResourceController conditional updates, FileContentIndex derived storage, FileStorageService managed-path confinement, NativeFiles main-owned tickets, NoteRecovery/SaveCoordinator and actual session/navigation/resource-link types against topic guides.
- Decisions/limitations/risks: a separate linked target/revision/controller is required. Host owns source registry/watcher/index/journal; Electron provides owner-authorized root selection and narrow native primitives. Renderer never owns arbitrary paths. Browser/remote linked editing is deferred until separately capability/grant qualified.
- Next: Phase 5 justified; component matrix and explicit source/save/navigation/security/portability contract below meet the design gate. No implementation compatibility is claimed for code not integrated.

### Phase 5 — Final qualification and roadmap

- Status: Passed.
- Objective/scope: consolidate reproducible evidence, exact safe subset, failures, performance, alternatives, staged production gates and GO/CONDITIONAL GO/NO-GO decision.
- Acceptance: all previous gates evaluated honestly; commands/results/diffs traceable; remaining platform/product risks explicit; documentation maintained and no production feature/release.
- Completed/evidence: consolidated architecture, fidelity matrix/diff, real filesystem/native negative controls, recovery cases and integration assessment. Initial measurements reveal seconds of synchronous work at1MiB, so large-document editing is a production gate.
- Decisions/limitations/risks: CONDITIONAL GO for source-preserving rich-text-first architecture; production enablement remains blocked on explicit gates below. No unrestricted serializer or general CAS claim.
- Next: qualification complete; stop before production/release. Final focused run: **88/88 passed, zero skipped** (58 fidelity +30 filesystem/recovery), recorded in [final-tests.tap](../../../experiments/linked-markdown/evidence/final-tests.tap). Metrics and both fixture/repository Git diffs generated successfully. Repository whitespace, experiment syntax, local evidence/document links and production-import isolation checked; no production compilation or UI/native app checks performed.

## Phase 2 evidence: source fidelity and exact editing subset

Reproduction from the repository root (Node24.18.1 and npm11.16.0 used here):

```powershell
Set-Location experiments/linked-markdown
npm ci --ignore-scripts --no-audit --no-fund
npm run fidelity
npm run filesystem
npm run evidence
```

The experiment has its own pinned package/lock and ignored node_modules/scratch. It imports no production files and production imports none of it. `source-editor.mjs` uses the actual Tiptap3.31.4 getSchema/StarterKit/table packages and ProseMirror state/steps/history **without a DOM**; it is not a test of the mounted BlockEditor, its custom extensions, IME or clipboard. Corpus input comes from five actual documentation files; their exact hashes/sizes and timing method are retained in [metrics.json](../../../experiments/linked-markdown/evidence/metrics.json). Updating the living guide intentionally changes its subsequent corpus hash; measurements identify the input actually used.

### Transaction algorithm actually tested

1. Strictly decode immutable original UTF-8 bytes, retaining BOM and EOLs; create a UTF-16 boundary→byte-offset table. Astral pairs have no valid interior boundary. Parser BOM exclusion is corrected explicitly.
2. Parse with mdast/micromark plus GFM/frontmatter/directive extensions. Project semantic blocks to Tiptap nodes, existing emphasis to marks, tables to table nodes. Map exact raw-equals-value literal leaves to their PM positions. PM container boundaries add positions that have no Markdown character equivalent. Unmapped blocks/inline syntax use atoms with exact raw payloads.
3. Inspect each real transaction step in its own pre-step coordinates. Only flat text ReplaceStep inside a single mapped leaf qualifies. Mark-only steps have empty positional maps but still change documents; they are explicitly rejected, not missed by relying on StepMap ranges alone. Structural Replace/ReplaceAround and attribute operations are rejected.
4. Convert the mapped source UTF-16 boundaries to **byte** ranges. Replace those bytes only. Each patch retains exact old prefix/suffix; no serializer is used. Unicode normalization is never applied.
5. Reparse the full candidate and compare its entire PM projection (including raw protected payloads) against the intended intermediate transaction document. Validate every step, then commit the batch together. Any failed step leaves authoritative bytes and accepted PM state unchanged and retains the proposed editor JSON in a separate draft.
6. Rebuild mappings after every accepted patch. Real history Undo/Redo also passes through this gate, yielding exact original bytes in tested cases. Full-leaf removal is currently rejected because a vanished leaf has no reverse range; production needs provenance/tombstones before enabling it.

The prototype stores rejected JSON; it does not implement continued mounted editing, selection/history persistence, or a source-editing UI for that draft. Production must retain a separate live draft branch and a visible resolution path rather than replace the user's live editor with accepted source or pretend the draft was saved.

### Empirically qualified matrix

| Construct/action | Experimental result | Required production behavior beyond this subset |
| --- | --- | --- |
| Open without edits | Exact Buffer equality, zero patches, synthetic LF/CRLF and five actual docs | Never write on open/mount/selection or parser normalization. |
| Paragraph text insert/replace/partial delete | Accepted inside one exact literal leaf; prefix/suffix byte checks | Token maps needed for decoded entities/escapes and continuation indentation. |
| Existing bold/italic/strike text | Text edits retain original delimiters, including underscore italics | New/remove formatting and edits spanning marks need specific token writers; currently source fallback. |
| Heading text | ATX heading text tested; original closing hashes retained | Heading-level/structure changes rejected; other heading forms need cases before qualification. Schema prototype allows1–6 while current UI menu is1–3. |
| Nested ordered/unordered list item text | LF/CRLF accepted in actual parsed nested items; numbering/markers/indentation unchanged | Indent/outdent, item split/join, start-number changes and multiline non-bijective text protected. Lazy continuation regression proves it is not assumed to be a nested list. |
| Fenced code | Literal body substring edits accepted with original tilde/backtick fence, info/meta and Unicode; fence collisions rejected | Indented/complex/empty code and CRLF multiline bodies protected in this prototype; no code fence serialization. |
| GFM tables | Literal cell replacement accepted, retaining pipes/alignment/padding elsewhere | New cells/rows/columns, spans, rich nested cells and raw pipe insertion need separate writers or targeted source control. |
| Inline links / relative paths | Label text changes accepted; original relative URL/title/fragment bytes preserved | URL edits and autolink label semantics need syntax-aware controls. No filesystem link navigation was implemented. |
| Reference links/definitions | Exact raw atoms retained; protected deletion rejected | Explicit label/definition dependency graph; collapsed/shortcut links cannot be treated as independent plain labels. Initially targeted source edit. |
| YAML/TOML frontmatter | Recognized and preserved as raw block; YAML tested | In-place protected source control; never interpret as note metadata or execute. |
| HTML/comments/directives | Exact raw protected regions, mixed with editable paragraphs; YAML/HTML/directive/reference removal rejected | Inert previews only; no HTML execution or external fetch. Unknown dialects need explicit detection/policy. |
| Unicode | Emoji, combining accents, Hindi replacement accepted; invalid UTF-8 and surrogate split rejected | Grapheme-aware selection/IME still need mounted editor qualification. Byte equality is stronger than normalized text equality. |
| LF/CRLF/BOM/mixed EOL/no final newline | Text patch preserves all untouched bytes | Newline insertion rejected; never globally normalize EOL or BOM. Non-UTF-8 is protected/read-only pending explicit encoding workflow. |
| Multiple successive edits / multi-step transaction | Maps rebuilt; failure in later step commits none of the batch | Coalescing must preserve source version/transaction origin and appended steps. |
| Undo/Redo | Two separately grouped real PM edits undone to byte-identical original and redone to identical modified source; partial deletion undone | Durable undo, full-leaf deletion, draft branches and cross-view appended/plugin transactions remain unqualified. |
| Cross-block/structural edits | Split, join/delete across blocks and heading mutation rejected with draft retained | No whole-document save fallback. Offer local source control with precise enclosing grammar boundary. |

Forty-two deterministic replacement trials include punctuation, Markdown delimiters, entity text, pipes, Unicode, newline, null and malformed surrogate. Accepted changes must reproject to the intended PM document; rejected changes leave source unchanged. These are adversarial examples, **not exhaustive fuzzing or a formal proof**. Unknown extensions may look like ordinary text to the chosen grammar; production must declare a supported dialect and protect detected extension regions. A parser cannot promise semantics for every arbitrary Markdown dialect.

The AST serializer negative control actually changes CRLF, heading closing hashes, ordered-list delimiter and emphasis choices. Lezer recognizes an unresolved reference-shaped link where mdast treats it as text: use it for lexical structure only unless semantic resolution is supplied. Neither library supplies a turnkey lossless Tiptap writer.

### Representative Git diff

[mixed.diff](../../../experiments/linked-markdown/evidence/mixed.diff) is generated by `git diff --no-index` from [before](../../../experiments/linked-markdown/evidence/mixed.before.md) and [after](../../../experiments/linked-markdown/evidence/mixed.after.md). A separate [CODEBASE paragraph diff](../../../experiments/linked-markdown/evidence/codebase.diff) records an edit to the actual guide's product description (in memory, never written to the real guide); metrics retain both hashes and its byte patch. Six successive real transactions on the mixed fixture produce only these edited regions:

```diff
-Paragraph original with **bold original** and _italic original_ and 😀 café é.
+Paragraph edited with **bold changed** and _italic original_ and 😀 café é.
@@
-   - Nested original
+   - Nested edited
@@
-const original = "😀";
+const changed = "😀";
@@
-| original | keep  |
+| changed | keep  |
@@
-[Inline original](../workspace/SESSIONS.md#durable-drafts-and-conflicts "Keep title")
+[Inline edited](../workspace/SESSIONS.md#durable-drafts-and-conflicts "Keep title")
```

Frontmatter, reference definitions, comments, raw HTML, directives, heading markers, list numbering and table alignment bytes remain exact. Git alone can hide EOL details; Buffer prefix/suffix assertions and explicit CRLF fixtures establish byte fidelity.

### Performance and complexity

The generated metrics are Windows local-machine observations without DOM, disk save or network latency. Nine warmed corpus projections use p50/p95 (p95 is maximum for n=9), followed by one patch/reparse timing. The five docs are roughly10–103KB. Every corpus sample preserves all prefix/suffix bytes for its tested edit. Literal mdast text coverage is measured separately from protected inline/code blocks; a high text-leaf percentage does **not** imply all Markdown syntax is visually editable.

An initial linear search over pending mappings was replaced with a node-keyed Map before measurements to avoid unnecessary quadratic leaf lookup. Current approach still rebuilds byte boundaries, parses, projects and compares the whole document for **every step**: O(document bytes + nodes) per normal pass, O(steps × document work) per transaction, with full-byte copies and JS Map memory overhead. Semantic references and pathological grammar can increase costs. PM history also retains document states. The stress fixture deliberately exceeds current production node bounds; it is measurement, not admission policy.

Measured synthetic single-edit latency rises from milliseconds at8KB to hundreds of milliseconds at256KB and seconds at1MiB. Synchronous full reparse on every keystroke is unsuitable for large documents. Production needs a worker, cancellable versioned results, coalesced validation with retained draft, compact byte mapping/piece table, bounded node/depth/time/memory admission and eventually incremental CST invalidation. Whole-document parse can remain the Save gate. Do not enable large documents before mounted-UI/input-latency qualification; incremental parsing alone does not eliminate reference/dependency validation.

## Phase 3 evidence: revision/save/recovery protocol

`filesystem.mjs`, `crash-worker.mjs`, `replacefile-proof.ps1` and `phase3.test.mjs` operate solely on newly created, ignored scratch trees. Cleanup resolves and confines the exact disposable root before recursive removal. No personal workspace, API, installed app or real documentation file is mutated. External race writers are separate Node processes; failures at five journal/staging/publication boundaries terminate a real worker with exit73. This establishes process-interruption recovery, **not power-loss survival**. ENOSPC/EACCES are injected faults; the sharing violation and junction are real Windows operations, not OS ACL denial qualification.

### Three versions and Save admission

Retain **B** (last opened/acknowledged bytes + SHA256 + source/root/document identity), **L** (latest validated local source, patches and independent editor draft), and freshly read **D** (current disk bytes/hash/identity). Hash bytes, not mtime, AST or JSON. Same-size edits are detected; same-byte file replacement is conservatively an identity conflict. Byte hash alone does not establish stable file identity. File IDs can be reused and vary by filesystem; hints must be bound to root/path/volume and reconciled. Rename detection may use file-key hints but never content-hash guessing to retarget writes.

Before Save, flush private host-owned journal records for B/L, source identity, operation UUID, local edit version, expected disk hash and intended patch. Store unsupported editor draft separately. Draft persistence is independent of explicit Save. A save acknowledgement applies only to that version; test proves version1 acknowledgement retains version2. Disk/journal failure leaves unsaved state visible and blocks claims of protection. Journals include content and therefore require owner ACLs/private permissions, bounded storage with visible refusal and explicit retention controls; never log bodies or include them in portable archives.

If D differs from B: preserve all versions, compute a three-way comparison and show conflict. Prototype merges only clearly separated contiguous line hunks and offers **MERGE_REVIEW**, never automatic overwrite. Same-line, overlapping or ambiguous adjacent edits remain conflicts. Production can evaluate an established diff3 library, but must verify exact bytes/line endings and reparse the chosen merged source. Acceptance of a merge creates a new local candidate based on reviewed D; Save rereads D again. Deletion/rename never recreates the old path automatically. User chooses an available source or explicit Save As/export of a recovery document.

### Actual save experiments and platform recommendation

| Approach/case | Observed result | Consequence |
| --- | --- | --- |
| Check hash, write temp, ordinary rename | Independent writer changed disk after check; rename replaced it and lost those bytes in the sandbox | **Reject** as the linked write protocol. Post-write hashing of only L cannot detect what was overwritten. |
| Capture existing entry into unique same-volume operation directory; rehash captured bytes/identity; publish staged file using exclusive hardlink creation | Intervening pre-capture writer detected and restored without overwriting; new entry during gap refused; two successive saves kept independent preimages | Recoverable generic experiment, but deliberate missing-path window, hardlink/filesystem/metadata constraints and path races make it unsuitable as an unqualified production default. |
| Windows native ReplaceFileW with unique backup pathname | Race test published L while backup retained the actual intervening D, whose hash differed from B | Prefer investigating a native **displaced-revision-preserving** replacement adapter over bare Java Files.move on Windows. Treat backup mismatch as conflict/uncertain save, not success; no automatic compensating overwrite. |
| Native ReplaceFileW while external handle denies write/delete sharing | Returned error32; source and staged local bytes stayed intact; no backup created | Retryable failure; never delete source or bypass sharing/permission checks. |
| Crash after PREPARED/STAGED | Journal/base/local persisted; original source retained | Recover draft, inspect live source, no blind replay. |
| Crash after capture, before journal update or after CAPTURED | Recovery inspects actual files despite stale journal state and offers captured original for explicit review; a reviewed restore uses exclusive creation only when target is absent, retains L | State record alone is insufficient; recovery reconciles path/file identities and byte hashes. Missing could be an external rename/deletion, so never automatically recreate. |
| Crash after publication, before commit journal | Current file matched intended L; recovery classified ALREADY_PUBLISHED and retained evidence | Idempotent reconciliation, no duplicate save. |
| Open external file handle survives rename and writes later | Captured preimage changed after its validation; final source was L, late external bytes remained in retained captured inode | Renaming does not stop unrelated handle writers. Retain displaced files and recheck/watch them; never silently expire unresolved revisions. |

Windows [ReplaceFileW documentation](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew) describes backup behavior, sharing, metadata preservation and multiple partial-failure states. WRITE_THROUGH is not supported by that API. The two native tests do not qualify every error code, ACL/ADS/EFS, antivirus/file locking, network/cloud provider or power interruption. Production must journal intent **before** calling it, recover each documented partial state, verify backup/current/staged identities/hashes after return and retain uncertain outcomes. Private backups may contain external secrets; never use a world-readable sibling backup.

Linux native renameat2 exchange is a candidate for retaining the displaced entry on supported filesystems; macOS requires its own swap/backup qualification. Java [Files.move](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/file/Files.html) cannot supply universal atomic compare-by-hash. Same-directory temp placement avoids cross-volume moves but does not guarantee atomicity/durability across all providers. Directory-entry flush semantics and provider metadata must be qualified on each platform. Never silently downgrade to truncation, copy-and-delete or ordinary overwrite when stronger replacement is unavailable; use read-only/explicit recovery output until qualified.

The recommended contract is **preflight conflict detection + preservation of the actually displaced revision + explicit post-save conflict/recovery reporting**, not linearizable CAS. If the intended product instead requires an unconditional guarantee that no noncooperating process can write between comparison and commit, this architecture is **NO-GO** on general filesystems. The requested allowance for documented limitations and explicit recovery supports a conditional production path without weakening source preservation.

### Watchers, Git, recovery and confinement

Watch events are invalidations. The test verifies actual directory events, self-write hash recognition, a subsequent external write and latest bytes after20 rapid Git-style replacements; it does not assert exact event count/order. [Java WatchService](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/file/WatchService.html) documents overflow and incomplete-writer/platform behavior. Register bounded subdirectories, debounce, handle overflow/key cancellation through full bounded reconciliation and rescan on focus/resume/reconnect. Self-write suppression matches operation identity/hash only; never ignore all events for a timer window. Git branch switches/renames can replace many identities: suspend affected save admission until stable scan, preserve drafts and show missing/replaced state.

Confine owner-selected roots using canonical root identity, safe relative segments, no symlinks/junctions/reparse points, no alternate data streams, regular files only and no multiple hardlink authority initially. Tests verify static traversal, actual junction escape and hardlink refusal. The Node lstat/realpath walk **has TOCTOU gaps** under ancestor replacement; it is a deliberately incomplete security adapter. Production requires handle-relative/no-follow native operations or provider-backed [SecureDirectoryStream](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/file/SecureDirectoryStream.html) where available, plus native Windows reparse/file-ID checking. Root revocation/unavailability invalidates all pending admissions; no renderer path string authorizes filesystem work.

Initial writable support should exclude network/removable/cloud placeholder roots and unsupported providers until their guarantees are tested. Directory traversal must bound files/depth/size; avoid repository internals such as .git, generated dependencies and Vaultor-private recovery directories. Explicit exclusions affect search coverage and must be visible. Read-only files remain read-only; do not chmod/clear attributes to force saving. Preserve original mode/ACL/owner/extended metadata according to qualified platform behavior, fail visibly when required metadata cannot be preserved, and keep journal storage on an authorized local location with space checks.

## Phase 4 integration architecture and compatibility contract

### Ownership and component changes

Choose a **host-owned LinkedSource service**, separate from ResourceService/FileStorageService, for registry, disk reads, hashes, identity ledger, watchers, derived index, drafts and write receipts. The Java host remains the sole authority for its source roots; do not put an Electron-only writable copy beside a Java-managed resource. Electron performs root selection and passes an opaque, owner-authorized local registration capability to its owned host. A narrow native adapter invoked by that host supplies platform primitives where Java cannot; its IPC/FFM boundary requires its own security and deployment qualification. No such adapter or endpoint was added here.

First production scope should be the owned local desktop host only. A renderer connected to a remote host must never accidentally register/write this computer's directory as if it belonged to that remote workspace. Standalone/Docker root configuration, browser editing, remote grants and companions require explicit future capability/scope qualification. Existing local-owner/TLS/CSRF/grant checks remain required; raw paths are not sent to paired clients. Source registration is owner-only; ordinary linked reads/writes must separately recheck source/workspace grants and root capability at dispatch and commit. Host lifecycle drains linked operations and recovers their journals before admitting new writes.

| Existing component | Reuse | Required extension/replacement |
| --- | --- | --- |
| BlockEditor / sharedNoteDocuments / PM history | Familiar typography, code presentation, per-view selection, shared transaction/history mechanisms | Separate linked schema/extensions/command admission and one source controller per scoped document. Capture original+appended transactions once; do not reuse JSON autosave. Prototype has not qualified actual custom editor plugins. |
| markdownUtils / ImportMarkdown / folderImports / NoteRenderer | Existing owned imports and derivative exports remain unchanged | New source parser/projection/patch engine for linked targets. No round-trip through these converters. |
| ResourceService/revisions / WorkspaceGate | Managed semantics and source/generation/epoch principles | Separate disk SHA/file-identity validators, per-linked-document writer lease and durable receipt/journal; gate is process-local and does not constrain external editors. |
| SaveCoordinator / NoteRecovery / RecoveryPanel | Late-response protection, draft review patterns and scoped errors | Explicit Save controller, native pre-Save source journal, retained raw B/L/D and unsupported PM draft. Do not auto-create a managed recovered copy as the sole linked recovery. |
| NativeFiles / preload / desktop lifecycle | Owner dialog, opaque ticket/frame/token validation, shutdown barriers | Root registration capability, handle confinement and qualified replacement adapter; never expose arbitrary read/write IPC. Existing transient import tickets are insufficient persistent grants. |
| PaneNavigation / sessionStore / Open Notes | Session/slot/visit identity, explicit split,200-visit journey bound, dedup and retained positions | Versioned tagged document targets, source identity and document revision anchors. Managed UUIDs migrate to `{kind:managed,id}`; linked targets use opaque `{kind:linked,sourceId,documentId}`. Raw paths remain host-private. |
| ResourceLinkExtension / relationships | Existing managed atomic links and graph unchanged | Separate Markdown link semantics/resolver with source-root confinement; linked associations use tagged targets, never synthesize managed JSON references into source. |
| FileContentIndex / ResourceSearchService | Derived, bounded indexing/coverage patterns, paged search and snippets | Separate linked source index keyed by actual source revision; stale/unavailable coverage explicit. Search saved disk content only; draft search must be labeled separately. |
| Collections / tags / lifecycle | Managed organization and visual controls | Association table may point to linked document targets without owning hierarchy. Removing association/unlinking source cannot delete/move/Trash original files. No filesystem rename/delete UI in first scope. |
| Archives / checkpoints / export / updates | Existing managed resource formats and compatibility | Keep linked roots/grants/journals/private paths out of current portable formats. Any future snapshot export is explicitly read-only derivative bytes with provenance/omissions, never a reconnected writable copy. Back up external directories independently; current stopped-host backups cannot claim to include them. |

Filesystem document IDs are host-assigned ledger identities, scoped by source/root, with relative location and OS identity as private attributes. On confirmed rename maintain identity only when reliable evidence exists; after a Git replacement at the same path, treat it as a new disk revision with a replacement identity event. Ambiguity/unlink/relink requires review; content equality does not authorize rebinding an unsaved draft. Portable associations to unavailable linked targets remain unresolved references until explicitly rebound; they do not silently import or reconnect paths.

### UI audit and state/transition contract (no production UI changed)

The current workspace already provides one editor surface per visible slot, transformed NoteOrientation header, compact save state, shared journey chrome, per-view scroll and explicit splits. Adding a source-mode route, parallel expanded/compact headers, permanent second toolbar or nested source scroller would disrupt continuity and density. Retain the same pane/editor identity; add source/save information in the existing orientation/status hierarchy. Detailed paths, coverage and revision IDs belong in disclosure. Reuse settings/tokens/motion, central Escape/portal/focus and AppModal/dialogFocus. No screenshot or motion validation was performed because no UI prototype was built.

| State and trigger | Same-object transition / accessible behavior | Reverse/recovery |
| --- | --- | --- |
| Available clean → first edit | Same editor/pane; header status becomes Unsaved with explicit Save. No auto-save on navigation or time delay. Journal protection status separate from disk-save status. | Successful version-matching receipt becomes Saved; a newer edit stays Unsaved. |
| Unsupported region → source edit action | Compact inert in-place representation identifies construct; selecting Edit source expands that region in its existing location, preserving other rich-text blocks and reading context. Keyboard action/label and cancel path remain reachable. | Apply reparses/validates entire candidate and shows exact local diff; Cancel restores region with focus/selection. Expansion uses shared structural timing; reduced motion immediate. No automatic whole-document mode switch. |
| Unsafe visual transaction | Keep draft live in the same pane, show localized Needs source resolution and block Save of unvalidated bytes; offer Undo/targeted source editing/recovery output. | Validated resolution rejoins source mapping; rejected draft is not silently discarded or overwritten by disk refresh. |
| Clean document + external change | Reconcile revision, map selection/scroll through source spans and update the same mounted editor without enqueueing a save. Reset/rebase stale history deliberately. | On mapping ambiguity keep context with a revision-changed indicator; explicit section/top fallback instead of guessed numeric jump. |
| Dirty document + external change | Preserve editor draft/history/base, mark External changes, retain D and offer compact three-way review through existing utility surface. | Choose reviewed merge/current source/local recovery; no automatic overwrite. Any later disk change invalidates that review. |
| Unavailable root/deleted path/permission failure | Keep Open Notes, draft, journey and last-known content with availability label; disable disk Save. Unavailability differs from managed Trash and transient network failure. | Reconnect/rescan validates root/file identity before editing/save; no implicit recreation/rebinding. |
| Navigation/Close/Quit/source switch with unsaved edits | Existing departure barrier offers Save / Keep protected draft / Cancel. Explicit Save default means navigation must not silently save linked edits. | Keep draft requires successful native journal write; failure retains pane and offers deliberate recovery export. Managed autosave stays unchanged. |
| Multiple panes / duplicate historical views | Same logical source document/controller and shared undo, independent selections/scroll/filter state; hidden Open Notes do not mount unlimited editor bodies. | Mirror patch once; no duplicate disk writers. Close pane retains session and protected draft. |

Journeys keep visit IDs and reading anchors bound to source/document/revision plus source-range/context hints; current numeric offsets are insufficient across external changes. Restore only against matching or safely mapped revisions; expose uncertain positions. Relative Markdown links retain exact source spelling. Resolve paths relative to the containing file through the host, percent-decode/validate once, separate fragment from path, reject root escapes/reparse points and file/custom/javascript URLs. Markdown documents use normal Open Notes/journey rules; other files use existing temporary previews subject to capability/security bounds. Cross-root links require explicit authorized roots; never open arbitrary local paths based on document text. URL/fragment resolution policy (including GitHub heading slug collisions) needs production tests; current imports retain fragments visibly without heading navigation.

Search and collections display source provenance with compact shared rows, saved-revision coverage and unavailable states; they never mirror the filesystem into owned nested collections. Filesystem hierarchy stays external-owned. Unsaved indicators are shared per document across Open Notes and panes; drafts survive source removal. Collection membership changes touch only Vaultor metadata. Existing managed backlinks/export graph do not automatically traverse arbitrary Markdown paths or fetch remote assets.

Phase 4 gate: component/source audit and state contract meet the integration-design criteria. The architecture needs capability/schema/session extensions in later work; **no** API/minimum-client, companion, archive, production data model, installed app or runtime behavior changed in this qualification.

## Phase 5 assessment and production roadmap

**CONDITIONAL GO** for linked external folders with source-preserving, rich-text-first editing. The experiments establish a useful safe visual subset and demonstrate why current converters and check-then-replace saving must not be reused. They do **not** qualify production linked editing or unrestricted use of the existing toolbar.

**GO** for the core method: original bytes + source-aware semantic/lexical maps + transaction-specific patches + full reparse/admission + retained drafts and displaced-revision recovery. **NO-GO** for whole-document AST/HTML serialization, silent normalization, unqualified structural commands, synchronous large-document full reparsing per keystroke, or a promise of portable cross-process atomic CAS. A phase marked Passed means its investigation criteria were met, not that every eventual product feature was proven safe.

### Release-blocking conditions for later production work

1. **Broader ordinary editing must be qualified.** Enter/Backspace, full-leaf deletion, mark toggles, list/table structural actions and clipboard/IME cannot silently serialize source. Implement operation-specific writers with lexical provenance/tombstones and inverse patches; otherwise show a precise targeted source fallback before the command commits. Preserve active draft, caret and undo under rejection. Quantify actual fallback frequency on a broader dialect corpus, not only five docs.
2. **Mounted Tiptap integration must be proven.** Real BlockEditor/shared schema, original+appended transactions, input rules, symbols, paste, plugins, duplicate panes, selection, history and external reload must pass fidelity tests. The headless schema intentionally does not enable all production extensions. Introduce command capabilities centrally instead of letting unsupported commands mutate first and guessing a serializer afterward.
3. **Save engine needs native platform qualification.** Journal intent and actual displaced revision, handle each native partial failure, revalidate hashes/identities, prevent path escapes with handles, preserve ACL/metadata and refuse unqualified providers. Qualify post-write external races, delayed open handles, disk-full/ACL/AV/cloud/volume failures and startup recovery. Retained revisions must be discoverable conflicts; no automatic rollback overwriting a newer writer. The Node capture-gap algorithm is evidence, not the shipping default.
4. **Durability/storage policy must be explicit.** Native private journals of accepted source and rejected draft, version-specific acknowledgement, corrupt-record isolation, visible storage errors, bounded retention/refusal and user-controlled recovery. File flush and process-exit recovery are proven here; directory/power-loss semantics are not. Do not call a draft protected until its required write is acknowledged.
5. **Latency and admission need bounded engineering.** Versioned worker projection/validation and compact offset storage; bounded file/nodes/depth/time/memory; cancellation and stale-result rejection. Save verifies the complete candidate even if typing validation becomes incremental. Qualify UI latency, memory and adversarial inputs before raising limits.
6. **Host and compatibility scope must be deliberate.** Owner-local initial scope, source-grant checks, tagged session/collection/reference targets, explicit Save departure flow, revision-aware reading anchors and nonportable registrations. Feature capabilities and any new storage/API/session/archive schema need separately reviewed migration/compatibility rules. Companion protocol remains outside this qualification and cannot silently consume unsupported linked targets.

### Staged production implementation plan (recommendation, not authorization)

| Stage | Deliverable | Exit evidence |
| --- | --- | --- |
| A — Freeze contracts | Declare Markdown dialect/encoding, safe operation matrix, protected-block/source-edit flow, local-host scope, external-root/backup policy and retention/security bounds | Product/design review of ordinary editing and conflict resolution; no weakening of original byte fidelity. |
| B — Harden source engine | Token/CST provenance including entities/escapes/reference dependencies, patch algebra/inverses/tombstones, worker/version control and precise block fallback | Golden byte fixtures, actual-doc corpus, property/differential fuzzing, successive edits/undo, malformed inputs and bounded parser measurements. |
| C — Native storage safety | Java-owned source registry/identity and private draft/receipt journal; platform replacement backup/confinement adapter | Windows real-volume crash/race/permission/metadata/late-handle tests; Mac/Linux qualify independently. Unsupported provider remains read-only. No release based only on this harness. |
| D — Read-only linked browsing | Owner-selected root, bounded scanner/watch reconciliation, derived search, relative path resolver, source availability and read-only rich projection | Actual Git branch switch/bulk replace/watch overflow, root revoke/unavailable, navigation/security fixtures. No original writes enabled yet. |
| E — Limited visual editing | Same-pane linked controller, explicit Save, protected regions/targeted source edits, shared views, drafts and conflicts | Native disposable-folder editing, actual Tiptap/IME/paste/history, multi-pane/restart/departure/merge tests; exact Git diffs and original signer/data isolation retained. |
| F — Organization/portability integration | Tagged Open Notes/journeys/positions, collection associations, references and explicit export/backup omissions | Existing managed resource regression checks plus migration/isolation tests. External file hierarchy never converted into owned collections. |
| G — Platform and release qualification | Wider operation/provider scope only after evidence; separately authorized package/version/signing/build delivery | Full required target qualification, security and installed upgrade checks under release process. No companion changes without separate scope. |

If B cannot make ordinary structural editing reliable at acceptable fallback frequency, retain a **Markdown source editor as the transaction authority** with a synchronized Tiptap projection and region-specific visual controls. Keep rich text as the default view and map simple visual intents into source-editor edits; use in-place source lenses for uncertain regions. A parser-backed source editor such as CodeMirror/Lezer can own text history and source ranges, while the semantic mdast projection validates effects. This still requires the same mapping, dialect and conflict-safety work; it is a better fallback than exporting the entire Tiptap document. It has not been implemented or UX-qualified here. If neither approach can preserve bytes for a visual action, protect that action; never hide damage behind semantic equivalence.

### Remaining limits and handoff

The proof is deliberately a headless editing engine and disposable filesystem laboratory. No browser/native product UI was inspected or altered; no screenshots, motion, touch, IME or physical device acceptance are claimed. No Spring endpoint, source migration, production filesystem write, companion protocol change, installer, release version or publication was made. Native Windows ReplaceFileW is exercised only in a two-case disposable experiment; Mac/Linux, network/cloud/removable providers, power interruption, hostile parent swaps and native metadata/security edge cases remain open gates.

The corpus is representative of Vaultor's documentation syntax, not all user repositories. Unknown dialects, malicious complexity and arbitrary plugin transactions remain limitations. JSON draft retention in the prototype proves data survives rejection, not a finished live-draft interaction. Conservative line merging demonstrates three-version preservation, not a full diff3 engine. No automatic data cleanup policy was shipped; production must block rather than discard unresolved versions at storage limits.

Resume from this document and `experiments/linked-markdown/` using its lockfile and recorded evidence; do not repeat Phase 1 unless dependencies/baseline change. The next task should settle the release-blocking contracts before assigning implementation/release ownership. This qualification ends here; the roadmap does not authorize starting Stage A–G.
