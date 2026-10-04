// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {watchChanges,rememberMutation,validChange} from './changeFeed';
import {openConnectionStream} from './platform';
vi.mock('./platform',()=>({openConnectionStream:vi.fn()}));
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
const event=(kind='resources',ids=['note'],requestId='')=>({cursor:'12345678-abcd-abcd-abcd-123456789abc:1',kind,ids,requestId,at:Date.now()});
it('validates bounded metadata without accepting unknown kinds',()=>{
  expect(validChange(event())).toBe(true);expect(validChange({...event(),ids:Array(101).fill('note')})).toBe(false);expect(validChange(event('execute-command'))).toBe(false);
});
it('broadens a large batch rather than losing resource invalidations',async()=>{
  vi.useFakeTimers();let receive!:(data:unknown)=>void;vi.mocked(openConnectionStream).mockImplementation(async(_p,_s,fn)=>{receive=fn;return {close:vi.fn()};});
  const sink=vi.fn(),controller=new AbortController();const stop=watchChanges(sink,controller.signal);await Promise.resolve();
  receive(event('resources',Array.from({length:100},(_,i)=>String(i))));receive(event('resources',['extra']));await vi.advanceTimersByTimeAsync(260);
  expect(sink.mock.calls[0][0][0].ids).toEqual([]);controller.abort();stop();
});
it('coalesces remote mutations, skips self writes, and cancels pending refresh on switch',async()=>{
  vi.useFakeTimers();let receive!:(data:unknown)=>void;const close=vi.fn();vi.mocked(openConnectionStream).mockImplementation(async(_p,_s,fn)=>{receive=fn;return {close};});
  const sink=vi.fn(),controller=new AbortController(),stop=watchChanges(sink,controller.signal);await Promise.resolve();
  rememberMutation('mine');receive(event('resources',['self'],'mine'));receive(event('resources',['a']));receive(event('resources',['b']));await vi.advanceTimersByTimeAsync(260);
  expect(sink).toHaveBeenCalledTimes(1);expect(sink.mock.calls[0][0][0].ids).toEqual(['a','b']);
  receive(event());controller.abort();stop();await vi.advanceTimersByTimeAsync(260);expect(sink).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalled();
});
it('a broad invalidation remains broad and reconnect resumes from the last cursor',async()=>{
  vi.useFakeTimers();let receive!:(data:unknown)=>void;vi.mocked(openConnectionStream).mockImplementation(async(_p,_s,fn)=>{receive=fn;return {close:vi.fn()};});
  const sink=vi.fn(),controller=new AbortController();const stop=watchChanges(sink,controller.signal);await Promise.resolve();
  receive(event('resources',[]));receive(event('resources',['b']));await vi.advanceTimersByTimeAsync(260);expect(sink.mock.calls[0][0][0].ids).toEqual([]);
  receive({kind:'disconnected'});await vi.advanceTimersByTimeAsync(1500);expect(openConnectionStream).toHaveBeenLastCalledWith('/changes?cursor='+encodeURIComponent(event().cursor),controller.signal,expect.any(Function));
  controller.abort();stop();
});
