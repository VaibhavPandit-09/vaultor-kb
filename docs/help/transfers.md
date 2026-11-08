# Importing, exporting and workspaces

## Import folder or files

Choose **Import → Browse files / Browse folder**, or use a supported native drop. Review the source, destination, counts and conversion choices. Markdown/TXT become managed notes by default; keep as original where appropriate. Folder hierarchy is preserved; Create a collection for the folder adds the selected root. Browser folder picking cannot preserve empty directories.

Approval starts Activity. Imported originals remain untouched. Relative Markdown links/images within the selected batch resolve only when unambiguous; missing/outside-root references remain readable warnings. Heading fragments remain text hints rather than automatic scroll targets. Import is not folder synchronization.

Repeated import can offer **Skip imported files** only for verified identical source bytes/paths with surviving targets, preserving Vaultor edits. **Import another copy** creates separate resources. Changed/new files do not update earlier notes in place. Resume reuses the interrupted operation only after matching source reselection; it is not the same as starting another copy.

Folder limits include 2,000 entries, 32 levels, 512 MiB per original and 2 GiB aggregate. Text conversion caps each input at 5 MiB. Unsafe paths/symlinks/junctions refuse. Retain source files until Activity confirms completion. See [Activity](desktop.md#activity).

## Export a note or file

Use **Export note** for Markdown, PDF or Word, with relevant linked-note/assets choices. Preview warnings: formatting and assets vary by format. Markdown rich tables may use HTML; Word lists use editable text markers; wide tables can become row records; GIF/WebP PDF/Word images are static first frames. Missing originals stay explicit warnings. Export is a snapshot, not live synchronization.

Use **Download original** on files to retain their original bytes. Native desktop Save cancellation is not successful disk output. Prepared copies for system applications are separate from private managed originals. [Desktop tools](desktop.md).

## Workspace ZIPs and selected exports

Workspace tools provide full export, reviewed merge/import-as-new, local copies and explicit replacement workflows. A full workspace ZIP is different from individual Markdown export. Selection export prepares a partial package; partial packages cannot replace a populated workspace. Review the preview and omissions before committing. Linked originals and local source grants are excluded.

Replacement is destructive and uses a save/generation barrier and explicit confirmation. Back up first. Portable archives exclude credentials, local authority and unacknowledged private recovery. Importing an archive never grants access to a linked folder. [Recovery](recovery.md), [Platforms](platforms.md).
