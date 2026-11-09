# Vaultor Next experimental foundation

Vaultor Next is a separate Windows development application. It does not replace the published Electron application and cannot open its databases. No migration is provided.

## Workspaces

The first launch creates a separate local workspace. Open workspace lets you select an empty folder or a folder previously created by Vaultor Next. Nonempty unrelated folders and workspaces already open in another process are refused. No external documents are edited.

## Notes and collections

Use New collection in the sidebar, enter a name and choose Create. Select Library to see all notes or a collection to see its notes. New note creates a note in the selected collection. Select its title to edit it. The button beside a note opens it in a second pane. Both views of the same note share content and Undo history.

Edit the title or body directly. Markdown typing shortcuts, bold, italic, headings, lists, code blocks, tables and Undo/Redo are supported by the rich-text editor. The foundation has no slash menu, attachments, resource links, imports, search, deletion or linked Markdown editing yet.

## Saving and recovery

Edits save automatically after a short pause. The note header shows saving, saved or failed. Ctrl+S flushes pending changes. Navigation, workspace changes and normal window closing wait for save receipts. A failed save keeps the editor open; correct the problem and use Retry saves. A revision conflict requires manual recovery; automatic merging is unavailable.

Only saved changes are guaranteed after a crash or forced process termination. Private crash-draft recovery is deferred. Do not use this experimental application as the sole copy of important information. Lists currently show up to 500 notes. Notes have an 8 MiB serialized size limit.

## Appearance and keyboard

Appearance switches light and dark themes and persists the choice in the workspace. F1 opens or closes this Help. Tab moves between controls; Escape leaves editor focus. The operating system's reduced-motion preference applies to shared motion and theme transitions.
