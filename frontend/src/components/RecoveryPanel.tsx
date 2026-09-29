import { useRef, useState } from 'react';
import type { RecoveryRecord } from '../lib/sessionStore';
import AppModal from './modals/AppModal';
export default function RecoveryPanel({ records, onClose, onResolve, onRetry, canRetry }: { records: RecoveryRecord[]; onRetry: (record: RecoveryRecord) => Promise<void>; canRetry: (record: RecoveryRecord) => boolean; onClose: () => void; onResolve: (record: RecoveryRecord, copy: boolean) => Promise<void> }) {
  const busy = useRef(false), [pending, setPending] = useState(''), [error, setError] = useState('');
  const resolve = async (record: RecoveryRecord, copy: boolean) => {
    if (busy.current) return; busy.current = true; setPending(record.key); setError('');
    try { await onResolve(record, copy); } catch (e) { setError(e instanceof Error ? e.message : 'Recovery failed. Retry.'); } finally { busy.current = false; setPending(''); }
  };
  const retry = async (record:RecoveryRecord) => {if(busy.current)return;busy.current=true;setPending(record.key);setError('');try{await onRetry(record);}catch{setError('Saving failed. Your draft is retained.');}finally{busy.current=false;setPending('');}};
  return <AppModal open title="Recover drafts" description="Saved notes are unchanged. Recover a separate copy or keep the saved version." onClose={onClose} widthClassName="max-w-xl"><div className="space-y-4">{error && <p role="alert">{error}</p>}{records.map(record => <section key={record.key} className="rounded-xl border border-border p-3"><p className="font-medium break-words">{record.value.title || 'Untitled note'}</p><div className="flex flex-wrap gap-2 mt-3"><>{canRetry(record)&&<button className="library-button" disabled={Boolean(pending)} onClick={()=>void retry(record)}>Retry save</button>}</><button autoFocus={records[0]===record} className="library-button" disabled={Boolean(pending)} onClick={() => void resolve(record,true)}>{pending===record.key?'Working…':'Open recovered copy'}</button><button className="library-button" disabled={Boolean(pending)} onClick={() => void resolve(record,false)}>Use saved version</button></div></section>)}{!records.length && <p>No unresolved recovery drafts.</p>}</div></AppModal>;
}
