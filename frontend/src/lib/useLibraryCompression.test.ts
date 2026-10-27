// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { attachLibraryCompression } from './useLibraryCompression';
let viewport: HTMLElement, header: HTMLElement, stop: () => void;
let frames: Map<number, FrameRequestCallback>, next: number, time: number;
let reduced: boolean;
const tick = () => { time += 16; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)); };
const settle = () => { for (let i = 0; frames.size && i < 100; i++) tick(); };
const progress = () => Number(viewport.style.getPropertyValue('--library-progress'));
beforeEach(() => {
 frames = new Map(); next = 0; time = 0; reduced = false;
 vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++next, fn); return next; });
 vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
 vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
 vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener() {}, removeEventListener() {} }));
 viewport = document.createElement('main'); header = document.createElement('div'); viewport.append(header); document.body.append(viewport);
 Object.defineProperties(viewport, { scrollHeight: { value: 1000, configurable: true }, clientHeight: { value: 500, configurable: true } });
 stop = attachLibraryCompression(viewport, header); settle();
});
afterEach(() => { stop(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
it('follows absolute scroll depth and reverses while retaining focus, caret and row nodes', () => {
 const input = document.createElement('input'); input.value = 'research'; header.append(input);
 const row = document.createElement('li'); viewport.append(row); input.focus(); input.setSelectionRange(2, 5);
 viewport.scrollTop = 80; viewport.dispatchEvent(new Event('scroll')); tick();
 expect(progress()).toBeGreaterThan(0); expect(progress()).toBeLessThan(.5); settle(); expect(progress()).toBe(.5);
 viewport.scrollTop = 16; viewport.dispatchEvent(new Event('scroll')); settle(); expect(progress()).toBe(.1);
 expect(document.activeElement).toBe(input); expect(input.selectionStart).toBe(2); expect(input.selectionEnd).toBe(5); expect(viewport.lastChild).toBe(row);
});

it('ignores note editor subtree mutations while retaining outer content discovery', async () => {
 stop();
 const editor=document.createElement('section');viewport.append(editor);
 const height=vi.fn(()=>1000);Object.defineProperty(viewport,'scrollHeight',{get:height,configurable:true});
 stop=attachLibraryCompression(viewport,header,{observeSubtree:false});settle();height.mockClear();
 editor.append(document.createElement('p'));await Promise.resolve();
 expect(height).not.toHaveBeenCalled();
 viewport.append(document.createElement('section'));await Promise.resolve();
 expect(height).toHaveBeenCalled();
});
it('holds a target through pointerup and click, and while its popover is open', () => {
 const button = document.createElement('button'); button.setAttribute('aria-haspopup', 'dialog'); header.append(button);
 button.dispatchEvent(new Event('pointerdown', { bubbles: true })); viewport.scrollTop = 160; viewport.dispatchEvent(new Event('scroll')); settle(); expect(progress()).toBe(0);
 document.dispatchEvent(new Event('pointerup')); expect(progress()).toBe(0);
 button.setAttribute('aria-expanded', 'true'); settle(); expect(progress()).toBe(0);
 button.setAttribute('aria-expanded', 'false'); document.dispatchEvent(new Event('keyup')); settle(); expect(progress()).toBe(1);
});
it('does not let a prior release unlock a new pointer gesture', () => {
 viewport.dispatchEvent(new Event('pointerdown')); document.dispatchEvent(new Event('pointerup')); tick();
 viewport.dispatchEvent(new Event('pointerdown')); viewport.scrollTop = 160; viewport.dispatchEvent(new Event('scroll')); settle(); expect(progress()).toBe(0);
 document.dispatchEvent(new Event('pointerup')); settle(); expect(progress()).toBe(1);
});
it('applies reduced geometry without a spatial sweep and removes all scheduled work on disposal', () => {
 reduced = true; viewport.scrollTop = 80; viewport.dispatchEvent(new Event('scroll')); tick(); expect(progress()).toBe(1); expect(frames.size).toBe(0);
 viewport.scrollTop = 0; viewport.dispatchEvent(new Event('scroll')); tick(); expect(progress()).toBe(0);
 stop(); expect(frames.size).toBe(0); expect(viewport.style.getPropertyValue('--library-progress')).toBe('');
});

it('completes a short final page, and keeps non-scrolling results expanded', () => {
 stop(); Object.defineProperty(viewport, 'scrollHeight', { value: 548, configurable: true });
 stop = attachLibraryCompression(viewport, header);
 viewport.scrollTop = 24; viewport.dispatchEvent(new Event('scroll')); settle(); expect(progress()).toBe(.5);
 viewport.scrollTop = 48; viewport.dispatchEvent(new Event('scroll')); settle(); expect(progress()).toBe(1);
 stop(); Object.defineProperty(viewport, 'scrollHeight', { value: 500, configurable: true });
 viewport.scrollTop = 0; stop = attachLibraryCompression(viewport, header); settle(); expect(progress()).toBe(0);
});
it('pins rename geometry through focused typing, then catches up after blur', () => {
 stop(); const input = document.createElement('input'); header.append(input);
 stop = attachLibraryCompression(viewport, header, { pinHeaderFocus: true });
 input.focus(); input.value = 'IME title'; input.setSelectionRange(2, 2);
 viewport.scrollTop = 160; viewport.dispatchEvent(new Event('scroll')); settle(); expect(progress()).toBe(0);
 expect(input.selectionStart).toBe(2);
 input.blur(); settle(); expect(progress()).toBe(1);
});
it('recalculates travel after results shrink and after the viewport grows', () => {
 viewport.scrollTop = 80; viewport.dispatchEvent(new Event('scroll')); settle(); expect(progress()).toBe(.5);
 Object.defineProperty(viewport, 'scrollHeight', { value: 580, configurable: true });
 viewport.dispatchEvent(new Event('scroll')); settle(); expect(progress()).toBe(1);
 Object.defineProperty(viewport, 'clientHeight', { value: 580, configurable: true });
 viewport.scrollTop = 0; viewport.dispatchEvent(new Event('scroll')); settle(); expect(progress()).toBe(0);
});

it('keeps reduced-motion density stable around its switching boundary', () => {
 reduced = true;
 const scroll = (top: number) => { viewport.scrollTop=top; viewport.dispatchEvent(new Event('scroll')); settle(); };
 scroll(64); expect(progress()).toBe(1); scroll(48); expect(progress()).toBe(1);
 scroll(16); expect(progress()).toBe(0); scroll(48); expect(progress()).toBe(0);
});

it('measures the breadcrumb row and withdraws it before title migration at every scroll depth',()=>{
 stop();const nav=document.createElement('nav');nav.className='collection-breadcrumb';nav.textContent='Library / docs / android / releases / a very long parent';Object.defineProperty(nav,'getBoundingClientRect',{value:()=>({height:27})});header.append(nav);stop=attachLibraryCompression(viewport,header);settle();
 expect(viewport.style.getPropertyValue('--collection-path-space')).toBe('35px');
 for(const top of [0,16,40,55,56,80,120,160,80,40,0]){viewport.scrollTop=top;viewport.dispatchEvent(new Event('scroll'));settle();const p=progress();const title=Number(viewport.style.getPropertyValue('--collection-title-progress'));if(p<.35){expect(title).toBe(0);expect(nav.inert).toBe(false);}else{expect(nav.inert).toBe(true);expect(nav.getAttribute('aria-hidden')).toBe('true');}}
 stop();expect(nav.inert).toBe(false);expect(nav.hasAttribute('aria-hidden')).toBe(false);
});
it('keeps keyboard breadcrumb navigation stable through scrolling until focus leaves',()=>{
 stop();const nav=document.createElement('nav');nav.className='collection-breadcrumb';const button=document.createElement('button');button.textContent='Parent';nav.append(button);header.append(nav);stop=attachLibraryCompression(viewport,header);button.focus();
 viewport.scrollTop=160;viewport.dispatchEvent(new Event('scroll'));settle();expect(progress()).toBe(0);expect(document.activeElement).toBe(button);
 button.blur();settle();expect(progress()).toBe(1);expect(nav.inert).toBe(true);
});
