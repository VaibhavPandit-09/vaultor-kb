# Desktop tools, Activity and updates

## Activity

The corner **Activity** control shows long imports, exports, transfers and Empty Trash, with phase, measured units, warnings and results. Open Details for failures. File review closes once the task is durably dispatched; you can continue browsing. One long operation per renderer/source is admitted at a time.

Pause for file import/Trash waits for the current request/batch. Pausing transfer monitoring does not cancel host work. Minimizing retains work; quitting/reloading does not promise arbitrary continuation. After restart, tasks restore paused and recheck authority; file imports need source reselection. Save ZIP appears only for a verified prepared output, and cancelling its save keeps the output available. Clear finished tasks does not silently dismiss issues.

Supported desktop Activity projects progress/attention to the OS taskbar and can notify for background attention or long-running completion. OS preferences control availability; foreground/passive events stay quiet. Clicking a notification focuses the app and Activity without changing workspace.

## Native files and window behavior

Desktop uses native file/folder/save dialogs and scoped prepared copies for managed files. Export/reveal/open/default-app/drag-out acts on those copies. Ordinary Clipboard text behavior remains native in editable fields. Internal resource clipboard uses identities and membership semantics: [Clipboard](interactions.md#copy-resource).

Window hiding/tray behavior retains editors; explicit Quit uses save/recovery and transfer barriers. Start at login is opt-in and OS checked. Connections and sharing owns local/remote host choice, approval and sharing. A manually added localhost server is not equivalent to the managed This computer profile for native linked-source authority.

## Updating Vaultor

Open the application **Updates** control. Use the offered verified update and restart workflow, or the advanced signed-pair import. Updates verify the original signing identity and platform/version; checksums alone are not authenticity. Keep the installer and matching signed sidecar together for manual import. Do not uninstall or clear app data merely to update.

Windows x64 and Mac Apple Silicon have separate platform assets. GitHub Latest can lag a platform-specific published release. Help is included in Windows 0.27.0; older 0.26.0 installations need an update to obtain it. Mac remains at its verified 0.26.0 release. [What's New](whats-new.md), [Platforms](platforms.md).

For official distributions use [Vaultor releases](https://github.com/VaibhavPandit-09/vaultor-kb/releases). Help itself does not need that site or a network connection.
