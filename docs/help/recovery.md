# Trash, drafts and recovery

## Recover deleted note

Open **Trash**, find the resource and choose **Restore**. Trash removes resources from ordinary Library/search/Pinned visibility but retains original content and surviving organization. Restore makes them available again. Removing a collection membership, unpinning or closing a note is not deletion.

**Delete permanently** is only in Trash and requires confirmation. It removes the original without rewriting links in other notes; readable broken references remain. **Empty Trash** reviews a snapshot across all matching pages, not just the visible page, and processes bounded batches. Failures remain visible and can need explicit retry. There is no restore after successful permanent deletion without an independent backup.

Linked references are externally owned. Trashing/removing a reference does not authorize deleting its source file. Collection deletion defaults to keeping originals; its optional Trash mode has narrower exclusively-contained managed-resource semantics. [Organization](library.md).

## Unsaved managed notes

Watch save status. Conflicting server revisions never silently overwrite a local draft. Same-tab, same-generation drafts may recover automatically only when their server revision still matches; other cases become separate recovery copies. Use the offered recovery flow to inspect/keep/export rather than discarding blindly.

Recovery and session records depend on local browser/desktop storage. Clearing it, changing browser origin or uninstalling with data removal can remove local evidence. Snapshots are not a substitute for backups; Undo does not persist after restart. Different views of one open managed note share live content/Undo, not independent forks.

## Linked-file recovery

[Linked sources](linked-sources.md#changes-conflicts-and-recovery) keeps explicit Save separate from private drafts. Export important versions before removing recovery evidence. Missing original paths are not permission to overwrite replacement files. Never delete journal locks or bypass source authorization to force a Save.

## When an operation fails

Read the local error and Activity details. Keep request references for diagnostics. Retry through the offered operation; do not assume network failure means nothing committed. For access/source changes, reauthorize or reconnect deliberately. [Troubleshooting](troubleshooting.md).
