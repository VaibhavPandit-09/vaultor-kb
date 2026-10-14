import { useEffect, type RefObject } from 'react';

/** One scroll signal, owned by Library. Never owns React, queries or focus. */
export function attachLibraryCompression(viewport: HTMLElement, header: HTMLElement) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let frame = 0, releaseFrame = 0, pointerHeld = false, lastTime = 0;
  const target = () => Math.min(1, Math.max(0, viewport.scrollTop / 160));
  let progress = target();
  const write = () => viewport.style.setProperty('--library-progress', String(progress));
  const locked = () => pointerHeld || Boolean(header.querySelector('[aria-haspopup][aria-expanded="true"]'));
  const step = (time: number) => {
    frame = 0;
    if (locked()) { lastTime = 0; return; }
    const goal = target();
    const elapsed = lastTime ? Math.min(40, time - lastTime) : 16;
    lastTime = time;
    // Follow slow scrolling directly; soften a large wheel/trackpad jump.
    const response = document.documentElement.dataset.animation === 'smooth' ? 65 : 35;
    progress = reduced?.matches ? (goal > .25 ? 1 : 0) : progress + (goal - progress) * (1 - Math.exp(-elapsed / response));
    if (Math.abs(goal - progress) < .001 || reduced?.matches) progress = reduced?.matches ? progress : goal;
    write();
    if (!reduced?.matches && progress !== goal) frame = requestAnimationFrame(step);
    else lastTime = 0;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(step); };
  const down = () => { cancelAnimationFrame(releaseFrame); pointerHeld = true; cancelAnimationFrame(frame); frame = 0; lastTime = 0; };
  const release = () => {
    // pointerup precedes click. Hold the geometry through the click's handlers
    // and React commit; an opening popover then retains its anchor geometry.
    cancelAnimationFrame(releaseFrame);
    releaseFrame = requestAnimationFrame(() => {
      releaseFrame = requestAnimationFrame(() => { pointerHeld = false; schedule(); });
    });
  };
  const measureActions = () => {
    const actions = header.querySelector<HTMLElement>('.library-heading-actions');
    viewport.style.setProperty('--library-actions-width', `${actions?.getBoundingClientRect().width ?? 0}px`);
    schedule();
  };
  const observer = new ResizeObserver(measureActions);
  observer.observe(viewport);
  const actions = header.querySelector<HTMLElement>('.library-heading-actions');
  if (actions) observer.observe(actions);
  if (reduced?.matches) progress = progress > .25 ? 1 : 0;
  write(); measureActions();
  viewport.addEventListener('scroll', schedule, { passive: true });
  viewport.addEventListener('pointerdown', down, true);
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  document.addEventListener('keyup', schedule, true);
  window.addEventListener('blur', release);
  reduced?.addEventListener('change', schedule);
  return () => {
    cancelAnimationFrame(frame); cancelAnimationFrame(releaseFrame); observer.disconnect();
    viewport.removeEventListener('scroll', schedule);
    viewport.removeEventListener('pointerdown', down, true);
    document.removeEventListener('pointerup', release, true);
    document.removeEventListener('pointercancel', release, true);
    document.removeEventListener('keyup', schedule, true);
    window.removeEventListener('blur', release);
    reduced?.removeEventListener('change', schedule);
    viewport.style.removeProperty('--library-progress');
    viewport.style.removeProperty('--library-actions-width');
  };
}

export function useLibraryCompression(viewport: RefObject<HTMLElement | null>, header: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (active && viewport.current && header.current) return attachLibraryCompression(viewport.current, header.current);
  }, [active, viewport, header]);
}
