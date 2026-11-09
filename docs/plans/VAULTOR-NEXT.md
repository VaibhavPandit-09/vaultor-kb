# Vaultor Next migration tracker

Reviewed 2026-11-09. Authoritative experimental replacement tracker. Published Windows/macOS 0.27.0 remain Electron/Java. This milestone does not merge, tag or publish releases; Android is on hold.

## Target and milestone 1

Tauri 2 + React/TypeScript + Tiptap + Rust + SQLite. Normal local work uses direct commands, with no HTTP server, JVM or permanent helper process. `next/` owns the native application; `frontend/src/next/` is its separate frontend entry point. Original implementations remain intact as reference and benchmark baseline.

Implemented: isolated workspace creation/opening; exclusive process ownership; SQLite schema 1, WAL/FULL durability and foreign keys; collections; collection-scoped note creation and metadata listing; structured Tiptap documents; revision-checked saves; shared two-pane content/history; workspace theme persistence; saved-note reopening; normal-close save barrier; offline milestone Help.

The portable Rust domain has no Tauri types. One storage thread owns SQLite and transactions; async handlers await receipts. No legacy migrations are provided. Nonempty unrelated directories, open workspaces and newer schemas are refused. The default profile has its own application identifier. Explicit benchmark workspace overrides never change the remembered personal workspace.

## Interaction decisions

The old Dashboard combines HTTP lifecycle, source authority and many unfinished capabilities. The new entry composes retained Tiptap packages, CodeBlockView, symbol rules, shared documents/history, SaveCoordinator, Escape ownership, theme reveal and design tokens without mounting that orchestration. This is an adapted editor composition, not full BlockEditor parity.

Library/collection selection changes the same resource list. Opening a note retains list context. Opening beside gives the existing editor less space; closing restores its bounds with shared motion timings and immediate reduced-motion endpoints. Library and editor scroll independently as separate working regions; no duplicate/sticky header is introduced. Theme uses the shared reveal controller. Navigation and normal close await saves and retain the editor on failure. Correctness never awaits animation.

## Boundaries

- Lists cap at 500 notes; serialized notes cap at 8 MiB. Paging, collection hierarchy/membership editing, rename/delete/Trash, tags, pins and search remain future work.
- Linked Markdown remains a product requirement. Linked reading/writing, imports/exports, images/attachments and resource-link commands are not exposed yet.
- SQLite receipts protect committed notes. Unsent edits can be lost on crash/forced termination. Private crash drafts, conflict comparison and recovery/export must precede important-data adoption. No forced-discard UI exists.
- Windows only. No installer, signing/updater, macOS, Android or LAN API qualification. Native menus, keyboard customization, slash menus, pane session restoration and full animation parity remain incomplete. Physical IME/accessibility acceptance is unclaimed.

## Build and run

Install stable Rust MSVC, Windows C++ Build Tools/SDK and WebView2. Add the user's `.cargo/bin` to PATH. Run `npm ci --prefix frontend`, `npm ci --prefix next`, then `npm --prefix next run dev` or `npm --prefix next run build`. The optimized build produces `next/src-tauri/target/release/vaultor-next.exe`, without an installer. Do not point it at published data. `VAULTOR_NEXT_WORKSPACE` is a disposable-test override.

## Measurements and verification

[Benchmark records](../../benchmarks/tauri-rust/README.md) own methodology, append-only CSV, generated workbook and sanitized summaries. The linked-source Electron harness built production UI/server but timed out at native source approval. Managed-note comparisons use production Electron/bundled Java and optimized Tauri with identical disposable 100-note fixtures and approximately 64 KiB documents. These limited comparisons do not establish whole-product parity. Cache/power are uncontrolled; true cold boot and physical input-to-presentation are unmeasured.

Verification covers Rust ownership/transactions/revisions/restart, TypeScript, scoped ESLint, shared save/document/theme tests, Help validation, optimized Windows build and actual native managed-note/restart qualification. CODEBASE and benchmark summaries record actual final outcomes.

## Next milestone

Implement durable crash drafts and explicit conflict recovery, then paginated Library and collection membership operations. Extend ordinary/large-note and native keyboard/pane acceptance before linked Markdown. Keep optional networking outside domain ownership; Android remains on hold.
