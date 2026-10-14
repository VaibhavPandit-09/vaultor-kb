import { useRef, type ReactNode, type RefObject } from 'react';
import { useLibraryCompression } from '../lib/useLibraryCompression';

/** The same mounted controls change geometry; compact sidebar shortcuts opt out. */
export default function LibraryOrientation({ enabled, active, viewport, children, context }: {
  enabled: boolean; active: boolean; viewport: RefObject<HTMLElement | null>; children: ReactNode; context: ReactNode;
}) {
  const header = useRef<HTMLDivElement>(null);
  useLibraryCompression(viewport, header, enabled && active);
  if (!enabled) return <>{children}{context}</>;
  return <div ref={header} className="library-orientation">
    <div className="library-orientation-layout">{children}</div>
    <div className="library-working-context">{context}</div>
  </div>;
}
