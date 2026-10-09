# Android images and file input/output

Reviewed 2026-10-09. Implemented in A4 / Android0.1.0-alpha.4, using host0.7.1 and protocol3. [ANDROID.md](ANDROID.md) owns setup/security/publication; [IMAGES.md](../workspace/IMAGES.md) owns portable image semantics. Android images remain File resources, not a new resource type.

## Inserting and editing

Open an editable note and choose **Add image/file**: Photos, Files, Camera, Paste clipboard image or Existing image. `/image` followed by Enter opens Photos. The restricted editor delegates image clipboard input to native Android; accessible content-provider images are supported, with Photos/Files as the fallback. Clipboard files take precedence over HTML images and accompanying plain text is retained. Remote HTML image URLs are never fetched.

PNG, JPEG, WebP and GIF support inline placement, at most20MiB/40megapixels per image. Original bytes are retained. Other formats can be imported as ordinary file links; malformed supported images are refused. File imports/downloads have a64MiB mobile bound. Existing images use paginated metadata/title search,100rows, without fetching all resource bodies.

Tap an image to open Image tools: width20–100%, left/center/right alignment, caption, alternative text, Apply, Replace, Preview, Copy original, Save original and Remove from note. Apply commits one undoable document transaction; replacement affects the selected mapped placement. Removing a placement never deletes the original File resource or another placement. The saved node contains only `resourceId`, `alt`, `caption`, `width` and `alignment`. Uploaded files, captions and alt text reuse existing host reference/search/export/archive behavior; no host/schema/protocol change.

## Pending inputs and recovery

Android Photos/SAF/camera permissions are mediated by the system; no broad storage or camera permission is requested. Camera delegates to an available camera app with a narrowly granted FileProvider output. Cancellation does not insert anything. Android Share accepts files and accompanying text with the app open or starting; it stages inputs and requires an explicit note/Insert here choice. It never inserts into whichever note is focused accidentally. A host is not needed to stage an input.

Native `VaultorMedia` stores original pending bytes and the catalog under `noBackupFilesDir/media-inputs`, encrypted with the existing AndroidKeyStore key. At most8pending inputs/80MiB total are retained. Note, host/workspace/generation, mapped editor anchor and load identity bind an upload to its source. The existing import UUID is persisted before dispatch and reused after an uncertain response. Ordered batches run serially. Native transport validates selected host/epoch, pinned TLS and current workspace identity; switching cancels media requests. Navigation/anchor loss retains uploaded files and pending inputs for explicit insertion after reopening the source.

Only a successful mapped editor acknowledgment followed by protected draft-journal persistence removes a pending input. A failed recovery write retains it; Already in this note prevents an accidental duplicate retry. Text saves do not wait for uploads. Root exit warns about pending input as well as drafts. Remove pending input discards that local input; an already uploaded resource remains on the host. Keep private catalogs, files and fixture data out of Git/archives.

## Viewing, copying and saving

Image nodes lazily request authenticated bounded server thumbnails. Data URLs exist only in the transient native/editor bridge, never in note JSON. Late thumbnail replies are checked against the current placement resource; replacement clears the former image immediately. Broken media exposes Retry/Replace. Preview is temporary, retains the mounted editor/journey and uses original media colors. Images render a static first frame, sampled to at most2048pixels per edge, with Fit and1–4× zoom controls. Animation is not played; originals remain unchanged. PDF preview renders one page at a time, at most20MiB,1280×2000pixels; text preview shows the first100KB. Other files offer Open with/Save original instead of guessed in-WebView rendering. WebView external navigation stays disabled.

Native private preview cache is bounded to96MiB/32rendered entries; temporary share copies to80MiB/16files. Host switching cancels requests and clears temporary caches. Copy image uses an explicit Android clipboard content URI. Share/Open grant read access only to the chosen recipient. Save original uses Android's Create document destination. These actions request OS handling; they do not claim another app saved/opened the bytes successfully. Missing viewers/destinations and clipboard failures retain a visible retry/fallback. Temporary clipboard/share URIs are not durable links and can expire after cache cleanup/host switching.

## Verification and remaining gates

Actual A4 results and final APK identity are recorded in [the tracker](../plans/android-plan.md) and [release notes](releases/0.1.0-alpha.4.md). Focused checks cover encrypted staging/restoration, UUID retry after lost acknowledgment, byte-identical originals, image bounds, mapped anchors, source changes, undo and duplicate placements, native clipboard/tools/save/preview, picker cancellation and explicit mixed Share intake. Disposable host exports verify saved node attributes/references, PDF image objects and embedded PNG assets in Word/Markdown packages. This does not certify visual PDF/Word layout or animation.

Physical Samsung clipboard providers, One UI camera/share/SAF implementations, real Wi-Fi/Mac media transfers, TalkBack, OEM process/battery behavior and physical OLED remain user-only checks. Full touch/theme/motion polish remains A6. A camera app dying before returning its output is outside the durable staged-input guarantee; use the original camera file/picker to retry. Batches that partly fail retain earlier staged inputs for explicit resolution. Full offline synchronization, video/audio playback, pinch-gesture parity and desktop multi-pane editing are outside A4.

Android can redeliver a Share intent; pending inputs are explicit and never auto-uploaded. Inspect the pending list before inserting a repeated share. Interrupted camera output before native staging and provider-specific cold-start URI grants remain separate physical-device checks.
