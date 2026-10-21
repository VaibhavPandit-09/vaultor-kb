import { deliveryLabel, deliveryExplanation } from '../src/reviewDelivery';
import type { CaptureItem } from '../src/reviews';
const capture = {
  state: 'queued',
  body: { comment: 'immutable' },
} as CaptureItem;
test('delivery and desktop triage remain separate; uncertain sends never claim failure or success', () => {
  expect(deliveryLabel(capture)).toBe('Queued on this phone');
  const unknown = {
    ...capture,
    delivery: { state: 'unknown', uncertain: true, reason: 'HOST_UNAVAILABLE' },
  } as CaptureItem;
  expect(deliveryLabel(unknown)).toBe('Queued · delivery unconfirmed');
  expect(deliveryExplanation(unknown)).toContain('same frozen identity');
  const synced = {
    ...capture,
    delivery: { state: 'synced', receipt: { status: 'resolved' } },
  } as CaptureItem;
  expect(deliveryLabel(synced)).toBe('Synced · Resolved');
  expect(synced.body).toBe(capture.body);
});
test('replacement and identity reuse are actionable without offering retargeting or overwrite', () => {
  for (const reason of [
    'REVIEW_ID_REUSED',
    'REVIEW_GENERATION_CHANGED',
    'APPROVAL_REQUIRED',
  ]) {
    const item = {
      ...capture,
      delivery: { state: 'error', reason },
    } as CaptureItem;
    expect(deliveryLabel(item)).toBe('Needs attention');
    expect(deliveryExplanation(item).length).toBeGreaterThan(40);
  }
});
