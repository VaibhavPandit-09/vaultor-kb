# R5 and desktop redesign integration

Reviewed 2026-10-15. Target: `integration/r5-redesign`. R6 has not started. This is an integration candidate, not a publication of historical installers.

## Sources and strategy

- Presentation baseline: fetched `master` at `cf953fe7b23d8e04f3120e0a212b686fff3cd40e`.
- R5 source: `ai/codex-current` at `68dcca8`.
- Common base: `11b09aae1a206f3441d5c5a1ce502f14c833664c`.
- Started with a clean tree on master, fetched origin, compared histories/diffs, created the requested integration branch, and merged R5 with `--no-commit --no-ff`. Source branches remain unchanged. The merge remains a two-parent integration rather than a collection of unrelated cherry-picks.

R5's domain/API/export/import/type layers carry forward intact; tests retain their contracts with additive legacy compatibility coverage and the current archive writer expectation. All frontend changes relative to master are the review capability, its explicit insertion points, transfer counts, diagnostic error ownership and necessary test adaptation. Master owns all presentation primitives and CSS.

## Conflict and semantic inventory

Eight paths changed on both branches; seven had textual conflicts:

| Path | Resolution |
| --- | --- |
| desktop/package.json and package-lock.json | Select new compatible capability version0.14.0, above both published streams; synchronized metadata, no dependency change. |
| frontend/src/pages/Dashboard.tsx | Preserve SidebarFrame, NoteOrientation, WorkspacePaneLayout, PreviewShell and all current layout/motion. Add workspace/resource inbox state, generation reset, review-only SSE invalidation, sidebar entry and guarded navigation. |
| frontend/src/components/PreviewLayer.tsx | Add ReviewButton to current preview-actions; keep the same shell, viewer and Side/Floating geometry. |
| docs/README.md | Retain both authoritative topic/tracker links. |
| docs/desktop/INSTALLATION-AND-UPDATES.md | Preserve actual Windows0.12.0/Mac0.13.0 availability and identify0.14.0 as unpublished. |
| docs/desktop/MAC-HANDOFF.md | Retain both immutable historical platform handoffs. |
| docs/CODEBASE.md | Auto-merged; manually reconcile current review/archive4 and redesigned presentation descriptions, source map, focus explanation and validation history. |

Cleanly mergeable R5 files include the backend services/controller/routing/OpenAPI, export/import integration and tests, review API helper/component/tests, change-feed/capability types, transfer counts and diagnostic harness entries. Clean merging did not constitute UI acceptance: AppModal focus, cached device settings, retained hidden browse views, diagnostics and preview geometry were reviewed separately.

## Preserved R5 semantics

[REVIEWS.md](../workspace/REVIEWS.md) remains authoritative. Reviews retain immutable caller identity/evidence, trusted display provenance, separate open/resolved/dismissed state, quoted review If-Match, private revision validators, per-workspace generation isolation and quarantine, deletion retention, bounded scope/counts/paging and dedicated invalidation. Originals, note revisions, save coordination and structured Tiptap JSON remain independent.

Archive4 retains portable reviews; readers accept1–4 with strict validation. Merge remaps review/resource identities, replacement restores reviews atomically in the new generation, and independent imports preserve evidence in their own namespace. Private routing/authorization/revisions stay excluded. Scoped note packages export only evidence for rendered notes/captured files, preserving the excluded-linked-note privacy boundary. Protocol3 and Android alpha.11 remain unchanged.

## UI adaptation and interaction states

The current sidebar opens one AppModal inbox. NoteOrientation's identity/action row and PreviewShell's current preview-actions open that same inbox scoped to a resource. Zero-count entries use a labeled icon; positive open counts remain visible. No old headers, sidebar shells, spacing system, duplicate toolbar, CSS or new motion primitive was restored.

Opening captures the invoking control through current dialogFocus and focuses Status. The existing compact AppModal owns one scrolling body and centralized Escape/Tab containment. Evidence expands within its existing row. Status writes retain pending/conflict/error feedback in the inbox; backgroundDiagnostic retains diagnostics without the unrelated global Retry saves banner. Same-query refresh failures retain evidence; changed query/source responses cannot populate the new scope.

Navigation waits for existing load/save/capacity checks. Failure leaves the inbox intact. Success removes the modal before handing focus to the current note pane or preview. Closing normally restores the trigger without waiting for animation. File-review dismissal retains the preview; Review opening does not remount the editor or viewer. Existing theme/reduced-motion/geometry primitives remain unchanged.

## Validation

- Clean Maven compilation and29 selected tests passed: ReviewTest13, DesktopContractTest4, NoteExportGraphTests1, WorkspaceImportTest6, NoteExportServiceTests3 and TransferStatusTest2. Includes real approved/pinned HTTPS, generation isolation, archive4 round trip/remapping/replacement/fork and export scope; disposable data only.
- The expanded archive/lifecycle/search compatibility selection established42 cases, including ReviewTest14 with explicit valid archive1–3 imports without reviews. Four initial failures were corrected in test expectations/polling; all19 cases in those affected classes passed on focused rerun. Combined with the initial selection,58 distinct backend cases passed. Production domain code remains byte-identical to the R5 source.
- Full frontend65 files/321 tests and full ESLint passed. After making review diagnostics local,15 focused review/change-feed/transfer tests passed; scoped final lint and TypeScript/Vite build passed.
- Desktop syntax checks and all43 desktop tests passed, including native ownership/transport/security/update contracts. Fresh UI and embedded browser/server builds passed; locked development staging was retained and an alternate ignored bundle was used.
- Windows Electron44.5.1 unpacked candidate:54 mixed note/file reviews, paging/counts, resolve/dismiss/reopen, real stale-validator conflict, unchanged originals, evidence escaping, long titles, successful destination focus, editor identity, file-preview retention, Escape/trigger focus, Light/Dark/OLED and narrow desktop checks passed. Real owned-server stop produced local retained-row error UI. Browser owner handoff/paging/narrow checks passed. Loading is separately exercised through a delayed browser request and component tests.
- Current redesigned Library/filter, note/code menu, command palette, Settings, export picker, Side/Floating previews, sidebar, Connections/Hosting, reduced-motion/narrow layout, cached appearance persistence and two mounted note panes passed the adapted native OLED harness. Inspected native frames for the shared surfaces and review states. Side/Floating frame/bounds samples retain the same preview node; this is limited temporal evidence, not a new subjective motion-quality certification.

Initial failures are not counted as passes: stale backend class files required a clean build; frontend mocks/assertions needed current modal/label behavior and bounded workers; native fixtures needed visible-Library scoping, device-local appearance changes through Settings and the explicit Connections and hosting control. Older archive tests needed writer4 and narrowly bounded retries for the existing maintenance409; the initial lifecycle run preceded recompilation of its updated assertion. Production ownership/security rules were preserved. Existing large-chunk/Browserslist warnings remain. One fixture shutdown logged a refused stale desktop caller after assertions; no authorization checks were weakened.

## Version, artifacts and stop boundary

Desktop/package-lock0.14.0 intentionally reconciles the integrated capability above0.12.0/0.13.0. Historical release notes/tags/assets remain unchanged. A fresh local Windows NSIS candidate and original-identity signed sidecar are built/verified under ignored desktop/releases. Final candidate:245,692,558 bytes, SHA256 `4749c9ab8851a5c044a69599da3dbefe32b0fe1f2fb0485a398e8b404634f983`,400-byte original-key sidecar. Native/staged and embedded browser CSS/JS asset bytes match. They are not a published update and no historical artifact was republished. Native Mac build/signing/verification and installer install-over were not performed; no Mac/Linux artifacts are claimed. Mac release work must use the eventual reviewed immutable integrated source, not either old partial release.

Publication/master integration are outside this requested branch-push stop boundary. Final integration commit and remote identity are available from `git log --first-parent integration/r5-redesign` and `origin/integration/r5-redesign`. Stop after pushing the clean integration branch; do not begin R6, alter source branches or retire them.
