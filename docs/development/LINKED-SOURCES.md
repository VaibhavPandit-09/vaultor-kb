# Linked external folders — production implementation

Reviewed 2026-10-25. Single authoritative implementation tracker and practical contract. Baseline: clean fetched master/origin `cd904793bf147fda0f8c5e63cc577b3bce5ce523`. User explicitly superseded the historical Gate3B metadata blockade and authorized complete Windows delivery. [Gate3](qualification/LINKED-MARKDOWN-G3.md) retains historical evidence, not current approval requirements.

| Phase | Status | Requirements, implementation, evidence and next actions |
| --- | --- | --- |
| L1 Filesystem contract | In Progress | Added host-private `saveLinked` over the proven detached publisher, ordinary ACL/owner/group/creation/attribute verification, Unicode8.3 acceptance, no-op identity preservation and guarded metadata completion. Java compilation +10 bundled-runtime production-policy checks pass. Complete host wiring/root recovery storage and broader production-policy crash qualification next. |
| L2 Registration/navigation | Pending | Electron consent, persistent registry, confined paged hierarchy, unavailable/revoke/reauthorize and conservative identity; no database-owned folder collections. |
| L3 Rich-text editing | Pending | Qualified worker/BlockEditor,256KiB/shape/input limits, protected fallback, explicit Save, durable drafts and history. |
| L4 Changes/conflicts/recovery | Pending | Watch invalidations/rechecks; clean refresh/dirty conflict; compact compare/reload/export/validated resolution; safe restart. |
| L5 Vaultor integration | Pending | Open Notes/panes/journeys; collection references; search; relative links/assets; portability without transferred ownership/authority. |
| L6 Validation/release | Pending | Real-doc copies; native/frontend/backend/desktop suites; packaged Windows interaction and sustained measurements; signed minor release/publication/updater verification. |

## Practical filesystem policy

Windows x64, fixed local NTFS, ordinary user-owned Markdown. Main/renderer remain unelevated. No elevated helper is currently justified: exact optional SACL parity is no longer universally required. Unreadable SACLs are **not assumed absent**; custom audit/security-resource metadata is not promised preserved. Explicit integrity labels and detected special files are read-only. Initially refuse EA/ADS/encryption/compression/reparse/sparse/cloud/readonly and existing multiple-hardlink source writes. Ordinary Unicode names/generated8.3 names must work. File identity/hardlink changes on replacement are documented semantics.

Preserve exact validated bytes, supported encoding/BOM/EOL, current owner/group/DACL, ordinary flags and creation time. Other timestamps may change. Prepare the new inode with a protected copy of current source access rules; restore ordinary inheritance through the held new inode at its authorized parent. Never modify original content/security in place. Interrupted metadata reconciliation leaves a restrictive owner-accessible replacement and explicit recovery, never COMMITTED. Final success requires content/identity/ordinary-metadata checks. Optional auditing limitations are declared, not falsely called exact parity.

Use directory read-data leases and native RootDirectory-bound operations. Retain captured original and flushed B/L/V before exclusive publication. Gap occupants survive; postpublication changes produce conflict/uncertainty. No hash CAS claim, overwriting rename, original-object writer, silent replay or automatic evidence purge. Check workspace/root/revocation throughout.

Same-volume capture is required. Other NTFS drives will use a reserved private recovery directory inside the explicitly consented source, scoped by installation/workspace/generation, excluded from browsing/indexing/assets/document capabilities. Never modify Git configuration or archive private journals. Complete reservation/lifecycle in L2 before cross-volume activation. AppData recovery serves same-volume development tests initially.

## UI audit and state contract

Preserve existing SidebarFrame, Library, Open Notes/PaneNavigation, BlockEditor, AppModal, Escape/focus and motion tokens. Linked Sources is a peer source-managed section. Expand the same tree rows and open through existing Fill-then-Replace journeys. Keep source/status/Save in the editor action region; disclose conflicts/details contextually. Closing/switching flushes recoverable drafts/positions, never external autosave. Reduced motion uses immediate correct endpoints.

Root: available/disconnected/missing/reauthorization. Document: clean, validating, dirty-ready, source-fallback, saving, conflict, recovery-required, unavailable/read-only. Older Save receipts never clear newer edits. Clean external changes preserve reading context; dirty changes preserve the draft and allow compare/reload/export. Validate manual resolution against a freshly reviewed D; no speculative merge or silent overwrite.

## Release ownership

Actual package0.18.2; GitHub v0.18.2 Windows-only/non-Latest, v0.18.1 Latest. Existing ignored original signing key is available; never log/export it. Target compatible minor0.19.0 after acceptance. Follow [release process](../desktop/RELEASE-PROCESS.md): verified Windows-only pair can publish Latest=false while Mac remains unqualified. Preserve complete-platform Latest policy and independent Android releases. No installer or completion is claimed yet.

## Continuation

Continue L1, then L2–L6 autonomously. Read this after compaction; do not restart historical qualification or reinstate exotic metadata certification as a blanket blocker. Commit coherent tested increments and update CODEBASE with actual evidence. Stop only for the user's stated real release blockers.

### L1 implementation evidence and decisions

`PracticalMetadata` copies current inherited ACEs as temporary explicit rules on the NEW inode, with a protected DACL. This avoids Windows discarding inherited entries against the private staging parent. After exclusive publication it restores the original protected/unprotected state and ordinary DACL at the authorized parent, then verifies exact current access rules, owner/group, flags and creation time. No original security setter or content writer is used. A first test run failed6/8 because inherited ACE flags needed explicit treatment; retained in `native/linked-markdown/evidence/production/initial-metadata-failure.txt`. The corrected10-case suite passes on bundled Temurin25.0.4.1.

Permission recovery initially requested WRITE_OWNER unnecessarily and failed on an ordinary Modify-permission file. It now requests only required rights, avoids resetting unchanged owner/group, binds a one-use review to checksummed staged/published identity and exact current D, reads captured metadata without writing it, and journals the explicit repair as a new operation. Reused paths, including equal bytes on another inode, refuse. No source-content replay. All10 checks include actual ordinary ACL/creation preservation, Unicode/BOM/CRLF, no-op identity, preflight conflict, old hardlink content/security, interrupted inheritance, competing gap occupant, postpublication race, guarded completion and reused-path refusal.

The historical G3 private desktop harness still refuses Save/repair/restore. Production entrypoints are implemented in the library but not yet wired into normal Electron routes; no public feature or release is claimed by this increment. Existing Gate1 editing limits remain unchanged. Next: scoped source registration/native hierarchy and production bridge, then mounted editor/UI integration and packaged acceptance.
