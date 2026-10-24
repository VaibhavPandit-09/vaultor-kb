// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { PaneNavigation, ResourceUnavailableError } from './paneNavigation';
import type { Resource } from '../types';
const note = (id: string) => ({ id, title: id, type: 'note', content: '{}' } as Resource);
function setup() {
  const dep = { load: vi.fn(async (id: string) => note(id)), save: vi.fn(async (_id: string) => {void _id;}), preview: vi.fn(), committed: vi.fn(), max: 3, behavior: 'replace' as 'fill' | 'replace' };
  return { dep, nav: new PaneNavigation(() => dep) };
}
describe('pane navigation commits', () => {
  it('retains unavailable visits and reading positions and resolves them after restore',async()=>{
    const {nav}=setup();await nav.open('A');const pane=nav.snapshot().panes[0];
    nav.recordPosition(pane.paneId,pane.history[0].visitId,{scrollTop:123,selection:{from:2,to:2}});
    await nav.open('B',{sourcePaneId:pane.paneId,intent:'link',destination:'here'});
    nav.markUnavailable('A');await nav.jump(pane.paneId,0);expect(nav.snapshot().panes[0].id).toBe('B');
    nav.markAvailable('A');await nav.jump(pane.paneId,0);expect(nav.snapshot().panes[0].id).toBe('A');
    expect(nav.position(pane.history[0].visitId)).toMatchObject({scrollTop:123,selection:{from:2,to:2}});
  });
  it('keeps an unknown resource identifiable without previewing it or leaving the source', async () => {
    const {nav,dep}=setup();await nav.open('A');
    dep.load.mockResolvedValueOnce({...note('unknown'),type:'future'});
    await nav.open('unknown',{intent:'link'});
    expect(nav.snapshot().panes[0].id).toBe('A');
    expect(nav.snapshot().issue?.message).toContain('not supported');
    expect(dep.preview).not.toHaveBeenCalled();expect(dep.save).not.toHaveBeenCalled();
  });
  it('a linked destination already visible focuses its existing session', async () => {
    const { nav, dep } = setup(); await nav.open('A'); const first = nav.snapshot().activePaneId!; await nav.open('B', {destination:'new'}); const second = nav.snapshot().activePaneId!;
    await nav.open('B', { sourcePaneId: first, intent: 'link', destination: 'here' });
    expect(nav.snapshot().panes.map(p => [p.paneId, p.id])).toEqual([[first, 'A'], [second, 'B']]);
    expect(dep.save).not.toHaveBeenCalled(); expect(nav.snapshot().activePaneId).toBe(second); expect(nav.snapshot().panes[0].history.map(v => v.resourceId)).toEqual(['A']);
    nav.activate(second); expect(nav.snapshot().panes[0].history.map(v => v.resourceId)).toEqual(['A']);
  });
  it('reuses the focused slot at capacity without a replacement confirmation', async () => {
    const { nav, dep } = setup(); dep.max = 1; await nav.open('A');
    const pane = nav.snapshot().activePaneId!;
    await nav.open('B', { sourcePaneId: pane, destination: 'new', intent: 'link' });
    expect(nav.snapshot().issue).toBeNull(); expect(dep.save).toHaveBeenCalledWith('A');
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
    const { nav, dep } = setup(); await nav.open('A'); await nav.open('B', {destination:'new'}); dep.behavior = 'replace'; await nav.open('C');
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
  const { nav, dep } = setup(); await nav.open('A'); const a = nav.snapshot().activePaneId!; await nav.open('B', {destination:'new'}); const b = nav.snapshot().activePaneId!;
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

describe('open sessions independent of visible panes', () => {
  it.each([1, 2, 3])('opens seven notes with %i occupied panes without an ordinary capacity prompt', async maximum => {
    const {nav, dep} = setup(); dep.max = maximum;
    for (let i=0; i<maximum; i++) await nav.open('note-'+i, {destination:'new'});
    for (let i=maximum; i<7; i++) await nav.open('note-'+i);
    expect(nav.snapshot().sessions).toHaveLength(7);
    expect(nav.snapshot().panes).toHaveLength(maximum);
    expect(nav.snapshot().panes.at(-1)?.id).toBe('note-6');
    expect(nav.snapshot().issue).toBeNull();
  });
  it('switches back to a hidden session without resetting journey or positions', async () => {
    const {nav}=setup(); await nav.open('A'); await nav.open('B', {intent:'link'});
    const session = nav.snapshot().panes[0], entry = session.history[1];
    nav.recordPosition(session.paneId, entry.visitId, {scrollTop:333, selection:{from:3,to:4}});
    await nav.open('C'); await nav.open('B'); await nav.open('B');
    expect(nav.snapshot().panes[0]).toMatchObject({paneId:session.paneId, history:session.history, cursor:1});
    expect(nav.position(entry.visitId)).toMatchObject({scrollTop:333});
    await nav.history(-1); expect(nav.snapshot().panes[0].id).toBe('A');
    await nav.history(1); expect(nav.snapshot().panes[0].id).toBe('B');
  });
  it('closes inactive and active sessions with a deterministic last-opened fallback', async () => {
    const {nav}=setup(); for (const id of ['A','B','C','D']) await nav.open(id);
    await nav.closeSession(nav.snapshot().sessions[1].paneId);
    expect(nav.snapshot().panes[0].id).toBe('D');
    await nav.closeSession(nav.snapshot().activePaneId!);
    expect(nav.snapshot().panes[0].id).toBe('C');
    expect(nav.snapshot().sessions.map(p=>p.id)).toEqual(['A','C']);
    await nav.closeOthers(nav.snapshot().activePaneId!); expect(nav.snapshot().sessions.map(p=>p.id)).toEqual(['C']);
    await nav.closeOthers(); expect(nav.snapshot().sessions).toEqual([]); expect(nav.snapshot().activePaneId).toBeNull();
  });
  it('closing a viewing pane preserves its complete session and allows explicit reopening', async () => {
    const {nav}=setup(); await nav.open('A'); await nav.open('B', {intent:'link'});
    const session=nav.snapshot().panes[0]; await nav.close(session.paneId);
    expect(nav.snapshot().panes).toHaveLength(0); expect(nav.snapshot().sessions[0].history).toEqual(session.history);
    await nav.open('B'); expect(nav.snapshot().panes[0].history).toEqual(session.history);
  });
  it.each(['active','inactive'])('reconciles a confirmed %s deletion and does not reopen on restore', async kind => {
    const {nav}=setup(); await nav.open('A'); await nav.open('B');
    nav.markUnavailable(kind === 'active' ? 'B' : 'A');
    expect(nav.snapshot().sessions.map(p=>p.id)).toEqual([kind === 'active' ? 'A' : 'B']);
    expect(nav.snapshot().panes).toHaveLength(1);
    nav.markAvailable('A'); nav.markAvailable('B'); expect(nav.snapshot().sessions).toHaveLength(1);
    await nav.open(kind === 'active' ? 'B' : 'A'); expect(nav.snapshot().sessions).toHaveLength(2);
  });
  it('keeps unavailable history references but removes every active instance, including permanent deletion', async () => {
    const {nav}=setup(); await nav.open('A'); await nav.open('B',{intent:'link'}); await nav.open('A',{destination:'new'});
    nav.markUnavailable('A'); nav.markUnavailable('A');
    expect(nav.snapshot().sessions.map(p=>p.id)).toEqual(['B']);
    expect(nav.snapshot().sessions[0].history[0].unavailable).toBe(true);
    nav.markUnavailable('B'); expect(nav.snapshot().panes).toEqual([]); expect(nav.snapshot().activePaneId).toBeNull();
  });
  it('does not resurrect a deleted resource from a stale load', async () => {
    const {nav,dep}=setup(); await nav.open('A'); let finish!:(r:Resource)=>void;
    dep.load.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const opening=nav.open('B'); nav.markUnavailable('B'); finish(note('B')); await opening;
    expect(nav.snapshot().sessions.map(p=>p.id)).toEqual(['A']);
  });
  it('a failed unsaved departure keeps both session and editor assignment intact', async () => {
    const {nav,dep}=setup(); await nav.open('A'); await nav.open('B');
    dep.save.mockRejectedValueOnce(new Error('Revision conflict; draft retained'));
    await nav.open('A'); expect(nav.snapshot().panes[0].id).toBe('B');
    expect(nav.snapshot().sessions).toHaveLength(2); expect(nav.snapshot().issue?.message).toContain('draft retained');
    await nav.open('A'); expect(nav.snapshot().panes[0].id).toBe('A');
  });
  it('deduplicates concurrent direct opens from different panes after their save barriers', async () => {
    const {nav,dep}=setup(); await nav.open('A'); await nav.open('B',{destination:'new'});
    const [a,b]=nav.snapshot().panes;
    const resolvers:(()=>void)[]=[]; dep.save.mockImplementation(()=>new Promise(resolve=>resolvers.push(resolve)));
    const first=nav.open('C',{sourcePaneId:a.paneId}), second=nav.open('C',{sourcePaneId:b.paneId});
    await Promise.resolve(); resolvers.forEach(resolve=>resolve()); await Promise.all([first,second]);
    expect(nav.snapshot().sessions.filter(p=>p.id==='C')).toHaveLength(1);
    expect(nav.snapshot().panes.filter(p=>p.id==='C')).toHaveLength(1);
  });
  it('rapid opening and switching retains one session per direct destination', async () => {
    const {nav}=setup(); await nav.open('A');
    await Promise.all(['B','C','D','E','F'].map(id=>nav.open(id)));
    expect(nav.snapshot().panes[0].id).toBe('F');
    await Promise.all(['A','F','A','F'].map(id=>nav.open(id)));
    expect(nav.snapshot().panes[0].id).toBe('F'); expect(nav.snapshot().sessions).toHaveLength(2);
  });
});
