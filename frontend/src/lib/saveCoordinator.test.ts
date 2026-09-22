import { expect, it } from 'vitest';
import { SaveCoordinator } from './saveCoordinator';
it('serializes writes and preserves edits made during an in-flight save', async () => {
  const writes: string[] = []; let release!: () => void;
  const coordinator = new SaveCoordinator<string>(async (_id, value) => {
    writes.push(value); if (writes.length === 1) await new Promise<void>(resolve => { release = resolve; });
  }, () => {});
  coordinator.enqueue('a', 'first', 10000);
  const pending = coordinator.flush('a');
  coordinator.enqueue('a', 'last', 10000);
  release(); await pending; await coordinator.flushAll();
  expect(writes).toEqual(['first', 'last']); expect(coordinator.dirty()).toBe(false);
});
it('retains failed data for retry', async () => {
  let fail = true;
  const coordinator = new SaveCoordinator(async () => { if (fail) throw new Error('offline'); }, () => {});
  coordinator.enqueue('a', 'draft', 10000);
  await expect(coordinator.flushAll()).rejects.toThrow('offline');
  expect(coordinator.status('a')).toBe('failed'); expect(coordinator.dirty()).toBe(true);
  fail = false; await coordinator.flushAll(); expect(coordinator.status('a')).toBe('saved');
});
