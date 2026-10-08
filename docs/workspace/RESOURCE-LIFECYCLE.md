# Resource actions, Trash and recovery

Reviewed 2026-10-08 for Vaultor 0.6.0, lifecycle/discovery Sprints 2–3. This owns lifecycle semantics; [Library](LIBRARY.md), [sessions](SESSIONS.md), [API](../development/API.md) and [release delivery](../desktop/RELEASE-PROCESS.md) own their respective contracts.

## Actions and distinctions

Resource rows, sidebar shortcuts, note headers and file previews share an Actions menu: Open/Preview, Rename, Add to collection, Manage tags, Pin/Unpin, applicable Export note/Download original, and Move to Trash. Ctrl+K targets the highlighted/captured resource and hands Trash confirmation to the same coordinator. Unknown resource kinds cannot be opened, renamed, exported or downloaded through guessed file behavior; organization, pins and Trash remain available. Collection shortcuts are organizational destinations, not resources.

- Move to Trash makes an original unavailable throughout the workspace. Its ID, original bytes, structured document, tags, surviving memberships and pin state remain.
- Remove from collection changes only that membership. Delete collection removes the organization and all its membership links, including links to trashed resources; originals survive.
- Remove from note removes an image placement, not its File resource or other placements. Unpin changes only the shortcut.
- Delete permanently exists only inside Trash. It removes the original, never rewrites referring documents. Their link labels/image placements remain identifiable broken references.

Trash has one bounded, metadata-only title-search list, 100 rows per UI page, checkbox selection, Restore and confirmed Delete permanently. Normal Library, Recent, pins, resource pickers, title/content search and membership counts exclude Trash. Tags and empty collections themselves remain discoverable. Nothing is automatically purged.

## Confirmation, drafts and shared views

Confirmation names each original and checks how many distinct **active saved notes** refer to it through links/image placements. Repeated placements count once. This count excludes unsaved references, references from trashed notes and table provenance; the on-demand [References view](REFERENCES.md) provides paginated sources and bounded occurrences. If usage cannot be checked, Retry is required before proceeding.

A local Trash action first flushes only its target note's document/title. A failed save keeps the input and recovery record; **Keep recoverable drafts and trash saved versions** explicitly waits for local recovery storage before continuing. Storage failure blocks this choice. Unrelated failed saves do not participate. Bulk actions retain failed targets and remove successful targets from selection/confirmation.

An unavailable open note remains mounted read-only, with its journey visit retained and an Open Trash/Recovery copies explanation. A foreign Trash/deletion captures its displayed content in recovery before stopping saves. Shared views pause together; no save or import retry recreates the original. File previews dismiss and restore their source focus. Restore makes journey visits available again; clean views reload the saved original. Retained/conflicting recovery copies still require an explicit recovery choice before editing that view. Restoring does not silently overwrite a draft or merge undo histories. A restored original elsewhere can always be opened directly while the recovery copy remains separate.

Menus use the shared Escape system. Rename is a semantic form with IME protection and initial input focus; closing it restores the Actions trigger. Pending operations cannot be submitted twice or dismissed midway; failures remain local.

## Conditional identities and permanent cleanup

Each per-item operation carries a fresh UUID, resource ID, action and current opaque revision. Identical retries replay the saved result; different input under an existing UUID conflicts. A stale revision does not mutate the resource. Review fresh metadata by closing/reopening a conflicting action; it never silently rebases a destructive request. A partial batch is not an atomic whole-workspace action.

Purge first commits an irreversible `cleanup-pending` intent. Only then does it delete binary bytes and finalize metadata/outgoing relationships. Failure retains a tombstone and durable original operation, shown as **Retry permanent deletion**. Restore is refused after intent starts because bytes may already be gone. Restart does not auto-delete; retry retrieves the original identity/revision and continues. Completed purge identities prevent late import UUID retries from resurrecting the original; they remain local operational records without automatic expiry.

Workspace transfer/replacement takes an exclusive workspace gate; lifecycle requests retain ordinary mutation admission during cleanup. A transfer cannot race this operation, and complete archive export refuses unfinished purge cleanup. Other devices can race ordinary saves/actions, so revisions and unavailable-state checks remain mandatory. An already prepared immutable note export can still contain an earlier snapshot after Trash; deletion cannot revoke bytes already downloaded or copied. There is no multi-process SQLite writer coordination.

## Persistence, portability and rollback

Nullable `trashed_at`, `purge_pending` and `trash_organization` resource columns and `resource_lifecycle_requests` are additive. Legacy rows with null lifecycle fields remain active. Changes increment existing optimistic revisions. Memberships remain real joins; trash snapshots organization labels solely to explain deletions before restore. Deleted collections/tags are not recreated. Rename/delete-and-recreate organization names cannot be treated as restored membership IDs.

Complete workspace ZIP **format 3** preserves trashed timestamps, structured documents, original binaries, organization/favorites and restoration labels. Merge remaps resource IDs; replacement preserves archived IDs and changes workspace generation. Formats 1 and 2 remain readable; absent lifecycle fields mean active. Operational retry identities, purge tombstones, credentials, device preferences and recovery drafts are not portable. Replacement clears former lifecycle identities inside the same rollback boundary. Complete ZIP export refuses cleanup-pending resources; finish cleanup first. Individual note/linked-graph exports exclude trashed destinations and keep unavailable-reference warnings.

Clients and hosts require API protocol/minimum client **3**. Update hosts before remote clients; 0.4.x clients are refused by the current compatibility gate before editors mount. The old hard-delete and replace-links-and-delete routes return 405 without changing originals or referring notes. Local legacy note writes still follow their existing contract; active-state checks prevent edits to Trash.

Do not run an older server against an upgraded database: it does not understand Trash and may expose it as active. Rollback means stop the host and restore the updater's pre-update workspace backup with the matching older app, following [UPDATES.md](../desktop/UPDATES.md). It loses changes made after that backup; it is not a reverse database migration.

## Checks and limits

Focused disposable tests cover additive old-table migration, stale revisions, retry replay, partial failures, organization/bytes/reference retention, rollback, cleanup failure and archive merge/replace. Native/restart results and artifact availability are recorded in [0.5.0 release notes](../desktop/releases/v0.5.0.md). No personal data, broad API smoke or Docker rebuild is required. Actual Mac/LAN verification is separate. Image categories and paged reference views are implemented in 0.6.0; [REFERENCES.md](REFERENCES.md) owns their limits. File-body search and measured Atlas integration remain Sprints 4–5.
