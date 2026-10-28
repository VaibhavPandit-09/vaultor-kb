# Historical0.24.0 menu, import-history and desktop-chrome audit

Reviewed 2026-10-29 against master 7bbbc3a and shipped Windows 0.24.0. This records the historical0.24.0 findings. The user subsequently authorized implementation;0.24.1 applies the audited menu/chrome/history/copy refinements. Current topic guides and the [0.24.1 ledger](../desktop/releases/v0.24.1.md) own implemented behavior and actual release status. The proposals below describe the audit-time baseline; they are not a second current behavior contract. The existing [UI philosophy](UI_PHILOSOPHY.md), [imports](../workspace/IMPORTS.md), [Activity](../workspace/ACTIVITY.md), [lifecycle](../workspace/RESOURCE-LIFECYCLE.md) and transfer contracts remain authoritative for current behavior.

## Evidence and scope

The user's four screenshots establish a covered window-menu trigger and the ambiguous repeat-import review. Source review covers desktop chrome/native menus, ordinary and inline import entry points, destination selection, Activity, workspace transfer/selection export, collection management/deletion, Trash/lifecycle, connections/sharing, updates, Settings, search commands and recovery. Only the submitted screens have fresh visual evidence in this audit; other findings are from current source, not newly exercised native menus. No personal workspace, local import journal or connection store was inspected or changed. The exact object the user deleted is not established by the screenshot: a nested collection and a saved connection have different semantics.

P1 means a blocked/misleading primary action or safety-relevant ambiguity. P2 means repeated comprehension/navigation friction. These are UX priorities, not claims of proven data corruption.

## 1. Window menu and Activity overlap — P1

[DesktopChrome.tsx](../../frontend/src/components/DesktopChrome.tsx) renders a drag grip and four buttons: menu, minimize, maximize/restore, close. In [index.css](../../frontend/src/index.css), the grip is20px and each button36px: nominal control width164px. Activity ends124px from the right. The occupied horizontal ranges therefore overlap by40px at the shared top edge. Activity has z-index3200 while window controls have3100, so it paints over and intercepts part of the menu/grip region. The remaining dot in the screenshot is consistent with the partially covered ellipsis.

This is a release regression, not a screen-width preference. Changing z-index would merely switch which control gets covered. The248px content reserve protects some document actions but does not position Activity relative to the window controls. The native qualification helper checks browse title/action bounds; it has no assertion that Activity and the complete window-control group have disjoint hit boxes. Earlier screenshots/width checks did not qualify that relationship.

Proposed interaction: keep the existing single top-edge chrome, but give its occupied width one owner. Reserve the full controls plus a gap, put Activity immediately to their left, and derive editor/action clearance from that whole group. Use a shared layout/token or the group's measured width rather than another unrelated offset. Keep all click targets outside drag regions. At narrow widths Activity can compress to its labeled icon/badge before document actions lose space; it must remain accessible in dialogs. No second titlebar or duplicate compact header is needed.

Qualification should compare real bounding rectangles and hit-test every button at600/680/900/1440px, supported display scales, idle/count/99+ Activity, maximized/restored windows, dialogs, long titles and reduced motion. Test menu opening and focus restoration, not only visible icon centers.440px remains stress evidence rather than a shipped minimum.

## 2. Why a deleted import still triggers the message — P1

[folderImports.ts](../../frontend/src/lib/folderImports.ts) reads retained journals from profile-scoped IndexedDB and filters by workspace ID/generation. It calculates two different facts:

- “Completed match”: an old journal has exactly the selected byte/path signature and is marked complete.
- “Related”: any old row path or directory path intersects the current selection. Even a shared root name such as docs can qualify. This is weaker than proving the same physical folder or the continued presence of any imported item.

Neither decision checks current collection existence, imported note/file existence, Trash state or permanent deletion. Collection/resource deletion does not remove those journals. A complete historical import is therefore treated as a current duplicate candidate even when its targets are gone. A path-only match is shown as “Review previous import” despite proving only overlapping names in history. In the screenshot, the absence of Skip unchanged is consistent with this weaker path-match branch; it does not prove that all139 files were imported before. The increase from an earlier137-file screenshot to139 does not by itself prove exactly two additions or a complete per-file diff.

Deleting a collection may deliberately keep its notes/files in Library, or move eligible items to Trash through the separate deletion choice. Removing a saved connection also does not delete the remote workspace: [profiles.mjs](../../desktop/src/profiles.mjs) retires its identity, and pairing the same remote host/certificate can restore that profile ID. [sessionStore.ts](../../frontend/src/lib/sessionStore.ts) isolates journals by profile; the inspected code does not establish cross-profile leakage. Forgetting a connection is intentionally not a command to erase drafts/import receipts.

Retaining recovery/idempotency history is necessary. The defect is using history as if it were a current inventory. Do not fix it by clearing all IndexedDB, deleting unfinished receipts, or making deleted items silently reappear.

Proposed review states, using bounded metadata checks against the original UUIDs:

| Current evidence | What review should say/do |
| --- | --- |
| No earlier source match | Normal Import folder review. |
| Exact completed source; matching targets still active | “Already imported”; Show existing items, Skip, or explicit Import another copy. Preserve Vaultor edits. |
| Collection removed; imported items still in Library | Say the collection was removed but the items remain. Explain that importing again creates copies. Rebuilding organization alone is a separate feature, not currently promised. |
| Targets in Trash | Say they are in Trash; offer navigation to review/restore them, or explicit new copies. Never restore implicitly. |
| All relevant earlier targets permanently gone | Normal explicit Import again with new identities. Do not recommend a historical Skip as though content still exists. |
| Mixed active/trashed/deleted targets | Show separate counts and deliberate copy/skip consequences; no automatic overwrite or resurrection. |
| Only path/name overlap; no byte identity | “Some filenames match import history.” Do not call it a verified previous source. |
| Host unavailable or metadata incomplete | Say existence could not be checked. Preserve the journal and offer retry; do not assert either absence or duplication. |
| Unfinished import | Resume only with the matching source and original generation/receipts; show already-finished versus remaining work. |

These are proposed policy refinements. Current0.24 deliberately preserves deleted/trashed targets on Skip; changing the recommendation needs focused safety qualification. Live checks should use bounded summaries/status metadata, not every document body or polling all history. Old receipts must not be transferred across profiles/generations.

## 3. Import review: prose is compensating for a weak decision — P1

[FileImportModal.tsx](../../frontend/src/components/modals/FileImportModal.tsx) is the main source. It exposes internal resource IDs, byte verification, relative paths, fingerprints and host receipts in ordinary product copy. The screen also combines source contents, conversion, folder structure, prior-import history and link repair before stating the action the user is approving.

The path-match branch renders one unselected radio (“Create independent copy — new resource IDs”). Import stays disabled until it is selected, yet the disabled primary button still says “Import in background”. A radio normally asks the user to choose between alternatives; here it is an unexplained acknowledgement gate. That is why shortening the paragraph alone will not fix the screen.

Use one consequence-specific primary action. Where a duplicate risk is actually supported, “Import another copy” is itself an explicit choice; where multiple real options exist, show those options. Reserve checkboxes/confirmations for the consequence being approved. Do not imply an unavailable update/merge mode.

| Current text | Proposed user-facing wording | Meaning to preserve |
| --- | --- | --- |
|139 files · 19 folders · 121 notes · 18 original files |139 files in19 folders;121 as notes · 18 kept as files | The latter counts are a breakdown, not another139 items. |
|661 internal references can resolve |661 links can connect to imported items | Preview is a prediction until finalization. |
|58 references need review |58 link issues · Review | Keep separate from failed file imports; do not imply58 failed files. |
|Review previous import |Already imported / Similar filenames found | Select the heading from actual evidence. |
|Create independent copy — new resource IDs |Import another copy | Existing notes remain unchanged; duplicate content is explicit. |
|identical verified bytes and relative paths |These files match your earlier import | Use only with real byte/path proof, then explain current target state. |
|Destination: Collection root |Import into: Library (no parent collection) | The optional docs collection can still be created underneath. |
|Conflicting collection names will receive a separate import copy |If a collection name is taken, a new collection gets a numbered name | Does not imply collections and notes share one collision policy. |
|Reuse matching collection paths |Use existing collections with matching names | Add a short explanation that notes/files are still new copies, and matching occurs under the same parents. |
|Options and individual files |File options | Keep batch conversion and per-file overrides available. |
|Folder preview |Folder structure | Preview the resulting organization. |
|Original / Note |Keep as file / Convert to note | “Original” currently hides where the copy is stored. |
|Resume in Activity |Resume import | Activity is the destination for progress, not the operation. |
|older journal / metadata fingerprints / host receipt / same IDs |Reselect the original files to resume safely | Keep technical proof and refusal details under troubleshooting. |

A suitable default hierarchy is: folder name; total plus conversion breakdown; a short, state-specific duplicate decision only when relevant; destination/create-folder choice; optional File options, Folder structure and Links. One short “Progress appears in Activity” helper is sufficient; background execution need not be repeated in every button.

For the submitted path-only state, suggested copy is “Some filenames match your import history. Importing again creates new copies; it does not update existing notes.” That wording must change if live checking proves the earlier targets are gone. The preview cannot claim “2 new files” without a qualified per-file comparison.

## 4. Related menus and dialogs

| Surface / priority | Current problem and concrete change |
| --- | --- |
|Native window menu — P2 |The screenshot shows “Connections hosting”. main.mjs uses an unescaped ampersand; native Windows menu labels treat it as a mnemonic. Use “Connections and sharing” (or escape a literal ampersand). “Window menu · Connections & hosting” also mixes one menu's name with one destination. Call the trigger “App menu” if it owns app commands. Standard Edit/Window roles are familiar; they do not all need rewriting. File currently contains close/quit, while importing/exporting is elsewhere, so its information architecture needs review. |
|Activity — P1/P2 |[Activity.tsx](../../frontend/src/components/Activity.tsx) displays raw state names and an8-character workspace UUID, then another phase line. Use friendly workspace/server names and one translated status; put IDs in Details. “Save output” → “Save ZIP”; “Review transfer” → “Review import”. “Pause monitoring” must not imply pausing server work: use “Pause updates” with “The task continues on the server.” The generic Retry label must distinguish retrying a status check, resuming writes and reselecting sources. |
|Activity completion — P2 |Dismiss completed removes all completed tasks, including warnings. Separate harmless cleared completions from unreviewed issues; do not make “complete” mean “nothing needs review”. Failed files, link issues and unsupported previews deserve separate counts. Keep receipt/checksum proof available without placing it in the main status. |
|Workspace ZIP import — P1 |[TransferModal.tsx](../../frontend/src/components/modals/TransferModal.tsx) says “Modify current workspace”, “Merge”, “Apply import” and “host owner connection”. Prefer “Add to this workspace” versus “Replace this workspace”, with a consequence-specific final button. The replacement confirmation must retain the exact loss boundary and explicit approval. Add does not mean updating matching notes; it creates imported copies. |
|New-workspace/local copy — P2 |[WorkspaceTransfers.tsx](../../frontend/src/components/WorkspaceTransfers.tsx) mixes “portable snapshot”, “new workspace”, “separate workspace”, “transfer” and “local copy”. Lead with “Import ZIP into a new workspace” or “Copy to this computer”. “Retry same transfer” → “Retry” with “Continues the existing import” when needed. Keep the separate approval after validation; do not hide a commit behind opening a review. |
|Selected export — P2 |[ExportSelectionDialog.tsx](../../frontend/src/components/ExportSelectionDialog.tsx) uses “Prepare partial ZIP in Activity” and “portable partial ZIP”. Prefer “Export selected items” / “Create ZIP”; explain the selected count and omitted linked files in expandable contents. State package-replacement incompatibility when importing it, with details still available at export. |
|Collection More menu — P2 |[LibraryView.tsx](../../frontend/src/components/LibraryView.tsx) has “Rename / move / delete”, a list of actions that actually opens a management surface. Use “Manage collection”, or provide distinct commands. “Collections & tags” alongside it lacks an obvious current-versus-all scope; use “Manage all collections and tags” where that is the destination. |
|Collection deletion — P1 |[CollectionDeletionDialog.tsx](../../frontend/src/components/CollectionDeletionDialog.tsx) exposes “hierarchy”, “unique managed”, “exclusive resources”, “reviewed revisions” and “operation identity”. Prefer “Delete this collection and its subcollections”; the two options should distinguish keeping all items from trashing only items found nowhere else. Keep shared-item, linked-file and irreversible collection-deletion warnings. Success should say what happened to both collections and items. |
|Trash / permanent deletion — P1/P2 |[EmptyTrashDialog.tsx](../../frontend/src/components/EmptyTrashDialog.tsx) gives three paragraphs explaining snapshots/revisions/retries. Lead with exact count and irreversibility; retain a short “Includes all pages and search-hidden items. Files linked from your computer stay untouched.” Show referring-note counts only when useful; zero does not need a permanent paragraph. Move snapshot mechanics to Details while keeping later arrivals and changed/restored targets protected. ResourceLifecycleDialog's “Restore the same resource IDs and surviving organization” should become “Restore items with their remaining tags and collections.” |
|Connections / sharing — P2 |[DesktopRoot.tsx](../../frontend/src/components/DesktopRoot.tsx) and [DesktopNetwork.tsx](../../frontend/src/components/DesktopNetwork.tsx) alternate server, host, connection, computer and workspace. Use “This computer” / named computers for selection, “Sharing” for access, “Start local server” in advanced controls. Forget connection must explain that remote files, drafts and history are not deleted. Keep certificate verification, code comparison and approval explicit; technical connection-help disclosure is appropriate. |
|Settings — P2 |[SettingsModal.tsx](../../frontend/src/components/modals/SettingsModal.tsx) is generally better structured. Specific problems: OS → “System”; “workspace chrome” → “navigation and toolbars”; “Fill, then replace” should explain opening in available panes and then reusing the selected pane. UI transparency displays an opacity value, so100% means solid; label the numeric behavior honestly. “0 for instant saves” should mean “Start saving immediately”, not a promise of instant durable completion. Scope labels for this device versus all devices are useful and should stay. |
|Updates — lower priority |[DesktopUpdates.tsx](../../frontend/src/components/DesktopUpdates.tsx) already has clear Update and restart and an Advanced disclosure. Keep that hierarchy. “Custom HTTPS manifest URL” → “Custom update source” with a technical-format helper; do not conceal the trusted-source/signature boundary. Platform-specific manual replacement language should appear only where needed. |
|Search / note actions — P2 |[CommandPaletteModal.tsx](../../frontend/src/components/modals/CommandPaletteModal.tsx) says “Used in / links” while elsewhere it is References/View usage. Pick “Links and mentions” with incoming/outgoing groups if supported, or distinct “Linked from”/“Links to”. Resource titles in action rows are useful context. Do not shorten icon accessible names to unexplained “More” everywhere. |
|Recovery — P1 |[LinkedRecovery.tsx](../../frontend/src/components/LinkedRecovery.tsx) shows “Validated Vaultor source”, “Original base” and “Visual draft”. Prefer “Vaultor version”, “Starting version” and “Editor draft (JSON)” with precise provenance. [RecoveryPanel.tsx](../../frontend/src/components/RecoveryPanel.tsx)'s “Use saved version” needs the effect on the retained draft made explicit before any destructive resolution. Do not replace source-preserving recovery decisions with a generic “Fix” button. |
|Collected ZIP approvals — P2 |[CollectedZipApprovals.tsx](../../frontend/src/components/CollectedZipApprovals.tsx) surfaces raw enum states and “Reconcile authorized creation”. Translate to task states and “Check workspace creation”. Keep device/source/checksum IDs under Details; approve the exact staged package, not an ambiguous future upload. |

## 5. Shared language and interaction rules proposed

Use the operation's object and consequence: Import folder, Import another copy, Resume import, Create ZIP, Save ZIP, Replace workspace, Empty Trash. Background/Activity/UUID/receipt are implementation or status context, not a suffix for every action.

Use note/file where known, item for a mixed set, and collection/workspace for their actual distinct containers. A collection is not an external folder, a workspace is not a connection, and a copied file is not the linked external original. Reuse/replace must never imply updating existing content where the implementation creates new identities.

Put the next decision first, one short consequence second, and exceptional technical evidence under Details. Keep counts whose unit is clear. Show checking, running, approval, paused, source-required, complete-with-issues and failed as different states. Disabled actions need a nearby reason. Use ellipsis for an action that opens another decision/picker; keep tooltips and accessible names descriptive when visible labels compact.

Transform existing controls and disclosures in place; do not solve prose volume with more cards, permanent banners or another scroll pane. Reviews keep one primary scroll area, compact disclosure summaries and stable footer actions. Opening file/link details expands from its own summary; closing restores its trigger focus. Existing reduced-motion endpoints remain sufficient. Correctness and approval cannot depend on an animation completing.

Security and data-loss information must be plain, not removed. Keep exact deletion/replacement counts, external-file ownership, pairing/certificate comparisons, unsaved-draft choices and source/generation refusal. Do not promise changed-file in-place updates, organization-only reconstruction, arbitrary post-exit continuation or source-identity certainty that the product does not support.

## 6. Proposed implementation order and validation

1. Fix shared desktop chrome ownership and hit-box regression first. This is a narrow layout change; it should not wait for a product-wide copy rewrite.
2. Separate historical source recognition from live imported-target state, with tests for collection-only deletion, Trash, purge, mixed states, same-name unrelated folders, edited notes, source changes, forgotten/re-paired connections, workspace/generation changes and unavailable hosts. Use disposable data; do not query or mutate the user's actual journal to qualify this.
3. Refine import review states/actions and Activity vocabulary together. Preserve journals, receipts, UUID maps, draft protection, duplicate refusal and explicit copy choices.
4. Apply the same outcome-based language to transfer, collection deletion and recovery; review their safety consequences individually. Then address low-risk naming in Settings/search/connections and native menus.
5. Focused component/typing checks plus native inspection of the changed menu states and realistic counts. A shipped change requires the standing desktop release process, a new version and original-key verified artifacts. This audit itself changes documentation only and requires no installer.

No runtime checks, app fixes or new release were performed for this audit. Prior0.24 acceptance remains historical evidence and does not certify the newly identified chrome/history UX defects. The current geometry and journal branches are source-confirmed; the precise item/connection deletion performed by the user remains unverified.

Native menu ampersand behavior was checked against the [official Electron Menu documentation](https://www.electronjs.org/docs/latest/api/menu/). All other findings cite local source and submitted screenshots.
