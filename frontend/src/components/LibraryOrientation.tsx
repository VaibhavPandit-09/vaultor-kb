import { useLayoutEffect,useRef,useState, type ReactNode, type RefObject } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { syncLibraryControls,useLibraryCompression } from '../lib/useLibraryCompression';
import { useEscapeLayer,ESCAPE_PRIORITIES } from '../lib/escape/escape';

/** The same mounted controls change geometry; compact sidebar shortcuts opt out. */
export default function LibraryOrientation({ enabled, active, viewport, children, context,filterSummary,selectionActive=false }: {
  enabled: boolean; active: boolean; viewport: RefObject<HTMLElement | null>; children: ReactNode; context: ReactNode;filterSummary?:string;selectionActive?:boolean;
}) {
  const header = useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null),[tools,setTools]=useState(selectionActive);
  const focusRequested=useRef(false),[previousSelection,setPreviousSelection]=useState(selectionActive);
  if(previousSelection!==selectionActive){setPreviousSelection(selectionActive);setTools(selectionActive);}
  useLayoutEffect(()=>{if(header.current){syncLibraryControls(header.current);if(tools&&focusRequested.current)header.current.querySelector<HTMLElement>('.library-filters input,.library-filters button,.library-working-context button')?.focus();}focusRequested.current=false;},[tools]);
  useEscapeLayer({active:tools,priority:ESCAPE_PRIORITIES.popover,close:()=>{setTools(false);trigger.current?.focus();},restoreFocusOnEscape:false});
  useLibraryCompression(viewport, header, enabled && active);
  if (!enabled) return <>{children}{context}</>;
  return <div ref={header} className="library-orientation" data-tools={tools}>
    <button ref={trigger} className="browse-icon-button library-compact-tools" title={filterSummary||'Search, filters and result details'} aria-label={filterSummary||'Search, filters and result details'} aria-expanded={tools} onClick={()=>{focusRequested.current=!tools;setTools(value=>!value);}}><SlidersHorizontal size={17}/>{filterSummary&&<span className="library-filter-indicator"/>}</button>
    <div className="library-orientation-layout">{children}</div>
    <div className="library-working-context">{context}</div>
  </div>;
}
