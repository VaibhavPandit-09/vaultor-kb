// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, within, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import JourneyBar from './JourneyBar';
import JourneyViewport from './JourneyViewport';
import type { Pane } from '../lib/paneNavigation';
import { EscapeManagerProvider } from '../lib/escape/EscapeManagerProvider';
vi.mock('../lib/useAnchoredPortalPosition', () => ({ useAnchoredPortalPosition: () => ({ position: { top: 50, left: 10, width: 320, maxHeight: 420 } }) }));
afterEach(cleanup);
const pane: Pane = { paneId: 'p', id: 'r3', cursor: 3, history: Array.from({ length: 8 }, (_, i) => ({ visitId: 'v' + i, resourceId: 'r' + i, title: 'Note ' + i, unavailable: i === 1 })) };
it('shows nearby steps, exposes every visit, and restores overflow focus on Escape', async () => {
  const jump = vi.fn();
  render(<EscapeManagerProvider><JourneyBar pane={pane} motion="forward" animationMode="smooth" onJump={jump} /></EscapeManagerProvider>);
  expect(screen.getByRole('button', { name: 'Note 3' }).getAttribute('aria-current')).toBe('step');
  expect(screen.queryByRole('button', { name: 'Note 7' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show full journey' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getAllByRole('button')).toHaveLength(8);
  expect((within(dialog).getByText('Unavailable').closest('button') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Step 8: Note 7' })); expect(jump).toHaveBeenCalledWith(7);
  fireEvent.click(screen.getByRole('button', { name: 'Show full journey' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Show full journey' }));
});
it('updates titles without remounting the animated trail; current step is a native button', () => {
  const props = { pane, motion: 'forward' as const, animationMode: 'snappy' as const, onJump: vi.fn() };
  const view = render(<JourneyBar {...props} />); const trail = view.container.querySelector('.journey-trail');
  view.rerender(<JourneyBar {...props} pane={{ ...pane, history: pane.history.map(v => v.resourceId === 'r3' ? { ...v, title: 'Renamed' } : v) }} />);
  expect(view.container.querySelector('.journey-trail')).toBe(trail); expect(screen.getByRole('button', { name: 'Renamed' })).toBeTruthy();
});
it('restores scroll only on mounting a visit, not on ordinary content updates', async () => {
  const changed = vi.fn(); const props = { visitId: 'v1', initialPosition: { scrollTop: 200, scrollLeft: 10 }, animationMode: 'smooth' as const, onPosition: changed };
  const view = render(<JourneyViewport {...props}>note</JourneyViewport>); const element = view.container.firstElementChild as HTMLElement;
  expect(element.scrollTop).toBe(200); expect(element.scrollLeft).toBe(10);
  fireEvent.wheel(element); element.scrollTop = 350; fireEvent.scroll(element); expect(changed).toHaveBeenLastCalledWith({ scrollTop: 350, scrollLeft: 10 });
  view.rerender(<JourneyViewport {...props} initialPosition={{ scrollTop: 1, scrollLeft: 0 }}>edited</JourneyViewport>);
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); }); expect(element.scrollTop).toBe(350);
});
