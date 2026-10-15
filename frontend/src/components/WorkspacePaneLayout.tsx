import { Children, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motionProfile } from '../lib/motion';
import { capturePaneReadingAnchors } from '../lib/paneReadingAnchor';

/** Presentation slots yield real width. Navigation alone owns live editors. */
export default function WorkspacePaneLayout({ paneIds, focusedId, animationMode, children }: {
 paneIds: string[]; focusedId: string | null; animationMode: 'smooth' | 'snappy'; children: ReactNode;
}) {
 const root = useRef<HTMLDivElement>(null), held = useRef(false), pointerHeld = useRef(false), pointerDown = useRef<(() => void) | null>(null);
 const restoreAnchor = useRef<((skip?: HTMLElement | null) => void) | null>(null), releaseFrames = useRef<number[]>([]), settleAfter = useRef(0), anchorUntil = useRef(0), ignoredViewport = useRef<HTMLElement | null>(null);
 const [width, setWidth] = useState(0), [reduced, setReduced] = useState(false);
 const [slots, setSlots] = useState(paneIds), [entered, setEntered] = useState(paneIds);
 const key = JSON.stringify(paneIds);
 const added = paneIds.filter(id => !slots.includes(id));
 if (added.length) setSlots([...slots, ...added]);
 const compact = (paneIds.length === 2 && width <= 850) || (paneIds.length >= 3 && width <= 1200);
 const available = Math.max(0, width - 32 - (compact ? 0 : (paneIds.length > 1 ? paneIds.length * 16 : 0)));
 const duration = motionProfile(animationMode, reduced).panel;
 const nodeById = new Map(paneIds.map((id, index) => [id, Children.toArray(children)[index]]));
 useLayoutEffect(() => {
  const element = root.current; if (!element) return;
  const measure = () => { if (element.clientWidth) setWidth(element.clientWidth); };
  measure(); const observer = new ResizeObserver(measure); observer.observe(element);
  const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const motion = () => setReduced(Boolean(preference?.matches));
  motion(); preference?.addEventListener('change', motion);
  return () => { observer.disconnect(); preference?.removeEventListener('change', motion); };
 }, []);
 useEffect(() => {
  let second = 0;
  const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setEntered(JSON.parse(key) as string[])); });
  return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
 }, [key]);
 useEffect(() => {
  let timer: ReturnType<typeof setTimeout>;
  const prune = () => {
   if (held.current || performance.now() < settleAfter.current) { timer = setTimeout(prune, 50); return; }
   setSlots(current => current.filter(id => (JSON.parse(key) as string[]).includes(id)));
  };
  timer = setTimeout(prune, duration + 60);
  return () => clearTimeout(timer);
 }, [key, duration]);
 useLayoutEffect(() => {
  const element = root.current; if (!element) return;
  if (!held.current) { ignoredViewport.current = null; restoreAnchor.current = capturePaneReadingAnchors(element); }
  anchorUntil.current = performance.now() + duration + 60;
  const observer = new ResizeObserver(() => {
   if (performance.now() > anchorUntil.current) restoreAnchor.current = null;
   if (!held.current) restoreAnchor.current?.(ignoredViewport.current);
  });
  element.querySelectorAll('.journey-viewport,.note-orientation,.ProseMirror').forEach(viewport => observer.observe(viewport));
  return () => { observer.disconnect(); restoreAnchor.current = null; };
 }, [key, focusedId, width, duration]);
 useEffect(() => {
  const element = root.current; if (!element) return;
  const cancelAnchor = () => { restoreAnchor.current = null; };
  const focusIn = (event: Event) => {
   ignoredViewport.current = event.target instanceof Element ? event.target.closest<HTMLElement>('.journey-viewport') : null;
  };
  const freeze = () => {
   held.current = true; cancelAnchor(); releaseFrames.current.forEach(cancelAnimationFrame);
   // Freeze current rendered bounds, including an interrupted transition. CSS
   // targets can update underneath without moving the target before click.
   element.querySelectorAll<HTMLElement>('.workspace-pane-slot').forEach(slot => {
    const bounds = slot.getBoundingClientRect(), style = getComputedStyle(slot);
    slot.style.transition = 'none'; slot.style.width = `${bounds.width}px`;
    slot.style.marginLeft = style.marginLeft; slot.style.marginRight = style.marginRight;
   });
  };
  const openPopover = () => Boolean(element.querySelector('[aria-haspopup][aria-expanded="true"]'));
  const down = () => { pointerHeld.current = true; freeze(); };
  const release = () => {
   if (!held.current || pointerHeld.current) return;
   releaseFrames.current.forEach(cancelAnimationFrame);
   releaseFrames.current = [requestAnimationFrame(() => {
    releaseFrames.current.push(requestAnimationFrame(() => {
     if (pointerHeld.current || openPopover()) return;
     held.current = false;
     settleAfter.current = performance.now() + (parseFloat(element.style.getPropertyValue('--pane-duration')) || 0) + 60;
     anchorUntil.current = settleAfter.current; ignoredViewport.current = null;
     restoreAnchor.current = capturePaneReadingAnchors(element);
     element.querySelectorAll<HTMLElement>('.workspace-pane-slot').forEach(slot => {
      slot.style.removeProperty('transition'); slot.style.removeProperty('width');
      slot.style.removeProperty('margin-left'); slot.style.removeProperty('margin-right');
     });
    }));
   })];
  };
  const up = () => { pointerHeld.current = false; release(); };
  const popovers = new MutationObserver(() => {
   if (openPopover()) { if (!held.current) freeze(); } else release();
  });
  popovers.observe(element, { subtree:true, attributes:true, attributeFilter:['aria-expanded'], childList:true });
  document.addEventListener('keyup', release, true);
  pointerDown.current = down;
  document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
  element.addEventListener('wheel', cancelAnchor, { passive: true });
  element.addEventListener('keydown', cancelAnchor, true); element.addEventListener('focusin', focusIn, true);
  window.addEventListener('blur', up);
  return () => {
   releaseFrames.current.forEach(cancelAnimationFrame); popovers.disconnect();
   document.removeEventListener('keyup', release, true);
   pointerDown.current = null;
   document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', up, true);
   element.removeEventListener('wheel', cancelAnchor); element.removeEventListener('keydown', cancelAnchor, true);
   element.removeEventListener('focusin', focusIn, true); window.removeEventListener('blur', up);
  };
 }, []);
 const focus = paneIds.includes(focusedId ?? '') ? focusedId : paneIds[0];
 return <div ref={root} onPointerDownCapture={() => pointerDown.current?.()} className="workspace-pane-layout" data-empty={paneIds.length === 0} data-speed={animationMode} style={{ '--pane-duration': `${duration}ms` } as CSSProperties}>
  {slots.map(id => {
   const live = paneIds.includes(id), active = id === focus;
   const weight = paneIds.length === 2 ? 1.16 : 1.2;
   const target = !live || (!entered.includes(id) && !reduced) ? 0 : compact || paneIds.length === 1 ? Math.min(available, paneIds.length === 1 ? 896 : available) : available * (active ? weight : 1) / (weight + paneIds.length - 1);
   const gap = live && entered.includes(id) && !compact && paneIds.length > 1 ? 8 : 0;
   return <div key={id} className={`workspace-pane-slot${live ? '' : ' workspace-pane-ghost'}`} data-slot-id={id} data-focused={active} hidden={live && compact && !active} inert={!live || (compact && !active)} aria-hidden={!live || (compact && !active) ? true : undefined}
    style={{ '--pane-width': `${target}px`, '--pane-gap': `${gap}px` } as CSSProperties}>
    {live ? nodeById.get(id) : null}
   </div>;
  })}
 </div>;
}
