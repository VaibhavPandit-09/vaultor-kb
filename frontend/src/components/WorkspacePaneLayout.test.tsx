// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WorkspacePaneLayout from './WorkspacePaneLayout';
import { useSyncExternalStore } from 'react';
import { PaneNavigation } from '../lib/paneNavigation';
import type { Resource } from '../types';
let frames: Map<number, FrameRequestCallback>, next: number, width: number, reduced: boolean;
let resizes: (() => void)[];
const tick = () => { const callbacks=[...frames.values()]; frames.clear(); act(()=>callbacks.forEach(fn=>fn(0))); };
const view = (ids:string[], focused=ids[0]) => <WorkspacePaneLayout paneIds={ids} focusedId={focused ?? null} animationMode="smooth">{ids.map(id=><section key={id}><input aria-label={id} defaultValue={id}/></section>)}</WorkspacePaneLayout>;
beforeEach(()=>{
 frames=new Map(); next=0; width=1600; reduced=false; resizes=[]; vi.useFakeTimers();
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(()=>width);
 vi.stubGlobal('ResizeObserver', class { constructor(callback:()=>void){resizes.push(callback);} observe(){} disconnect(){} });
 vi.stubGlobal('matchMedia',()=>({get matches(){return reduced;},addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++next,fn);return next;});
 vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
});
afterEach(()=>{cleanup(); vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it('retains editor identity and caret across focus, opening and authorized closing',()=>{
 const result=render(view(['a','b'])); const input=result.getByLabelText('a') as HTMLInputElement;
 input.focus(); input.setSelectionRange(0,1);
 result.rerender(view(['a','b'],'b')); expect(result.getByLabelText('a')).toBe(input); expect(input.selectionEnd).toBe(1);
 result.rerender(view(['a','b','c'],'c')); const entering=result.container.querySelector<HTMLElement>('[data-slot-id="c"]')!;
 expect(entering.style.getPropertyValue('--pane-width')).toBe('0px'); tick(); tick();
 expect(parseFloat(entering.style.getPropertyValue('--pane-width'))).toBeGreaterThan(0);
 result.rerender(view(['a','b'],'a')); expect(result.queryByLabelText('c')).toBeNull();
 const ghost=result.container.querySelector<HTMLElement>('[data-slot-id="c"]')!;
 expect(ghost.hasAttribute('inert')).toBe(true); expect(ghost.getAttribute('aria-hidden')).toBe('true');
 act(()=>vi.advanceTimersByTime(400)); expect(ghost.isConnected).toBe(false); expect(result.getByLabelText('a')).toBe(input);
});
it('freezes an interrupted width until pointerup and click complete, including a new gesture',()=>{
 const result=render(view(['a','b'])); const slot=result.container.querySelector<HTMLElement>('[data-slot-id="b"]')!;
 slot.getBoundingClientRect=()=>({width:450} as DOMRect);
 fireEvent.pointerDown(slot); result.rerender(view(['a','b'],'b')); expect(slot.style.width).toBe('450px');
 fireEvent.pointerUp(document); expect(slot.style.width).toBe('450px'); tick();
 fireEvent.pointerDown(slot); tick(); expect(slot.style.width).toBe('450px');
 fireEvent.pointerUp(document); tick(); tick(); expect(slot.style.width).toBe('');
});
it('keeps narrow peers mounted and inert, and restores them without remounting on resize',()=>{
 const result=render(view(['a','b'])); const input=result.getByLabelText('a');
 width=800; act(()=>resizes.forEach(fn=>fn())); tick(); result.rerender(view(['a','b'],'b'));
 const slot=result.container.querySelector<HTMLElement>('[data-slot-id="a"]')!;
 expect(slot.hidden).toBe(true); expect(slot.hasAttribute('inert')).toBe(true); expect(result.getByLabelText('a')).toBe(input);
 width=1600; act(()=>resizes.forEach(fn=>fn())); tick(); expect(slot.hidden).toBe(false); expect(slot.hasAttribute('inert')).toBe(false);
});
it('uses immediate reduced-motion allocation and removes the last closed editor before its empty slot',()=>{
 reduced=true; const result=render(view(['a'])); result.rerender(view(['a','b'],'b'));
 expect(parseFloat(result.container.querySelector<HTMLElement>('[data-slot-id="b"]')!.style.getPropertyValue('--pane-width'))).toBeGreaterThan(0);
 expect(result.container.firstElementChild?.getAttribute('style')).toContain('--pane-duration: 0ms');
 result.rerender(view([])); expect(result.queryByLabelText('a')).toBeNull(); expect(result.queryByLabelText('b')).toBeNull();
 act(()=>vi.advanceTimersByTime(100)); expect(result.container.querySelectorAll('[data-slot-id]').length).toBe(0);
});
it('holds open picker geometry and releases it after dismissal', async()=>{
 const result=render(view(['a','b'])); const slot=result.container.querySelector<HTMLElement>('[data-slot-id="b"]')!;
 slot.getBoundingClientRect=()=>({width:430} as DOMRect);
 const trigger=document.createElement('button');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');slot.append(trigger);
 fireEvent.pointerDown(trigger); trigger.setAttribute('aria-expanded','true'); fireEvent.pointerUp(document);
 await act(async()=>{});tick();tick();expect(slot.style.width).toBe('430px');
 trigger.setAttribute('aria-expanded','false');await act(async()=>{});tick();tick();expect(slot.style.width).toBe('');
});

it('does not begin visual departure while the navigation save barrier is pending or failed', async()=>{
 const save=vi.fn(async()=>{});
 const nav=new PaneNavigation(()=>({load:async(id:string)=>({id,title:id,type:'note',content:'{}'} as Resource),save,preview:()=>{},committed:()=>{},max:3,behavior:'replace'}));
 await nav.open('a'); await nav.open('b');
 function Harness(){const state=useSyncExternalStore(nav.subscribe,nav.snapshot);return <WorkspacePaneLayout paneIds={state.panes.map(p=>p.paneId)} focusedId={state.activePaneId} animationMode="smooth">{state.panes.map(p=><input key={p.paneId} aria-label={p.id}/>)}</WorkspacePaneLayout>;}
 const result=render(<Harness/>), id=nav.snapshot().activePaneId!, editor=result.getByLabelText('b');
 let reject!: (error:Error)=>void; save.mockImplementationOnce(()=>new Promise<void>((_resolve,no)=>{reject=no;}));
 let pending!:Promise<void>;act(()=>{pending=nav.close(id);});
 expect(result.getByLabelText('b')).toBe(editor);expect(result.container.querySelector('.workspace-pane-ghost')).toBeNull();
 await act(async()=>{reject(new Error('Save failed'));await pending;});
 expect(result.getByLabelText('b')).toBe(editor);expect(result.container.querySelector('.workspace-pane-ghost')).toBeNull();
 await act(async()=>{await nav.close(id);});expect(result.queryByLabelText('b')).toBeNull();expect(result.container.querySelector('.workspace-pane-ghost')).toBeTruthy();
});
it('freezes geometry before a child capture handler activates its pane, including reduced motion',()=>{
 reduced=true; let captured='';
 const result=render(<WorkspacePaneLayout paneIds={['a','b']} focusedId="a" animationMode="smooth"><input/><button onPointerDownCapture={event=>{captured=event.currentTarget.closest<HTMLElement>('.workspace-pane-slot')!.style.width;}}>Activate</button></WorkspacePaneLayout>);
 const slot=result.container.querySelector<HTMLElement>('[data-slot-id="b"]')!;slot.getBoundingClientRect=()=>({width:450} as DOMRect);
 fireEvent.pointerDown(result.getByText('Activate'));expect(captured).toBe('450px');
});

it('uses equal layout widths for focus depth and freezes unscaled widths and visual transform through a click',()=>{
 const result=render(view(['a','b']));const a=result.container.querySelector<HTMLElement>('[data-slot-id="a"]')!,b=result.container.querySelector<HTMLElement>('[data-slot-id="b"]')!;
 const width=a.style.getPropertyValue('--pane-width');expect(b.style.getPropertyValue('--pane-width')).toBe(width);
 result.rerender(view(['a','b'],'b'));expect(a.style.getPropertyValue('--pane-width')).toBe(width);expect(b.style.getPropertyValue('--pane-width')).toBe(width);
 Object.defineProperty(a,'offsetWidth',{value:600});a.getBoundingClientRect=()=>({width:579} as DOMRect);a.style.transform='matrix(.965,0,0,.965,0,4)';
 fireEvent.pointerDown(a);expect(a.style.width).toBe('600px');expect(a.style.transform).toContain('.965');
 fireEvent.pointerUp(document);tick();tick();expect(a.style.transform).toBe('');
});
