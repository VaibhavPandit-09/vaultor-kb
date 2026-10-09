import { backIntent, QuickAccess } from '../src/navigation';

const base = {
  transient: false,
  keyboard: false,
  editing: false,
  view: 'note' as const,
  cursor: 2,
  collection: false,
};
test('Back dismisses tools/IME before editing, journey and browsing', () => {
  expect(
    backIntent({ ...base, transient: true, keyboard: true, editing: true }),
  ).toBe('dismiss');
  expect(backIntent({ ...base, keyboard: true, editing: true })).toBe(
    'keyboard',
  );
  expect(backIntent({ ...base, editing: true })).toBe('read');
  expect(backIntent(base)).toBe('history');
  expect(backIntent({ ...base, cursor: 0 })).toBe('browse');
  expect(backIntent({ ...base, view: 'browse', collection: true })).toBe(
    'library',
  );
  expect(backIntent({ ...base, view: 'browse' })).toBe('home');
  expect(backIntent({ ...base, view: 'home' })).toBe('exit');
});
test('quick access uses mixed bounded sequential queries and retains rows on failure', async () => {
  const load = jest
    .fn()
    .mockResolvedValueOnce({
      items: [{ id: 'recent-file' }, { id: 'recent-note' }],
    })
    .mockResolvedValueOnce({ items: [{ id: 'pin-collection' }] });
  const feed = new QuickAccess(load, jest.fn());
  feed.bind('a');
  await feed.refresh();
  expect(load.mock.calls.map(c => c[0])).toEqual([
    '/resources?page=0&size=12&q=&sort=recent',
    '/organization/pins?page=0&size=12&q=',
  ]);
  expect(feed.state.recent.map(r => r.id)).toEqual([
    'recent-file',
    'recent-note',
  ]);
  load.mockRejectedValueOnce(Error('offline'));
  await feed.refresh();
  expect(feed.state.recent).toHaveLength(2);
  expect(feed.state.pinned).toHaveLength(1);
  expect(feed.state.error).toBe('offline');
});
test('hidden/superseded quick access cannot publish or start its next query', async () => {
  let finish!: (page: any) => void;
  const load = jest.fn(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const cancel = jest.fn(),
    feed = new QuickAccess(load, cancel);
  feed.bind('a');
  const pending = feed.refresh();
  feed.suspend();
  finish({ items: [{ id: 'stale' }] });
  await pending;
  expect(feed.state.recent).toEqual([]);
  expect(load).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalled();
  const next = feed.refresh();
  feed.bind('b');
  finish({ items: [{ id: 'other-workspace' }] });
  await next;
  expect(feed.state.recent).toEqual([]);
  expect(feed.state.pinned).toEqual([]);
});
test('quick access refuses unbounded pages and retries with the same contract', async () => {
  const load = jest.fn().mockResolvedValueOnce({ items: Array(13).fill({}) });
  const feed = new QuickAccess(load, jest.fn());
  feed.bind('a');
  await feed.refresh();
  expect(feed.state.error).toContain('Invalid');
  expect(feed.state.recent).toHaveLength(0);
  load.mockResolvedValue({ items: [] });
  await feed.refresh();
  expect(feed.state.error).toBe('');
  expect(feed.state.loading).toBe(false);
});
