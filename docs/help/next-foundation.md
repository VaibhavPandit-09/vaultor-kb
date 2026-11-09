# Vaultor Next experimental foundation

Vaultor Next is a separate Windows development application. It does not replace the published Electron application and cannot open its databases. No migration is provided.

## Workspaces

The first launch creates a separate local Vaultor Next workspace. Open workspace accepts an empty folder or an existing M2/M3 workspace. M1 and published Electron databases are not migrated; choose a new empty folder if an older workspace is refused. Unrelated nonempty folders and workspaces already open in another process are refused. No external documents are edited.

## Notes and collections

Use New collection in the sidebar, enter a name, choose its parent and select Create. The selected collection is the default parent. Expand or collapse branches with their arrow. Use a collection's More button or right-click it to rename it or change its parent. Names must be unique among siblings; moving a collection inside itself is refused.

Library shows all notes; a collection shows its direct members. Previous and Next load pages of up to 100 summaries, newest-created first. Editing does not reorder notes. Page loading keeps open editors and restores the page's scroll position when returning. New notes and membership changes refresh the first page.

New note creates a note in the selected collection. Select a title to edit it, or use Open beside for a second pane. Both views of the same note share content, Undo history and one protected draft.

Use a note's More button or right-click a Library row for the organization actions described below. These change placements without copying or deleting note content.

Edit the title or body directly. Markdown typing shortcuts, bold, italic, headings, lists, code blocks, tables and Undo/Redo are supported by the rich-text editor. The foundation has no slash menu, attachments, resource links, imports, search, deletion or linked Markdown editing yet.

## Selecting and organizing a page

Click a note title to open it normally; this clears an explicit multi-selection. Ctrl-click toggles notes without opening them. Shift-click selects the displayed range from the anchor; Ctrl+Shift-click adds that range. Checkboxes select without opening. The header reports the selected count, and Organize opens the same actions as right-click. Right-clicking an already selected row keeps the group; right-clicking another row selects that row alone.

When the resource list owns focus, Up/Down and Home/End move focus, Enter opens the focused note, Space toggles selection and Shift+Up/Down extends the range. Ctrl+A selects only the loaded page, at most 100 notes. These shortcuts do not take over editor text, inputs or dialogs. Shift+F10 or the context-menu key opens row actions. Menu arrows/Home/End move through available actions; Escape dismisses the menu first, then clears selection when the list owns focus. Escape from the editor returns focus to its Library row when visible.

Selection is scoped to the current page and collection. Changing either clears it; refresh and collection renaming retain only still-visible selected IDs. Keyboard opening preserves selection on that page. Closing a note returns focus to the list. A successful organization clears selection and reports actual added/removed/unchanged memberships; failure retains the selection for retry.

Add to collection, Move to collection and Remove from this collection use one shared dialog for one or many notes. Type to find a destination; use Down to enter the results, then Enter/Space to choose. Move and Remove appear only when browsing a collection. The entire operation commits together or leaves memberships unchanged. Already-present or absent memberships are safe no-ops; no note content or other memberships are removed.

Collection More/right-click menus provide Open, New note here, New child collection and Rename or move. Collection arrows navigate visible branches; Left/Right collapse or expand. Right-click blank Library space for New note, collection actions, page selection and Refresh. Unimplemented features are not listed.

## Search and filtering

Search notes searches the Library or the selected collection's direct members. Search options switches between titles and titles plus saved content, and between newest-created, recently modified and title A–Z order. It also provides Refresh results.

Words match prefixes, ignoring case and accents. All words must match; punctuation separates words. There are no Boolean, wildcard or fuzzy operators. Queries allow up to 256 characters and 12 words. Only committed text is indexed; pending edits and protected drafts become searchable after saving. Existing M2/M3 notes are indexed automatically on opening the workspace.

Results update after a short typing pause and use pages of at most 100 summaries. Down from the search field focuses results; Enter on a result opens it in the existing pane. Ctrl+A in the field selects text. With list focus, Escape clears selection first, then search and filters. Escape in the editor returns focus to its row. Clear search and filters returns to the prior browse page in the same collection. Opening results keeps the query and result page.

If saved notes or memberships change while paging, refresh starts a new result page instead of silently skipping or repeating rows. No-results and query-error states keep open editors intact. External Markdown, media search and Saved Searches are not available.

## Saving and recovery

Edits are protected after about 250 ms without typing; continuous typing requests protection at least once per second. Disk/processing delays can extend that window. Autosave follows about one second after typing stops. Pending means the newest edit is not yet durable. Draft protected means SQLite has acknowledged it. Saved means the committed note contains it. Ctrl+S, navigation and normal closing flush pending work.

After unexpected termination, protected drafts appear under Recovery in the sidebar. Open one to compare its text and title with the saved note. Restore draft resumes it. Discard draft and use saved explicitly removes the protected evidence. Keep draft for later closes its editor and retains the draft in Recovery. Unrecorded edits cannot survive a crash or power loss.

If another writer changes the saved revision, autosave refuses to overwrite it and opens the same comparison. Use draft over reviewed saved version is an explicit replacement of that reviewed revision; another concurrent change requires another review. Keep the draft for later if you need manual reconciliation. There is no automatic merge. Both panes stay consistent when a version is chosen.

A successful protected save removes only the matching draft, in the same transaction. Recovery holds at most 64 notes / 32 MiB per workspace; reaching the limit refuses new protection rather than evicting old drafts. Review or discard older drafts to free space. There is no timed deletion of unresolved evidence. Notes have an 8 MiB serialized size limit. This remains experimental software; keep independent copies of important information.

## Appearance and keyboard

Appearance switches light and dark themes and persists the choice in the workspace. F1 opens or closes this Help. Tab moves between controls; Escape leaves editor focus. The operating system's reduced-motion preference applies to shared motion and theme transitions.
