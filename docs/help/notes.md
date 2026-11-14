# Notes, editing and links

## Managed notes

Create with New note. Managed notes autosave; save failures and conflicts need attention. Do not assume an unsaved draft is searchable or safely stored on the server. Opening Library keeps existing editors alive. [Recovery](recovery.md) explains retained drafts.

Type `/` for Text, Heading 1–3, lists, tasks, code, quote, divider, highlight, symbols, table, resource links, images and Markdown/CSV insertion. Arrow keys choose menu items; Enter confirms; Escape dismisses. Formatting includes bold, italic, strike, underline, highlight and inline code. Undo is shared between visible views of the same managed note, but does not survive restart or the last editor closing.

## Links and mentions

Type `[[` to search resources, create a note or upload a file from the picker. Resource links retain their inserted labels; renaming a target does not promise to rewrite every label. Open **Links and mentions** to inspect saved relationships and their occurrences. Unsaved edits are not saved relationship evidence. Missing or trashed targets stay identifiable; deleting a resource never silently rewrites referring notes.

Use a link's ordinary opening action for the current navigation workflow; Ctrl/Cmd-click requests another pane. [Panes and history](navigation.md) explains pane limits. Dragging over a note entry can reveal that note; dropping **inside its editor** inserts a resource link at the indicated position. Dropping on the entry itself is not link insertion.

## Images

Paste/drop supported image bytes, use `/image`, or choose an existing image resource. Images retain an original File resource; tools set width, alignment, caption and alternative text. Remove from note removes that placement only. Replacing a placement does not delete its former original. Pending uploads remain separate from text saving and can block leaving the connection. Images are bounded to 20 MiB and 40 megapixels; unsupported content is refused with an explanation.

## Tables, code and insertion

Select a table in the active pane for Row, Column, Filter, Expand and More. Structural actions have restrictions while filtered. More includes copy/export and confirmed table deletion. Expanded editing keeps the table in context. Code blocks support language selection and copying. Open the language control to search; Up/Down move through choices and Escape closes the chooser and returns focus to its control. Symbol names such as `:alpha:` and supported punctuation patterns convert on space/Enter as applicable.

Markdown insertion converts content into the current managed note; it is not a lossless external-file editor. CSV insertion also retains an original file resource and inserts a table. Review before inserting; cancellation keeps the command text. XLSX/PDF table export and Google Docs export are not implemented.

## External Markdown is different

[Linked sources](linked-sources.md) uses explicit Save, source validation and protected unsupported syntax. It is not the managed-note autosave workflow. Source-preserving editing may refuse a change rather than silently rewrite syntax it cannot safely reproduce.
