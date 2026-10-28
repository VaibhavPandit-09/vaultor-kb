// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import NoteOrientation from './NoteOrientation';
import SaveIndicator from './SaveIndicator';
const driver = vi.hoisted(() => ({ update: (_: number) => { void _; }, stop: vi.fn() }));
vi.mock('../lib/useLibraryCompression', () => ({ attachLibraryCompression: (_v: HTMLElement, _h: HTMLElement, options: { onProgress: (p: number) => void }) => {
  driver.update = options.onProgress; options.onProgress(0); return driver.stop;
} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('folds organization into reachable disclosure without remounting title, caret, retry or controls', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const retry = vi.fn();
  const result = render(<main><NoteOrientation tagCount={5} identity={<><input aria-label="Rename" defaultValue="Long note title"/><SaveIndicator status="failed" onRetry={retry}/></>} status={<p>Unavailable note</p>}><button>Add to collection</button></NoteOrientation></main>);
  const title = screen.getByRole('textbox') as HTMLInputElement;
  title.focus(); title.setSelectionRange(2, 5);
  const band = screen.getByRole('button', {name:'Add to collection'}).parentElement!.parentElement!;
  act(() => driver.update(1));
  expect(band.inert).toBe(true);
  const disclosure = screen.getByRole('button', {name:/Tags and collections · 5 tags/});
  expect(disclosure.getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByRole('textbox')).toBe(title); expect(title.selectionStart).toBe(2);
  fireEvent.click(disclosure); expect(band.inert).toBe(false);
  expect(disclosure.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('button', {name:'Save failed — click to retry'})); expect(retry).toHaveBeenCalledOnce();
  expect(screen.getByText('Unavailable note')).toBeTruthy();
  fireEvent.click(disclosure); act(() => driver.update(1)); expect(band.inert).toBe(true);
  act(() => driver.update(0)); expect(band.inert).toBe(true);
  fireEvent.click(disclosure); expect(band.inert).toBe(false);
  result.unmount(); expect(driver.stop).toHaveBeenCalled();
});

it('remeasures intrinsic organization content after narrowing and widening without retaining wrapper height', async () => {
 let resize = () => {};
 vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize=callback; } observe() {} disconnect() {} });
 const result=render(<main><NoteOrientation tagCount={0} identity={<button>Title</button>}><button>Add to collection</button></NoteOrientation></main>);
 const viewport=result.container.firstElementChild as HTMLElement;
 const band=result.container.querySelector<HTMLElement>('.note-organization')!;
 let height=100; Object.defineProperty(band.firstElementChild,'scrollHeight',{get:()=>height});
 Object.defineProperty(band,'scrollHeight',{value:100});
 act(()=>resize()); await waitFor(()=>expect(viewport.style.getPropertyValue('--note-organization-height')).toBe('100px'));
 height=40; act(()=>resize()); await waitFor(()=>expect(viewport.style.getPropertyValue('--note-organization-height')).toBe('40px'));
});
