# Keyboard shortcuts

## Current bindings

In-app Help shows a searchable live reference below this article, derived from the same registry and resolved settings as the app. Use Settings → Keyboard to customize registered app bindings. The existing Shortcuts window remains available. In GitHub, inspect that window in your installation for actual bindings; this document deliberately does not duplicate configurable defaults.

## Focus matters

App navigation, resource-list commands, menus and editor commands have different focus requirements. Ctrl/Cmd+A in a resource list selects the loaded page; in an editor it selects text. Desktop Ctrl/Cmd+C/X/V operates on resources only when the resource list owns focus and applicable scope exists. Cut requires collection contents; paste adds membership to a destination collection.

F2 renames one supported selected resource. Delete reviews Move to Trash. ContextMenu / Shift+F10 opens applicable context menus. Slash opens the editor block menu; `[[` opens resource linking. Arrow keys and Enter work in pickers/menus; Escape closes the deepest active surface before returning focus. The unmodified `?` shortcut opens Shortcuts outside editable fields.

The live reference covers registered app/navigation/menu commands and desktop resource conventions. It is not an exhaustive list of Tiptap formatting/OS text commands, which retain their context and platform behavior. [Selection](interactions.md), [Editor](notes.md).
