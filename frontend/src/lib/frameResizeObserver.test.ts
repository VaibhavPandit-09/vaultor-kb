// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {frameResizeObserver} from './frameResizeObserver';
it('coalesces observer deliveries outside delivery phase and cancels pending writes on disposal',()=>{
 let delivery=()=>{};let frame:FrameRequestCallback|undefined;
 vi.stubGlobal('ResizeObserver',class{constructor(callback:()=>void){delivery=callback;}observe(){}disconnect(){}});
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frame=callback;return 1;});const cancel=vi.fn();vi.stubGlobal('cancelAnimationFrame',cancel);
 const write=vi.fn(),observer=frameResizeObserver(write);observer.observe(document.body);delivery();delivery();expect(write).not.toHaveBeenCalled();frame!(0);expect(write).toHaveBeenCalledOnce();
 delivery();observer.disconnect();expect(cancel).toHaveBeenCalledWith(1);vi.unstubAllGlobals();
});
it('reads each delivered geometry before a coalesced frame write',()=>{
 let delivery=()=>{};let frame:FrameRequestCallback|undefined;
 vi.stubGlobal('ResizeObserver',class{constructor(callback:()=>void){delivery=callback;}observe(){}disconnect(){}});
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frame=callback;return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const events:string[]=[],observer=frameResizeObserver(()=>events.push('write'),()=>events.push('read'));
 observer.observe(document.body);delivery();delivery();expect(events).toEqual(['read','read']);frame!(0);expect(events).toEqual(['read','read','write']);observer.disconnect();vi.unstubAllGlobals();
});
