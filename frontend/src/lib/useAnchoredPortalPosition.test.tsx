// @vitest-environment jsdom
import { StrictMode, useRef } from 'react';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useAnchoredPortalPosition } from './useAnchoredPortalPosition';

afterEach(cleanup);
function Menu() {
  const anchor = useRef<HTMLButtonElement>(null);
  const { position } = useAnchoredPortalPosition(true, anchor, { width: 'anchor', offset: 8 });
  return <><button ref={anchor}>Anchor</button><output>{position?.top}</output></>;
}
it('settles with inline options and continues responding to viewport changes', () => {
  render(<StrictMode><Menu /></StrictMode>);
  expect(screen.getByRole('status').textContent).toBe('8');
  fireEvent(window, new Event('resize'));
  fireEvent(window, new Event('scroll'));
  expect(screen.getByRole('status').textContent).toBe('8');
});
