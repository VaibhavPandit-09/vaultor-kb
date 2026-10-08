import { useEffect, useState, useLayoutEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import AppModal from '../modals/AppModal';
import ResourceThumbnail from '../ResourceThumbnail';
import api from '../../lib/api';
import {requestResourceAction} from '../../lib/resourceActions';
import type {Resource} from '../../types';
import {resourceDescription} from '../../lib/resourceKinds';
import {browseResources} from '../../lib/resourceBrowse';
import type { ResourceSummary } from '../../types';
import { imageInfo, imageNode, IMAGE_ACCEPT, uploadNoteImages } from '../../lib/noteImages';
import { pickFiles } from '../../lib/filePicker';
import { useRestoreFocusOnClose } from '../../lib/useRestoreFocusOnClose';

export default function ImagePicker({ editor, noteId, position, replaceId, close }: { editor: Editor; noteId: string; position: number; replaceId?: string; close: () => void }) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(0), [rows, setRows] = useState<ResourceSummary[]>([]), [more, setMore] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const [anchor] = useState(() => ({ position, valid: true }));
  const { captureFocus, restoreFocus } = useRestoreFocusOnClose(editor);
  const captured = useRef(false); if (!captured.current) { captureFocus(); captured.current = true; }
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const element = root.current; return () => { queueMicrotask(() => { if (!element?.isConnected) restoreFocus(); }); }; }, [restoreFocus]);
  useEffect(() => { const map = ({ transaction }: { transaction: Transaction }) => { if (transaction.docChanged) { const mapped = transaction.mapping.mapResult(anchor.position, 1); anchor.position = mapped.pos; anchor.valid &&= !mapped.deletedAcross; } }; editor.on('transaction', map); return () => { editor.off('transaction', map); }; }, [editor, anchor]);
  useEffect(() => { const controller = new AbortController(); void browseResources({q:query,type:'image',sort:'title',page,size:50},controller.signal).then(data => { if (controller.signal.aborted) return; setError(''); setRows(data.items); setMore(page + 1 < data.totalPages); }).catch(() => { if (!controller.signal.aborted) setError('Could not load image resources. Retry.'); }); return () => controller.abort(); }, [query, page, attempt]);
  const valid = () => { if (!anchor.valid || editor.isDestroyed) throw new Error('The insertion location changed. Close and choose a new location.'); };
  const choose = async (id: string) => { if (busy) return; setBusy(true); setError(''); try { await imageInfo(id); valid(); if (replaceId) { const node = editor.state.doc.nodeAt(anchor.position); if (node?.attrs.resourceId !== replaceId) throw new Error('The selected image changed. Select it again.'); editor.view.dispatch(editor.state.tr.setNodeMarkup(anchor.position, undefined, { ...node.attrs, resourceId: id })); } else if (!editor.commands.insertContentAt(anchor.position, imageNode(id), { errorOnInvalidContent: true })) throw new Error('Image insertion failed. Choose a new location.'); close(); } catch (error) { setError(error instanceof Error ? error.message : 'Image insertion failed.'); } finally { setBusy(false); } };
  return <AppModal open title={replaceId ? 'Replace image' : 'Add image'} onClose={close}><div ref={root} className="image-picker">
    <p className="browse-feedback">{replaceId?<>Only this placement changes. The original file and other placements are retained. <button onClick={async()=>{try{const {data}=await api.get<Resource>('/resources/'+replaceId+'/summary');await requestResourceAction('references',[data]);}catch{setError('Could not open usage. Retry.');}}}>View original usage</button></>:'Images retain their original bytes.'}</p>
    <button disabled={busy} onClick={async () => { setBusy(true); try { const files = await pickFiles(IMAGE_ACCEPT, !replaceId); valid(); if (files.length) { uploadNoteImages(noteId, editor, files, anchor.position, replaceId); close(); } } catch (error) { setError(error instanceof Error ? error.message : 'File selection failed.'); } finally { setBusy(false); } }}>Choose image files</button>
    <input autoFocus placeholder="Find an existing image…" aria-label="Find existing image" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />
    {error && <p role="alert">{error}<button onClick={() => setAttempt(value => value + 1)}>Retry loading</button></p>}
    <div className="image-picker-results">{rows.map(row => <div key={row.id} className="flex items-center gap-2"><ResourceThumbnail resource={row}/><button disabled={busy} onClick={() => void choose(row.id)}>{row.title}<small>{resourceDescription(row)}</small></button></div>)}{!rows.length && <p>No matching images. Choose files to add one.</p>}</div>
    {(page > 0 || more) && <div><button disabled={!page} onClick={() => setPage(value => value - 1)}>Previous</button><button disabled={!more} onClick={() => setPage(value => value + 1)}>Next</button></div>}
  </div></AppModal>;
}
