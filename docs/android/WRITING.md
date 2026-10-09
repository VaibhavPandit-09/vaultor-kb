# Android writing and automatic saving

Reviewed 2026-10-09. A6 owns this implementation; [ANDROID.md](ANDROID.md) owns setup/security/release and [MEDIA.md](MEDIA.md) owns image/input bounds. No host contract or protocol change; desktop/Mac0.7.1 remains compatible.

## Reading and tools

Existing notes open for reading. Edit makes the same mounted Tiptap document editable and requests the IME once; Done ends editing, without promising a host acknowledgment. The compact accessory contains Insert, Format, Undo and Redo. Insert opens Photos/Files/camera/clipboard/existing-image/pending-input choices. Format offers bold, italic, heading, bullet/numbered lists, quote and code block. Short sheets deliberately dismiss the keyboard; Tiptap retains its current selection/undo history and commands focus without requesting a scroll jump. Native clipboard and composition remain WebView responsibilities; no text reserialization is used to apply formats or save acknowledgments.

Image selection opens a contextual sheet with width, alignment and caption. More exposes alternative text, replacement, preview, Retry, Copy, Save original and placement removal. Apply commits one attribute transaction. Close discards the uncommitted form; removal does not delete the File resource. Existing mapped-anchor/source/epoch/media-import protections remain unchanged.

## Local protection and host saves

Every edit enters the encrypted, scope-bound draft journal before automatic host dispatch. Read the workspace's existing `autosaveDelay` through authenticated GET `/settings/workspace`, bounded to0–1000ms; use500ms if settings are unavailable. Reconnection refreshes this setting. There is one save request at a time. More typing during a save stays local, receives the acknowledged revision as its new base, and schedules a subsequent save. No editor reload occurs on acknowledgment. Draft-storage input allows up to3,010,000characters only for an edit plus its receipt; each document remains bounded to1,500,000characters and the existing24MiB encrypted-state/32-draft limits remain. Network and editor document limits are unchanged.

Status distinguishes Protecting draft, On this phone, Saving, Saved to host, recovery-write failure and conflict. A remote failure retains editable local content and exposes Retry saving; it does not repeatedly hammer an offline host. A local-write failure prevents network dispatch and unsafe transitions. Repeated saves join the in-flight request. Successful exact-version acknowledgment alone removes that edit from recovery; newer edits survive.

Before PUT, persist an exact `sent` receipt (version, base revision, title and document) in the draft. After a timeout/restart, GET the note before retrying: matching title/document at a changed revision acknowledges the previous request; an unchanged base permits the original conditional retry; differing host content stops writes and retains both versions. A later local edit rebases only after the sent content is verified. Missing/trashed notes and revision conflicts require explicit recovery choices. No unconditional overwrite or blind replay is introduced.

Navigation protects the source; replacement waits for an in-flight save to settle, and failures retain local drafts. Host switching retains Save first / Keep drafts behavior. Backgrounding cancels debouncing, protects locally and attempts a best-effort host flush; reactivation resumes safe automatic saving. Android can terminate before a final callback or storage write. Root exit warns about live drafts, recovery records and unfinished media; storage is not an abrupt-interruption guarantee.

## Quick creation

Home/browsing exposes New note. The title sheet captures the active collection destination, validates1–500characters and submits through the existing UUID import endpoint. A per-workspace encrypted creation record stores UUID/title/collection before dispatch. Repeated submission joins the operation. An uncertain or failed creation remains pending across restart; Retry uses its exact identity/payload instead of creating a duplicate or redirecting it to another collection. The host atomically creates note+membership. After a confirmed open, acknowledge the creation record and enter editing. Other existing-note opens remain read-first. At most32 pending workspace creation records are retained, outside portable archives. There is deliberately no silent abandon-and-recreate action for an uncertain import.

## Validation boundaries

The tracker and milestone release notes record actual controller/editor/native/emulator checks. Samsung Keyboard/One UI, physical clipboard/providers, real Wi-Fi/Mac races, TalkBack and OEM background termination remain user-only checks; Windows emulators do not certify them. Organization mutations remain A7, mobile preferences/discovery/updater A8 and integrated motion/performance A9.
