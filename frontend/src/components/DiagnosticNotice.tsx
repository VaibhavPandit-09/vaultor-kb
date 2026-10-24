import type { DiagnosticEvent } from '../lib/diagnostics';
export default function DiagnosticNotice({event,saveFailed,onDetails,onRetrySaves,onDismiss}:{event:DiagnosticEvent;saveFailed:boolean;onDetails:()=>void;onRetrySaves:()=>void;onDismiss:()=>void}) {
 if(event.severity==='info'||(event.category==='save'&&!saveFailed))return null;
 const critical=event.severity==='critical';
 return <div role="alert" data-diagnostic-category={event.category} data-diagnostic-severity={event.severity} className={'z-[1200] flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-sm '+(critical?'bg-red-950 text-white':'bg-[var(--surface-3)] text-[var(--text-primary)]')}>
  <span>{event.category==='save'?'Changes could not be saved. Your pending edits are retained.':event.message}</span>
  <button className="library-button" onClick={onDetails}>Details</button>
  {event.category==='save'&&saveFailed&&<button className="library-button" onClick={onRetrySaves}>Retry saves</button>}
  <button className="library-button" onClick={onDismiss}>Dismiss</button>
 </div>;
}
