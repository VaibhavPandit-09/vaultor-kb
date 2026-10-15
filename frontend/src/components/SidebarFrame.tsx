import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { SidebarVisibility } from '../lib/sidebarVisibility';
import { PanelLeft } from 'lucide-react';

/** One sidebar tree across docked, edge-revealed and hidden geometries. */
export default function SidebarFrame({ floating, open, focusMode, pinned, onReveal, onHide, onToggle, surfaceStyle, children }: {
  floating: boolean; open: boolean; focusMode: boolean; pinned: boolean;
  onReveal: () => void; onHide: () => void; onToggle: () => void; surfaceStyle?: CSSProperties; children: ReactNode;
}) {
  const ownsFocus = useRef(false);
  const panel = useRef<HTMLElement>(null), launcher = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ onReveal, onHide });
  useLayoutEffect(() => { callbacks.current = { onReveal, onHide }; });
  useLayoutEffect(() => {
    if (!open && (ownsFocus.current || panel.current?.contains(document.activeElement) || panel.current?.querySelector('[aria-haspopup][aria-expanded="true"]'))) launcher.current?.focus({ preventScroll: true });
    if (!open) ownsFocus.current = false;
  }, [open]);
  useEffect(() => {
    const root = panel.current, allocation = root?.parentElement, content = root?.querySelector<HTMLElement>('.sidebar-content');
    if (!root || !allocation || !content) return;
    let pointer = false, held = false, frame = 0;
    const clear = () => {
      root.style.removeProperty('transform'); root.style.removeProperty('transition'); root.style.removeProperty('visibility');
      allocation.style.removeProperty('width'); allocation.style.removeProperty('transition');
      content.style.removeProperty('transform'); content.style.removeProperty('opacity'); content.style.removeProperty('transition');
      held = false;
    };
    const release = () => {
      pointer = false; cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
        if (!pointer && !root.querySelector('[aria-haspopup][aria-expanded="true"]')) clear();
      }); });
    };
    const down = () => {
      pointer = true; cancelAnimationFrame(frame);
      if (held) return;
      const surface = getComputedStyle(root), transform = surface.transform, visibility = surface.visibility, child = getComputedStyle(content);
      const width = allocation.getBoundingClientRect().width, childTransform = child.transform, opacity = child.opacity;
      root.style.transform = transform || 'none'; root.style.visibility = visibility; root.style.transition = 'none';
      allocation.style.width = `${width}px`; allocation.style.transition = 'none';
      content.style.transform = childTransform || 'none'; content.style.opacity = opacity; content.style.transition = 'none';
      held = true;
    };
    const observer = new MutationObserver(() => { if (held && !pointer) release(); });
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });
    root.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', release, true); document.addEventListener('pointercancel', release, true); window.addEventListener('blur', release);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); clear(); root.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', release, true); document.removeEventListener('pointercancel', release, true); window.removeEventListener('blur', release);
    };
  }, []);
  useEffect(() => {
    const root = panel.current;
    if (!root || !floating || !open || focusMode || pinned) return;
    let timer: ReturnType<typeof setTimeout> | undefined, pointer = false;
    const held = () => pointer || root.matches(':hover') || root.contains(document.activeElement)
      || Boolean(root.querySelector('[aria-haspopup][aria-expanded="true"]'));
    const clear = () => { clearTimeout(timer); };
    const schedule = () => { clear(); timer = setTimeout(() => { if (!held()) callbacks.current.onHide(); }, 180); };
    const enter = () => clear();
    const down = () => { pointer = true; clear(); };
    const release = () => { pointer = false; schedule(); };
    const observer = new MutationObserver(schedule);
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });
    root.addEventListener('mouseenter', enter); root.addEventListener('mouseleave', schedule);
    root.addEventListener('focusin', clear); root.addEventListener('focusout', schedule);
    root.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', release, true); document.addEventListener('pointercancel', release, true);
    window.addEventListener('blur', release);
    return () => {
      clear(); observer.disconnect(); root.removeEventListener('mouseenter', enter); root.removeEventListener('mouseleave', schedule);
      root.removeEventListener('focusin', clear); root.removeEventListener('focusout', schedule); root.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', release, true); document.removeEventListener('pointercancel', release, true); window.removeEventListener('blur', release);
    };
  }, [floating, open, focusMode, pinned]);
  return <>
    <button ref={launcher} id="sidebar-trigger" className="sidebar-edge-toggle" hidden={open}
      aria-label={focusMode ? 'Show navigation and exit focus mode' : 'Toggle sidebar'} aria-controls="workspace-sidebar" aria-expanded={open}
      onClick={onToggle}><PanelLeft size={18}/></button>
    {floating && !focusMode && <div className="sidebar-reveal-edge" onMouseEnter={onReveal} aria-hidden="true"/>}
    <div className="sidebar-allocation" data-floating={floating} data-open={open}>
      <aside ref={panel} id="workspace-sidebar" aria-label="Workspace navigation" aria-hidden={!open} inert={!open}
        className="sidebar-surface" style={surfaceStyle}
        onFocusCapture={() => { ownsFocus.current = true; }} onBlurCapture={event => {
          if (event.relatedTarget && !panel.current?.contains(event.relatedTarget as Node)) ownsFocus.current = false;
        }} onMouseEnter={() => { if (floating && !focusMode) callbacks.current.onReveal(); }}>
        <SidebarVisibility value={open}><div className="sidebar-content">{children}</div></SidebarVisibility>
      </aside>
    </div>
  </>;
}
