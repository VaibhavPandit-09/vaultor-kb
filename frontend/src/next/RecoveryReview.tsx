import type { JSONContent } from '@tiptap/core';
import AppModal from '../components/modals/AppModal';
import type { Draft, Note } from './client';
function text(node: JSONContent): string { return (node.text ?? '') + (node.content?.map(text).join(node.type === 'doc' ? '\n\n' : '') ?? ''); }
export default function RecoveryReview({ draft, saved, busy, close, resolve }: { draft: Draft; saved: Note; busy: boolean; close: () => void; resolve: (choice: 'restore' | 'discard' | 'park') => void }) {
  const conflict = draft.baseRevision !== saved.revision;
  return <AppModal open title={conflict ? 'Saved version changed' : 'Recover interrupted editing'} description="Your protected draft is separate from the saved note. Review both versions before deciding." widthClassName="max-w-4xl" onClose={close} footer={<div className="next-recovery-actions">
    <button disabled={busy} onClick={() => resolve('park')}>Keep draft for later</button>
    <button disabled={busy} onClick={() => resolve('discard')}>Discard draft and use saved</button>
    <button disabled={busy} onClick={() => resolve('restore')}>{conflict ? 'Use draft over reviewed saved version' : 'Restore draft'}</button>
  </div>}><div className="next-comparison"><section><h4>Protected draft · based on revision {draft.baseRevision}</h4><strong>{draft.title || '(Untitled)'}</strong><pre>{text(draft.content).slice(0,200000)}</pre></section><section><h4>Saved version · revision {saved.revision}</h4><strong>{saved.title}</strong><pre>{text(saved.content).slice(0,200000)}</pre></section></div><small>Preview shows up to 200,000 characters per version. Full content remains stored. Keeping a draft closes its editor; reopen it from Recovery.</small></AppModal>;
}
