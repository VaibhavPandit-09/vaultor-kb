import { frameResizeObserver } from '../lib/frameResizeObserver';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { attachLibraryCompression } from '../lib/useLibraryCompression';

/** Same note identity and organization controls, inside the visit's scroll owner. */
export default function NoteOrientation({ identity, children, status, tagCount }: {
  identity: ReactNode; children: ReactNode; status?: ReactNode; tagCount: number;
}) {
  const header = useRef<HTMLDivElement>(null), organization = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null), mode = useRef<'auto' | 'open' | 'closed'>('auto');
  const [disclosure, setDisclosure] = useState<'auto' | 'open' | 'closed'>('auto');
  const regionId = useId();
  useEffect(() => {
    const root = header.current, content = organization.current, button = toggle.current;
    const viewport = root?.parentElement;
    if (!root || !content || !button || !viewport) return;
    const update = (progress: number) => {
      // Folded controls have an explicit, always reachable disclosure. Never
      // leave keyboard focus in visually clipped organization controls.
      const folded = mode.current === 'closed' || (progress > .001 && mode.current !== 'open');
      content.inert = folded;
      root.dataset.folded = String(mode.current === 'closed' || (progress > .98 && mode.current !== 'open'));
      button.setAttribute('aria-expanded', String(!folded));
    };
    const measure = () => {
      const height=`${content.firstElementChild?.scrollHeight ?? 0}px`;
      if(viewport.style.getPropertyValue('--note-organization-height')!==height)viewport.style.setProperty('--note-organization-height',height);
    };
    measure();
    const observer = frameResizeObserver(measure);
    if (content.firstElementChild) observer.observe(content.firstElementChild);
    const stop = attachLibraryCompression(viewport, root, { pinHeaderFocus: true, onProgress: update });
    return () => { stop(); observer.disconnect(); viewport.style.removeProperty('--note-organization-height'); };
  }, []);
  return <div ref={header} className="note-orientation" data-organization-open={disclosure}>
    <div className="note-heading"><div className="note-identity">{identity}</div>
    <button ref={toggle} className="note-organization-toggle" aria-controls={regionId} aria-expanded={disclosure === 'auto' ? undefined : disclosure === 'open'}
      onClick={() => {
        const next = toggle.current?.getAttribute('aria-expanded') !== 'true';
        mode.current = next ? 'open' : 'closed'; setDisclosure(mode.current);
        if (organization.current) organization.current.inert = !next;
        if (header.current) header.current.dataset.folded = String(!next);
      }}>
      Organization <span>· {tagCount} {tagCount === 1 ? 'tag' : 'tags'}</span><ChevronDown size={13}/>
    </button></div>
    <div ref={organization} id={regionId} className="note-organization"><div>{children}</div></div>
    {status && <div className="note-availability">{status}</div>}
  </div>;
}
