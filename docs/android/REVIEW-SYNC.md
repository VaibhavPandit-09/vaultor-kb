# Android Review delivery and desktop status

Reviewed 2026-10-21. R6 A4 implementation on ai/codex-android-ux-prototypes.
[REVIEWS](../workspace/REVIEWS.md) owns the unchanged R5 domain/API contract;
[Review capture](REVIEW-CAPTURE.md) owns evidence and protected local drafts.
[Consolidated candidate](R6-COMPLETION.md) owns authorization and acceptance.

## Native delivery ownership

VaultorReviewSync is the sole native dispatch owner. VaultorReviews retains its
format1 encrypted AtomicFile, 256-record/8MiB bounds and separate non-evictable
journal. Additive delivery metadata never rewrites UUID, captured source, frozen
creation body, draft version or evidence. The React bridge can request catch-up,
refresh or Sync now; it cannot supply an arbitrary write route or forge receipts.
The existing apiFor read-only boundary is unchanged. No host/backend change.

Each source is admitted against the approved pinned-TLS host, explicit captured
workspace header, current generation, server grant and reviews:1 capability.
Dispatch does not activate a source or use the focused workspace. Approval is
checked before and after each native request. GET receipts lack generation, so
reconciliation also checks workspace identity after the receipt. PUT itself
retains the frozen generation and baseRevision. No fallback source or retargeting.

Before PUT, persist a sending claim. After success, validate UUID, resource,
comment, quote, context, locator, status and revision before persisting the bounded
receipt. A lost acknowledgment or process death retries the exact UUID and entire
creation body. GET is only for previously acknowledged records; it cannot recover
omitted immutable creation inputs. Conditional desktop status writes stay absent.
Known acknowledgments survive later network/revocation/conflict failures as last
known receipts, with an explanation. Original note content/revision is untouched.

## Scheduling and presentation

Mount/resume, a newly queued capture and a30s active-app timer perform catch-up.
Review stream events invalidate only delivery/status, never the retained document.
Normal batches select up to32 pending and32 acknowledged rows, oldest checked
first; explicit Sync now covers the bounded journal. Retry backoff is2s to5min.
Nonretryable admission/conflict errors require explicit retry after correction.
Android37 local-network permission is requested by manual Sync now when needed.
There is no guaranteed background scheduler. A process may stop at any point;
the next foreground session recovers from durable state.

Device-wide source-grouped Review shows protected draft, queued, sending,
delivery unconfirmed, needs attention, or synced plus desktop Open/Resolved/
Dismissed. It never silently activates a source. Synced receipts can be last known
when the host is unavailable. Attachment/target availability is secondary to the
original captured evidence. Capture's saved receipt remains a durable-local-save
confirmation; sync updates its label without replaying motion or haptics.
All ordinary sync/status updates are silent. Existing native haptics are unchanged.

Queued evidence remains immutable and protected against discard, source removal,
download eviction and generation replacement. There is no edit/redirect/recreate
or automatic resolution action. A conflicting UUID retains both intents. No
credentials, private bodies or host payloads are written to diagnostics/logs.

## Focused verification

ReviewSyncTest injects offline transport, lost acknowledgment, stale sending,
restart, wrong generation, revocation, conflicts, malformed receipts, concurrent
owners and journal write failures. ReviewSyncExperienceTest uses production pinned
HTTPS against review-fixture.mjs: disposable workspaces only, owner approval,
actual network loss/reconnect, process death, same UUID in another workspace,
real capture and desktop status changes. Fixture commands never print credentials.
They require explicit emulator serials and never access the user's phone.
Actual results and known limits are recorded in R6-COMPLETION.md. Native/emulator
PASS does not approve S24 motion, sensation, TalkBack or OEM lifecycle behavior.
