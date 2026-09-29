// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { PaneNavigation, ResourceUnavailableError } from './paneNavigation';
import type { Resource } from '../types';
const note = (id: string) => ({ id, title: id, type: 'note', content: '{}' } as Resource);
function setup() {
  const dep = { load: vi.fn(async (id: string) => note(id)), save: vi.fn(async (_id: string) => {}), preview: vi.fn(), committed: vi.fn(), max: 3, behavior: 'split' as 'split' | 'replace' };
  return { dep, nav: new PaneNavigation(() => dep) };
}
describe('pane navigation commits', () => {
  it('linked replacement leaves other panes intact and permits duplicate views', async () => {
    const { nav, dep } = setup(); await nav.open('A'); const first = nav.snapshot().activePaneId!; await nav.open('B'); const second = nav.snapshot().activePaneId!;
    await nav.open('B', { sourcePaneId: first, intent: 'link', destination: 'here' });
    expect(nav.snapshot().panes.map(p => [p.paneId, p.id])).toEqual([[first, 'B'], [second, 'B']]);
    expect(dep.save.mock.calls).toEqual([['A']]); expect(nav.snapshot().panes[0].history.map(v => v.resourceId)).toEqual(['A', 'B']);
    nav.activate(second); expect(nav.snapshot().panes[0].history.map(v => v.resourceId)).toEqual(['A', 'B']);
  });
  it('does not evict at capacity and supports explicit open here', async () => {
    const { nav, dep } = setup(); dep.max = 1; await nav.open('A');
    const pane = nav.snapshot().activePaneId!;
    await nav.open('B', { sourcePaneId: pane, destination: 'new', intent: 'link' });
    expect(nav.snapshot().panes[0].id).toBe('A'); expect(nav.snapshot().issue?.limit).toBe(true); expect(dep.save).not.toHaveBeenCalled();
    await nav.open('B', { ...nav.snapshot().issue!.options, destination: 'here' });
    expect(nav.snapshot().panes[0].id).toBe('B');
  });
  it('keeps note and journey on failed saves and retries only that note', async () => {
    const { nav, dep } = setup(); await nav.open('A'); dep.save.mockRejectedValueOnce(new Error('Save failed'));
    await nav.open('B', { intent: 'link' }); expect(nav.snapshot().panes[0].id).toBe('A'); expect(nav.snapshot().panes[0].history.map(v => v.resourceId)).toEqual(['A']);
    const issue = nav.snapshot().issue!; await nav.open(issue.id, issue.options); expect(nav.snapshot().panes[0].id).toBe('B');
  });
  it('discards superseded loads and never commits after workspace reset', async () => {
    const { nav, dep } = setup(); await nav.open('A'); let finish!: (r: Resource) => void;
    dep.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const slow = nav.open('B', { intent: 'link' }); await nav.open('C', { intent: 'link' }); finish(note('B')); await slow;
    expect(nav.snapshot().panes[0].id).toBe('C');
    dep.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); const abandoned = nav.open('D', { intent: 'link' }); nav.reset(); finish(note('D')); await abandoned;
    expect(nav.snapshot().panes).toEqual([]);
  });
  it('previews files without saving, changing panes or adding history', async () => {
    const { nav, dep } = setup(); await nav.open('A'); const before = nav.snapshot().panes;
    dep.load.mockResolvedValueOnce({ ...note('file'), type: 'file' });
    await nav.open('file', { intent: 'link', destination: 'new' }); expect(nav.snapshot().panes).toBe(before); expect(dep.save).not.toHaveBeenCalled(); expect(dep.preview).toHaveBeenCalledWith(expect.objectContaining({ id: 'file' }), before[0].paneId);
  });
  it('direct replace affects only focused pane and starts a new trail', async () => {
    const { nav, dep } = setup(); await nav.open('A'); await nav.open('B'); dep.behavior = 'replace'; await nav.open('C');
    expect(nav.snapshot().panes.map(p => p.id)).toEqual(['A', 'C']); expect(nav.snapshot().panes[1].history.map(v => v.resourceId)).toEqual(['C']);
  });
  it('history stays in its pane and close saves only the departing note', async () => {
    const { nav, dep } = setup(); await nav.open('A'); await nav.open('B', { intent: 'link' }); await nav.history(-1);
    expect(nav.snapshot().panes).toHaveLength(1); expect(nav.snapshot().panes[0].id).toBe('A');
    dep.save.mockClear(); await nav.close(nav.snapshot().activePaneId!); expect(dep.save.mock.calls).toEqual([['A']]); expect(nav.snapshot().panes).toHaveLength(0);
  });
});

it('failed close stays retryable and successful retry clears the error', async () => {
  const { nav, dep } = setup(); await nav.open('A'); const paneId = nav.snapshot().activePaneId!;
  dep.save.mockRejectedValueOnce(new Error('Save failed')); await nav.close(paneId);
  expect(nav.snapshot().panes).toHaveLength(1); expect(nav.snapshot().issue?.closePaneId).toBe(paneId);
  await nav.close(paneId); expect(nav.snapshot().panes).toHaveLength(0); expect(nav.snapshot().issue).toBeNull();
});

it('an outstanding navigation cannot steal focus back from another pane', async () => {
  const { nav, dep } = setup(); await nav.open('A'); const a = nav.snapshot().activePaneId!; await nav.open('B'); const b = nav.snapshot().activePaneId!;
  nav.activate(a); let resolve!: (value: Resource) => void;
  dep.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = nav.open('C', { sourcePaneId: a, intent: 'link' }); nav.activate(b); resolve(note('C')); await pending;
  expect(nav.snapshot().panes[0].id).toBe('C'); expect(nav.snapshot().activePaneId).toBe(b); expect(dep.committed).toHaveBeenLastCalledWith('C', false);
});

it('records link cycles as distinct visits, restores positions, and branches after jumping', async () => {
  const { nav } = setup(); await nav.open('A'); const paneId = nav.snapshot().activePaneId!;
  const first = nav.snapshot().panes[0].history[0]; nav.recordPosition(paneId, first.visitId, { scrollTop: 400, scrollLeft: 12, selection: { from: 3, to: 5 } });
  await nav.open('B', { intent: 'link' }); await nav.open('A', { intent: 'link' });
  const history = nav.snapshot().panes[0].history; expect(history.map(v => v.resourceId)).toEqual(['A', 'B', 'A']); expect(history[0].visitId).not.toBe(history[2].visitId);
  nav.recordPosition(paneId, history[2].visitId, { scrollTop: 800 });
  await nav.jump(paneId, 0); expect(nav.snapshot().panes[0].selection).toEqual({ from: 3, to: 5 }); expect(nav.position(first.visitId).scrollTop).toBe(400);
  expect(nav.snapshot().panes[0].history).toHaveLength(3);
  await nav.open('C', { intent: 'link' }); expect(nav.snapshot().panes[0].history.map(v => v.resourceId)).toEqual(['A', 'C']);
  expect(nav.position(history[2].visitId).scrollTop).toBe(0);
});
it('copies journeys and positions independently into a new linked pane', async () => {
  const { nav } = setup(); await nav.open('A'); const source = nav.snapshot().panes[0];
  nav.recordPosition(source.paneId, source.history[0].visitId, { scrollTop: 123 });
  await nav.open('B', { intent: 'link', destination: 'new' }); const target = nav.snapshot().panes[1];
  expect(target.history[0].visitId).not.toBe(source.history[0].visitId); expect(nav.position(target.history[0].visitId).scrollTop).toBe(123);
  await nav.jump(target.paneId, 0); nav.recordPosition(target.paneId, target.history[0].visitId, { scrollTop: 555 });
  expect(nav.position(source.history[0].visitId).scrollTop).toBe(123);
});
it('retains renamed and deleted journey steps without previewing or navigating elsewhere', async () => {
  const { nav, dep } = setup(); await nav.open('A'); await nav.open('B', { intent: 'link' }); const paneId = nav.snapshot().activePaneId!;
  nav.rename('A', 'Renamed'); expect(nav.snapshot().panes[0].history[0].title).toBe('Renamed');
  dep.load.mockRejectedValueOnce(new ResourceUnavailableError('Missing'));
  await nav.jump(paneId, 0); expect(nav.snapshot().panes[0].id).toBe('B'); expect(nav.snapshot().panes[0].history[0].unavailable).toBe(true);
  dep.load.mockClear(); await nav.jump(paneId, 0); expect(dep.load).not.toHaveBeenCalled(); expect(dep.preview).not.toHaveBeenCalled();
});
it('bounds visits at 200 and self-links do not add a step', async () => {
  const { nav } = setup(); await nav.open('A'); await nav.open('A', { intent: 'link' }); expect(nav.snapshot().panes[0].history).toHaveLength(1);
  for (let i = 0; i < 205; i++) await nav.open('note-' + i, { intent: 'link' });
  expect(nav.snapshot().panes[0].history).toHaveLength(200); expect(nav.snapshot().panes[0].cursor).toBe(199);
  expect(nav.snapshot().panes[0].history[0].resourceId).toBe('note-5');
});
it('transient failures do not mark a step unavailable or change cursor', async () => {
  const { nav, dep } = setup(); await nav.open('A'); await nav.open('B', { intent: 'link' }); dep.load.mockRejectedValueOnce(new Error('Offline'));
  await nav.history(-1); expect(nav.snapshot().panes[0].cursor).toBe(1); expect(nav.snapshot().panes[0].history[0].unavailable).toBeUndefined();
});
