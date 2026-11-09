import { afterEach, expect, it, vi } from 'vitest';
import { EditingSession } from './editing';
import { command, type Note } from './client';
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{type:'text',text}] }] });
const note = (): Note => ({id:'a',title:'Test',revision:1,content:doc('saved')});
afterEach(() => vi.useRealTimers());
it('captures once for a burst, protects before commit and performs no idle polling',async()=>{
  vi.useFakeTimers(); const calls: string[]=[]; const capture=vi.fn(()=>doc('draft'));
  const invoke=vi.fn(async(r:{kind:string})=>{calls.push(r.kind);return {revision:2};});
  const changed=vi.fn(),s=new EditingSession(changed,()=>{},invoke as unknown as typeof command);s.adopt(note());
  for(let i=0;i<20;i++)s.edit('a',{capture});
  expect(capture).not.toHaveBeenCalled();expect(changed).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(260);expect(capture).toHaveBeenCalledTimes(1);expect(s.status('a')).toBe('draft protected');
  s.releaseViews();capture.mockImplementation(()=>{throw Error('Editor destroyed');});
  await s.flushAll();expect(calls).toEqual(['draft','save']);expect(s.status('a')).toBe('saved');
  await vi.advanceTimersByTimeAsync(300000);expect(calls).toEqual(['draft','save']);
});
it('keeps a second edit made during an in-flight save and uses its new revision',async()=>{
  vi.useFakeTimers();let release!:()=>void;const revisions:number[]=[];let saving=0;
  const invoke=vi.fn(async(r:{kind:string;revision?:number})=>{if(r.kind==='save'){revisions.push(r.revision!);if(++saving===1)await new Promise<void>(r=>release=r);return {revision:r.revision!+1};}return {};});
  const s=new EditingSession(()=>{},()=>{},invoke as unknown as typeof command);s.adopt(note());s.edit('a',{capture:()=>doc('first')});
  const first=s.flushAll();await vi.waitFor(()=>expect(release).toBeDefined());
  s.edit('a',{capture:()=>doc('last')});s.releaseViews();const protection=s.protect('a');release();await first;await protection;
  expect(revisions).toEqual([1,2]);expect(s.get('a')?.content).toEqual(doc('last'));expect(s.status('a')).toBe('saved');
});
it('retains protected conflicts, allows parking and never retries a stale save silently',async()=>{
  vi.useFakeTimers();const conflict=vi.fn();const calls:string[]=[];
  const invoke=vi.fn(async(r:{kind:string})=>{calls.push(r.kind);if(r.kind==='save')throw Error('Note revision conflict');return {};});
  const s=new EditingSession(()=>{},conflict,invoke as unknown as typeof command);s.adopt(note());s.edit('a',{capture:()=>doc('mine')});
  await expect(s.flushAll()).rejects.toThrow('revision conflict');expect(s.status('a')).toBe('conflict');expect(conflict).toHaveBeenCalledWith('a');
  await expect(s.flushAll()).rejects.toThrow('Saved version changed');expect(calls).toEqual(['draft','save']);
  await s.park('a');expect(s.get('a')).toBeUndefined();expect(calls).not.toContain('discardDraft');
});
it('does not discard an old durable draft after protection failure',async()=>{
  vi.useFakeTimers();const invoke=vi.fn(async()=>{throw Error('disk full');});
  const s=new EditingSession(()=>{},()=>{},invoke as unknown as typeof command);s.adopt(note());s.edit('a',{capture:()=>doc('unsent')});
  await expect(s.flushAll()).rejects.toThrow('disk full');expect(s.dirty('a')).toBe(true);expect(s.status('a')).toBe('failed');
});
