# R5 integration handoff — ai/codex-current

Reviewed 2026-10-15. R5 is complete. **R6 has not started.** This handoff prepares a later, separately authorized integration; it does not integrate either branch. [REVIEWS](../workspace/REVIEWS.md) remains authoritative for the review domain. [The tracker](workspace-companion-plan.md) remains authoritative for sprint scope.

## Source boundary

- Common base with fetched `origin/master`: `11b09aae1a206f3441d5c5a1ce502f14c833664c`.
- Master inspected read-only: `cf953fe7b23d8e04f3120e0a212b686fff3cd40e` (desktop version 0.13.0).
- R5 implementation/release source: `4e2f71394547bf87422ac751793f56013bd7d043`, immutable tag `v0.12.0`.
- Publication documentation tip before this handoff: `0bcb1b1836149e50aea2c4bee1edf400254664c6`.
- Final handoff commit SHA is reported in the accompanying completion message; this document cannot contain its own commit hash. Verify with `git rev-parse origin/ai/codex-current` after fetching.

R5 commits after the common base, oldest first: `a2166f9` (scope), `c01e7b6` (domain/API/portability), `1b987fe` (generation/export isolation), `d7df3aa` (inbox/entry points/counts), `4e2f713` (long titles/native gates), `0bcb1b1` (publication). This final preparation adds documentation only. No master/UI implementation was incorporated. The earlier shared documentation-only base update was explicitly requested by the user.

## Delivered functionality

Workspace review inbox plus resource-scoped entry/counts on note headers and file previews; open/resolved/dismissed triage; original evidence disclosure; bounded status-filtered paging and counts; local pending/error/conflict feedback; retained rows during same-query refresh failure; safe navigation and centralized Escape/focus restoration. Original content, save state, undo and revisions are independent of reviews. Changed/deleted/trashed targets retain evidence and provenance; original edits do not automatically resolve concerns.

R5 is host/desktop/browser triage. It does **not** add Android capture, offline review synchronization, queued imports or a desktop capture form. Android alpha.11/versionCode15 is unchanged. No resource type, Tiptap node or global styling/motion system was added.

## Backend, domain and API

New `ReviewService` and `ReviewController` under `backend/src/main/java/com/vaultor/vaultor/`. Reviews use the isolated workspace JDBC transaction context. `WorkspaceRequestFilter` admits `/reviews` to workspace routing and maintenance guards, retaining owner/paired TLS, CSRF and workspace-grant enforcement.

| Route | Contract |
| --- | --- |
| `PUT /api/reviews/{UUID}` | Immutable generation/resource/comment/quote/context/locator/baseRevision intent. Identical retries reconcile current receipt, including after target deletion; different body returns `409 REVIEW_ID_REUSED`. Author derives from authenticated principal. |
| `GET /api/reviews/{UUID}` | Reconcile current receipt/status within current generation. |
| `GET /api/reviews` | Optional resource UUID; status open/resolved/dismissed/all; default size50, maximum100. Counts cover target scope before status filtering. Created descending, UUID tie-break. |
| `PATCH /api/reviews/{UUID}/status` | Current generation plus quoted **review revision** `If-Match`. Missing validator428; stale validator412 `REVIEW_CONFLICT`: refresh and choose again. Never reuse a note revision here. |

Generation mismatch returns409; source replacement must never redirect pending intent. Limits: 10,000 retained rows including quarantined generations; comment1–5000, quote/context up to4000 each; block locator up to64 indices/300characters; page1–100000. Page evidence is context, not PDF rectangle anchoring. Verified note attachment requires matching saved revision and matching quote/context; changed/imported evidence never pretends to be a current live selection.

Capabilities add `reviews:1` and `workspaceArchiveVersion:4` in DiagnosticsController and frontend capability typing. API/minimum client protocol **3 is unchanged**. OpenAPI adds review routes/schemas and optional preview review count. `reviews` change-feed events carry review/resource IDs after commit, never comments/documents. Do not add duplicate filter-owned notifications.

## Database/schema

Additive per-workspace `review_items` table, initialized idempotently by ReviewService:

```text
id TEXT PRIMARY KEY
resource_id, fingerprint, evidence, status, revision,
created_at, updated_at, generation: TEXT NOT NULL
review_target_scope(generation, resource_id, status, created_at, id)
review_status_scope(generation, status, created_at, id)
```

There is deliberately no resource FK/cascade: purge retains evidence. All lookup/count/export queries filter current generation. Former-generation UUIDs cannot be reassigned. Unpublished candidate tables lacking generation gain an `unscoped` value; bytes are retained/quarantined rather than attributed by guesswork. Those rows still count toward admission limits. Deliberate full replacement clears/restores reviews atomically with originals and new generation; recovery backups preserve old data. No Resource-column, document-schema or search-index migration.

## Archive, export and import

- Full ZIP writer is **archive4**, reader accepts1–4. Archive4 requires `workspace.json.reviews`; future versions and older-version archives containing nonempty reviews fail instead of silently stripping evidence.
- Portable reviews retain IDs/target title/type/comment/quote/context/locator/author/timestamps/status. Exclude private revisions, source host/workspace/generation, device credentials and authorization data.
- Merge remaps review IDs and resource IDs; missing targets get independent missing identities, avoiding accidental attachment to unrelated resources.
- Replacement restores archived review IDs in the new generation and clears former reviews atomically. Import-as-new/fork retains IDs in its independent namespace, with fresh workspace identity/generation/private validators. Imported evidence is changed/unverified.
- `TransferService.Workspace` adds reviews and retains prior constructor overloads. Import Preview adds review count; frontend count is optional for older hosts. Both transfer surfaces display it and replacement explicitly names reviews.
- Scoped note ZIPs include `reviews.json` only for rendered note bodies and captured files. Merely encountering an excluded linked note must not export its review quotes. Standalone MD/PDF/Word presentation is unchanged. These packages are not full-workspace import archives.
- Existing checksum/JSON/expanded-byte limits remain. Older hosts reject archive4. Android transfer/export UI remains later work.

Implementation files: `TransferService.java`, `ZipWorkspaceExporter.java`, `NoteExportGraph.java`, `NoteRenderer.java`. NoteExportGraph gains ReviewService constructor dependency; preserve corresponding test mock.

## Frontend capability/state contracts

New `frontend/src/lib/reviews.ts` and `components/ReviewInbox.tsx` isolate capability from presentation. `reviewIntent` captures UUID/body/connection epoch for uncertain retries; full evidence input is supported by API, while this frontend helper currently creates resource-level comments only. Status writes use generation and quoted review validator. Query keys include epoch, target, status, page and bounded size. Shared API transport owns source checks; no new credential storage.

`vaultor:reviews-changed` invalidates inbox/counts on same-client writes and approved SSE review/reset/broad events. It must not dirty/reconcile note documents. Dashboard state uses **undefined=closed, null=workspace inbox, target=resource inbox**; source-generation changes close it. A connection epoch keys the modal. ReviewButton hides on hosts without `reviews:1`; global inbox explains unsupported capability.

Preserve retained-query cancellation/stale-response behavior, escaped evidence, unavailable-target refusal, explicit conflict refresh, and local error feedback. Navigation must await existing save/load/pane-capacity success before dismissing. Failure leaves inbox/source intact. Successful navigation preserves destination focus; ordinary close restores trigger immediately. File-review dismissal retains its preview. Keep mounted editors and centralized Escape ownership; presentation may move freely if these semantics survive. No second result scroll container is required.

## Conflict inventory against inspected master

These are **all eight files changed on both sides** since the common base (overlap is not proof of a textual conflict):

| File | Integration requirement |
| --- | --- |
| `frontend/src/pages/Dashboard.tsx` | Preserve redesigned geometry while restoring inbox state, sidebar entry, note count/button, epoch/generation reset, SSE invalidation, guarded navigation and preview callback. R5 adds12 net lines; do not replace the redesigned file wholesale. |
| `frontend/src/components/PreviewLayer.tsx` | Preserve redesigned preview geometry and resource-owned temporary behavior; carry optional `onReview` and resource ReviewButton into the new header. |
| `desktop/package.json` | Ours0.12.0, master0.13.0. Never downgrade. A later integrated release needs a fresh version greater than both published versions. |
| `desktop/package-lock.json` | Reconcile with chosen package version; keep pair synchronized. |
| `docs/CODEBASE.md` | Combine current redesigned architecture with R5 review/archive4 contracts and actual validation history. |
| `docs/README.md` | Retain both streams' authoritative links, including this handoff. |
| `docs/desktop/INSTALLATION-AND-UPDATES.md` | Combine actual per-platform availability; no unsupported Mac0.12 claim or version regression. |
| `docs/desktop/MAC-HANDOFF.md` | Preserve immutable-tag gates; master Mac0.13 availability does not prove its host includes R5. |

Other semantically coupled files, even without current path overlap: ReviewInbox/AppModal/BrowsePagination/focus helpers; changeFeed and connection capabilities; WorkspaceTransfers/TransferModal review count; server transfer/export/routing/OpenAPI; electron-builder diagnostic inclusion and native smoke selectors. Recheck overlap if master advances. No renames/deletions were made by R5.

## Tests protecting R5

Previously passed R5 gates (not rerun for this documentation-only preparation):

- `backend/src/test/java/com/vaultor/vaultor/ReviewTest.java`: **13 cases** covering uncertain immutable retries/trusted provenance, conditional status/unchanged originals, purge retention/bounds, locator/generation validation, file context, portable remapping, archive4/scoped exports, approval/child isolation, real pinned HTTPS grants/revocation, replacement, independent import, review-unaware generation changes and unscoped migration.
- `DesktopContractTest`: **4** compatibility cases; `NoteExportGraphTests`: **1** constructor/graph regression case.
- `frontend/src/lib/reviews.test.tsx`: **6 cases** for intent/epoch retry, conditional status, bounded queries, escaping/changed evidence/conflict retention, stale response/unavailable targets, contained focus/central Escape restoration. Existing changeFeed4 and WorkspaceTransfers3 bring focused frontend total to **13**.
- TypeScript/backend compilation and scoped ESLint passed. Release ledger records actual results, not a new certification of master.
- `desktop/scripts/native-review-check.mjs`, dispatched by `VAULTOR_REVIEW_CHECK=1` in existing smoke harness: disposable packaged/browser54 mixed reviews, paging/counts, triage without original changes, note/file entry, preview retention, Escape, long titles, Light/Dark/narrow geometry. Adapt selectors to redesigned UI but retain assertions and normal owner-cookie/CSRF access.

After integration, rerun these focused cases and compile; use disposable storage. Recheck modal navigation/focus and source isolation with the redesigned shell. No need to repeat unrelated broad suites. This handoff's validation is Git diff/overlap inspection, local documentation links and whitespace checks only; no new runtime or hardware claims.

## Release/version and documentation inventory

Release/version files changed by R5: `desktop/package.json` and `desktop/package-lock.json` to0.12.0; `desktop/electron-builder.cjs` includes native review diagnostic helper; `desktop/scripts/chrome-smoke.mjs`, `native-chrome-smoke.mjs` and new `native-review-check.mjs` wire that diagnostic. No dependency, mobile version/signing or backend protocol bump. OpenAPI info advances to1.11.0.

Published [Windows0.12.0](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/v0.12.0) remains immutable. Original-key personal signed sidecar is not paid Windows Authenticode. Exact artifact sizes/hashes and platform limitations are in [release notes](../desktop/releases/v0.12.0.md). Do not move tag, replace asset bytes or interpret later master Mac publication as same-tag R5 verification. Integration itself is not authorized by this preparation task.

R5 documentation: `docs/CODEBASE.md`, `docs/README.md`, `docs/android/ANDROID.md`, `docs/desktop/{INSTALLATION-AND-UPDATES,MAC-HANDOFF,UPDATES}.md`, `docs/desktop/releases/v0.12.0.md`, `docs/development/API.md`, `docs/plans/{codex-current-stream,workspace-companion-plan}.md`, `docs/workspace/{NOTE-EXPORTS,REVIEWS,WORKSPACE-TRANSFERS}.md`. This preparation adds this handoff and corrects stale current-guide sprint wording; historical checkpoint records remain intact.

## Preserve and stop

Preserve original documents/drafts/save coordination, immutable evidence/intent, strict generation and approved workspace ownership, conditional status, retained deletion evidence, portability privacy, excluded-content export isolation, bounded queries and focus/navigation failure behavior. Keep Android read-only original-write refusal unchanged. No phone access, personal workspace mutation or credentials in artifacts.

R5 Mac native/two-device verification remains unavailable; Samsung, physical OLED, installer install-over and full10k review stress were not certified. Exact same-tag Mac handoff remains documented. R6–R10 are unstarted. Stop after pushing this handoff; no new release is required for documentation-only preparation.
