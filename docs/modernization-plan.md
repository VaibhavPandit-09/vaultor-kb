# Modernization implementation tracker

Started 2026-09-21. Status: in progress. Authoritative scope: approved five-sprint usability, portability, and diagnostics overhaul.

## Decisions

- Keep the workspace design; remove authentication/encryption, without deleting existing resources.
- No encrypted archive or obsolete API compatibility. Plain logical ZIP transfers support merge and replace.
- API diagnostics and automated component/API tests; visual verification is manual.
- Future PDF/DOCX/XLSX/Google Docs renderers are deferred; establish registry and document traversal now.
- Update this tracker after each sprint and CODEBASE.md with implementation truth. Archive on completion only.

## Sprint 1 — crash and error visibility

- [ ] Reproduce positioning loop; stable geometry dependencies and equality guard.
- [ ] Keyboard dropdowns and nested Escape behavior.
- [ ] Regional error boundaries, diagnostic references, browser error collection.
- [ ] Vitest/Testing Library regression tests and build checks.

## Sprint 2 — password-free workspace and reliability

- [ ] Remove auth, token, lock and encryption flows; loopback Docker binding.
- [ ] Per-note serialized autosave, debounce/flush/retry and visible status.
- [ ] Serialize settings writes; visible operation errors.
- [ ] Rewrite replacement links in documents; fix preview fetch lifecycle.

## Sprint 3 — API and diagnostics

- [ ] Explicit structured-content DTOs, pagination, validation, OpenAPI.
- [ ] Problem details and request IDs; structured stdout logs.
- [ ] Bounded browser events, health/capabilities/integrity APIs, Diagnostics panel.

## Sprint 4 — workspace transfers

- [ ] Logical versioned ZIP, manifest/checksums, configurable limits.
- [ ] Persisted operations, single worker, mutation gate, recovery.
- [ ] Preview/merge/replace with staged files and transactional metadata.
- [ ] Progress/download/cancel/retry UI without restart.

## Sprint 5 — export foundation and release

- [ ] Export scope/format registry and shared document traversal.
- [ ] Agent smoke script, service/API tests, frontend build/lint/tests.
- [ ] Docker build and disposable-container smoke tests; manual UI checks.
- [ ] Current API/debugging documentation and codebase guide; archive tracker.

## Acceptance

No dropdown blank screen; direct workspace startup; durable visible saving; coherent merge/replace round trips; actionable correlated logs; discoverable APIs and diagnostics. Malformed imports leave the workspace unchanged. Preserve device appearance and existing data unless replace is explicitly selected.

## Validation / blockers

Not yet run. Existing documentation changes from the prior task are retained.
