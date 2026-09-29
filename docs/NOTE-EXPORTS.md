# Individual note exports

Use the Export icon beside a note's save indicator. Clicking Markdown, Markdown + assets ZIP, PDF or Word DOCX directly saves that note, prepares a snapshot and requests the download. There is no second confirmation/download step. The picker closes automatically after download handoff; the compact status card retains Download again. Failed saves retain the draft and offer Retry export. Download requested means the browser was handed the file, not that it was successfully saved; Download again remains available. Relevant conversion warnings and technical Details are disclosures rather than persistent instructions.

## Architecture and API

`NoteExportModal.tsx` is always mounted by Dashboard and owns a `NoteExportController` outside the conditional AppModal. The controller captures the target note/format, serializes execution and uses the shared API client. Closing the picker at any stage keeps saving, sequential polling and automatic download alive, with a compact status card. One active or unresolved export is retained at a time; completed downloads may be replaced by a new format choice. Format discovery uses the exporter registry. Status polling stops after three consecutive failures until Retry status check. Status/download retries reuse the operation and do not save or render again. A confirmed FAILED operation permits a fresh snapshot after saving the latest draft. An ambiguous POST failure has no automatic retry because creation is not idempotent: check Diagnostics before explicitly dismissing and starting over. Technical IDs are under Details. Full application unmount/reload stops frontend tracking; backend rendering continues, but old downloads are not automatically replayed. No export state is persisted locally.

```json
POST /api/exports
{"scope":"notes","noteId":"<resource-id>","format":"pdf"}
```

Formats for scope `notes`: `md`, `md-assets`, `pdf`, `docx`. This sprint accepts one note per operation. `GET /api/export-formats` returns MIME types/extensions. Poll `GET /api/operations/{id}`; after `SUCCEEDED`, retrieve `GET /api/exports/{id}/download`. Operations add `filename`, `mediaType` and `warnings`; the download has matching Content-Type and Content-Disposition. Unsupported formats, missing/non-note IDs and unavailable results produce existing problem-detail responses. Workspace `{scope:workspace,format:zip}` remains separate and unchanged in format.

`TransferService.exportNote` takes an immutable structured-document/title snapshot and copies directly referenced local file bytes under the workspace gate before returning the operation. It records snapshot/artifact metadata and uses the existing single worker. Rendering does not hold the workspace gate; short progress writes do, preventing contention with ordinary note requests. Operation-status persistence also retries transient SQLITE_BUSY at most five times with bounded backoff. Request/operation IDs follow the job through logs. Later edits, rename, file deletion or workspace replacement cannot alter the snapshot.

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
| Internal links | Label and source-workspace resource ID retained as a readable reference; linked notes are not recursively exported, and no nonexistent deep link is invented |
| Missing targets/bytes | References remain visible; warnings identify missing resources/files without dropping surrounding content |
| Assets | Markdown asset ZIP contains `note.md`, `assets/` and `README.txt`; directly referenced files are included. Plain Markdown/PDF/DOCX retain ordinary file references rather than embedding attachments |
| Images | Locally referenced PNG/JPEG images up to 10 MiB embed in PDF/DOCX. Missing, remote or unsupported images remain text references with warnings; ZIP includes local source bytes |
| Unicode | Markdown/DOCX retain original Unicode. PDF bundles Noto Sans; unsupported glyphs become explicit U+ codepoint labels with a warning rather than invisible text |
| Unknown blocks/marks | Recognized child text/content retained, unsupported formatting reported in bounded warnings |

Image nodes are supported by the export renderer for structured documents; this does not add an image-insertion command to the editor. Existing editor imports that preserve an image only as text cannot reconstruct missing binaries during export.

Asset snapshots default to 100 MiB total, bounded additionally by MAX_ARCHIVE_BYTES; configure MAX_NOTE_EXPORT_ASSET_BYTES to change the note limit. Tables are bounded at 500 columns, 10,000 rows and 50,000 logical cells. Invalid/out-of-bounds/overlapping spans fail the operation. Warning lists cap at 100 unique messages. Large/complex documents may take longer; progress is phase-based, not a measured rendering percentage.

## Dependencies and validation

DOCX uses [Apache POI 5.5.1](https://poi.apache.org/download.cgi). PDF uses the maintained [OpenHTMLtoPDF community fork](https://github.com/openhtmltopdf/openhtmltopdf), pinned to 1.1.86 with PDFBox 3. Bundled Noto Sans Regular/Bold come from [Noto Fonts](https://github.com/googlefonts/noto-fonts/tree/main/hinted/ttf/NotoSans); the OFL license is included alongside the fonts in backend resources. Both Dockerfiles install fontconfig for Java font loading in Alpine. Library license notices remain in their dependency distributions.

Focused verification: renderer fixtures create all four formats, assert Markdown/ZIP content, DOCX spans/header/image structure and PDF extracted text. The PDF fixture is rendered to PNG for visual inspection. A service test checks snapshots against subsequent edits, discovery, selection errors, request ID retention and MIME/download metadata. Frontend checks cover save failure/retry and changed shortcut behavior. No broad API smoke or browser automation is required for routine development.

DOCX visual pagination remains unverified: the available bundled runtime has no LibreOffice executable. Structural checks do not prove Word page layout. Actual export-dialog usability is also not browser-verified. PDF inspection covers the representative fixture, not every possible note.

### N1 validation — 2026-09-29

Production build, final TypeScript compilation and targeted ESLint passed. Seven focused cases cover save failure/retry, one-click download, dismissal/duplicate suppression, existing-operation download/status retries, bounded polling failures, confirmed renderer failure, ambiguous POST failure and unmount cancellation. No browser/native download or layout verification, API smoke or Docker rebuild. Browser download restrictions may require Download again; the UI cannot confirm the destination was saved. Backend renderers and their prior validation are unchanged.

## Linked-resource export follow-up (planned N5)

Current exports do not recursively include linked notes; the asset ZIP includes directly referenced local files only. PDF/DOCX still show readable labels followed by source-workspace resource IDs. N5 will replace this presentation and add optional outgoing-graph export, cycle/deduplication handling, bounded consistent snapshots, internal document/relative Markdown links, and attachment packages. See the workspace tracker for the authoritative planned scope. These renderer changes are not delivered by N2.

N2 correction validated 2026-09-29: the picker automatically closes only after successful browser download handoff. Save/download failure keeps it open; reopening a completed export does not immediately dismiss it. Existing focused export tests now assert the close callback after handoff and its absence on save failure. Native browser disk-save completion remains unobservable and is not claimed.
