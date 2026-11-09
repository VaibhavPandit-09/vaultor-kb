# Vaultor Next migration tracker

Reviewed 2026-11-09. Authoritative experimental replacement tracker. Published Windows/macOS 0.27.0 remain Electron/Java. This milestone does not merge, tag or publish releases; Android is on hold.

## Target and implemented milestones

Tauri 2 + React/TypeScript + Tiptap + Rust + SQLite. Normal local work uses direct commands, with no HTTP server, JVM or permanent helper process. `next/` owns the native application; `frontend/src/next/` is its separate frontend entry point. Original implementations remain intact as reference and benchmark baseline.

M1 completed at `52b84ee`: isolated workspaces, exclusive process ownership, Rust/SQLite persistence, collections, structured Tiptap notes, revision-checked saves, shared panes/history, workspace themes, normal-close save barrier and offline milestone Help.

M2 adds same-database durable drafts, explicit recovery/conflict review, keyset Library pages, nested/renamable collections and atomic identity-based memberships. `editing.rs` and `library.rs` extend the portable domain; the connection still has one storage-thread owner. Schema/marker 2 intentionally refuse M1 data without migration. A new default `Workspace-M2` avoids modifying the M1 default. Previously remembered older paths can be replaced using Open workspace and a new empty folder.

The portable Rust domain has no Tauri types. One storage thread owns SQLite and transactions; async handlers await receipts. No legacy migrations are provided. Nonempty unrelated directories, open workspaces and newer schemas are refused. The default profile has its own application identifier. Explicit benchmark workspace overrides never change the remembered personal workspace.

## Interaction decisions

The old Dashboard combines HTTP lifecycle, source authority and many unfinished capabilities. The new entry composes retained Tiptap packages, CodeBlockView, symbol rules, shared documents/history, Escape ownership, theme reveal and design tokens without mounting that orchestration. M2's document-owned EditingSession replaces M1 SaveCoordinator for this entry only. This is an adapted editor composition, not full BlockEditor parity.

Library/collection selection changes the same resource list. Opening a note retains list context. Opening beside gives the existing editor less space; closing restores its bounds with shared motion timings and immediate reduced-motion endpoints. Library and editor scroll independently as separate working regions; no duplicate/sticky header is introduced. Theme uses the shared reveal controller. Navigation and normal close await saves and retain the editor on failure. Correctness never awaits animation.

## M2 editing and Library contracts

One draft per resource lives in the workspace SQLite database, independently of the committed note. It binds base revision, random editor token and monotonic sequence to the exact title/JSON. Protection is requested after 250 ms quiet or 1 second continuous typing; actual durability begins at the SQLite FULL/WAL receipt, not the timer deadline. Autosave follows 1 second quiet. Full JSON is captured for protection, not every keystroke. Two views share the document and journal owner. There is no idle polling.

Save verifies the exact protected evidence and expected note revision; note commit and matching-draft deletion share one transaction. Stale revisions retain the journal. Recovery compares protected and current text/title on demand, supports explicit restore/discard, and can park a draft without blocking other documents or normal closing. Choosing a draft over a competing saved version conditionally rebases against the reviewed revision; no automatic merge. Conflicting or quota-blocked evidence never silently expires. Limits are 64 drafts / 32 MiB of document bodies and 8 MiB per note. Unsynchronized edits and unreached durability receipts cannot survive power loss. Previews cap display at 200,000 characters without truncating storage.

Library reads at most 100 metadata summaries per request and mounts one page. Immutable descending creation sequence plus an anchor high-water mark excludes later insertions during traversal; note edits do not reorder pages. Cursors carry collection scope. Membership changes are live, not a database snapshot, and the owning UI refreshes page one after organization changes. Previous/Next preserve open editors and per-page scroll. No virtualization dependency is needed for bounded 100-row rendering. Full note bodies load only for editing/recovery, not organization.

Collections have parent IDs and sibling-normalized unique names; reparenting rejects cycles. Add/remove/move update the resource/collection join transactionally; resources can have multiple memberships and retain one ID/body. Collection arrows compress/restore the same tree branch; row More/right-click opens inline management. M3 can extend the single-resource organization owner to selection/bulk actions.

## Boundaries

- Resource deletion/Trash, tags, pins, search, selection and bulk actions remain future work. Collection contents are direct memberships, not recursive descendant aggregation.
- Linked Markdown remains a product requirement. Linked reading/writing, imports/exports, images/attachments and resource-link commands are not exposed yet.
- Only acknowledged journal/commit bytes are durable. There is no automatic conflict merge or recovery export, and unresolved evidence requires an explicit decision. This experimental app still needs independent copies of important information.
- Windows only. No installer, signing/updater, macOS, Android or LAN API qualification. Native menus, keyboard customization, slash menus, pane session restoration and full animation parity remain incomplete. Physical IME/accessibility acceptance is unclaimed.

## Build and run

Install stable Rust MSVC, Windows C++ Build Tools/SDK and WebView2. Add the user's `.cargo/bin` to PATH. Run `npm ci --prefix frontend`, `npm ci --prefix next`, then `npm --prefix next run dev` or `npm --prefix next run build`. The optimized build produces `next/src-tauri/target/release/vaultor-next.exe`, without an installer. Do not point it at published data. `VAULTOR_NEXT_WORKSPACE` is a disposable-test override.

## Measurements and verification

[Benchmark records](../../benchmarks/tauri-rust/README.md) own methodology, append-only CSV, generated workbook and sanitized summaries. The linked-source Electron harness built production UI/server but timed out at native source approval. Managed-note comparisons use production Electron/bundled Java and optimized Tauri with identical disposable 100-note fixtures and approximately 64 KiB documents. These limited comparisons do not establish whole-product parity. Cache/power are uncontrolled; true cold boot and physical input-to-presentation are unmeasured.

Verification covers Rust ownership/transactions/revisions/restart, TypeScript, scoped ESLint, shared save/document/theme tests, Help validation, optimized Windows build and actual native managed-note/restart qualification. CODEBASE and benchmark summaries record actual final outcomes.

M2 source `d2106c2`: Rust6/6, frontend5/5 (including actual Tiptap lock/selection regression), TypeScript/scoped lint, Help validation/17governance cases and optimized Windows build pass. Final native qualification passes protected-draft taskkill/reopen, normal close, conflicts/restore/discard/park, shared panes, hierarchy/membership operations,50metadata pages across5000notes and restart, plus runtime theme/pane samples, reduced motion and bundled Help. Five-minute settled CPU measured0.173% of one logical core versus retained M1's0.684%; private bytes increased modestly. Benchmark README/CSV/workbook own exact values, source hashes, immediate large-Library/churn observations and limitations. No idle loop was identified; phantom saves from editability updates were eliminated. Further settled/churn sampling is needed before claiming absence of leaks or broad performance gains.

## Next milestone

M3: selection and coherent bulk organization, expanded keyboard/context-menu workflows and measured Library ergonomics. Preserve draft ownership and exact save/recovery gates. Linked external Markdown, imports/exports, media, search, Trash, networking and platform qualification remain separately scoped; Android stays on hold.
