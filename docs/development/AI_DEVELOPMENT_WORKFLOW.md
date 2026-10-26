# Vaultor AI development and integration workflow

Reviewed 2026-10-26. This is the authoritative Git workflow for Vaultor, a primarily single-developer, AI-assisted project. It supersedes the former automatic milestone-branch and integration-branch pattern. Product, security, UI and release contracts remain in force.

## Master-centered direct development

`master` is the default working branch and authoritative development baseline. New Codex chats and new milestones do not automatically create branches or worktrees. Work directly on master in small coherent commits within the user's authorized scope.

Before editing, fetch and inspect the actual remote/local master tips, working tree and worktree inventory. Preserve unrelated changes. Use the existing master checkout; if master is checked out elsewhere, inspect that checkout rather than creating another integration branch. Never start from an obsolete feature branch because a previous chat used it. A new milestone still requires authorization, but does not require a branch.

Validate changes before committing or pushing. Keep ordinary checks focused on compilation and changed failure-prone behavior; run full regressions and native/release suites at meaningful integration/release checkpoints. Maintain CODEBASE and supporting contracts in the same coherent change. Durable context belongs in source, tests, documentation, Git history and release notes.

## When isolation is justified

Create a temporary branch/worktree only when explicitly requested, when concurrent work requires isolation, or when a substantial risky experiment warrants it. State the reason and use the latest verified master as the baseline unless the user explicitly names another source. A new chat or milestone alone is not a reason. Reuse suitable existing isolation where practical.

Concurrent agents must stay in their assigned scopes and must not merge, rebase onto, cherry-pick from or otherwise incorporate another active agent branch without explicit integration authorization. Do not continuously synchronize active feature branches. Preserve coherent history and document integration-sensitive changes.

## Direct integration into master

Do not create a separate integration branch for routine work. When integrating an authorized temporary branch, fetch, inspect both histories and diffs from their common base, verify cleanliness and check GitHub branch protection/rules and required checks first.

If direct merging is permitted, use the clean master checkout:

```text
git fetch origin --tags
git switch master
git merge --ff-only origin/master
git merge --no-ff --no-commit <authorized-source>
# Inspect every changed file, resolve semantically, validate and update docs.
git diff --cached --check
git commit
git push origin master
```

Use the actual authorized source, never a guessed historical branch. Review automatically merged files as well as conflicts. If there is genuine unresolved product/security/compatibility ambiguity, stop and explain it. Do not mechanically choose ours/theirs or revert accepted presentation architecture. If a merge cannot be completed safely, preserve the source and report the blocker; do not rewrite history as a shortcut.

If protections require a PR or checks, use that required route with the existing source branch, attach any created PR to the task, and wait for required checks/reviews. Never bypass protections, disable checks, use force-push, or rewrite established history. An explicit user request does not authorize bypassing repository policy.

## Product and presentation precedence

Preserve all approved product/UI contracts unless a change is explicitly authorized. Current master owns integrated architecture and presentation; an authorized feature contributes its intended domain semantics. Tests and explicit contracts take precedence over incidental implementation details. Preserve resources, structured Tiptap JSON, shared clients/settings/tokens, centralized Escape/focus/Back, host authority, source isolation and protected journals.

For narrow UI fixes read applicable UI_PHILOSOPHY.md sections; substantial interaction redesigns require the complete contract; Android-facing work also requires ANDROID_UI_PHILOSOPHY.md. Major interaction changes require explicit authorization and meaningful user review. Milestone, integration and release authorization do not authorize a redesign. Electron is authoritative for desktop runtime; browser/Vite is supplementary. Inspect motion in motion. Emulator evidence cannot certify physical Samsung/OEM/tactile quality, TalkBack speech or real-LAN behavior. Do not self-certify unperformed platform checks.

## Release and recovery points

Finish release qualification before tagging. Follow RELEASE-PROCESS.md and Android's separate release contract: deliberate version/lock bumps, fresh UI/server/runtime as needed, original signing identity, native checks and verified installer/sidecar pairs. Reconcile old branch release metadata without downgrading current versions or republishing historical bytes.

Use immutable release tags as stable recovery points. Never move existing tags, replace published assets, force-push or rewrite established history. A correction to a published app needs a new version; only the documented exact-source absent-platform addition is permitted. Respect platform gates and report unavailable hardware precisely. Documentation/test-only changes do not require new installers.

After any integration, verify master contains the intended source and earlier integrated functionality, record actual tests/limitations, and push coherent changes. Preserve historical branches and worktrees; do not delete them automatically. Branch/worktree retirement requires explicit user direction.

Complete only the authorized work and stop at its requested completion/acceptance gate. Do not automatically begin the next milestone or post-roadmap product work.

## Efficient exploration and verification

Minimize AI reasoning and context spent on repetitive verification; preserve automated checks that protect actual product correctness. This is the single operational efficiency policy for every platform and agent.

### Exploration and scope

Inspect Git state and changed files first. Discover filenames and symbols with rg, then read bounded relevant code, CODEBASE and topic-guide sections. Understand applicable architecture and UI contracts before editing; comprehensive design review is reserved for substantial interaction redesigns. Reuse current implementation and evidence rather than historical qualification campaigns. After compaction retain paths, decisions and check outcomes; do not reread large unchanged files. Passing logs need only exit status/counts; inspect full logs for failures.

Implement requested behavior and necessary support only. Avoid opportunistic refactors, architectural replanning and speculative compatibility work. Investigate practical evidenced risks; never dismiss plausible irreversible data loss or authorization failure. Refuse safely unsupported exotic configurations and document the boundary. Explicitly fix, defer or report investigations that expand beyond scope. Use existing fixtures/harnesses and suitable CI; add a small reusable wrapper only when it removes actual repeated work. Do not redesign CI for efficiency alone.

### Risk and verification

| Risk | Examples | Required evidence |
| --- | --- | --- |
| Low | Styling, text, layout | Targeted component checks, compilation/type checks, one actual visual inspection covering changed layouts. No routine backend/filesystem/Docker suites. |
| Medium | Navigation, settings semantics, editor interactions, search | Focused affected tests, relevant integration tests and affected runtime smoke. Expand when shared behavior changes or failures justify it. |
| High | Publication, recovery, migrations, credentials, security, updates | Existing affected safety regressions, focused new-behavior and failure/recovery cases, final appropriate packaged-runtime check. |

At coherent implementation checkpoints run focused checks. After a fix rerun the failing check and expand only as warranted. Do not rerun unchanged passing suites after unrelated edits. Run the relevant broader regression once at final integration/release. Changes affecting a previously checked behavior invalidate that evidence; documentation edits do not. Keep a compact command/outcome record with artifact/source identity for runtime checks. Avoid duplicate tests, repetitive browser inspections and large passing-log reads. Native evidence remains required for native behavior claims.

### Delivery and reporting

Stable delivery still requires relevant regressions, production build, packaged smoke, affected filesystem/recovery checks, original signing identity, installer/sidecar verification, version/source provenance, applicable public updater/download verification and no known critical correctness/data-loss defects. These are final conditions, not a repeated campaign after every edit. RELEASE-PROCESS.md owns exact release gates and missing-platform handling.

Continue autonomously through authorized work with small coherent commits; ordinary decisions do not need repeated approval. Update authoritative documents in place and avoid lengthy new qualification reports. Report concise meaningful progress, then implementation, tested/untested behavior, limitations, commit/release and remaining platform work.

### Lightweight baseline and measurement

Baseline on 2026-10-26: frontend build/lint/test; desktop check/test and native smoke scripts; native linked run.ps1; backend Maven tests; separate Android checks. Existing instructions discouraged routine full/API/Docker checks but root/workflow/UI contract demanded complete UI-guide reads even for layout fixes. No hosted CI signing pipeline is configured by the release process.

Use explicit affected test files and compact runner summaries during development. Reserve affected native safety regressions and packaged checks for final integration; reuse unchanged results for release. Record eliminated duplicate operations in the milestone result, not a second large qualification ledger. Report actual token consumption only if supported tooling exposes it; command counts or estimated percentages are not token measurements.
