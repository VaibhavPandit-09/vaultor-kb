// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import JourneyViewport from './JourneyViewport';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('restores each visit once, keeps the editor node, and never rewinds after user interaction', () => {
 let frame: FrameRequestCallback = () => {};
 vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frame=fn; return 1; });
 vi.stubGlobal('cancelAnimationFrame', vi.fn());
 const record=vi.fn();
 const view=(visitId:string,scrollTop:number)=><JourneyViewport visitId={visitId} initialPosition={{scrollTop,scrollLeft:0}} onPosition={record} animationMode="smooth"><div className="note-orientation">Header</div><div contentEditable suppressContentEditableWarning>Editor</div></JourneyViewport>;
 const result=render(view('a',120));
 const viewport=result.container.firstElementChild as HTMLElement, editor=viewport.lastElementChild;
 expect(viewport.scrollTop).toBe(120);
 viewport.scrollTop=160; fireEvent.wheel(viewport); act(()=>frame(16)); expect(viewport.scrollTop).toBe(160);
 fireEvent.scroll(viewport); expect(record).toHaveBeenLastCalledWith({scrollTop:160,scrollLeft:0});
 result.rerender(view('a',900)); expect(viewport.scrollTop).toBe(160);
 result.rerender(view('b',40)); expect(viewport.scrollTop).toBe(40); expect(viewport.lastElementChild).toBe(editor);
 result.rerender(view('a',160)); expect(viewport.scrollTop).toBe(160);
});
