# Individual note exports

Implemented through N6; desktop file integration reviewed 2026-10-04 (D4).

Use the Export icon beside a note's save indicator. Clicking Markdown, Markdown + assets ZIP, PDF or Word DOCX directly saves that note, prepares a snapshot and requests the download. There is no second confirmation/download step. The picker closes automatically after download handoff; the compact status card retains Download again. Failed saves retain the draft and offer Retry export. Download requested means the browser was handed the file, not that it was successfully saved; Download again remains available. Desktop opens a native save dialog and streams directly to disk. Saved is shown only after flushing/closing/renaming the result. Cancelling the save dialog retains the prepared operation for Retry download; it does not repeat rendering. Relevant conversion warnings and technical Details are disclosures rather than persistent instructions.

Choose **This note** (default) or **Include linked resources** before choosing a format. Linked mode previews saved graph counts and missing-resource warnings; Markdown becomes one package choice, while PDF/Word become ZIP packages whenever the graph contains files. Options can include an omitted/missing references list. The picker remains compact and format choice still starts eventual download. Cancel export is available while saving, before snapshot preparation; it stops export continuation without undoing saved edits.

## Architecture and API

`NoteExportModal.tsx` is always mounted by Dashboard and owns a `NoteExportController` outside the conditional AppModal. The controller captures the target note/format, serializes execution and uses the shared API client. Closing the picker at any stage keeps saving, sequential polling and automatic download alive, with a compact status card. One active or unresolved export is retained at a time; completed downloads may be replaced by a new format choice. Format discovery uses the exporter registry. Status polling stops after three consecutive failures until Retry status check. Status/download retries reuse the operation and do not save or render again. A confirmed FAILED operation permits a fresh snapshot after saving the latest draft. An ambiguous POST failure has no automatic retry because creation is not idempotent: check Diagnostics before explicitly dismissing and starting over. Technical IDs are under Details. Full application unmount/reload stops frontend tracking; backend rendering continues, but old downloads are not automatically replayed. No export state is persisted locally. The controller is keyed by workspace identity/generation: replacement disposes old tracking and prevents further client continuation/download. Backend work already accepted may continue. Import closes stale export pickers; ordinary dismissal within the same workspace retains tracking.

```json
POST /api/exports
{"scope":"notes","noteId":"<resource-id>","format":"pdf"}
```

Formats for scope `notes`: `md`, `md-assets`, `pdf`, `docx`. Each operation starts at one root note; optional `links: "linked"` includes its outgoing graph. `GET /api/export-formats` returns MIME types/extensions. Poll `GET /api/operations/{id}`; after `SUCCEEDED`, retrieve `GET /api/exports/{id}/download`. Operations add `filename`, `mediaType` and `warnings`; the download has matching Content-Type and Content-Disposition. Unsupported formats, missing/non-note IDs and unavailable results produce existing problem-detail responses. Workspace `{scope:workspace,format:zip}` remains separate and unchanged in format.

`NoteExportGraph` discovers the bounded graph; `TransferService.exportNote` takes an immutable structured-document/title snapshot and copies included local file bytes under the workspace gate before returning the operation. It records snapshot/artifact metadata and uses the existing single worker. Rendering does not hold the workspace gate; short progress writes do, preventing contention with ordinary note requests. Operation-status persistence also retries transient SQLITE_BUSY at most five times with bounded backoff. Request/operation IDs follow the job through logs. Later edits, rename, file deletion or workspace replacement cannot alter the snapshot.

`NoteExporters` registers renderers through `WorkspaceExporter` / `ExporterRegistry`; `NoteRenderer` consumes JSON via `DocumentService.children`, which traverses only actual content nodes. Renderers never scrape browser HTML. XHTML for PDF is generated from escaped, recognized nodes/marks. External images are never fetched; the PDF URI resolver accepts only generated PNG/JPEG data URIs. No new account integration exists.

Completed artifacts and snapshots live beside existing workspace operations and currently require manual expiry while the backend is stopped. Restart marks unfinished operations failed; retry creates a new snapshot/operation. Export retries are read-only and may create duplicate artifacts, never duplicate notes.

## Format fidelity

| Feature | Behavior |
| --- | --- |
| Headings, paragraphs, quotes, code | Preserved; PDF/DOCX long code lines wrap for page readability |
| Bold, italic, strike, underline, highlight | Preserved; highlight normalized to yellow; Markdown underline/highlight use HTML |
| Lists and tasks | Markdown/PDF retain lists and checked state; DOCX uses editable text markers, with a visible warning that Word auto-renumbering/interactive checkboxes are absent |
| Tables | Markdown embeds HTML to retain spans/rich cells; requires an HTML-capable Markdown viewer. PDF/DOCX preserve spans and repeat suitable header rows |
| Wide tables | Above eight columns, PDF/DOCX render row records with column numbers and a warning; merged values appear at their originating cell |
| Nested tables | DOCX uses row records and warns |
| Internal links | Standalone exports retain readable labels, with optional omitted/missing references. Linked exports rewrite note links to relative Markdown filenames, PDF destinations or Word bookmarks. IDs never decorate reading content; package metadata retains them. |
| Missing targets/bytes | References remain visible; warnings identify missing resources/files without dropping surrounding content |
| Assets | Single-note asset ZIP contains `note.md`, `assets/`, `README.txt` and `export.json`. Linked Markdown ZIP contains separate numbered note files. Linked PDF/DOCX with files packages `notes.pdf`/`notes.docx` and original `assets/`; PDF attachment references use readable filenames. Missing files are warned about, not fabricated. |
| Images | Resource-backed PNG/JPEG/WebP/GIF up to 20 MiB/40 MP embed in PDF/DOCX with captions, alignment and proportional width. GIF/WebP use static first-frame PNG conversion; animated sources warn. Missing/unsupported images remain references; ZIP retains original bytes |
| Unicode | Markdown/DOCX retain original Unicode. PDF bundles Noto Sans; unsupported glyphs become explicit U+ codepoint labels with a warning rather than invisible text |
| Unknown blocks/marks | Recognized child text/content retained, unsupported formatting reported in bounded warnings |

The editor inserts resource-backed image blocks through paste/drop or `/image`; [IMAGES.md](IMAGES.md) owns insertion/tools/loading. Imported Markdown that retained an external image only as text cannot reconstruct missing binaries during export. Plain Markdown uses meaningful workspace image references; asset packages use original relative asset paths.

Asset snapshots default to 100 MiB total, bounded additionally by MAX_ARCHIVE_BYTES; configure MAX_NOTE_EXPORT_ASSET_BYTES to change the note limit. Tables are bounded at 500 columns, 10,000 rows and 50,000 logical cells. Invalid/out-of-bounds/overlapping spans fail the operation. Warning lists cap at 100 unique messages. Large/complex documents may take longer; progress is phase-based, not a measured rendering percentage.

## Dependencies and validation

DOCX uses [Apache POI 5.5.1](https://poi.apache.org/download.cgi). PDF uses the maintained [OpenHTMLtoPDF community fork](https://github.com/openhtmltopdf/openhtmltopdf), pinned to 1.1.86 with PDFBox 3. Bundled Noto Sans Regular/Bold come from [Noto Fonts](https://github.com/googlefonts/noto-fonts/tree/main/hinted/ttf/NotoSans); the OFL license is included alongside the fonts in backend resources. Both Dockerfiles install fontconfig for Java font loading in Alpine. Library license notices remain in their dependency distributions.

Focused verification: renderer fixtures create all four formats, assert Markdown/ZIP content, DOCX spans/header/image structure and PDF extracted text. The PDF fixture is rendered to PNG for visual inspection. A service test checks snapshots against subsequent edits, discovery, selection errors, request ID retention and MIME/download metadata. Frontend checks cover save failure/retry and changed shortcut behavior. No broad API smoke or browser automation is required for routine development.

DOCX visual pagination remains unverified: the available bundled runtime has no LibreOffice executable. Structural checks do not prove Word page layout. Actual export-dialog usability is also not browser-verified. PDF inspection covers the representative fixture, not every possible note.

### N1 validation — 2026-09-29

Production build, final TypeScript compilation and targeted ESLint passed. Seven focused cases cover save failure/retry, one-click download, dismissal/duplicate suppression, existing-operation download/status retries, bounded polling failures, confirmed renderer failure, ambiguous POST failure and unmount cancellation. No browser/native download or layout verification, API smoke or Docker rebuild. Browser download restrictions may require Download again; the UI cannot confirm the destination was saved. Backend renderers and their prior validation are unchanged.

## Linked-resource graph exports

GET `/api/exports/notes/{id}/preview` returns `notes`, `files`, ordered `noteIds`, `resourceIds` (including missing targets), bounded warnings, and an opaque fingerprint. It reads saved content and creates no operation. Counts can change when pending edits are saved.

The frontend saves the root and only participating notes through the existing coordinator, rediscovering after saves for at most six rounds. If graph membership/file count differs from the reviewed preview, preparation stops and asks the user to dismiss and review updated counts; no hidden expansion. Draft/save failures remain retryable. The final preview fingerprint accompanies POST `/api/exports` with `links: "linked"`; `references: "true"` opts into the references list. A mismatched fingerprint returns 409 before operation creation, permitting a fresh save/review attempt. Status/download retries retain the original immutable operation and never save/render again.

Traversal is deterministic breadth-first from recognized `resourceLink`/`image` resourceId and table sourceResourceId attributes. Only actual document children are visited, not arbitrary attributes/marks. Cycles and diamond graphs deduplicate by ID; backlinks and remote fetching are excluded. Limits fail explicitly rather than truncating: `MAX_NOTE_EXPORT_NODES` (200, including missing references), `MAX_NOTE_EXPORT_DEPTH` (20 edges), `MAX_NOTE_EXPORT_TOTAL_BYTES` (157286400, UTF-8 documents plus actual file bytes), and the existing asset limit (104857600, also capped by MAX_ARCHIVE_BYTES). Final artifacts must also fit MAX_ARCHIVE_BYTES. The workspace gate makes metadata and binary copying consistent against application mutations; out-of-band filesystem edits remain unsupported.

Markdown paths have deterministic numeric prefixes plus sanitized titles, so equal titles cannot overwrite each other. Assets have numeric prefixes and bounded sanitized filenames. PDF uses a contents list, bookmarks, named destinations and separate note sections. DOCX uses named sections/bookmarks and internal hyperlinks. Linked files remain original bytes alongside the document; packages include `export.json` mapping source IDs/titles to output paths. These reading packages are not workspace-transfer ZIPs and cannot be used for workspace restore. Standalone exports do not invent destinations for omitted notes.

### N5 validation — 2026-09-30

Production frontend build, final TypeScript compilation and targeted ESLint pass. Eleven frontend export tests cover prior lifecycle/retries plus graph participants/fingerprint, changed membership, cancellation and counts/package labels. Six backend renderer/graph/service tests pass using disposable storage, covering cycle/diamond deduplication, equal titles, immutable snapshots, stale previews, missing assets, node/depth/byte limits, original-byte ZIP packaging, PDF destinations/bookmarks and DOCX anchor structure. Three pages of the graph PDF fixture were visually inspected and are readable. DOCX rendering was attempted with render_docx.py but LibreOffice is unavailable; Word pagination remains unverified. No browser exploration, Docker rebuild, broad API smoke or user-data mutation. Existing build warnings remain. N6 results and remaining limits are recorded in [INTEGRATION.md](INTEGRATION.md).

## Trash — 0.5.0

Trashed roots cannot be exported as active notes. Linked graph snapshots exclude trashed destinations, retain their labels and report unavailable-reference warnings. Complete workspace ZIP format 3 instead includes Trash and its original binaries/organization; unfinished permanent cleanup must be completed first. Previously prepared immutable exports can still describe the earlier saved snapshot. See [RESOURCE-LIFECYCLE.md](RESOURCE-LIFECYCLE.md).

## Android image placements

Android A4 saves standard resource-backed image attributes, so existing host export snapshots consume the same nodes. Disposable checks produced PDF image objects, embedded PNGs and captions in Word, and original PNG/alt/caption references in Markdown-with-assets. This is artifact/content verification, not visual layout certification; Word currently does not emit the placement alt text as an accessibility description. Android0.1.0-alpha.4 does not add a separate export renderer or change snapshot semantics. See [MEDIA.md](../android/MEDIA.md).
