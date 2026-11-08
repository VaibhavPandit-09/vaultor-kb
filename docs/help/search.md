# Search and command palette

## Find resources

Use Library search or **Search workspace** (default Ctrl+K on Windows, Cmd+K on Mac; configurable). Titles only is the default. Search options enables **Include saved content** and chooses the entire workspace or a collection. Pending drafts are excluded. Content search ranks saved notes and supported PDF/UTF-8 file text by relevance; ordinary title mode keeps its browsing sort.

Content search matches word prefixes, not arbitrary substrings or fuzzy synonyms. All entered terms must match. PDF extraction has limits (20 MiB, first 100 pages); text extraction caps input at 4 MiB. Image-only/encrypted/unsupported files may remain title-only. Inspect visible coverage rather than treating no result as proof that every original was searched. No OCR or Office body extraction is provided.

Global owner-local linked-folder search can include verified Markdown disk content. Scoped collection/tag/pin queries do not promise that same linked-body expansion. Disconnected sources cannot serve retained body matches. [Linked sources](linked-sources.md).

## Commands and actions

The palette has separate Search and Commands modes. Search shows bounded resources and collections; refine a broad query or use Library pagination. Commands opens registered tasks such as creation, organization, settings, shortcuts and Help. Arrow keys select, Enter opens/executes, and normal Tab moves through controls, including Actions for the selected resource. Escape steps back before closing.

Actions target the captured or selected resource, not an arbitrary first result. Renames and destructive operations retain their review/failure behavior. An existing dirty note is reopened through its current session rather than reloaded over a draft.

## Search Help

Help search is separate from workspace search. It searches bundled article text, feature names, screens, task phrases, keywords and current registered shortcuts locally. It never sends a request or includes private note bodies. Try “select multiple notes”, “drag and drop”, “linked markdown”, “recover deleted note”, “import folder”, “copy resource”, or “open in another pane”. Use Tab/Shift+Tab to traverse results and Enter to open; ArrowDown from search focuses the first result.

No matches? Try a shorter task or browse an area. Help may describe a desktop capability unavailable on your current platform; consult each feature's availability and [Platform support](platforms.md).
