import { useRef, useState } from 'react';
import AppModal from './AppModal';
import { importResource, type ImportRow, type ImportSession } from '../../lib/fileImports';
import type { Resource } from '../../types';

export default function FileImportModal({ session, onClose, onResource }: { session: ImportSession; onClose: () => void; onResource: (resource: Resource) => void }) {
  const [rows, setRows] = useState(session.rows);
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const update = (id: string, patch: Partial<ImportRow>) => setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  async function apply() {
    if (running.current) return;
    running.current = true; setPending(true);
    try {
      for (const row of rows.filter(item => item.status !== 'done')) {
        update(row.id, { status: 'pending', error: undefined });
        try {
          const needsDocument = session.target ? session.mode !== 'link' : row.asNote;
          if (needsDocument && (!row.doc || row.parseError)) throw new Error(row.parseError || 'Cannot read this document.');
          session.target?.assertValid();
          update(row.id, { started: true });
          if (session.target) {
            let content = row.doc?.content ?? [];
            if (session.mode === 'csv' || session.mode === 'link') {
              const resource = await importResource(row.id, row.file);
              onResource(resource);
              if (session.mode === 'link') content = [{ type: 'resourceLink', attrs: { resourceId: resource.id, label: resource.title, type: 'file' } }, { type: 'text', text: ' ' }];
              else content = content.map(node => node.type === 'table' ? { ...node, attrs: { ...node.attrs, sourceResourceId: resource.id, sourceResourceTitle: resource.title, sourceResourceType: 'file' } } : node);
            }
            session.target.insert(content.length ? content : [{ type: 'paragraph' }]);
          } else {
            const resource = await importResource(row.id, row.file, row.asNote ? row.doc : undefined,session.collection?.id);
            onResource(resource);
          }
          update(row.id, { status: 'done' });
        } catch (error) { update(row.id, { status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
      }
    } finally { running.current = false; setPending(false); }
  }
  const complete = rows.every(row => row.status === 'done');
  return <AppModal open title={session.target ? 'Insert file into note' : 'Import files'} description={session.target ? 'Your command is replaced only after a successful import. Cancel keeps the note unchanged.' : 'Choose how to import each file. Existing notes are never overwritten.'} widthClassName="max-w-2xl" onClose={() => { if (!running.current) onClose(); }}>
    <div className="space-y-4">
      {session.collection&&<p className="rounded-lg border border-border p-3 text-sm">Import destination: <strong>{session.collection.name}</strong>. Every successful import will join this collection.</p>}
      {rows.map(row => <div key={row.id} className="rounded-xl border border-border p-3 space-y-2">
        <p className="break-all font-medium">{row.file.name}</p>
        {!session.target && <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">Import as <select aria-label={`Import ${row.file.name} as`} disabled={pending || row.started || row.status === 'done'} value={row.asNote ? 'note' : 'file'} onChange={e => update(row.id, { asNote: e.target.value === 'note', error: undefined, status: 'ready' })} className="rounded border border-border bg-background p-2">
            <option value="file">Original file</option>
            {row.kind !== 'binary' && <option value="note">{row.kind === 'csv' ? 'Note with table' : row.kind === 'code' ? 'Note with code block' : 'Note'}</option>}
          </select></label>
          {row.kind !== 'binary' && <button disabled={pending} className="text-xs text-primary disabled:opacity-50" onClick={() => setRows(current => current.map(other => other.kind === row.kind && !other.started && other.status !== 'done' ? { ...other, asNote: row.asNote } : other))}>Apply to similar files</button>}
        </div>}
        {(row.asNote || session.target) && row.warnings.map((warning, i) => <p key={i} className="text-sm text-amber-600">{warning}</p>)}
        {(row.asNote || (session.target && session.mode !== 'link')) && row.parseError && <p role="alert" className="text-sm text-red-500">{row.parseError}</p>}
        {row.error && <p role="alert" className="text-sm text-red-500">{row.error}</p>}
        <p role="status" className="text-xs text-[var(--text-secondary)]">{row.status === 'done' ? 'Imported' : row.status === 'pending' ? 'Importing…' : row.status === 'failed' ? 'Failed — retry below' : 'Ready for review'}</p>
      </div>)}
      <div className="flex justify-end gap-2">
        <button disabled={pending} className="rounded-lg border border-border px-3 py-2" onClick={onClose}>{complete ? 'Done' : 'Cancel'}</button>
        {!complete && <button disabled={pending} className="rounded-lg bg-primary px-3 py-2 text-white disabled:opacity-50" onClick={() => void apply()}>{pending ? 'Importing…' : rows.some(row => row.status === 'failed') ? 'Retry failed files' : 'Import'}</button>}
      </div>
    </div>
  </AppModal>;
}
