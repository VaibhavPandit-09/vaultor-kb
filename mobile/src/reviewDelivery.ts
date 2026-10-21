import type { CaptureItem } from './reviews';
export function deliveryLabel(item: CaptureItem) {
  if (item.state === 'draft') return 'Protected draft';
  const d = item.delivery;
  if (d?.state === 'synced')
    return `Synced · ${
      d.receipt?.status === 'resolved'
        ? 'Resolved'
        : d.receipt?.status === 'dismissed'
        ? 'Dismissed'
        : 'Open on desktop'
    }${d.reason ? ' · last known' : ''}`;
  if (d?.state === 'sending') return 'Sending';
  if (d?.state === 'unknown') return 'Delivery unconfirmed';
  if (d?.state === 'error') return 'Needs attention';
  return d?.reason ? 'Queued · source unavailable' : 'Queued on this phone';
}
const reasons: Record<string, string> = {
  APPROVAL_REQUIRED:
    'Approve this source in Source management, then Sync now. Evidence stays protected.',
  NETWORK_PERMISSION_REQUIRED:
    'Allow local-network access with Sync now to reach the source.',
  TLS_VERIFICATION_FAILED:
    'TLS trust could not be verified. Inspect the approved source identity before retrying.',
  HOST_IDENTITY_CHANGED:
    'Host identity differs. Inspect Source management; no submission was redirected.',
  REVIEW_GENERATION_CHANGED:
    'The source workspace was replaced. This evidence stays with its original generation.',
  SOURCE_UNAVAILABLE:
    'The original source is unavailable. Keep the evidence and retry its approved connection.',
  WORKSPACE_UNAVAILABLE:
    'The original workspace is unavailable. No other workspace will be substituted.',
  REVIEWS_UNSUPPORTED:
    'This host does not support Reviews. Update the source host before retrying.',
  REVIEW_ID_REUSED:
    'The host has different evidence under this UUID. Both versions are preserved; no overwrite was attempted.',
  RECEIPT_CONFLICT:
    'The host receipt differs from the frozen evidence. No local evidence was replaced.',
  INVALID_RECEIPT:
    'The host response could not confirm this evidence. Sync now retries the same UUID and body.',
  RESOURCE_NOT_FOUND:
    'The original target is unavailable. Evidence is retained; no new target was chosen.',
  REVIEW_NOT_FOUND:
    'The acknowledged Review is no longer available on its source. Its receipt and evidence are retained.',
  REVIEW_LIMIT:
    'The host Review limit was reached. Retain this capture and retry after managing the host inbox.',
  REVIEW_CONFLICT:
    'The host Review state conflicts. Refresh with Sync now; Android does not overwrite desktop triage.',
  HOST_BUSY: 'The host is busy. Foreground catch-up will retry safely.',
  HOST_UNAVAILABLE:
    'The source is not reachable. Foreground catch-up retries; Sync now can retry sooner.',
  REQUEST_REJECTED:
    'The source refused this submission. Evidence remains protected for inspection.',
};
export function deliveryExplanation(item: CaptureItem) {
  const d = item.delivery;
  const reason = d?.reason ? reasons[d.reason] || reasons.REQUEST_REJECTED : '';
  if (d?.uncertain)
    return `${reason} A prior request may have arrived; retry uses the same frozen identity.`;
  return (
    reason ||
    (d?.state === 'synced'
      ? 'Desktop triage is read-only here. Original resources and captured evidence are unchanged.'
      : 'Protected locally. Delivery uses only its approved original host, workspace and generation.')
  );
}

export function receiptContext(item: CaptureItem) {
  const r = item.delivery?.receipt;
  if (!r) return '';
  if (
    ['missing', 'deleting', 'trashed'].includes(r.availability || '') ||
    r.attachment === 'unavailable'
  )
    return 'Original target unavailable · captured evidence retained';
  if (r.attachment === 'changed')
    return 'Source changed · captured evidence retained';
  if (r.attachment === 'unverified')
    return 'Attachment unverified · original evidence retained';
  return '';
}
