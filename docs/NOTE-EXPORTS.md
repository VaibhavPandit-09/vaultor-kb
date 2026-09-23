# Individual note exports

Implemented in Sprint 3, 2026-09-23. Use the Export icon beside a note's save indicator. Choose Markdown, Markdown + assets ZIP, PDF or Word DOCX. Pending title/content saves finish first; a failed save retains the draft and offers Retry export. Download appears when rendering completes, alongside conversion warnings and operation/request IDs.

## Architecture and API

`NoteExportModal.tsx` uses the shared API client and operation endpoints. Format discovery comes from the exporter registry; no unfinished formats are selectable. Status polling is sequential, aborts on unmount and stops after three consecutive network failures until Retry status check. A failed download can be retried without rendering again. Closing the dialog after preparation does not cancel the operation; its ID remains usable through the API.

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
