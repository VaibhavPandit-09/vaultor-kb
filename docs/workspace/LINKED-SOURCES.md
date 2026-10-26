# Linked external folders

Reviewed2026-10-26 for Windows0.20.0. Publication and installed-runtime results belong in the versioned release ledger; this guide owns the product and safety contract. [Implementation evidence](../development/LINKED-SOURCES.md) retains the engineering history and actual limits.

## Link instead of import

On Windows Desktop, select **This computer**, then **Linked sources → Link folder**. Choose an existing documentation folder with the native picker. This authorizes that local folder recursively; it does not import files, move them, or create database-owned collections for its directories. Expand folders to browse existing .md/.markdown documents. Directory pages contain at most200 entries and continue refreshing at the current offset. Git internals and private recovery entries are excluded; junctions and other special entries are not traversed.

Ordinary Import files / Import folder remains a separate operation: it creates Vaultor-owned notes/files and leaves external originals untouched. Choose import when you want independent managed resources, and linking when the external files must remain authoritative.

Up to eight non-overlapping roots are registered per local workspace generation. Registrations persist privately on this computer. Disconnect revokes access without deleting files. Remove source removes its registration while retaining document reference identities and recovery evidence. **Locate source folder** explicitly reauthorizes an unavailable/restored reference. It selects a fresh root/file identity; it never silently associates an old session with a reused pathname.

## Windows filesystem support

Write support covers Windows x64 ordinary user-owned Markdown on local NTFS, including additional internal volumes and external NTFS SSDs. The installation and primary workspace can stay on C:. Safe publication always uses a verified private recovery carrier on the source volume; it never uses cross-volume rename or copy/delete. Network shares, non-NTFS, reparse/cloud/sparse/encrypted/compressed files, alternate streams, extended attributes, explicit integrity labels, existing multiple hardlinks and read-only files are outside direct-write admission. A refused file retains its original bytes. The application remains unprivileged; no elevated helper is required.

Ordinary owner/group, DACL access/inheritance, creation time and supported attributes are preserved and checked. Modification time, physical file identity and incidental NTFS object tracking IDs can change on Save; replacement does not preserve hardlink relationships. A tracking object ID alone is admitted by the ordinary-file policy. Optional audit SACLs are not assumed absent and exact reproduction is not promised. This is a practical ordinary-file policy, not certification of every NTFS metadata class.

## Private carriers and drive lifecycle

The existing primary recovery store remains the carrier for its own volume. On another volume Vaultor creates an owner-private .vaultor-recovery account/scope directory at the volume root, outside source trees and Git repositories. Multiple roots in a workspace share that volume carrier. If automatic provisioning is refused, the main process explains the requirement and offers a native location picker; Vaultor creates a new protected subfolder and refuses a different volume, source overlap, repositories, reparse paths and pre-existing folders. No documentation is moved and no UAC/system-directory changes are required.

A descriptor beside the primary journal binds the Windows volume GUID, carrier-relative path and native directory identity. Source registrations also retain the volume GUID. Discovery can follow the same GUID at another drive letter; source and carrier identities are rechecked before publication. An unrelated disk at the previous letter gains no authority. Missing/replaced/inaccessible carriers are refused rather than silently recreated. Reconnect the same volume or explicitly select the source through Link or reconnect folder; source removal revokes authority without deleting evidence.

Visual/source drafts remain in the primary store even when the source/carrier disappears. Interrupted publication artifacts remain on their source volume and become reviewable when that same verified carrier returns. Earlier workspace recovery catalogs retain carrier descriptors as well as primary copies. Missing-volume artifacts cannot be exported until that volume is available. Uncertain work is never automatically discarded.

The existing 100-operation/256 MiB allocation cap applies independently to each carrier and the primary draft store. Acknowledged history retains at most 20 versions/64 MiB per carrier; unresolved evidence is retained and quota refuses further allocation. Recovery offers review, separate export and explicit confirmed cleanup. Empty carrier containers/descriptors are retained for reconnect; there is no background volume cleanup.

## Rich-text editing and exact source

Admitted UTF8 Markdown opens in the familiar rich-text editor. UTF8 BOM, LF/CRLF and untouched source ranges are preserved. Supported operations include paragraphs, headings, bold/italic/inline code, links, nested lists, code blocks, ordinary GFM tables, common structure changes, clipboard and Undo/Redo. Replacing a syntactic block/list/table is sometimes necessary; unrelated blocks are not regenerated.

The initial visual limit is256KiB, with additional shape/input limits:1,500 root blocks,6,000 rendered nodes,16,384 text/code units per ordinary editable block,2,000 table cells and65,536 combined clipboard text/HTML units. Large/complex blocks become protected source where supported; files outside editing admission remain intact. Valid UTF8 Markdown up to256KiB defaults to a formatted read-only GFM preview independently of Save admission, with View source / View formatted controls; larger, invalid-encoding or over-complex input retains the bounded source view. The preview never grants Save authority, executes raw HTML or fetches Markdown images from the network; local image/link text remains available in source. Overlapping64KiB byte windows retain characters spanning a page boundary. These limits are separate from the2MiB asset limit.

Frontmatter, HTML, comments, reference syntax, directives and unsupported constructs use protected in-place representations. Activate a protected block to edit that identified Markdown region. A versioned expected-node ticket prevents a rejected structural edit from targeting a different region. Unsupported formatting refuses source admission and retains the visual draft. Undo it, or explicitly return to validated source while retaining rejected work in Recovery. There is **no whole-document Markdown serialization fallback**.

Undo history survives pane remounts while the document is cached. The bounded cache retains seven foreground/cached documents and never evicts mounted editors. History resets after cache eviction or application restart; protected source/visual drafts remain recoverable. A restored rejected draft has an explicit return-to-validated action without relying on its old Undo stack.

## Explicit Save and external changes

Use **Save** or **Ctrl+S**. Typing does not autosave the external file. Draft checkpoints protect the latest queued visual/source state privately; only an independently validated source candidate enters publication. Saving acknowledges its captured editing version, so newer edits remain dirty. Checkpoint/storage failures remain visible and prevent a departure barrier from claiming protection.

Native notifications invalidate cached state; bounded polling and filesystem rechecks decide what changed. Clean same-object changes refresh through a versioned binding while preserving reading context where practical. Dirty documents retain their draft and show a conflict. Changes outside the visual envelope can switch a clean session to the read-only view. A missing/disconnected source is not treated as confirmed deletion.

External renames, moves and atomic pathname replacements appear conservatively as new navigation entries; old sessions/reference identities remain unavailable with their drafts retained. Open the current entry, or explicitly locate its source when the relative path still identifies it. The first release does not automatically migrate collection references across external renames or infer identity solely from a reused path. Vaultor’s own successful replacement updates its existing logical document identity.

## Compare and resolve

**Compare** shows the last saved base, validated Vaultor source and current disk version. Keep the draft or export a separate copy at any time. Reload retains the previous dirty draft privately before adopting the reviewed disk version; it does not write that file.

**Review combined changes** is offered only when trusted base/local/disk changes can be combined as strictly separated line hunks. The combined bytes must be reproduced exactly by an independently parsed, disk-seeded Markdown engine. Acceptance checks disk and editing versions again, journals the combined draft and keeps the old version. It remains **unsaved** until explicit Save. Overlapping/adjacent or provenance-ambiguous changes require keeping/exporting the draft, reloading disk and reapplying the desired edits visually. No speculative merge or last-write-wins overwrite is performed.

A lost, inconsistent or uncertain Save receipt requires recovery review. It is never shown as successful and is not automatically retried. A later external writer can still change a file after verification; Windows does not provide an atomic hash compare-and-swap against unrelated processes.

## Interrupted-save recovery

The private host retains original base B, latest validated source L and visual draft V. Publication captures the original file object privately and exclusively publishes a separately prepared file object. It never writes content into the original object, so an outside-root alias to that original retains its content. A publication gap can temporarily leave the original pathname absent. A new occupant is never overwritten to close that gap.

**Linked sources → Recovery** offers retained versions, create-new separate exports and fresh source review. Missing original restoration requires explicit review of the original root, absent destination, captured identity/revision and current ownership. A recorded published replacement can receive guarded completion of interrupted ordinary permissions; unrelated occupants refuse. No journal automatically replays a Save. Corrupt records cannot authorize restoration, while readable versions and preserved artifacts remain exportable.

Private copies remain available after source loss and in a bounded catalog of earlier workspace generations. Older-generation hosts load no source capabilities; they can inspect/export copies but cannot restore to an old root automatically. Removing reviewed private copies requires native confirmation and closes linked editors after protecting their work. It changes no external source files. Active drafts cannot be deleted through the legacy resolve endpoint.

Acknowledged saved/viewed history retains at most20 versions and64MiB; the just-acknowledged version is retained. Uncertain/unacknowledged evidence never expires automatically. The per-namespace store refuses new allocations at100 operations/256MiB rather than deleting unresolved work. Export and explicitly resolve copies to free space. These are process-crash protections. Sudden power loss, storage controllers and every disk-full configuration are not certified.

## Open Notes, collections and search

Linked documents use existing Open Notes sessions, panes, Fill-then-Replace behavior, journeys, reading positions and selection restoration. Managed-note JSON/autosave stays separate. Collections, tags and pins can reference a linked document without owning its file. Multiple memberships refer to one logical document. Moving/removing a membership never moves/deletes the filesystem file. Trash/purge applies to the Vaultor reference only. Filesystem hierarchy management remains external.

Global Library queries and Ctrl+K include private linked results, deduplicated by logical document UUID against registered metadata. Include saved content searches verified disk text, not editor drafts. The derived in-memory index is bounded to10,000 bodies/16MiB estimated text and50 returned hits; reconciliation processes two200-entry directory pages and four admitted files per tick, restarting completed scans after30s. Registry metadata is bounded to50,000 entries/16MiB; link a smaller documentation folder when those limits are reached. Collection/tag/pin-scoped body queries remain backend metadata search; private global expansion does not broaden their scope.

Ctrl+click ordinary relative Markdown links navigates within the authorized root, retaining the original URL in source. Heading fragments use the mounted heading map. Scoped PNG/JPEG/GIF/WebP images and PDF previews are read-only, at most2MiB each; raster dimensions are capped at8,192/axis and16million pixels. Each document also caps compressed previews at8MiB and aggregate pixels at16million. HTML/SVG, unknown attachments, remote image fetches and outside-root paths refuse. Vaultor-specific links are not substituted into source.

## Portability and authority

The backend stores only a five-field linkedDocument/version1 descriptor: logical source UUID/name and relative Markdown path. It stores neither source body nor absolute root/grants. Full/partial workspace packages containing linked references use archive9/10 and report external dependencies. Packages without them retain existing5/6/7/8 choices. External file contents, private drafts/journals, credentials and local grants are not embedded in ordinary archives. Note/graph exports omit external bodies with a warning.

Restoring on another computer requires explicit local reauthorization; a saved path/reference grants no access. Browser, Android and remote desktop clients can see permitted workspace metadata but receive no native filesystem authority. Android remains an independent reader/companion release; this feature does not synchronize linked folders between devices. Workspace/updater backups do not roll back independently owned external files.

## Implementation and evidence

Main-owned modules are in desktop/src/linked; native Java25 FFM code is under native/linked-markdown/src/vaultor/linked and is packaged without test classes. frontend/src/lib/markdown owns source projection/patching; frontend/src/lib/linked owns session coordination. The Java host is authoritative for identities, revisions, journals and publication. Private consent/validation keys are ephemeral and never enter renderer storage, URLs or archives. Root and file operations use native handle confinement, not string canonicalization alone.

The [single implementation tracker](../development/LINKED-SOURCES.md) contains exact test counts, runtime/soak evidence, failed experiments, phase status and remaining release acceptance. Physical Windows IME, hours-long all-pane editing, non-Windows writing, physical hot-unplug/drive-letter reassignment, independent certification and physical power-loss testing remain unqualified. Actual OS clipboard automation is distinguished from physical hardware testing.
