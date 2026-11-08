import {afterEach,expect,it,vi} from 'vitest';
import {DragHoverLease,type DragFeedback} from './dragHover';
afterEach(()=>vi.useRealTimers());
it('one hover lease resets for movement/target changes and revokes asynchronous admission on cancellation',async()=>{
 vi.useFakeTimers();const states:DragFeedback[]=[],hover=new DragHoverLease(state=>states.push(state));let admission:()=>boolean=()=>false;let finish!:()=>void;const action=vi.fn(async(valid:()=>boolean)=>{admission=valid;await new Promise<void>(resolve=>{finish=resolve;});});
 hover.enter('a',10,10,'A',action);await vi.advanceTimersByTimeAsync(600);hover.enter('a',30,10,'A',action);await vi.advanceTimersByTimeAsync(400);expect(action).not.toHaveBeenCalled();hover.enter('b',30,10,'B',action);await vi.advanceTimersByTimeAsync(900);expect(action).toHaveBeenCalledOnce();expect(admission()).toBe(true);hover.leave('b');expect(admission()).toBe(false);finish();await Promise.resolve();expect(states.at(-1)?.phase).toBe('discovering');hover.clear();
});
it('a completed hover fires once; clearing removes timers and stale failures',async()=>{
 vi.useFakeTimers();const states:DragFeedback[]=[],hover=new DragHoverLease(state=>states.push(state)),action=vi.fn(async()=>{});hover.enter('a',0,0,'A',action,'Ready A');await vi.advanceTimersByTimeAsync(900);hover.enter('a',0,0,'A',action);await vi.advanceTimersByTimeAsync(1200);expect(action).toHaveBeenCalledOnce();expect(states.at(-1)?.label).toBe('Ready A');hover.clear();hover.enter('b',0,0,'B',async()=>{throw Error('Late error');});hover.clear();await vi.advanceTimersByTimeAsync(2000);expect(states.some(state=>state.phase==='error')).toBe(false);
});
it('navigation failure is explicit and never reports a destination ready',async()=>{
 vi.useFakeTimers();const states:DragFeedback[]=[],hover=new DragHoverLease(state=>states.push(state));hover.enter('a',0,0,'A',async()=>{throw Error('Save failed; original pane retained');});await vi.advanceTimersByTimeAsync(900);expect(states.at(-1)).toMatchObject({phase:'error',label:'Save failed; original pane retained'});hover.clear();
});
