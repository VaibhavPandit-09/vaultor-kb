# Managed images in notes

Reviewed 2026-10-08. Implemented and shipped in 0.4.0; current 0.5.0 lifecycle clients and hosts require protocol 3 (managed images originally introduced protocol 2). Older clients cannot open the current host; new clients require an updated host before editors mount. Images remain File resources and follow the Trash/Restore semantics in RESOURCE-LIFECYCLE.md.

## Add and edit

Paste a screenshot or image file into a note, drop image files at an insertion point, or use `/image` to choose files or search existing image resources. PNG, JPEG, WebP and GIF are supported, up to 20 MiB and 40 megapixels each. Original bytes become ordinary File resources. Unsupported inline formats remain available through ordinary file imports. Dimensions are inspected before full backend decoding. Remote HTML image URLs are not fetched automatically; choose a local image instead. Clipboard files take precedence over accompanying HTML images; accompanying plain text is retained.

The `image` Tiptap block persists only `resourceId`, `alt`, `caption`, integer `width` (20–100 percent) and `alignment` (`left | center | right`). Default width is 100%, center aligned, with aspect ratio preserved. No credentials, URLs, file bytes, upload IDs/status or blob handles enter saved JSON/recovery records.

Select an image, focus its frame or use touch to reveal Width, alignment, Caption & alt, Replace and More. Drag the bottom-right handle to resize; release commits one undoable attribute transaction. Numeric width commits on blur/Enter. Caption and alt text are editable separately. More offers Preview, Copy image, Download original and Remove from note. Removal deletes only that placement; replacement changes its resource reference and retains placement attributes. Neither action deletes the file or another placement. Image insertions and edits mirror through shared ProseMirror steps/undo; each view keeps independent selection.

## Upload ownership and recovery

One pipeline uses the existing retry-safe `PUT /resources/imports/{uuid}` identity. Retry reuses that UUID after a lost response. Batch uploads/insertion retain input order: a failed earlier image holds later ready images until Retry/Remove resolves it. Native file selection supports up to 50 images per batch; each selected image is validated independently. Pending status appears locally and at mapped view-only decoration anchors, never in saved documents. Browser uploads show transfer progress; the native adapter reports preparation/completion when streamed progress is unavailable.

Uploads own the source note and connection epoch. Anchors map through intervening shared edits; an invalid/deleted target or the last view closing retains a successfully imported resource and offers Insert here after reopening that source note. Focusing another note never changes the upload target. Pending or failed bytes remain in memory; exiting warns and switching connections waits for upload completion/removal. Text saving continues normally. This is not durable upload-byte recovery: refresh/process loss may discard unfinished local bytes; successfully imported originals remain in Library. Failed validation can leave the original as an ordinary file resource, which Remove does not delete.

## Loading, preview and copy

Inline placements lazy-load near visibility through authenticated platform loading. Requests cancel on disposal/resource changes and release their preview cache/blob handles. A broken/missing image provides Retry/Replace/Download original. Image pixels are never inverted or themed. Preview uses existing side/floating preferences; supported image preview permits 20 MiB with the same dimension check, while unrelated PDF/text limits stay 1 MiB. Fit, Actual size and zoom controls affect display only.

Desktop Copy uses a narrow resource-ID/token bridge, authenticated first-frame PNG conversion and Electron's current asynchronous `ClipboardItem` API. Browser Copy starts `navigator.clipboard.write` during the click gesture with a promised PNG payload. Browser permissions/security-context support vary; failures retain an explicit Download original fallback. GIF/WebP clipboard conversion is a static first frame; original downloads remain unchanged. See [Electron clipboard API](https://www.electronjs.org/docs/latest/api/clipboard).

## Portability and APIs

Image resource IDs participate in backlinks, replacement/deletion references, export graph snapshots and archive merge remapping. Captions and alt text enter transactional saved-content FTS extraction; IDs and arbitrary attributes do not. Deleted resources retain visible broken placements with feedback rather than dropping document content.

`GET /api/resources/{id}/image-info` returns `{format,width,height,bytes,animated}` for authenticated file resources, without storage paths. `GET /api/resources/{id}/image-png` returns a bounded first-frame PNG for clipboard conversion. Original `/raw` and `/download` remain unchanged. Unsupported formats/limits produce actionable request errors. No database migration/new resource type is introduced. ImageIO inspects headers and decodes bounded first frames; WebP uses pinned [imageio-webp 3.14.0](https://central.sonatype.com/artifact/com.twelvemonkeys.imageio/imageio-webp/3.14.0).

PDF/Word embed supported local images, preserving caption, alignment and proportional width. GIF/WebP render as PNG first frames; animated content carries a warning. Markdown retains meaningful `vaultor:resource/<id>` image references; asset ZIPs and workspace archives keep original files. See [NOTE-EXPORTS.md](NOTE-EXPORTS.md) for snapshot/graph/total-asset limits.

Tiptap content validation is enabled. Unknown/unsupported structured content disables that editor and saving, retaining the original source JSON and explaining the need for a compatible client. Unsupported legacy URL/data image representations are also blocked rather than silently stripped and autosaved.

## Validation

Focused editor/upload tests cover source ownership, mapped anchors, retry identity/order, closed-note insertion, shared attributes/undo and limits. Backend tests cover header limits/formats, GIF animation/WebP decode, original preservation, references/remapping, saved captions/alt search and export fidelity. The native development helper `VAULTOR_IMAGES_SMOKE=1` uses an owned disposable workspace and real OS clipboard, restoring its captured clipboard items using reconstructed ClipboardItems. Actual results/platform limitations are recorded in CODEBASE and the tracker. Browser clipboard permission prompts and physical/native Mac checks require their respective environments.

## Discovery and usage — 0.6.0

Images remain File resources. Images in the shared Type filter selects all matching saved image metadata before server paging; the existing-image picker now uses this category query rather than filtering an arbitrary mixed page. Rows load bounded static thumbnails, never all original image bytes. Image More and replacement tools expose Used in, distinguish saved sources from placements and explain placement-only replacement. See [REFERENCES.md](REFERENCES.md) for thumbnail limits, historical MIME metadata, saved-only counts and validated source navigation.
