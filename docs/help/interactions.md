# Selection, clipboard and dragging

These desktop interaction capabilities shipped in Windows x64 and Mac Apple Silicon 0.26.0. Browser support is narrower; native resource clipboard and prepared filesystem copies require Vaultor Desktop. Android does not offer these desktop editing workflows.

## Select multiple notes

Use resource checkboxes, Ctrl/Cmd-click to toggle, or Shift-click for a displayed range. With the resource list owning focus, Ctrl/Cmd+A selects its current loaded page (up to 100 resources), not all matching pages. Changing page or criteria clears selection. Collections are destinations and are excluded from resource bulk selection.

Bulk controls offer applicable collection membership, tags, pins, partial export and reviewed Move to Trash. Failed targets remain selected so you can inspect them. Delete reviews Trash for the selection; F2 renames one supported selected resource. Editable text, composition and configured app shortcuts take precedence.

## Copy resource

Desktop **Copy resource** copies identities, not duplicate documents or raw filesystem paths. Paste into a collection adds memberships. **Cut** is available from a specific collection; successful paste elsewhere removes only that captured source membership. Other memberships remain. Clipboard scope checks refuse stale or different workspace/connection identities.

Copy resource link provides link content for editor insertion; ordinary text copy/paste remains available when text owns focus. Ctrl/Cmd+C inside an editor copies selected text, not the Library selection. Copy title is separate. Resource clipboard does not synchronize between computers.

## Drag and drop

Use the visible intent label to understand the destination before releasing:

| Drag | Destination | Result |
| --- | --- | --- |
| Resources | Collection | Add membership; no duplicate content |
| Resources | Tag | Apply tag |
| Tag | Resource | Apply that tag |
| Resources | Pinned | Pin |
| Resources | Trash | Review Trash; confirmation still required |
| Collection | Valid parent collection | Move hierarchy; cycles refused |
| One resource | Pane target | Open in that pane |
| Resources | Editable managed-note body | Insert resource links at drop position |
| Open Notes session | Session / pane target | Reorder, arrange or swap as indicated |

Hover over supported sidebar destinations to explore while retaining the drag. **Dragging a note into another note:** hover its entry to reveal the editor, then move into the editable body and release at the insertion marker. Releasing on the entry does not insert into the document. Escape cancels the drag. Unsupported targets refuse rather than guessing.

Dropping local files/folders into acquisition or a collection starts import review; it does not grant arbitrary filesystem access. Browser folder drops ask for Browse folder. [Import](transfers.md).

## Native filesystem copies

For managed files, **Export copy for Explorer**, **Reveal exported copy**, default-app opening and prepared drag-out require explicit preparation/review. These work with copies, never expose the private managed original. Unsupported resources and externally owned linked files cannot be treated as managed originals. See [Desktop tools](desktop.md).
