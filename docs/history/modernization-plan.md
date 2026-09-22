# Modernization implementation tracker

Started 2026-09-21. Status: implementation complete; validation coverage and limitations below. Authoritative scope: approved five-sprint usability, portability, and diagnostics overhaul.

## Decisions

- Keep the workspace design; remove authentication/encryption, without deleting existing resources.
- No encrypted archive or obsolete API compatibility. Plain logical ZIP transfers support merge and replace.
- API diagnostics and automated component/API tests; visual verification is manual.
- Future PDF/DOCX/XLSX/Google Docs renderers are deferred; establish registry and document traversal now.
- Update this tracker after each sprint and CODEBASE.md with implementation truth. Archive on completion only.

## Sprint 1 — crash and error visibility

- [x] Reproduce positioning loop; stable geometry dependencies and equality guard.
- [x] Keyboard dropdowns and nested Escape behavior.
- [x] Regional error boundaries, diagnostic references, browser error collection.
- [x] Vitest/Testing Library regression tests and build checks.

## Sprint 2 — password-free workspace and reliability

- [x] Remove auth, token, lock and encryption flows; loopback Docker binding.
- [x] Per-note serialized autosave, debounce/flush/retry and visible status.
- [x] Serialize settings writes; visible operation errors.
- [x] Rewrite replacement links in documents; fix preview fetch lifecycle.

## Sprint 3 — API and diagnostics

- [x] Explicit structured-content DTOs, pagination, validation, OpenAPI.
- [x] Problem details and request IDs; structured stdout logs.
- [x] Bounded browser events, health/capabilities/integrity APIs, Diagnostics panel.

## Sprint 4 — workspace transfers

- [x] Logical versioned ZIP, manifest/checksums, configurable limits.
- [x] Persisted operations, single worker, mutation gate, recovery.
- [x] Preview/merge/replace with staged files and transactional metadata.
- [x] Progress/download/cancel/retry UI without restart.

## Sprint 5 — export foundation and release

- [x] Export scope/format registry and shared document traversal.
- [x] Agent smoke script, service/API tests, frontend build/lint/tests.
- [x] Docker build and disposable-container smoke tests; manual UI coverage/remaining checks recorded.
- [x] Current API/debugging documentation and codebase guide; archive tracker.

## Acceptance

No dropdown blank screen; direct workspace startup; durable visible saving; coherent merge/replace round trips; actionable correlated logs; discoverable APIs and diagnostics. Malformed imports leave the workspace unchanged. Preserve device appearance and existing data unless replace is explicitly selected.

## Validation / blockers

Completed 2026-09-22. Existing workspace data was preserved throughout. Implementation checkpoints were validated sequentially; the tracker is archived after the final API and Docker verification.

- Sprint 1: reproduced the old positioning render loop in the regression test; fixed primitive dependencies/equal-geometry updates; keyboard selection and nested Escape component checks pass. Regional error-boundary test preserves sibling input and records a diagnostic.
- Sprint 2: removed auth/encryption endpoints and screens; visible serialized note/settings saves and retry, draft flush on pane/transfer transitions, persisted document link replacement and preview cleanup implemented. Browser checked two panes and an actual backend stop → Save failed → restart → Retry → Saved before the user's API-first instruction.
- Sprint 3: explicit DTOs, problem details/field errors, pagination/OpenAPI, structured JSON logs, request IDs, diagnostic collection/panel and read-only integrity checks implemented. API tests seed dangling references, backlink disagreement and missing binaries. Bounded diagnostic retention/batches tested.
- Sprint 4: logical ZIP transfers, preview/merge/replace, remapping/tag unification, staged binaries, transactional commit/journal recovery and idempotency verified. Simulated transaction failure leaves original metadata/files intact. Restart tests clean interrupted staging and resume committed cleanup. Cancellation supports queued/preview and pre-commit import preparation.
- Sprint 5: exporter interface/registry, shared document traversal, agent smoke script, API/operations guide and updated living guide delivered. Only workspace ZIP enabled; planned additional formats remain future work.

Final automated results:

- Frontend build and lint PASS. Six test files / nine tests PASS (positioning, settings keyboard/Escape, saves, error boundary, save icons, pasted list/table/code parsing, picker focus and StrictMode editor mounting).
- Backend Maven: seven tests PASS, zero failures/errors; includes HTTP save/read-back for nullable ordered-list attributes and malformed-shape/depth rejection.
- Docker Compose build PASS. Disposable named volume vaultor-release-check_vaultor_data, loopback port 18080. Expanded API smoke PASS with 18 checks; request ID smoke-1790069570184 verified in structured Docker logs.
- Normal Compose container recreated using the existing vaultor-kb_vaultor_data volume; no replacement import or smoke mutations run against normal data. UI assets require browser refresh; a currently failed draft should be retried/saved before refreshing.

Manual coverage and honest limits:

- Before the API-first instruction, browser checks verified settings dropdown opening, keyboard/Escape behavior, light/dark settings, two note panes, visible autosave and real network-failure/retry recovery.
- The user subsequently requested primarily API/component debugging. No extra browser/native debugging was performed. Full manual matrix (every dropdown/theme/narrow-screen/import UI permutation) is not claimed complete; resize/scroll and keyboard cases have component coverage.
- The native Windows/Vivaldi file-dialog pointer disappearance is not directly reproduced. Removed the concrete deferred-focus race; regression tests prove picker commands do not schedule editor focus. Native pointer visibility needs a user/native check.
- Transfer artifact expiry and full modal focus trapping remain documented follow-ups, not newly enabled export formats. Vite large-chunk/Browserslist warnings remain non-blocking.

Follow-up fixes from the user's diagnostic report:

- Notion paste: validation mistakenly interpreted attribute objects as nodes. Ordered-list attrs.type=null is now accepted; actual malformed nodes/marks still fail.
- Save status: moved to top-right title-bar icon with hover/focus text and accessible retry.
- Editor mount: fixed view.dom access before the Tiptap view exists; StrictMode regression passes.
- CSV/Markdown picker: no asynchronous refocus before native dialog; imports keep the original editor across async reads.

No implementation blockers remain. Outstanding manual/native verification is explicitly listed above.
