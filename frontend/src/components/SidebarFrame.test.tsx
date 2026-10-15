// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SidebarFrame from './SidebarFrame';
import LibraryPopover from './LibraryPopover';
import { EscapeManagerProvider } from '../lib/escape/EscapeManagerProvider';
vi.mock('../lib/useAnchoredPortalPosition',()=>({useAnchoredPortalPosition:()=>({position:{top:40,left:20,width:280,maxHeight:400,placement:'bottom'}})}));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const actions = { onReveal: vi.fn(), onHide: vi.fn(), onToggle: vi.fn() };
function Frame({ floating=false, open=true, pinned=false, focusMode=false }: { floating?: boolean; open?: boolean; pinned?: boolean; focusMode?: boolean }) {
  return <SidebarFrame {...actions} floating={floating} open={open} pinned={pinned} focusMode={focusMode}><div data-testid="scroll"><button aria-haspopup="dialog" aria-expanded="false">Menu</button><input aria-label="Filter" defaultValue="retained"/></div></SidebarFrame>;
}
it('retains one sidebar, input selection and quick-access scroll across collapse and presentation changes', () => {
 const view=render(<Frame/>), panel=screen.getByRole('complementary'), input=screen.getByRole('textbox') as HTMLInputElement, scroll=screen.getByTestId('scroll');
 scroll.scrollTop=160; input.focus(); input.setSelectionRange(2,4);
 view.rerender(<Frame open={false}/>);
 expect(panel.hasAttribute('inert')).toBe(true); expect(panel.getAttribute('aria-hidden')).toBe('true');
 expect(document.activeElement).toBe(screen.getByRole('button',{name:'Toggle sidebar'}));
 view.rerender(<Frame floating/>);
 expect(screen.getByRole('complementary')).toBe(panel); expect(screen.getByRole('textbox')).toBe(input);
 expect(input.value).toBe('retained'); expect(input.selectionStart).toBe(2); expect(scroll.scrollTop).toBe(160);
 expect(panel.hasAttribute('inert')).toBe(false);
});
it('keeps floating navigation available during focus, pointer and portal-menu use, then hides after dismissal', async () => {
 vi.useFakeTimers(); actions.onHide.mockClear(); render(<Frame floating/>);
 const panel=screen.getByRole('complementary'), menu=screen.getByRole('button',{name:'Menu'});
 menu.focus(); fireEvent.mouseLeave(panel); act(()=>vi.advanceTimersByTime(200)); expect(actions.onHide).not.toHaveBeenCalled();
 menu.blur(); fireEvent.pointerDown(menu); fireEvent.mouseLeave(panel); act(()=>vi.advanceTimersByTime(200)); expect(actions.onHide).not.toHaveBeenCalled();
 menu.setAttribute('aria-expanded','true'); fireEvent.pointerUp(document); act(()=>vi.advanceTimersByTime(200)); expect(actions.onHide).not.toHaveBeenCalled();
 await act(async()=>menu.setAttribute('aria-expanded','false'));
 act(()=>vi.advanceTimersByTime(200)); expect(actions.onHide).toHaveBeenCalledOnce();
});
it('pinned navigation ignores mouse leave and focus mode exposes an explicit exit control', () => {
 vi.useFakeTimers(); actions.onHide.mockClear(); const view=render(<Frame floating pinned/>);
 fireEvent.mouseLeave(screen.getByRole('complementary')); act(()=>vi.advanceTimersByTime(500)); expect(actions.onHide).not.toHaveBeenCalled();
 view.rerender(<Frame floating open={false} focusMode/>);
 const exit=screen.getByRole('button',{name:'Show navigation and exit focus mode'}); expect(exit.getAttribute('aria-expanded')).toBe('false');
 actions.onReveal.mockClear(); fireEvent.mouseEnter(exit); expect(actions.onReveal).not.toHaveBeenCalled();
});
it('retargets interrupted reveal and cleans pending hide timers on mode change or unmount', () => {
 vi.useFakeTimers(); actions.onHide.mockClear(); const view=render(<Frame floating/>);
 fireEvent.mouseLeave(screen.getByRole('complementary')); view.rerender(<Frame/>); act(()=>vi.advanceTimersByTime(500)); expect(actions.onHide).not.toHaveBeenCalled();
 view.rerender(<Frame floating/>); fireEvent.mouseLeave(screen.getByRole('complementary')); view.unmount(); act(()=>vi.advanceTimersByTime(500)); expect(actions.onHide).not.toHaveBeenCalled();
});

it('dismisses owned portaled menus immediately on collapse and never replays them on reopening', () => {
 const props={...actions,floating:false,pinned:false,focusMode:false};
 const content=<LibraryPopover label="Owned menu">{()=> <button>Portal action</button>}</LibraryPopover>;
 const view=render(<SidebarFrame {...props} open>{content}</SidebarFrame>,{wrapper:EscapeManagerProvider});
 fireEvent.click(screen.getByRole('button',{name:'Owned menu'}));
 const action=screen.getByRole('button',{name:'Portal action'}); act(()=>action.focus());
 view.rerender(<SidebarFrame {...props} open={false}>{content}</SidebarFrame>);
 expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(screen.getByRole('button',{name:'Toggle sidebar'}));
 view.rerender(<SidebarFrame {...props} open>{content}</SidebarFrame>); expect(screen.queryByRole('dialog')).toBeNull();
});

it('keeps the launcher target stable on hover and opens only through its completed click', () => {
 actions.onReveal.mockClear(); actions.onToggle.mockClear(); render(<Frame floating open={false}/>);
 const button=screen.getByRole('button',{name:'Toggle sidebar'});
 fireEvent.mouseEnter(button); fireEvent.pointerDown(button); expect(actions.onReveal).not.toHaveBeenCalled();
 fireEvent.click(button); expect(actions.onToggle).toHaveBeenCalledOnce();
});

it('holds interrupted sidebar geometry through pointer click and an open portal, then resumes on dismissal', async () => {
 let next=0; const frames=new Map<number,FrameRequestCallback>();
 vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++next,cb);return next;});
 vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
 const flush=()=>{for(let i=0;i<2;i++){const queued=[...frames.values()];frames.clear();queued.forEach(cb=>cb(16));}};
 render(<Frame/>); const panel=screen.getByRole('complementary') as HTMLElement, allocation=panel.parentElement!;
 vi.spyOn(allocation,'getBoundingClientRect').mockReturnValue({width:220} as DOMRect);
 const menu=screen.getByRole('button',{name:'Menu'});
 fireEvent.pointerDown(menu); expect(allocation.style.width).toBe('220px'); expect(panel.style.transition).toBe('none');
 menu.setAttribute('aria-expanded','true'); fireEvent.pointerUp(document); act(flush); expect(panel.style.transition).toBe('none');
 await act(async()=>menu.setAttribute('aria-expanded','false')); act(flush);
 expect(panel.style.transition).toBe(''); expect(allocation.style.width).toBe('');
});
