# Vaultor AI Development & Integration Workflow

> **Status:** Engineering workflow contract  
> **Purpose:** Keep parallel AI development safe, reviewable, and easy to integrate.

---

## 1. Master is the product baseline

`master` is always the authoritative integrated product baseline. A feature branch or acceptance APK does not supersede it.

Fetch before beginning a milestone, verify the actual remote and local master tips and working trees, then start its temporary isolated branch/worktree from current verified `master`.

Do not begin a new roadmap milestone from an old feature branch merely because the previous AI chat still has context.

Durable context belongs in:

- source code;
- tests;
- documentation;
- Git history;
- release notes.

---

## 2. One branch, one responsibility

Examples:

- `ai/codex-ui-redesign` — desktop UI transformation
- `ai/codex-r5` — R5 review functionality
- `ai/codex-r6-android` — R6 + Android companion UI work
- `integration/r5-redesign` — integration only

An active implementation branch must not continuously merge other active AI branches.

---

## 3. Fresh integration chat for divergent major branches

When two major branches have diverged substantially, use a fresh AI conversation as integration engineer.

The integration agent must have an explicit precedence contract.

Example:

- `master` owns current presentation/UI/motion architecture;
- `ai/codex-r5` owns R5 functional/domain semantics.

A conflict is resolved semantically, not by mechanically choosing "ours" or "theirs."

Automatically merged files must also be reviewed. A clean Git merge does not prove a clean product integration.

---

## 4. Preferred integration branch pattern

Create the integration branch from current `master`:

`integration/<feature>-<baseline>`

Then inspect both branch diffs from their common base.

Preferred first attempt:

- merge source branch with `--no-commit`;
- inspect all changed files;
- resolve/adapt presentation conflicts;
- test before creating the integration commit.

If the merge produces an unreasonably tangled result:

- abort;
- port/cherry-pick coherent functional layers in dependency order;
- adapt presentation work explicitly to the current baseline.

Never "solve" integration by reverting the current design system to an older feature branch's UI.

---

## 5. Integration precedence

Unless the user specifies otherwise:

1. current `master` architecture and documentation win for current product structure;
2. feature branch domain semantics win for the feature it implemented;
3. current UI philosophy wins for presentation;
4. current Android UI philosophy wins for Android interaction/haptics;
5. tests and explicit product contracts beat incidental implementation details;
6. if two branches imply different product behavior, stop and ask instead of guessing.

---

## 6. Version/release files

Old feature branches may contain release/version metadata that was correct when they were created.

During integration:

- do not accidentally downgrade current product versions;
- preserve historical release notes;
- reconcile current versioning intentionally;
- do not republish historical artifacts as if newly built;
- follow the current release process for new artifacts.

---

## 7. Milestone lifecycle

For R6 and later, require:

1. latest verified `master`;
2. fresh branch `ai/codex-rN[-scope]`;
3. fresh milestone chat;
4. audit/plan;
5. user approval;
6. implement in coherent slices;
7. tests + runtime verification side by side;
8. small commits;
9. push;
10. milestone review;
11. integrate to `master`;
12. verify `master`;
13. only then begin R(N+1).

Avoid one endless AI chat spanning many major milestones.

A completed milestone must be integrated and verified on master before the next milestone begins. Never silently start from an unmerged or obsolete feature branch. An explicit user-authorized combined milestone or integration task is an exception, and its source ancestry and scope must be documented. Isolated branches/worktrees are temporary implementation environments, not competing product baselines. Preserve source branches unless the user separately authorizes deletion.

R7–R9 consolidation is complete on master63668b0 with Windows0.16.0/Androidalpha.28 publication; see [integration](../plans/R7-R9-INTEGRATION.md). R10 is unstarted and requires fresh authorization from fetched master; see [handoff](../plans/R10-HANDOFF.md). Temporary branches/worktrees and historical candidate APKs are not alternate baselines.

---

## 8. UI review gates

Major UI or interaction changes require explicit user authorization before implementation and must stop for user review at meaningful gates. Milestone/integration authorization does not authorize redesigning accepted screens. Preserve all approved design and domain contracts, including the resource model, structured documents, host authority, source isolation, protected queues and centralized interaction ownership.

Desktop examples:

- Library transformation;
- pane transitions;
- preview geometry;
- theme reveal.

Android examples:

- navigation shell;
- reader chrome;
- review capture;
- major offline/sync transitions;
- haptic vocabulary;
- theme transition.

The implementing agent does not get to self-certify subjective motion/haptic quality.

---

## 9. Desktop validation

For desktop-facing UI:

- Electron runtime is authoritative;
- browser/Vite is supplementary;
- motion must be inspected in motion;
- static screenshots cannot certify temporal quality.

---

## 10. Android validation

For Android-facing UI:

- emulator is useful for deterministic layout/testing;
- real-device validation is required for final haptic feel and important touch/motion interactions;
- system settings/accessibility must be respected;
- screenshots cannot certify haptic or motion quality.

---

## 11. Handoff at branch completion

Before an implementation branch is considered ready:

- working tree clean;
- branch pushed;
- tests/builds documented;
- relevant native/runtime checks documented;
- CODEBASE/current tracker updated as required;
- major risks listed;
- integration-sensitive files listed;
- branch does not contain unrelated changes.

---

## 12. Branch retirement

After successful integration and master verification:

- tag important historical states when useful;
- retain source branch until confidence/release threshold is reached;
- then delete the branch if desired.

Do not delete the only copy of unintegrated work.
