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
it('bounds ordinary popover width and height to a compact viewport',()=>{
 const previous=window.innerWidth;Object.defineProperty(window,'innerWidth',{value:220,configurable:true});
 function Compact(){const anchor=useRef<HTMLButtonElement>(null);const {position}=useAnchoredPortalPosition(true,anchor,{width:280});return <><button ref={anchor}>Open</button><output>{JSON.stringify(position)}</output></>;}
 render(<Compact/>);const position=JSON.parse(screen.getByRole('status').textContent!);expect(position.width).toBe(196);expect(position.left).toBe(12);expect(position.maxHeight).toBeLessThanOrEqual(window.innerHeight-20);
 Object.defineProperty(window,'innerWidth',{value:previous,configurable:true});
});
