import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { ReadingPosition } from '../lib/paneNavigation';

/** Visit changes restore position without remounting an unchanged note editor. */
export default function JourneyViewport({ visitId, initialPosition, onPosition, direction, animationMode, children }: {
  visitId: string; initialPosition: ReadingPosition; onPosition: (position: Partial<ReadingPosition>) => void;
  direction?: string; animationMode: 'smooth' | 'snappy'; children: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null), interacted = useRef(false);
  useLayoutEffect(() => {
    interacted.current = false;
    const initial = initialPosition;
    if (element.current) {
      element.current.style.animation = 'none';
      void element.current.offsetWidth;
      element.current.style.animation = '';
    }
    const restore = () => { if (element.current && !interacted.current) { element.current.scrollTop = initial.scrollTop; element.current.scrollLeft = initial.scrollLeft; } };
    restore(); const frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  // Each visit restores its captured position once; scroll/typing updates must not rewind it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);
  return <div ref={element} className="journey-viewport min-h-0 flex-1 overflow-y-auto px-4" data-motion={direction} data-speed={animationMode}
    onWheel={() => { interacted.current = true; }} onPointerDown={() => { interacted.current = true; }} onKeyDown={() => { interacted.current = true; }}
    onScroll={event => onPosition({ scrollTop: event.currentTarget.scrollTop, scrollLeft: event.currentTarget.scrollLeft })}>{children}</div>;
}
