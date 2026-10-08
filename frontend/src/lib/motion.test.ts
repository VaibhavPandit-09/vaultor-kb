// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {enterSurface,exitSurface,installMotion,motionProfile} from './motion';
let dispose:(()=>void)|undefined;const running:Array<{cancel:ReturnType<typeof vi.fn>;finish:()=>void}>=[];
function setup(){document.documentElement.dataset.animation='smooth';vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})));Object.defineProperty(Element.prototype,'animate',{configurable:true,value:vi.fn(()=>{let finish!:()=>void;const finished=new Promise<void>(r=>finish=r);const cancel=vi.fn(finish);running.push({cancel,finish});return {finished,cancel};})});}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
afterEach(()=>{dispose?.();dispose=undefined;running.splice(0).forEach(a=>a.finish());document.body.innerHTML='';delete document.documentElement.dataset.animation;delete (Element.prototype as unknown as {animate?:unknown}).animate;vi.unstubAllGlobals();});
it('uses bounded expressive durations, quick Snappy and no motion under reduced motion',()=>{
 expect(motionProfile('smooth',false)).toEqual({panel:280,menu:220,page:200,exit:180,stagger:24,lift:2});expect(motionProfile('snappy',false).panel).toBeLessThan(100);expect(Object.values(motionProfile('smooth',true)).every(value=>value===0)).toBe(true);
});
it('keeps anchored portal transforms and does not scale page destinations',()=>{
 setup();const element=document.createElement('div');element.style.transform='translateY(-100%)';document.body.append(element);enterSurface(element,'menu');const frames=vi.mocked(element.animate).mock.calls[0][0] as Keyframe[];expect(frames[0].transform).toContain('translateY(-100%)');enterSurface(element,'page');expect(vi.mocked(element.animate).mock.calls[1][0]).toEqual([{opacity:.4},{opacity:1}]);
});
it('closed surfaces leave only inert visuals without focus ownership or duplicate IDs',async()=>{
 setup();const input=document.createElement('input');document.body.append(input);input.focus();const original=document.createElement('div');original.setAttribute('role','dialog');original.id='source';original.innerHTML='<button tabindex="0" autofocus>Old action</button>';exitSurface(original,{top:2,left:3,width:200,height:100} as DOMRect);const ghost=document.querySelector<HTMLElement>('[data-motion-ghost]')!;expect(ghost.inert).toBe(true);expect(ghost.getAttribute('aria-hidden')).toBe('true');expect(ghost.querySelector('[tabindex],[autofocus],[id]')).toBeNull();expect(ghost.querySelector('button')?.disabled).toBe(true);expect(document.activeElement).toBe(input);running[0].finish();await flush();expect(ghost.isConnected).toBe(false);
});
it('reopening cancels the old visual and reduced motion creates no ghost',()=>{
 setup();const element=document.createElement('div');element.setAttribute('aria-label','Picker');exitSurface(element,{top:0,left:0,width:100,height:100} as DOMRect);enterSurface(element);expect(document.querySelector('[data-motion-ghost]')).toBeNull();vi.mocked(window.matchMedia).mockReturnValue({matches:true} as MediaQueryList);exitSurface(element,{top:0,left:0,width:100,height:100} as DOMRect);expect(document.querySelector('[data-motion-ghost]')).toBeNull();
});
it('reveals at most six initial rows and never replays for search or background refresh',async()=>{
 setup();dispose=installMotion();const page=document.createElement('section');page.dataset.motionSurface='page';page.dataset.motionKey='library';page.dataset.motionList='true';page.dataset.motionReady='true';page.innerHTML=Array.from({length:20},()=>'<div class="library-row">Row</div>').join('');document.body.append(page);await flush();expect(vi.mocked(page.animate)).toHaveBeenCalledTimes(7);page.dataset.motionList='false';page.innerHTML='<div class="library-row">Search match</div>';await flush();expect(vi.mocked(page.animate)).toHaveBeenCalledTimes(7);page.dataset.motionList='true';page.innerHTML='<div class="library-row">Background update</div>';await flush();expect(vi.mocked(page.animate)).toHaveBeenCalledTimes(7);
});
it('interrupted preference changes cancel animations without replacing mounted editors',async()=>{
 setup();dispose=installMotion();const editor=document.createElement('div');editor.className='tiptap';editor.contentEditable='true';document.body.append(editor);const panel=document.createElement('div');panel.setAttribute('role','dialog');document.body.append(panel);await flush();const animation=running[0];document.documentElement.dataset.animation='snappy';await flush();expect(animation.cancel).toHaveBeenCalled();expect(document.querySelector('.tiptap')).toBe(editor);
});

it('defers hidden cached pages until visible without replacing their rows',async()=>{
 setup();dispose=installMotion();const wrapper=document.createElement('div');wrapper.hidden=true;const page=document.createElement('section');page.dataset.motionSurface='page';page.dataset.motionKey='library';page.dataset.motionList='true';page.dataset.motionReady='true';page.innerHTML='<div class="library-row">Cached</div>';wrapper.append(page);document.body.append(wrapper);await flush();expect(vi.mocked(page.animate)).not.toHaveBeenCalled();const row=page.firstChild;wrapper.hidden=false;await flush();expect(vi.mocked(page.animate)).toHaveBeenCalledTimes(2);expect(page.firstChild).toBe(row);
});
