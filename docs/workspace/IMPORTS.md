# File and folder imports

Reviewed 2026-10-24. Ordinary imports create Vaultor-owned resources and leave source files untouched. They do not watch, refresh, synchronize or write back to external folders. Workspace ZIP transfers remain a separate workflow.

## Selection and review

Use Import files, or Import options → Import folder beside it. The current visible collection is captured; review can choose another destination. Folder hierarchy is always preserved. By default the selected root becomes an additional collection; uncheck Create a collection for the folder to place its contents directly inside the destination. Desktop preserves empty directories. Browser directory input retains relative paths but cannot enumerate empty directories; review states that limitation instead of claiming full fidelity.

Review leads with source, file/folder counts, note/original totals and references that can resolve. Markdown and TXT become notes by default. Options applies one conversion choice to the batch; individual overrides are paged at30 rows. Folder branches are collapsed and mounted on demand. Optional reference details group causes, and conversion/upload failures appear with the affected file. One Import action becomes progress, retry or completion in the same modal. Escape/Close cannot dismiss a running operation; Pause stops after the current request. The existing AppModal owns focus, viewport bounds and reduced-motion entry/exit.

## Collection conflicts and bounds

Default collision handling creates separately named collections, such as `docs (import 2)`, without overwriting resources. Reuse matching collection paths is explicit; it reuses each normalized sibling under the corresponding parent and still creates new resource IDs. An interrupted retry uses stored collection/resource UUIDs and is distinct from Start a separate import. Collection identities remain independent of names and paths.

Limits:2,000 files/directories,32 path levels,100 characters per source path component,2,048 characters per relative path,512MiB per original and2GiB aggregate. Note conversion caps each input at5MiB and decoded batch text at64MiB. Text accepts strict UTF-8 or BOM-marked UTF-16; invalid text can be kept as an original. Native traversal rejects symlinks, junctions and non-regular entries, verifies confinement and retains opaque connection-owned file tickets. No absolute source path enters renderer state or a document. Browser paths are validated as relative metadata and never interpreted as host filesystem locations.

## Relationship resolution

The full batch establishes path→resource-ID mappings. All resources are created with recoverable unresolved references first. After every creation succeeds, each unchanged Markdown note is finalized with its resolved links in a short transaction. This handles mutual/cyclic references without exposing links to resources that failed creation. Backlinks derive from the final structured document in that transaction.

Marked parses Markdown into inert DOM structure. Only parsed link/image nodes are transformed; fenced code, inline code and literal examples remain intact. Relative links resolve against the original source directory, including `../` within the selected root, encoded names and exact paths. Case-insensitive fallback and extensionless `.md`/`.markdown`, `README.md`/`index.md` conventions work only with one unambiguous candidate. External HTTP(S)/mailto links remain external and are never fetched. Missing, outside-root, malformed and ambiguous references retain their original destination as text and produce grouped warnings. No title-based matching to existing notes occurs.

Recognized PNG/JPEG/GIF/WebP assets become ordinary managed files and are checked through image-info before managed-image placement. Alt text is retained. Other linked files use resourceLink. Unsupported images remain recoverable text references. Heading fragments remain explicit `(heading: #fragment)` text beside the internal link; automatic heading scrolling is intentionally not implemented.

## Pause, retry and restart

Before any creation, a strict IndexedDB journal persists the source identity/generation, relative paths, file size/modified-time signature, chosen modes, converted documents and stable UUIDs. It contains no credentials or absolute paths. Each successful step updates the journal. Storage failure stops work rather than silently promising resumability. Successful resources and empty collections are retained on cancellation or failure; originals are never removed.

Close/restart, then reselect the same folder or files: an unfinished matching journal offers Resume import. Source bytes are reselected, not copied into the browser journal. Resume skips completed resources and reuses IDs for uncertain responses. The server fingerprint rejects changed payloads. Renamed/moved/changed source metadata will not match an unfinished journal; keep the original source selection for reliable resume. Complete journals permit a deliberate second import with new UUIDs. Browser storage clearing removes local recovery metadata, so retain source files until completion.

Workspace-generation admission and captured connection epochs prevent an import from continuing into a replacement workspace or another profile. Relationship finalization proves the original import fingerprint and checks unchanged current content/title; concurrent edits are preserved. Identical finalization receipts are safe after response loss or later edits. If files remain failed, successful notes remain readable with text references until outstanding creation finishes; resolution never silently associates them with unrelated resources.

## Focused UX audit and scope

The previous import modal mounted every file, repeated conversion controls, and displayed every warning in orange. Review now uses summary first, batch choices, bounded details, grouped non-blocking reference issues, and phase progress. Collection movement shares the paged destination picker. Library hierarchy reuses existing rows, orientation and scroll ownership; nesting indentation is capped and ancestor labels truncate with full tooltips/focus access.

Export already has a compact status card with warning details and retains its existing workflow. Diagnostics is an intentionally technical opt-in surface; it needs a separate severity/grouping audit before broader changes. Settings already uses compact categories and optional detail, so no unrelated redesign is included. Disclosure interiors currently use immediate native expansion; the modal and existing browse geometry retain shared motion tokens. No correctness or focus behavior depends on animation completion.

## Compatibility

Deploy the0.18 frontend with its host. GET /collections/capabilities gates the new import contract. Protocol3 is retained. Hierarchy-bearing full/partial archives use7/8 and reject on older hosts; flat archives remain5/6. Androidalpha.28 connected reading and host exports remain usable. New checkpoint1 downloads containing nested collection nodes are explicitly refused because its offline exporter cannot preserve parent metadata; existing flat downloads are untouched. Removing that boundary requires a separately qualified companion update.
