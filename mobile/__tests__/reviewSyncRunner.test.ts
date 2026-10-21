import { ReviewSyncRunner } from '../src/reviewSyncRunner';
test('a capture arriving during a native snapshot gets one follow-up; requests coalesce', async () => {
  let finish!: () => void;
  const execute = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>(r => {
          finish = r;
        }),
    )
    .mockResolvedValue(undefined);
  const runner = new ReviewSyncRunner(execute);
  const first = runner.request('catchUp');
  await Promise.resolve();
  runner.request('catchUp');
  runner.request('refresh');
  runner.request('opportunity');
  expect(execute).toHaveBeenCalledTimes(1);
  finish();
  await first;
  expect(execute.mock.calls.map(v => v[0])).toEqual(['catchUp', 'opportunity']);
});
test('manual retry has priority and shutdown does not start deferred work', async () => {
  let finish!: () => void;
  const execute = jest.fn(
    () =>
      new Promise<void>(r => {
        finish = r;
      }),
  );
  const runner = new ReviewSyncRunner(execute);
  const running = runner.request('catchUp');
  await Promise.resolve();
  runner.request('now');
  runner.request('catchUp');
  runner.stop();
  finish();
  await running;
  await runner.request('now');
  expect(execute).toHaveBeenCalledTimes(1);
});
