import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ChevronRight, MoreHorizontal } from 'lucide-react';
import type { Pane } from '../lib/paneNavigation';
import { useAnchoredPortalPosition } from '../lib/useAnchoredPortalPosition';
import { ESCAPE_PRIORITIES, useEscapeLayer } from '../lib/escape/escape';

export default function JourneyBar({ pane, motion, animationMode, onJump }: {
  pane: Pane; motion: 'back' | 'forward' | 'replace' | 'switch'; animationMode: 'smooth' | 'snappy'; onJump: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const { position } = useAnchoredPortalPosition(open, anchor, { width: 320, minWidth: 200, align: 'start', offset: 8 });
  const close = () => { setOpen(false); anchor.current?.focus(); };
  useEscapeLayer({ active: open, priority: ESCAPE_PRIORITIES.popover, close, restoreFocusOnEscape: false });
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const selected = panel.current?.querySelector<HTMLElement>('[aria-current="step"]');
      (selected ?? panel.current?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
      selected?.scrollIntoView?.({ block: 'nearest' });
    });
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  const go = (index: number) => { if (open) close(); onJump(index); };
  const current = pane.history[pane.cursor];
  return <nav aria-label="Note journey" className="journey-bar" data-speed={animationMode}>
    <div className="journey-controls">
      <button className="journey-icon" aria-label="Journey back" title="Previous journey step" disabled={!pane.history[pane.cursor - 1] || pane.history[pane.cursor - 1].unavailable} onClick={() => go(pane.cursor - 1)}><ArrowLeft size={16} /></button>
      <button className="journey-icon" aria-label="Journey forward" title="Next journey step" disabled={!pane.history[pane.cursor + 1] || pane.history[pane.cursor + 1].unavailable} onClick={() => go(pane.cursor + 1)}><ArrowRight size={16} /></button>
      <button ref={anchor} className="journey-icon" aria-label="Show full journey" title={`${pane.cursor + 1} of ${pane.history.length} steps`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}><MoreHorizontal size={17} /></button>
    </div>
    <ol key={pane.paneId + ':' + current.visitId} className="journey-trail" data-motion={motion}>
      {pane.history.map((entry, index) => ({ entry, index })).filter(({ index }) => Math.abs(index - pane.cursor) <= 1).map(({ entry, index }) => <li key={entry.visitId} className={index === pane.cursor ? 'journey-current' : 'journey-neighbor'}>
        {index > Math.max(0, pane.cursor - 1) && <ChevronRight size={13} aria-hidden="true" className="journey-divider" />}
        <button title={entry.title + (entry.unavailable ? ' · Unavailable' : '')} aria-current={index === pane.cursor ? 'step' : undefined} disabled={entry.unavailable} onClick={() => go(index)}>{entry.title || 'Untitled note'}{entry.unavailable && ' · Unavailable'}</button>
      </li>)}
    </ol>
    <span className="sr-only" role="status">Step {pane.cursor + 1} of {pane.history.length}: {current.title}</span>
    {open && position && createPortal(<div ref={panel} role="dialog" aria-label="Full note journey" className="journey-popover" style={{ position: 'fixed', zIndex: 85, top: position.top, left: position.left, width: position.width, maxHeight: Math.min(position.maxHeight ?? 420, 420), transform: position.placement === 'top' ? 'translateY(-100%)' : undefined }} onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!buttons.length) return;
      event.preventDefault(); const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    }}><p className="px-3 pb-2 pt-1 text-xs text-[var(--text-tertiary)]">Journey · {pane.history.length} steps</p><ol>{pane.history.map((entry, index) => <li key={entry.visitId}><button className="journey-step" aria-label={`Step ${index + 1}: ${entry.title}${entry.unavailable ? ", unavailable" : ""}`} disabled={entry.unavailable} aria-current={index === pane.cursor ? 'step' : undefined} onClick={() => go(index)}><span className="w-6 shrink-0 text-xs opacity-60">{index + 1}</span><span className="min-w-0 break-words">{entry.title || 'Untitled note'}{entry.unavailable && <small className="block">Unavailable</small>}</span>{index === pane.cursor && <span className="ml-auto text-xs text-primary">Current</span>}</button></li>)}</ol></div>, document.body)}
  </nav>;
}
