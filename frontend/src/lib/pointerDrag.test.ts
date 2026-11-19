// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PointerDrag} from './pointerDrag';
let source:HTMLButtonElement,hit:HTMLElement,drag:PointerDrag<string>;
const move=vi.fn(),drop=vi.fn(),end=vi.fn();
function pointer(type:string,x=10,buttons=1,id=7){const event=new MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons,clientX:x,clientY:10});Object.defineProperty(event,'pointerId',{value:id});return event;}
function begin(){const event=pointer('pointerdown');source.dispatchEvent(event);drag.begin({button:0,pointerId:7,clientX:10,clientY:10,shiftKey:false,currentTarget:source,target:source,preventDefault:()=>event.preventDefault(),stopPropagation:()=>event.stopPropagation()},'note');return event;}
beforeEach(()=>{
 document.body.innerHTML='<main data-pointer-drag-owner><button title="Note title">Note title</button><div id="target"></div></main>';
 source=document.querySelector('button')!;hit=document.querySelector('#target')!;
 vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
 Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>hit});
 move.mockReset();drop.mockReset();end.mockReset();drag=new PointerDrag(()=>({label:data=>data,move,drop,end}));
});
afterEach(()=>{drag.dispose();vi.unstubAllGlobals();window.getSelection()?.removeAllRanges();document.body.innerHTML='';});
it('admits synchronously before native selected-text drag and uses the six pixel threshold',()=>{
 const range=document.createRange();range.selectNodeContents(source);window.getSelection()?.addRange(range);
 expect(begin().defaultPrevented).toBe(true);expect(window.getSelection()?.toString()).toBe('');
 const native=new Event('dragstart',{bubbles:true,cancelable:true});source.dispatchEvent(native);expect(native.defaultPrevented).toBe(true);
 source.dispatchEvent(pointer('pointermove',15));expect(document.querySelector('.pointer-drag-preview')).toBeNull();
 source.dispatchEvent(pointer('pointermove',16));expect(document.querySelector<HTMLElement>('.pointer-drag-preview')?.style.pointerEvents).toBe('none');expect(move).toHaveBeenCalled();
 source.dispatchEvent(pointer('pointerup',30,0));expect(drop).toHaveBeenCalledWith('note',{x:30,y:10,shiftKey:false});expect(document.querySelector('.pointer-drag-preview')).toBeNull();expect(source.title).toBe('Note title');
});
it('leaves an ordinary click intact without explicitly clearing another editor selection',()=>{
 const editor=document.createElement('p');editor.textContent='Other editor text';document.body.append(editor);const range=document.createRange();range.selectNodeContents(editor);window.getSelection()?.addRange(range);
 const clear=vi.spyOn(window.getSelection()!,'removeAllRanges');begin();expect(clear).not.toHaveBeenCalled();clear.mockRestore();source.dispatchEvent(pointer('pointerup',11,0));expect(drop).not.toHaveBeenCalled();expect(end).toHaveBeenCalledWith('note','click');
 const click=new MouseEvent('click',{bubbles:true,cancelable:true,detail:1});source.dispatchEvent(click);expect(click.defaultPrevented).toBe(false);
});
it('tracks pointer identity, refuses a lost button and cleans up without a commit',()=>{
 begin();source.dispatchEvent(pointer('pointermove',50,1,8));expect(move).not.toHaveBeenCalled();source.dispatchEvent(pointer('pointermove',50));source.dispatchEvent(pointer('pointermove',60,0));expect(drop).not.toHaveBeenCalled();expect(end).toHaveBeenCalledWith('note','cancel');expect(document.querySelector('.pointer-drag-preview')).toBeNull();
});
it.each(['escape','blur'] as const)('cancels on %s and never eats the next navigation click',reason=>{
 begin();source.dispatchEvent(pointer('pointermove',30));drag.cancel(reason);source.dispatchEvent(pointer('pointerup',30,0));expect(drop).not.toHaveBeenCalled();
 hit.dispatchEvent(pointer('pointerdown',100));const click=new MouseEvent('click',{bubbles:true,cancelable:true,detail:1});hit.dispatchEvent(click);expect(click.defaultPrevented).toBe(false);
});
it('blocks only the post-drop compatibility click, preserving keyboard activation and a new gesture',()=>{
 begin();source.dispatchEvent(pointer('pointermove',30));source.dispatchEvent(pointer('pointerup',30,0));
 const keyboard=new MouseEvent('click',{bubbles:true,cancelable:true,detail:0});source.dispatchEvent(keyboard);expect(keyboard.defaultPrevented).toBe(false);
 const compatibility=new MouseEvent('click',{bubbles:true,cancelable:true,detail:1});source.dispatchEvent(compatibility);expect(compatibility.defaultPrevented).toBe(true);
 const next=new MouseEvent('click',{bubbles:true,cancelable:true,detail:1});source.dispatchEvent(next);expect(next.defaultPrevented).toBe(false);
});
it('does not intercept native external drag events without a local pointer source',()=>{
 const external=new Event('dragstart',{bubbles:true,cancelable:true});hit.dispatchEvent(external);expect(external.defaultPrevented).toBe(false);expect(move).not.toHaveBeenCalled();
});
it('revalidates release coordinates before removing temporary target UI',()=>{
 drag.configure(()=>({label:data=>data,move,drop:()=>expect(hit.isConnected).toBe(true),end:()=>hit.remove()}));begin();source.dispatchEvent(pointer('pointermove',30));source.dispatchEvent(pointer('pointerup',40,0));expect(hit.isConnected).toBe(false);
});
