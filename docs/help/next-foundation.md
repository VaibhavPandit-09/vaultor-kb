# Vaultor Next experimental foundation

Vaultor Next is a separate Windows development application. It does not replace the published Electron application and cannot open its databases. No migration is provided.

## Workspaces

The first launch creates a separate local M2 workspace. Open workspace accepts an empty folder or an M2 workspace. M1 and published Electron databases are not migrated; choose a new empty folder if an older workspace is refused. Unrelated nonempty folders and workspaces already open in another process are refused. No external documents are edited.

## Notes and collections

Use New collection in the sidebar, enter a name, choose its parent and select Create. The selected collection is the default parent. Expand or collapse branches with their arrow. Use a collection's More button or right-click it to rename it or change its parent. Names must be unique among siblings; moving a collection inside itself is refused.

Library shows all notes; a collection shows its direct members. Previous and Next load pages of up to 100 summaries, newest-created first. Editing does not reorder notes. Page loading keeps open editors and restores the page's scroll position when returning. New notes and membership changes refresh the first page.

New note creates a note in the selected collection. Select a title to edit it, or use Open beside for a second pane. Both views of the same note share content, Undo history and one protected draft.

Use a note's More button or right-click a Library row to organize it. Choose a destination and Add membership to include the same note in another collection. From a collection, Move membership adds the destination and removes the current membership together. Remove from this collection removes that placement only. These actions never duplicate or delete note content.

Edit the title or body directly. Markdown typing shortcuts, bold, italic, headings, lists, code blocks, tables and Undo/Redo are supported by the rich-text editor. The foundation has no slash menu, attachments, resource links, imports, search, deletion or linked Markdown editing yet.

## Saving and recovery

Edits are protected after about 250 ms without typing; continuous typing requests protection at least once per second. Disk/processing delays can extend that window. Autosave follows about one second after typing stops. Pending means the newest edit is not yet durable. Draft protected means SQLite has acknowledged it. Saved means the committed note contains it. Ctrl+S, navigation and normal closing flush pending work.

After unexpected termination, protected drafts appear under Recovery in the sidebar. Open one to compare its text and title with the saved note. Restore draft resumes it. Discard draft and use saved explicitly removes the protected evidence. Keep draft for later closes its editor and retains the draft in Recovery. Unrecorded edits cannot survive a crash or power loss.

If another writer changes the saved revision, autosave refuses to overwrite it and opens the same comparison. Use draft over reviewed saved version is an explicit replacement of that reviewed revision; another concurrent change requires another review. Keep the draft for later if you need manual reconciliation. There is no automatic merge. Both panes stay consistent when a version is chosen.

A successful protected save removes only the matching draft, in the same transaction. Recovery holds at most 64 notes / 32 MiB per workspace; reaching the limit refuses new protection rather than evicting old drafts. Review or discard older drafts to free space. There is no timed deletion of unresolved evidence. Notes have an 8 MiB serialized size limit. This remains experimental software; keep independent copies of important information.

## Appearance and keyboard

Appearance switches light and dark themes and persists the choice in the workspace. F1 opens or closes this Help. Tab moves between controls; Escape leaves editor focus. The operating system's reduced-motion preference applies to shared motion and theme transitions.
