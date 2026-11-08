# Troubleshooting and limitations

## Search missed something

Start with the title, clear type/tag/collection filters, then enable saved content if wanted. Unsaved drafts are not indexed. File extraction can be queued, limited, encrypted or unsupported; Diagnostics exposes coverage and retry/rebuild. No OCR, fuzzy search or Office body extraction is promised. Linked disk search has its own authorization and bounded asynchronous coverage. [Search](search.md).

## Save, connection or access failed

Keep the draft and read the error. A revision conflict means the saved version changed; use the offered review/recovery flow. Access denial, workspace replacement and lost source authority are not ordinary retryable delays. Reconnect/reauthorize deliberately. Do not bypass TLS/approval, remove journal locks or clear storage to force progress. [Recovery](recovery.md).

## Import is paused or only partly complete

Open Activity Details. Successful resources remain; failed files and link warnings are separate. After restart, reselect the same source for a verified Resume. Import another copy intentionally makes separate resources and never overwrites earlier Vaultor edits. Source files are not automatically watched. [Transfers](transfers.md).

## Preview or export differs from the original

Preview has bounds (desktop PDF/text preview up to 1 MiB; supported images 20 MiB/40 MP). Download original retains bytes even when preview is unavailable. Export formats have documented fidelity warnings; inspect them before sharing. Wide tables, Unicode fallback and static image frames can change presentation. [Exports](transfers.md#export-a-note-or-file).

## Help or a platform feature is unavailable

This is bundled documentation for its build, not a live feed from master. Old installers do not acquire new Help. Native features depend on supported platform and local owner access; Android remains a reading/Review companion. Unknown contextual Help falls back to home. [Platforms](platforms.md).

## Share a useful diagnostic

Use Diagnostics and retain request references and the app/platform version. Avoid sharing private notes, credentials, source grants or workspace backups publicly. A failed cleanup can remain in a cleanup phase and retry after restart; transfer artifacts currently need manual expiry. Help cannot repair workspace data and never runs privileged commands from an article.
