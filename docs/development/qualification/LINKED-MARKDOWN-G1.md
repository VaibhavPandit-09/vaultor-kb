# Linked Markdown production engineering — Gate 1

Reviewed 2026-10-24. Authoritative Gate 1 contract, progress and evidence. Continues [qualification](LINKED-MARKDOWN.md) at clean master/origin `13486fa`. Scope: source-preserving everyday editing engine and isolated mounted-editor integration. No linked roots, disk writes/watchers, managed-note redesign, protocols/archives, releases or installed-app changes.

## Phase tracking

| Phase | Initial status | Current status | Acceptance |
| --- | --- | --- | --- |
| G1-A Editing contract/architecture | Pending | Passed | Explicit operation/boundary/validation/history/async contracts and supported/unsupported matrix before implementation. |
| G1-B Structural editing | Pending | Conditional | Implemented/tested broad ordinary subset; encoded/ambiguous inline structural provenance and some table commands remain explicit restrictions. |
| G1-C Mounted Tiptap | Pending | Passed (isolated path) | Actual editor extensions/shared history, selection, clipboard/keys, lifecycle, rapid edits, fallback, no content feedback loops or stale commits. No production activation. |
| G1-D Qualification | Pending | Conditional | Recorded fidelity/performance evidence supports bounded prose editing; broader document shapes, IME and pre-render large-paste admission remain unqualified. |

### G1-A

- Scope: inspect existing prototype, failures, real editor commands/plugins/tests; choose maintainable engine and bounded syntactic replacements.
- Implementation/evidence: verified clean master matches origin13486fa; read prior report, engine and representative diff. Existing prototype is not production code; leaf restriction, BOM adjustment, synchronous full reparsing, missing reverse mapping and headless-only schema require replacement/extension.
- Decisions: retain source authority and full reparse validation; allow reserialization of changed paragraph/list/table/code subtrees, never unrelated top-level blocks. Do not modify general Markdown exporter.
- Known failures/risks: prior88 tests do not cover ordinary structural actions or mounted input; semantic projection must include every meaningful Markdown attribute. Async validation must not replace live editor content.
- Next: architecture gate passed before implementation; source-aware boundary architecture remains viable. No source-editor-first replacement is required by current evidence.

## G1-A editing contract and architecture decision

Use a source-authoritative, DOM-independent TypeScript engine under `frontend/src/lib/markdown/`, unreferenced by ordinary application routes. Keep the historical Node filesystem prototype experimental. Reuse mdast/micromark syntax support, strict UTF8/BOM/EOL principles and failure tests, replacing its leaf-only adapter with bounded syntactic patching. The ordinary Markdown exporter remains unchanged. A dedicated test-only mounted integration must use actual BlockEditor extensions/shared schema/history; isolate parsing/worker/harness from shipped entrypoints.

Source consists of immutable UTF8 bytes and exact top-level syntax ranges/gaps. Parse/project semantic JSON, with inert source atoms for raw HTML/comments/frontmatter/directives/reference syntax; preserve their exact raw payload. Canonical comparison includes content, marks, heading/list/code/link semantics and protected raw content. Only documented presentation attributes (table IDs/column widths, link presentation defaults) are excluded. Unknown semantic nodes/marks fail explicitly.

Patch hierarchy: first attempt a bijective literal leaf patch. Otherwise find the changed top-level interval using unchanged prefix/suffix; serialize only changed blocks, reusing exact raw text of unchanged/moved blocks inside that interval. A list/table is one syntactic boundary, not unrelated root content. Escaping and fence selection belong to the block writer. Gaps outside that interval remain exact. Reparse the entire candidate off-thread and compare its complete semantic projection before source admission; no root serializer fallback. Protected raw occurrences must survive unless an explicitly targeted source edit changes that region.

Empty paragraphs used for caret placement remain live editor layout state: Markdown has no semantic empty-paragraph node. They may be omitted from semantic comparison/source while retained in the mounted draft/checkpoint; they must not trigger rejection on ordinary Enter. Empty list items remain meaningful. This is an explicit representational restriction, not permission to drop text.

History coordination: ProseMirror remains the live history authority. Accepted semantic states retain exact source provenance in a bounded source history; Undo/Redo restores previous bytes where retained, rather than progressively canonicalizing. Source-history exhaustion must be visible and refuse further source admission rather than silently evict required provenance. Checkpoints retain source plus current editor draft; they are in-memory Gate 1 objects, not durable external-file journals.

Async contract: one worker-owned engine per document, monotonically versioned requests, at most one running job plus one coalesced latest draft. Editor transactions/selection/history apply immediately. Capture original and appended transactions once, ignore mirrored duplicate writes. Stale success/failure may update worker ancestry but never acknowledge a newer draft or replace editor content. Worker failure/timeout preserves draft, refuses source output and permits explicit retry/recovery. Dispose invalidates callbacks and terminates owned work. Targeted source replacement is a separate reviewed action returning a projected document; applying it deliberately resets stale visual history and restores focus through the existing owner.

Initial command contract: visual text/deletion/paragraph split/join, marks/code/heading, list creation/extension/nesting, inline links, fenced code, simple GFM table cells/rows/columns, cross-mark selections, supported clipboard blocks and block moves. Complex table spans/rich cells, resource images/links, highlight/underline and arbitrary dialect changes require explicit fallback. Reference spelling/definitions remain protected initially. Unknown/custom constructs are inert and source-editable. Actual supported status requires G1-B/C evidence; this list is a target, not an untested success claim.

UI audit/state contract: preserve the existing mounted editor, shared focus/Escape, typography and table surfaces. Test-only fallback occupies its protected region or a compact status disclosure with accessible reason and draft retention; no second global toolbar, automatic whole-document source mode, added motion or permanent nested scroll. Reduced-motion endpoints remain immediate. No Open Notes/navigation redesign. G1-A is justified because structural boundary writers retain the requested rich-text experience without changing source authority; acceptance remains conditional on measured implementation.

### G1-B

- Scope/acceptance: table above. Implemented typed `syntax.ts` parser/projector/canonical semantic comparison/block writer, `engine.ts` literal and structural boundaries, raw block reuse/moves and exact inverse-patch provenance. Explicit source-region replacement resets stale source history.
- Actual evidence:39/39 engine tests passed, including LF/CRLF ordinary operations, list indent/outdent/extension, actual PM Undo/Redo, code metadata, table changes, cross-mark replacement, protected source/deletion refusal, block movement and Enter-before-typing.
- Failures: first31/39 run mixed headless and DOM-required commands; DOM cases moved to jsdom, not weakened. Table alignment array needed width normalization; aligned column semantics remain a separate restriction to qualify. Mounted trailing-paragraph plugin exposed an extra-EOL block-move case; caret-only root empty paragraphs now excluded from source boundary serialization. Unchanged gaps inside batched multi-block intervals now reuse original gap bytes.
- Decisions/risks: inverse character patches plus nonauthoritative semantic fingerprint hints replace full source snapshots, avoiding per-keystroke document duplication. Every history hit still fully reparses/compares; hash collision cannot admit incorrect content. Final policy is65536 transitions/16MiB accounted inverse storage; a small injected transition bound tests exhaustion/refusal. It never silently evicts provenance. Complex table semantics and arbitrary plugin nodes remain explicit restrictions.
- Later evidence: token-level decoded→raw UTF16 mapping supports entities, escaped punctuation, Unicode and list continuation prefixes without rewriting them. Structural writers reuse exact inline lexemes, preserve existing fence/info spelling and use the Markdown serializer's surrounding-attention protocol. Encoded text that cannot safely retain its spelling under partial formatting is refused, not silently normalized. Cross-mark, clipboard and repeated-edit regressions found missing attention metadata in the custom raw handler; it was corrected before acceptance.
- Next: Gate 1 follow-up must remove/accept the explicitly listed usability restrictions before unrestricted everyday editing can pass. No production route enables this engine.

### G1-C

- Scope/acceptance: table above. Real BlockEditor accepts an optional parser-free document adapter; default managed composition is unchanged. Adapter adds source atoms/attributes, owns updates and bypasses managed JSON autosave. No application route supplies it. `session.ts` coordinates worker versions, coalescing, retained draft, timeout/failure and explicit source application.
- Evidence:7 mounted React/jsdom tests and4 coordinator fault/order tests pass (50 total with engine cases). Actual production SharedHistory/SharedNoteDocuments, Lowlight, WorkspaceTable append transactions, TableWorkspace, slash/resource/symbol/image extensions are mounted. Tested real keymaps, duplicate views/independent selection, rapid edits before delayed validation, no transaction feedback, source rejection/Undo and session-retaining remount.
- Failures: initial mounted2/7 failures exposed a trailing-paragraph initialization transaction and a test helper racing the capture microtask. Byte no-op preservation remains strict; adapter suppresses managed autosave, recognizes semantic no-op without rewriting, and tests wait through capture. A version counter is not a disk write.
- Decisions/risks: browser lab is separate `markdown-g1.html`/Vite config, absent from shipped entrypoint. Real native module-worker, CDP keyboard, DOM paste, protected block/inline source, focus and Escape have been exercised in headless Edge, including a separately compiled worker. Browser entity decoding originally selected a DOM-only dependency export and failed; explicit `worker` export conditions fix it. Those conditions are part of any future worker build contract. jsdom timing is never presented as browser latency.
- Side effects: the adapter owns updates and prevents managed image paste/drop/picker, managed import and resource-link actions. Unsupported slash actions retain their typed invocation and expose a reason; ordinary managed notes omit the adapter and retain existing paths. Default-source heading configuration is explicitly1–6, while managed defaults stay1–3. Relative link activation is disabled in the lab until a future source resolver exists.
- Next: production host/session activation remains unauthorized; physical IME/platform keyboard, OS clipboard and full product source UX need separate acceptance.

### G1-D

- Scope/acceptance: table above. PASS requires all four fidelity/usability/performance/integration categories; otherwise CONDITIONAL/BLOCKED with remediation.
- Implementation/evidence: separate browser runner under `experiments/linked-markdown/g1/` uses the actual BlockEditor and native module Worker, CDP keyboard and real DOM clipboard events. Planned size range8KiB–approximately1MiB, plus five actual documentation inputs. Raw fixture/evidence remains outside release packaging.
- Risks/next: final evidence, capability matrix and four-part verdict below. Gate 1 closes with a CONDITIONAL assessment, not permission to enable the editor or start filesystem Gate 2.

## Final architecture and boundaries

The new maintainable engine lives in `frontend/src/lib/markdown/`; the historical `experiments/linked-markdown/source-editor.mjs` remains historical. `syntax.ts` parses CommonMark/GFM plus frontmatter/directives and projects semantic JSON with protected raw atoms. `sourceMap.ts` uses parser-confirmed decoded text and entity/escape token boundaries; offsets are UTF16 until a validated patch is converted to UTF8 byte offsets. Surrogate/entity interiors are not guessed. BOM and all unrelated EOLs/bytes remain source-owned. Soft line breaks display as whitespace, code text uses LF internally, and original source EOLs remain exact on no-op/untouched regions.

`engine.ts` first tries a precise literal patch, including escaping only newly inserted text when delimiter context requires it. Structural edits choose a changed root-block interval, reuse unchanged/moved blocks and their original adjacent gaps, and serialize only changed blocks. Existing inline links/title/destination spellings, code and attention lexemes are reused where uniquely identified. An edited table or list may be reserialized as that whole syntactic subtree; its padding/numbering/indentation can change as demonstrated by the structural diff. Other root blocks and protected payloads are not regenerated. Ambiguous lexical identity, multiline inline-source reuse and partially reformatted encoded text are explicit refusal cases. No whole-document serializer fallback exists.

Every completed source candidate is strictly decoded/well-formed, reparsed and compared to the intended final semantic document, including raw protected payloads, link destinations/titles, code language/meta, heading/list attributes and table alignment. Only renderer-owned IDs/widths/default link presentation attributes are excluded. Unknown nodes/marks/table spans fail. Empty caret-only root paragraphs are live layout state, not representable Markdown semantic paragraphs; they survive an in-memory checkpoint/remount. Markdown mark-boundary normalization trims bold/italic/strike from leading/trailing boundary whitespace through a real appended transaction before validation; it does not trim text or loosen comparison. Managed notes do not receive this extension.

The worker owns parsing, source, patching and inverse source history. `session.ts` captures actual final mounted transactions after appended plugins, coalesces a latest snapshot behind one active request and verifies the in-flight version on reply. It never calls setContent for validation acknowledgements. PM selection/history therefore continue immediately. Stale results cannot acknowledge newer edits, unexpected replies are ignored, and timeout/error terminates the port while retaining the draft. Accepted historical states restore exact source through inverse patches; fingerprints are cache hints only and hits undergo full validation. Unvalidated coalesced intermediate PM states may need a fresh bounded patch when undone to, rather than having pre-existing source bytes. No claim of durable undo is made.

Explicit targeted source editing requests the current validated region from the worker. Applying it requires review, retains the former editor JSON, validates unchanged outside block ranges/semantics, then deliberately replaces the projection and resets stale visual history. An unterminated fence that would swallow another block is rejected. Ordinary async validation cannot perform that replacement. The lab uses existing AppModal/Escape/dialog focus and keyboard-operable inert source nodes. It adds no motion or production navigation surfaces. One inspected screenshot establishes only the minimal lab presentation, not a finished linked-source UX.

## Editing capability and usability matrix

Evidence identifiers refer to `engine.test.ts` (E), `corpus.test.ts` (C), `mounted.test.tsx` (M), `session.test.ts` (S), and [browser evidence](../../../experiments/linked-markdown/g1/evidence/browser.json) (B), all under `frontend/src/lib/markdown/` except B.

| Common action | Visual status | Boundary / restrictions | Actual evidence |
| --- | --- | --- | --- |
| Text insertion/replacement/partial and full deletion | Fully supported in qualified text ranges | Literal token range; malformed Unicode/entity interiors refused | E LF/CRLF, decoded-map tests, M rapid edits, B keyboard |
| New/delete paragraphs; Enter/Backspace split/join | Fully supported in qualified blocks | Affected paragraph(s); empty caret paragraphs remain layout state | E split/join/delete/Enter-then-type, M keymaps/remount, B Enter |
| Bold/italic apply/remove | Supported with restrictions | Paragraph/inline provenance; boundary whitespace normalized visually; partial encoded or ambiguous raw spans may require source | E marks/cross-range/lexical guard, M whitespace normalization, C corpus, B Ctrl+B |
| Inline code apply/remove/edit | Supported with restrictions | Inline token or paragraph; multiline/ambiguous lexemes can refuse | E apply/remove/raw-code preservation |
| Heading creation/change, levels1–6 | Supported with restrictions | One block; lab slash menu remains familiar1–3, configured keymaps/JSON allow1–6 | E headings/soft wrapping, C corpus, M importedH6 |
| Bullet/ordered list creation/extension | Supported with restrictions | Affected list subtree; complex mixed task/bullet lists protected | E LF/CRLF creation, nested extension/Undo; structural diff |
| List nesting/outdent | Supported with restrictions | Entire affected list subtree may renumber/reindent | E actual sink/lift commands, C structural evidence |
| Task lists | Supported with restrictions | Homogeneous task lists map; mixed lists protected; exhaustive nested task interactions remain open | M actual creation/checkbox interaction produces GFM |
| Inline links / relative destinations / titles | Supported with restrictions | Literal label or paragraph; preserve unchanged destination/title spelling | E relative link insertion/label/fence quoting, structural diff; actual navigation deferred |
| Reference/collapsed links and definitions | Requires targeted source editing | In-place protected atom opens its enclosing source block | E raw retention/deletion refusal; B inline source control preserves definition |
| Fenced code bodies/language metadata | Supported with restrictions | Existing fence/info/EOL preserved where safe; fence expanded on collision; >16384 UTF16 units protected | E LF/CRLF body/meta, C mixed workflow, M actual Lowlight Enter/language command; popup interaction not separately qualified |
| GFM cell text; simple row/column insertion | Supported with restrictions | Literal cell or whole table; no spans/rich multi-block cells | E cell/row/column, M WorkspaceTable IDs; structural diff |
| Aligned-table column restructuring | Requires targeted source editing | Explicit refusal until alignment follows stable column identity | C aligned-column refusal |
| Header deletion, merges/spans, rich cells | Requires targeted source editing / partly unqualified | GFM cannot represent all managed-table semantics | Semantic guards exist; exhaustive toolbar actions not qualified |
| Cross-format selection replacement | Supported with restrictions | Affected paragraph(s); encoded token losses refused | E LF/CRLF cross-mark replacement; encoded refusal |
| Plain/rich text clipboard | Supported with restrictions | Actual DOM pipeline; supported text/marks/blocks only | E HTML insertion, M paste, B DataTransfer/ClipboardEvent |
| Images / managed resources/import commands | Unsupported visually in Gate1 | Refused before managed side effects, explicit reason/input retained; source image references remain protected | M image rejection; B slash refusal; managed regression tests |
| Underline/highlight | Requires targeted source or Undo | Unsupported Markdown mark never silently stripped | M retained underline draft/Undo; source slash admission |
| Moving/reordering supported blocks | Supported with restrictions | Reuse raw blocks and unchanged original gaps; uncertain inline identity may refuse | E raw-spelling move, C unusual-gap test |
| Undo/Redo | Supported for accepted provenance | PM history plus bounded inverse ledger; history exhaustion refuses rather than evicts | E actual PM grouped Undo/Redo and bound failure; C250 edits/exact restoration; M shared Undo; B keyboard |
| Multiple views / selection / rapid edits | Supported in isolated integration | One logical session/controller; mirror writes ignored; no acknowledgement replacement | M12 edits, shared panes/independent selection; S coalescing/order/faults |
| Remount / lifecycle | Supported with restrictions | Reuse live session/checkpoint; durable/restart undo and browser storage not provided | M remount and subsequent edits; S disposal |
| Frontmatter, HTML, comments, directives | Requires targeted source editing | Exact raw inert regions; no HTML execution or external fetch | E no-op/deletion refusal, C mixed corpus, B protected editing |
| Large documents / complex shapes | Restricted |256KiB default admission;1MiB stress only; >2000-cell tables protected; parser30000 nodes/depth64 | Limits, E size/cap cases, B benchmark; dense-block/IME/large-paste limits remain open |

A normal measured documentation sequence—typing, paragraphs, headings, marks, lists/nesting, inline links, code, tasks, table rows, clipboard and Undo—runs through rich text. The evidence does **not** establish an almost-entirely-visual workflow for all documentation repositories: complex task interactions, some table commands, partial formatting of encoded text and ambiguous lexical spans still have gaps. These refusals are not counted as successful visual actions. This is the reason for the CONDITIONAL usability verdict.

## Fidelity evidence and failures

[Structural Git diff](../../../experiments/linked-markdown/g1/evidence/structural.diff), [before](../../../experiments/linked-markdown/g1/evidence/mixed.before.md), [after](../../../experiments/linked-markdown/g1/evidence/mixed.after.md), [byte patch ledger](../../../experiments/linked-markdown/g1/evidence/fidelity.json), and [actual CODEBASE paragraph diff](../../../experiments/linked-markdown/g1/evidence/codebase.diff) are generated by real editor commands/in-memory repository input. Real documentation files are never edited by the experiment. The mixed workflow creates a heading, nests an ordered item, applies bold to a relative link label, edits code, adds a table row and creates a paragraph. Frontmatter/comments/HTML/directives/reference definitions/escaped text survive. The table's own padding changes because its structure changed; the diff makes that visible instead of claiming character-minimal edits everywhere.

Tests assert exact no-op strings/UTF8 bytes, byte prefix/suffix for each emitted patch, raw protected payload retention, semantic reparse, exact accepted-history restoration and refusal with editor draft intact. Five actual docs are tested for no-op plus text/format/heading edits and exact return to original bytes. Corpus hashes in B identify inputs at measurement time; living docs may subsequently change.250 repeated edits use under40KB accounted inverse history in the fixture; no document-sized snapshots are accumulated.

Recorded failed approaches were corrected or restricted: headless DOM commands, mounted trailing-paragraph/no-op timing, table alignment length, absent DOM decoder in worker, raw writer missing attention lookahead/adjacency encoding, CRLF code representation and a jsdom ClipboardEvent shim. A task-checkbox focus interaction exposed a missing EscapeManagerProvider in the test harness:119 assertions initially passed while Vitest correctly exited1 for an unhandled error. The harness now includes the real provider and final logs verify no unhandled errors. The compiled browser's focus assertion caught modal-unmount/locked-editor handoff; committing the modal close before focus fixed it. Browser typing setup now explicitly awaits real focus, preventing lost setup keystrokes. Retrying did not relax byte-preservation or semantic equality. Partial encoded formatting, ambiguous duplicate raw lexemes and multiline inline preservation remain explicit refusal paths. An unsupported pending draft can continue editing/Undo; source output remains blocked until the latest version validates. Targeted source replacement cannot consume unrelated blocks. Parser-replaced NUL is protected rather than normalized; lone CR and UTF8 bytes remain exact outside the edit.

## Performance and memory qualification

Measurements use actual mounted BlockEditor in headless Edge/Chromium, real module Worker and CDP keyboard. Keydown→next animation frame measures visible update latency; it is not input-hardware latency or an installed Electron claim. Worker patch planning and validation are separately timed; validation includes speculative literal reparse and final full-candidate reparse. One active job plus one latest draft bounds queue growth; stale results do not repaint. There is no synchronous parser fallback in the renderer. Full-document worker reparse remains O(document size); incremental parsing was not needed to meet the measured prose envelope and is not claimed implemented.

Final compiled-path measurements: Edge155.0.4283.62,24 actual keyboard samples per size. Keydown→next frame is a DOM/frame latency proxy, not proof of physical pixel presentation. All worker timing is off-thread. These are single-machine runs, not statistically broad certification.

| Input bytes | Key/frame p95 ms | Patch planning p95 ms | Worker validation p95 ms | Structural dispatch / acknowledgement ms | Foreground typing long tasks≥50ms | Worker heap after forced GC MiB |
| --- | --- | --- | --- | --- | --- | --- |
| 7,980 | 3.64 | 0.92 | 9.81 | 4.36 / 14.87 | 0 | 1.30 |
| 65,436 | 4.39 | 2.35 | 41.87 | 3.61 / 30.45 | 0 | 1.87 |
| 130,872 | 6.63 | 3.83 | 67.03 | 4.00 / 53.91 | 0 | 2.30 |
| 262,143 | 11.81 | 10.08 | 145.56 | 6.58 / 100.36 | 0 | 3.38 |
| 1,047,774 stress | 53.70 | 40.83 | 569.94 | 53.71 / 386.25 | 4 | 9.61 |

Open/worker parse plus mounted-editor readiness ranged63–234ms through256KiB and741ms near1MiB; these are separate from typing. The256KiB sample's foreground heap was approximately29MiB after typing. Current worker heap before explicit collection ranged about8–45MiB through256KiB, then retained1.3–3.4MiB after GC. Heap capacity/allocations and native/process memory are different measurements; no peak or total process ceiling is inferred.

Proposed acceptance budgets for the measured supported prose shape: typing-to-frame p95≤16.7ms, no≥50ms foreground long task during ordinary typing, structural acknowledgement≤250ms, worker acknowledgement typically≤500ms, and stale/failed work never replacing the live editor. Default session byte limit256KiB is enforced in the worker for open and subsequent source admission. The lab explicitly opts into a1MiB stress override; that override is not a production recommendation. Large code/table blocks are protected to avoid unbounded highlight/table work, but all near-limit block shapes and huge clipboard insertion **before** worker admission are not yet qualified. Raising caps requires new evidence, not this prose benchmark alone.

Memory evidence separates foreground JS heap, actual worker Runtime.getHeapUsage before/after forced GC (collected after latency timing), and accounted inverse history. Total browser/native/process memory and allocation peaks are not established, and GC makes deltas noisy. Retained source history is bounded16MiB/65536 transitions and visibly refuses exhaustion. AST bytes/depth/node admission and one worker queue constrain work; timeout terminates the worker. These are engineering bounds, not proof against every parser-memory attack. Lifecycle/dirty checkpoint handling prevents silent draft disposal; a user-facing history-checkpoint workflow and broader heap/long-session profiling remain follow-up.

## Reproduction, validation and isolation

Final validation: **120/120 passed, zero skipped and zero unhandled errors** across9 focused files:52 engine,11 corpus/evidence,13 mounted-editor,6 coordinator and38 existing managed editor/table/shared-history/session-recovery regressions. [JSON ledger](../../../experiments/linked-markdown/g1/evidence/focused-tests.json) and [full test log](../../../experiments/linked-markdown/g1/evidence/focused-tests.log) retain actual results; assertion totals alone are insufficient to detect an unhandled harness error. Full frontend lint, TypeScript and normal production build passed; the separate laboratory/worker build passed. Existing large-chunk, ineffective dynamic-import and Browserslist-age warnings remain, with no attempt to refactor unrelated build behavior.

Final compiled-browser run: **13 interaction/corpus checks passed, zero page errors**, plus the five timing/heap cases above. Source edit Apply restores actual editor focus, inline protected references open targeted source, Escape uses the shared owner, rich paste and real Enter/Ctrl+B/Undo/Redo work, and an unsupported slash image command retains its text and opens no upload dialog. Native module-worker heap was read through CDP, not estimated from foreground heap. Browser metadata's sample count is24 (asserted against actual events); its deterministic compiled-worker checksum was attached after the run without changing raw metrics.

Normal build isolation was verified: no lab HTML/worker asset and no source-engine admission strings in `frontend/dist`. Desktop packaging still includes only its existing src/ui/assets/scripts/bundle allowlist, which excludes the lab and experiments. No desktop files/bundle/installed profile were changed. Documentation links, source hashes, byte-patch replay and Git whitespace are checked before commit. Git delivery is a coherent master change descended from13486fa; actual delivery hashes are in Git and the final handoff message. Before delivery, master fast-forwarded to the completed documentation-only Mac publication e47bdeba5472ea222cb500bc776b4cf0ebc0648f; its release facts/history are preserved. Tested editor source is unchanged by that publication. Corpus hashes describe the historical experiment inputs (the CODEBASE input predates that documentation update), with source snapshots and byte patches retained in fidelity.json; they are not hashes of later living-document revisions.

From `frontend/`:

```powershell
$env:VAULTOR_RECORD_MARKDOWN_G1 = '1'
npx vitest run src/lib/markdown src/components/editor/BlockEditor.images.test.tsx src/components/editor/TableWorkspace.test.ts src/lib/sharedNoteDocuments.test.ts src/components/editor/tableCommands.test.ts src/lib/sessionRecovery.test.ts --reporter=default --reporter=json --outputFile.json=../experiments/linked-markdown/g1/evidence/focused-tests.json *> ../experiments/linked-markdown/g1/evidence/focused-tests.log
npm run lint
npm run build
npx vite build --config vite.markdown-g1.config.ts
npx vite preview --config vite.markdown-g1.config.ts --host 127.0.0.1 --port 5175 --strictPort
```

In another terminal from the repository root, use the Playwright package returned by `load_workspace_dependencies`:

```powershell
$env:VAULTOR_PLAYWRIGHT_PACKAGE = '<bundled node_modules>/playwright/index.mjs'
$env:VAULTOR_G1_URL = 'http://127.0.0.1:5175/markdown-g1.html'
node experiments/linked-markdown/g1/browser.mjs
```

Normal build input is still `index.html`. Lab output is under ignored `frontend/node_modules/.cache/markdown-g1-build`, not desktop/ui or installers. Audit normal `dist` for no worker/lab asset and no engine admission strings. No backend/API smoke, Docker/native installer or Android checks are warranted by this scope. No release versions/tags, archives, server data or updater behavior changed. The new direct parser dependency remains at the existing frontend transitive2.0.3 baseline, avoiding the initially attempted2.0.2 downgrade; original feasibility experiments retain their old pinned lockfile.

## Four-part readiness verdict and next instructions

| Category | Assessment | Meaning |
| --- | --- | --- |
| Source preservation correctness | PASS for the explicitly admitted subset | Byte evidence and strict rejection protect known unsafe cases; no universal dialect or formal proof claimed. |
| Rich-text feature coverage | CONDITIONAL | Ordinary measured workflow is practical; encoded/ambiguous structural spans, aligned column/header/span operations and exhaustive task/language-control interactions need completion/qualification. |
| Editing performance | CONDITIONAL | Bounded prose envelope passes measured budgets;1MiB fails typing budget, dense shapes/large paste/total worker memory need more work. |
| Integration safety | PASS for isolated mounted path | Real BlockEditor/history/plugins, native worker, selection, ordering, failure/draft and fallback evidence; OS clipboard, physical IME and production session activation remain unqualified. |

**Gate 1 verdict: CONDITIONAL.** Architecture is viable beyond leaf replacement; a full PASS for dependable everyday editing has not been earned. Do not ship/enable this path or start linked-folder/native-write implementation based on the test count.

Next Gate 1 follow-up: (1) carry transaction-level inline provenance into the worker to remove encoded/duplicate ambiguity without reserializing unrelated tokens; (2) bind table alignment to stable column identity and complete header/span/task/code-language/mark-removal interaction tests; (3) qualify composition/large-paste admission, dense code/list/table shapes, worker memory and user-directed history checkpoints; (4) repeat the bounded mounted workflow and byte/diff checks with those changes. Keep the source-authoritative Tiptap architecture; a CodeMirror-owned replacement is not justified by the current evidence.

Gate 2 instructions **after review resolves those prerequisites or explicitly accepts a narrower contract**: read this tracker, the historical qualification's filesystem section and HOST-ACCESS/DESKTOP/SESSIONS contracts; freeze exactly the editor's accepted source/revision/draft API; implement host ownership/opaque local root authorization and handle-safe native access in disposable roots; prove displaced-revision-preserving writes and B/L/D conflict recovery across real external processes/crash windows; design watcher reconciliation as invalidation only; retain explicit Save and native journals of both validated source and rejected visual draft. Reuse qualified editing bytes, never regenerate Tiptap JSON to write a file. Do not alter companion/archive/updater contracts or release without separately authorized scope. This document is a handoff, not authorization to begin Gate 2.
