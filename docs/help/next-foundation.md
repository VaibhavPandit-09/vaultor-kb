# Vaultor Next experimental foundation

Vaultor Next is a separate Windows development application. It does not replace the published Electron application and cannot open its databases. No migration is provided.

## Workspaces

The first launch creates a separate local Vaultor Next workspace. Open workspace accepts an empty folder or an existing M2–M8 workspace. M1 and published Electron databases are not migrated; choose a new empty folder if an older workspace is refused. Unrelated nonempty folders and workspaces already open in another process are refused. Import and transfers also offers Create local workspace: choose a parent and a new folder name. Finish or cancel Activity tasks before switching. Linked folders are separate from this workspace.

## Notes and collections

Use New collection in the sidebar, enter a name, choose its parent and select Create. The selected collection is the default parent. Expand or collapse branches with their arrow. Use a collection's More button or right-click it to rename it or change its parent. Names must be unique among siblings; moving a collection inside itself is refused.

Library shows managed notes and imported file resources; a collection shows its direct members. Previous and Next load pages of up to 100 summaries, newest-created first. Editing does not reorder notes. Page loading keeps open editors and restores the page's scroll position when returning. New notes and membership changes refresh the first page.

New note creates a note in the selected collection. Select a title to edit it, or use Open beside for a second pane. Both views of the same note share content, Undo history and one protected draft.

Use a note's More button or right-click a Library row for the organization actions described below. These change placements without copying or deleting note content.

Edit the title or body directly. Markdown typing shortcuts, bold, italic, headings, lists, code blocks, tables and Undo/Redo are supported by the rich-text editor. The foundation has no slash menu, rich attachment previews, resource links or deletion yet. Search and linked Markdown use the controls described below.

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

If saved notes or memberships change while paging, refresh starts a new result page instead of silently skipping or repeating rows. No-results and query-error states keep open editors intact. Search covers managed notes only; external Markdown, media search and Saved Searches are not indexed.

## Saving and recovery

Edits are protected after about 250 ms without typing; continuous typing requests protection at least once per second. Disk/processing delays can extend that window. Autosave follows about one second after typing stops. Pending means the newest edit is not yet durable. Draft protected means SQLite has acknowledged it. Saved means the committed note contains it. Ctrl+S, navigation and normal closing flush pending work.

After unexpected termination, protected drafts appear in the sidebar footer’s Recovery menu. Open one to compare its text and title with the saved note. Restore draft resumes it. Discard draft and use saved explicitly removes the protected evidence. Keep draft for later closes its editor and retains the draft in Recovery. Unrecorded edits cannot survive a crash or power loss.

If another writer changes the saved revision, autosave refuses to overwrite it and opens the same comparison. Use draft over reviewed saved version is an explicit replacement of that reviewed revision; another concurrent change requires another review. Keep the draft for later if you need manual reconciliation. There is no automatic merge. Both panes stay consistent when a version is chosen.

A successful protected save removes only the matching draft, in the same transaction. Recovery holds at most 64 notes / 32 MiB per workspace; reaching the limit refuses new protection rather than evicting old drafts. Review or discard older drafts to free space. There is no timed deletion of unresolved evidence. Notes have an 8 MiB serialized size limit. This remains experimental software; keep independent copies of important information.

## Linked external Markdown (Windows experiment)

Use Link external folder and choose an ordinary local NTFS folder. Registration records location and identity without importing files. Expand folders to browse Markdown; directories load at most 100 entries per page. Right-click a source to refresh or remove its registration. Removal never deletes its files. Up/Down navigate entries; Left/Right collapse/expand, Enter opens, and Shift+F10 opens actions.

Open a file in the existing pane or use Open beside. Both panes share one document, history and protected draft. Ctrl-click a Markdown link, or Ctrl+Enter while in it, navigates within registered folders. HTTP/HTTPS links open the system browser; other protocols are refused. Simple same-document heading fragments scroll within the pane; cross-file fragment positioning and embedded media are not implemented.

The external file remains authoritative. Editing protects a private recovery draft after 250 ms quiet or one second continuous typing, subject to the actual SQLite acknowledgment. It does **not** autosave the external file. Select Save in that pane, or Ctrl+S while that pane owns focus, to publish deliberately. Navigation and normal close protect drafts without publishing. A no-op Save leaves bytes and timestamps unchanged.

Rich editing supports paragraphs, headings, basic inline formatting/links, lists/tasks, ordinary code blocks and simple unaligned tables. UTF-8 BOM, CRLF/LF, frontmatter, reference definitions and unrelated source ranges are retained. Frontmatter is shown separately. Save patches verified source ranges and reparses the result; complex structural changes may be refused instead of reformatting the file. Raw HTML, images, footnotes, extensions and aligned tables use a read-only source view. Rich editing is limited to 256 KiB; reading to 1 MiB.

If the source changes, disappears or is replaced, Save refuses to overwrite it. Review compares protected content with the current source; keep the draft for manual reconciliation or explicitly discard it and reload. There is no force overwrite or automatic merge. After interruption, the footer Recovery menu offers Restore draft or explicit discard. Only acknowledged edits survive a crash.

Publication flushes a same-directory candidate and captures the original before a non-replacing rename. This is not atomic compare-and-swap: another program can occupy the brief path gap. It is left untouched, with original/candidate evidence and the draft retained. Review shows evidence paths. Verify Save outcome acknowledges only an exact original or candidate identity/hash; uncertain outcomes require manual attention and are never replayed. Do not remove evidence files while resolving an interrupted Save.

At most eight non-overlapping fixed local NTFS roots are supported. Junctions/reparse points, cloud placeholders, hardlinks, alternate streams/extended attributes and unsupported metadata are refused or read-only. Ordinary owner/group/DACL, creation time and attributes are checked and transferred; file identity and write time change on a real Save. Optional audit/exotic metadata and concurrent security administration are not qualified. SMB, removable/non-NTFS storage and other platforms are unsupported. Linked drafts have a separate 64-document / 32 MiB bound in the same workspace database; unresolved drafts are never evicted silently. Registration persists, but expanded trees and open panes are not restored automatically.

## Appearance and keyboard

Appearance in the top toolbar offers Light, Dark and OLED black, persisted in the workspace. The window becomes visible after the saved theme is applied. F1 opens or closes this Help, saving managed edits and protecting linked drafts first. Tab moves between controls; Escape leaves editor focus. The operating system's reduced-motion preference applies to shared motion and theme transitions.

## Desktop workspace and navigation

Library and collection contents use the full workspace. Opening a note enters the note workspace; the Library list is not kept as a permanent second column. Use Return to Library or Back in the top toolbar to return with the current query, resource page, selection and scroll position intact. Forward reopens the previous note arrangement. Alt+Left/Right also traverses view history. History is limited to 32 view changes in this session and uses the current Library/collection browse context; it does not recreate older collection/filter snapshots.

The sidebar has Search and Library entry points, Collections and Linked sources companion access, and New note. Its working-area tabs show Open notes, Quick access, Collections or Linked sources without changing the main workspace. Open notes keeps up to twelve session shortcuts; it does not keep hidden editors running. Categories support Left/Right/Home/End focus and Enter/Space activation. Toggle sidebar in the toolbar expands or collapses navigation. Recovery counts remain visible in the footer; open Recovery to review protected managed or linked drafts.

Open beside or Split active note uses two shared panes. The active pane has an accent line. Drag the divider, or focus it and use Left/Right, to change the width from 30% to 70%. Narrow windows stack the two panes. Closing a pane keeps the other intact. Close beside an Open notes entry saves/protects its work and closes that note’s current panes. Closing the last returns to Library. Pane arrangements and Open notes shortcuts are session-only.

Library orientation compresses as its resource list scrolls, reclaiming space while keeping actions available. The shell, window controls and sidebar remain within the window; only the intended list, pane and companion regions scroll. Reduced motion applies independently of appearance.

The top toolbar provides Back/Forward, workspace or note context, Library search, pane controls and Appearance. Drag its central title area to move the window; double-click it to maximize/restore. Minimize, maximize/restore and Close use native window commands. Close protects/saves pending work through the existing barrier. This experiment has no tray-close or full native window-menu/Snap-hover parity yet.

## Managed imports and exports

Use Import in the sidebar, then Import files or Import folder. Native selection is followed by a review showing destination, counts, sizes, discovery issues and likely duplicates. External originals remain untouched. Folder imports reuse nested collections (including empty folders) below the selected collection or Library. Successful files commit separately: cancellation or failed inputs can leave a partial import, explained in Activity. Links/junctions are skipped; workspace storage cannot be its own source.

By default, an existing original with the same filename and SHA-256 is skipped, even in a different destination; no new membership is added. Choose separate copies in review to intentionally create new resources. Existing resources are never overwritten. UTF-8 text and supported Markdown up to256KiB become editable notes with the initial original bytes retained. Larger, non-UTF-8 or unsupported Markdown and other file types remain managed file resources. Open them for identification and Export original; full previews are planned for M9. Library search includes their filenames, not binary contents.

Right-click one resource or a selected page and choose Export selected resources. Choose Markdown, plain text or imported originals, then a parent and a new output folder name. Non-note files always export original bytes. Note export uses the current committed document; imported original export uses the initial bytes. Unsupported rich structures fail clearly instead of claiming lossless conversion. Output names include resource identity to avoid collisions. Existing destinations are refused.

Each review accepts up to20,000 entries/32folder levels,1GiB per file and10GiB total. Discovery issue details and review rows are bounded to100. Reviews expire after15minutes.

## Portable workspace transfers

Import and transfers or Workspace actions offers Export workspace. Resolve or explicitly discard protected drafts and uncertain linked publication evidence first. Export contains committed managed notes, original files, collections, memberships, tags/assignments, pins, Trash state, managed recency and supported workspace settings. It excludes linked external contents and registrations, protected drafts, Activity history and machine-specific connections. External folders must be registered again explicitly after restoration.

Choose a new `.vaultor` filename. The portable format is versioned and integrity-checked; it is unrelated to Electron archives. Import workspace as new verifies the archive and previews resource, collection and file counts. Choose a parent and a new folder name. Restoration stages and validates a separate workspace before publication and never overwrites an existing workspace. Open restored workspace from its completed Activity entry, or use Open workspace. Merge into an existing workspace is deferred to M10. Portable manifests are limited to32MiB of JSON and20,000 resources; file payloads have the import limits above.

## Background Activity

Activity in the upper-right toolbar opens a compact anchored panel. Tasks continue while it is closed. Queued/running tasks show actual processed items/bytes, or indeterminate progress when totals are unknown. Completion includes output paths and committed counts; expand Details for failed inputs or errors. Cancel task stops at safe boundaries. Committed import items remain; unpublished export/restore staging is cleaned up. Final verification/publication cannot be interrupted and is labelled accordingly.

The last64 summaries (up to30days) remain across navigation and ordinary restart. Unexpectedly interrupted tasks are marked Interrupted and are never automatically replayed. Review partial imports before retrying; the default duplicate policy helps avoid repeated copies. A forced process termination can leave uniquely named staging/orphan files; do not mistake those for completed exports. No automatic backup or resumable-job guarantee is provided.

## Tags and quick navigation

Choose Tags in the sidebar working region. Search existing tags, browse pages of up to100, and use New tag or Manage tag to name/color/rename/delete one. Deleting a tag removes assignments, never resources. Resource actions → Assign tags opens the searchable picker for the current selection. Existing names appear first; Create and assign appears only when the complete name does not already exist. Assigned indicates all selected resources; a partial count offers assignment to all. Click Assigned to remove from all. Down enters choices, arrows traverse, Enter activates, and Escape closes the picker. Ctrl+A in its input selects text. Newly created tags become available immediately.

Choose a tag to browse its active resources through the ordinary paginated Library. Pinned resources use the same list and selection actions. Pin/unpin from resource menus or note actions; membership/content does not change. The working-region tabs expose Open notes, Quick access, Collections, Tags, Pinned, Recents and Linked sources. Quick access shows six recent entries; Recents retains a compact cross-restart list including linked Markdown. Managed recent writes are throttled within15seconds and never track mere pane focus. Missing linked sources report their existing safe open error. Automatic contextual sidebar switching and full session restoration remain later refinements.

## Trash and permanent deletion

Resource actions → Move to Trash asks for confirmation and saves/protects current editing first. Unresolved managed recovery drafts refuse lifecycle changes. Trash keeps identity, content, tags, pin state and collection memberships; normal Library, tag, pin and search views exclude it. Trash uses the same100-row pages and page-scoped selection. Row activation selects there; contextual Restore returns the selected resources to active browsing. Surviving renamed collections retain their identities. Deleted collections are not recreated; resources remain accessible through Library.

Permanently delete operates only on Trash and asks for confirmation. Empty Trash is one action across all Trash pages, regardless of the current search/page. Activity reports processed resources and protected/failed inputs; eligible resources commit independently and cancellation can leave partial completion. Deletion cannot be undone. Protected drafts are never bypassed.

Metadata removal and managed-file removal are separate durable steps. A committed cleanup receipt retains the exact owned UUID file obligation until removal succeeds. Startup and Empty Trash retry those receipts; failures remain visible in Activity. External linked originals are never candidates. No recursive cleanup of unknown directories or external export stages is performed.

## Deleting a collection hierarchy

Collection actions → Delete hierarchy removes its nested collections while keeping every resource in Library by default. The explicit Trash-exclusive option reviews the hierarchy count and exclusive resource count; resources with another membership outside the hierarchy stay active. A changed review is refused and must be reopened. Collection hierarchy restoration is not implemented. Removing linked-source registration continues to keep its external files.
