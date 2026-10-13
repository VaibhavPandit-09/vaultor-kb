import { ReaderFeed } from '../src/readerFeed';
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
function setup() {
  const port = {
    start: jest.fn(async (_cursor: string) => {}),
    stop: jest.fn(),
    reconnect: jest.fn(async () => {}),
    reconcile: jest.fn(async () => {}),
    error: jest.fn(),
  };
  return { port, feed: new ReaderFeed(port) };
}
test('reset and normal saved events reconcile without reopening a reset stream loop', async () => {
  const { port, feed } = setup();
  feed.start();
  feed.receive({ event: { kind: 'reset', cursor: 'c1' } });
  await jest.advanceTimersByTimeAsync(300);
  feed.receive({ event: { kind: 'resources', cursor: 'c2' } });
  await jest.advanceTimersByTimeAsync(300);
  expect(port.start).toHaveBeenCalledTimes(1);
  expect(port.reconnect).not.toHaveBeenCalled();
  expect(port.reconcile).toHaveBeenCalledTimes(2);
  feed.dispose();
});
test('closure resumes from cursor; background/disposal cancel queued reconnection', async () => {
  const { port, feed } = setup();
  feed.start();
  feed.receive({ event: { kind: 'resources', cursor: 'c7' } });
  await jest.advanceTimersByTimeAsync(300);
  feed.receive({ closed: true });
  await jest.advanceTimersByTimeAsync(1000);
  expect(port.reconnect).toHaveBeenCalledTimes(1);
  expect(port.start).toHaveBeenLastCalledWith('c7');
  feed.receive({ closed: true });
  feed.foreground(false);
  await jest.advanceTimersByTimeAsync(30000);
  expect(port.reconnect).toHaveBeenCalledTimes(1);
  feed.foreground(true);
  await jest.advanceTimersByTimeAsync(1);
  expect(port.reconnect).toHaveBeenCalledTimes(2);
  feed.dispose();
  feed.receive({ closed: true });
  await jest.advanceTimersByTimeAsync(30000);
  expect(port.reconnect).toHaveBeenCalledTimes(2);
});
