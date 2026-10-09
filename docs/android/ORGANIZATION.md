# Android organization and resource lifecycle

A7 adds one contextual Actions sheet to browsing rows, note More and file previews. Long-press a resource to start selection; collection rows never enter resource selection. Selection clears when the query, page, type, mode, destination, collection or workspace changes. Successful lifecycle items leave the selection; unsuccessful items remain available for retry. No permanent bulk toolbar is shown.

## Collections, metadata and membership

Collections offers New collection. Collection Actions offers Add resource, rename, pin and an explicitly confirmed collection deletion. Deleting a collection removes memberships, not originals. Resource Actions offers conditional title rename, pin/unpin, collections, tags, References and Trash. File formats remain File resources; unsupported kinds receive neutral presentation and explicit unavailable-action feedback.

Add resource searches bounded title-only metadata pages of 100. Add commits immediately and keeps the picker open; Added and local failure feedback identify the affected row. Existing members cannot be added twice. Create note “title” and explicit Create new note use A6's durable UUID import identity and atomic collection destination. A pending creation locks its original title/destination until it completes. New collection similarly journals its UUID and original payload before dispatch. Failure retains input. Name IME submission and the primary button share duplicate-gated validation. Collection names are 1–100 characters, resource titles 1–500, tags 1–100.

Tag names travel as JSON through POST /tags; membership uses tag IDs through POST /organization/memberships. This preserves the host's canonical-path protection, which rejects percent-encoded API path segments. Removing a membership or tag does not delete its original. Mutations capture host connection epoch and workspace identity/generation. Changing workspace invalidates the sheet's requests rather than redirecting them.

## References

Incoming Used in and outgoing Links to use GET /resources/{id}/references with pages of 30 metadata entries. Counts represent saved content only, not unknown drafts. File previews remain temporary. Occurrence navigation loads the source note and verifies its revision, lack of a pending local draft, slash-index path and target identity before applying a ProseMirror node selection. It does not rewrite content or change undo history. Changed/unknown paths open the source with an explanation instead of guessing a location. Missing or trashed targets stay identifiable.

## Trash, Restore and permanent deletion

Trash is a title-only destination using bounded server pages of 100; content/type/collection filters are cleared rather than silently ignored. Trash review flushes the affected current note first. If saving fails, Keep protected drafts explicitly permits reviewing saved versions; journal failure still blocks the operation. A modal suspends autosave/editing while review is active. Saved usage is loaded before confirmation and explicitly excludes unsaved drafts.

Each lifecycle item has its own durable operation UUID, original revision and action. PUT /resources/lifecycle results are checked individually. An uncertain HTTP response retries the exact same operation after reopening, not a fresh deletion. Terminal success acknowledges only the matching local journal ID. Failed and cleanup-pending items retain feedback and their request. Review latest revisions is available only when all unfinished items definitively failed; uncertain requests and committed purge intents cannot be discarded. Trash re-reviews only unfinished items. For definitively failed Restore/purge items, Refresh Trash and review again releases those failed identities and closes the sheet to fetch current rows for a fresh confirmation. An uncertain request continues with its original identity. Cleanup Retry follows the host's committed intent if another device superseded a locally failed purge request; a same-UUID revision mismatch is refused.

Permanent deletion requires a separate irreversible confirmation. Cleanup-pending uses the server's durable original request and an explicit Retry; there is no automatic purge or cleanup loop. Restore retains resource identity, collection membership and referring links. Placement removal in image tools only removes that placement; it never deletes the original. Foreign Trash retains a protected local note and unavailable journey visits. Restore reconciles to an explicit conflict/recovery choice; choosing saved preserves the former draft independently and marks the visit available.

Organization operation records use the existing encrypted native journal, scoped by host/workspace/generation, with at most 32 scopes and 100 pending operations per scope. Limits fail visibly rather than evicting uncertain operations. They are device-local and absent from archives. Collection creation and note creation are separate journals. No database/schema/protocol or desktop release change is required.

## Validation and limits

Actual A7 release checks and platform limitations are recorded in [release notes](releases/0.1.0-alpha.7.md) and [ANDROID.md](ANDROID.md). Windows emulators are the agent test boundary. Samsung Keyboard, TalkBack, S24 Ultra/One UI8.5–9, actual Mac/Wi-Fi races and OEM lifecycle remain user-owned gates. A8 settings/discovery/updater and A9 integration are separate sprints.
