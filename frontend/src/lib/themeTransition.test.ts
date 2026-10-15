// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createThemeTransitionController,themeOriginAt} from './themeTransition';
function deferred(){let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
let controller:ReturnType<typeof createThemeTransitionController>;
let transitions:Array<{update:()=>void;ready:ReturnType<typeof deferred>;finished:ReturnType<typeof deferred>;skipTransition:ReturnType<typeof vi.fn>}>;
beforeEach(()=>{
 transitions=[];Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 Object.defineProperty(document,'startViewTransition',{configurable:true,value:vi.fn((update:()=>void)=>{const item={update,ready:deferred(),finished:deferred(),skipTransition:vi.fn()};transitions.push(item);return {ready:item.ready.promise,finished:item.finished.promise,skipTransition:item.skipTransition};})});
 Object.defineProperty(document.documentElement,'animate',{configurable:true,value:vi.fn(()=>({cancel:vi.fn()}))});
 document.documentElement.dataset.animation='smooth';controller=createThemeTransitionController();controller.apply('light');
});
afterEach(()=>{controller.dispose();transitions.forEach(item=>item.finished.resolve());vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();document.body.innerHTML='';document.documentElement.className='';delete document.documentElement.dataset.theme;delete document.documentElement.dataset.animation;delete (document as unknown as {startViewTransition?:unknown}).startViewTransition;delete (document as unknown as {getAnimations?:unknown}).getAnimations;delete (document as unknown as {fullscreenElement?:unknown}).fullscreenElement;delete (document.documentElement as unknown as {animate?:unknown}).animate;});
it('uses the trigger center and one complete radial snapshot without replacing focus, selection or scroll',async()=>{
 const trigger=document.createElement('button');vi.spyOn(trigger,'getBoundingClientRect').mockReturnValue({left:40,top:60,width:40,height:20} as DOMRect);expect(themeOriginAt(trigger)).toEqual({x:60,y:70});
 const input=document.createElement('input'),viewport=document.createElement('div');input.value='Selection';viewport.append(input);document.body.append(viewport);input.focus();input.setSelectionRange(2,6);viewport.scrollTop=180;
 controller.apply('dark',themeOriginAt(trigger));expect(document.documentElement.dataset.theme).toBe('light');transitions[0].update();expect(document.documentElement.dataset.theme).toBe('dark');transitions[0].ready.resolve();await flush();
 const [frames,options]=vi.mocked(document.documentElement.animate).mock.calls[0];expect((frames as Keyframe[])[0].clipPath).toBe('circle(0px at 60px 70px)');expect(options).toMatchObject({duration:380,pseudoElement:'::view-transition-new(root)'});
 expect(document.activeElement).toBe(input);expect(input.selectionStart).toBe(2);expect(input.selectionEnd).toBe(6);expect(viewport.scrollTop).toBe(180);expect(viewport.firstChild).toBe(input);
 transitions[0].finished.resolve();await flush();expect(document.documentElement.hasAttribute('data-theme-reveal')).toBe(false);
});
it('skips obsolete captures and prevents delayed callbacks or cleanup from overwriting a newer theme',async()=>{
 controller.apply('dark',{x:1,y:2});controller.apply('oled',{x:50,y:60});expect(transitions[0].skipTransition).toHaveBeenCalledOnce();transitions[0].update();expect(document.documentElement.dataset.theme).toBe('dark');
 transitions[1].update();transitions[0].finished.resolve();await flush();expect(document.documentElement.dataset.theme).toBe('oled');expect(document.documentElement.hasAttribute('data-theme-reveal')).toBe(true);
 controller.dispose();transitions[0].update();expect(document.documentElement.dataset.theme).toBe('oled');
});
it.each(['pointerdown','keydown','scroll','resize'])('keeps the requested theme and removes stale visuals on %s interruption',async event=>{
 controller.apply('dark',{x:2,y:3});transitions[0].update();transitions[0].ready.resolve();await flush();
 (event==='resize'?window:document).dispatchEvent(new Event(event));expect(document.documentElement.dataset.theme).toBe('dark');expect(document.documentElement.hasAttribute('data-theme-reveal')).toBe(false);expect(transitions[0].skipTransition).toHaveBeenCalledOnce();
});
it('uses immediate application for OS/programmatic, reduced, fullscreen and unsupported transitions',()=>{
 controller.apply('dark');expect(document.startViewTransition).not.toHaveBeenCalled();
 vi.stubGlobal('matchMedia',()=>({matches:true}));controller.apply('oled',{x:1,y:2});expect(document.startViewTransition).not.toHaveBeenCalled();
 vi.stubGlobal('matchMedia',()=>({matches:false}));Object.defineProperty(document,'fullscreenElement',{configurable:true,value:document.body});controller.apply('light',{x:1,y:2});expect(document.startViewTransition).not.toHaveBeenCalled();delete (document as unknown as {fullscreenElement?:unknown}).fullscreenElement;
 Object.defineProperty(document,'startViewTransition',{configurable:true,value:undefined});controller.apply('dark',{x:1,y:2});expect(document.documentElement.dataset.theme).toBe('dark');
});
it('falls back on synchronous capture failure, rejected ready and capture timeout',async()=>{
 vi.mocked(document.startViewTransition).mockImplementationOnce(()=>{throw Error('capture');});controller.apply('dark',{x:1,y:2});expect(document.documentElement.dataset.theme).toBe('dark');
 controller.apply('oled',{x:1,y:2});transitions[0].ready.reject(Error('capture'));await flush();expect(document.documentElement.dataset.theme).toBe('oled');
 vi.useFakeTimers();controller.apply('light',{x:1,y:2});vi.advanceTimersByTime(151);expect(document.documentElement.dataset.theme).toBe('light');transitions[1].update();expect(document.documentElement.hasAttribute('data-theme-reveal')).toBe(false);
 controller.apply('dark',{x:1,y:2});transitions[2].finished.resolve();await flush();expect(document.documentElement.dataset.theme).toBe('dark');
});
it('cancels runtime reduced-motion and animation-preference changes',async()=>{
 let reducedChanged!:()=>void;vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:(_event:string,callback:()=>void)=>{reducedChanged=callback;},removeEventListener:vi.fn()}));
 controller.apply('dark',{x:1,y:2});reducedChanged();expect(document.documentElement.dataset.theme).toBe('dark');expect(transitions[0].skipTransition).toHaveBeenCalledOnce();
 controller.apply('oled',{x:1,y:2});document.documentElement.dataset.animation='snappy';await flush();expect(transitions[1].skipTransition).toHaveBeenCalledOnce();expect(document.documentElement.dataset.theme).toBe('oled');
});
it('completes only color tweens while leaving spatial animations running',()=>{
 const color={transitionProperty:'background-color',finish:vi.fn()},geometry={transitionProperty:'width',finish:vi.fn()},radius={transitionProperty:'border-radius',finish:vi.fn()};Object.defineProperty(document,'getAnimations',{configurable:true,value:()=>[color,geometry,radius]});
 controller.apply('dark');expect(color.finish).toHaveBeenCalledOnce();expect(geometry.finish).not.toHaveBeenCalled();expect(radius.finish).not.toHaveBeenCalled();
});
