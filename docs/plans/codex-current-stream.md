# Codex product stream

Integration preparation is complete; see [R5 integration handoff](R5-INTEGRATION-HANDOFF.md) for the read-only comparison with master, conflict inventory and preservation gates. R6 is explicitly paused at the authorization boundary; no R6 implementation has begun.

Reviewed2026-10-15. Work only on **ai/codex-current**; never incorporate ai/gemini-ui without explicit integration authorization. R4 remains completed/published; the workspace-companion tracker remains authoritative. No project restart.

R5 is complete/published Windows0.12.0: review records and inbox on desktop/browser; Android capture/sync remains R6. Functional changes will use separate review types/API/state and a dedicated component, with only narrow Dashboard hooks. Broad layout/theme/motion work belongs to the UI stream.

The user requested latest Git instructions: master11b09aa (AGENTS, UI_PHILOSOPHY, macOS ignore) was fast-forwarded before feature edits. Read the design contract completely. No other branch is an implementation dependency.

Review UI interaction boundary: workspace inbox lists paged review evidence/status with on-demand resource focus; focused resource offers a compact pending count opening the same component scoped to that resource. Opening evidence expands its existing row. Status changes retain evidence and show pending/conflict/retry on the affected row. Resource navigation uses existing navigation/save contracts. One scroll context per view; no new sticky chrome/global style refactor/custom motion system. Central Escape/focus restoration and existing theme/motion primitives apply.

Integration risks: Dashboard sidebar/destination and resource-header insertion points may conflict with presentation restructuring. Preserve review query scope, generation, immutable creation UUID/body, If-Match status updates, target availability/evidence state and failure/stale-response behavior when relocating controls. Detailed API/state contracts will live in workspace/REVIEWS.md. Release ownership remains agent-owned; push this branch, never master.

## R5 checkpoints

a2166f9 records branch continuity/authorization; c01e7b6 implements review domain/API/portability. d7df3aa adds functional inbox/entry points;1b987fe isolates generations/export scope;4e2f713 caps long titles and is immutable v0.12.0 source. Current UI implementation keeps separate ReviewInbox/ReviewButton and lib/reviews.ts with narrow Dashboard/PreviewLayer hooks. Transfer previews add optional reviews counts and explicit replacement wording; these capabilities must survive the UI transformation. See workspace/REVIEWS.md for complete contracts and desktop/releases/v0.12.0.md for actual validation/release status. No other active AI branch has been consumed.

R5 release published at2026-10-14T20:50:06Z (2026-10-15 IST), Windows-only; exact source/version, verified artifact digests and Mac handoff are in the release ledger. Work remains on ai/codex-current; master and ai/gemini-ui were not modified. Stop after R5; next separately authorized sprint is R6 Android review capture/sync.

Shared-file integration also includes desktop package/lock version0.12.0, the native diagnostic helper packaging entry, CODEBASE/index/tracker and release notes. Preserve immutable published tags/signatures and choose a new higher release version after integration. Adapt native UI selectors to the redesigned presentation while retaining source isolation, pagination, triage/original preservation, focus and preview assertions.
