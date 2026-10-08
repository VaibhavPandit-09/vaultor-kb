import type { Editor, JSONContent } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Transaction } from '@tiptap/pm/state';
import api from './api';
import { getConnection, getPlatform, saveApiFile } from './platform';
import { importResource } from './fileImports';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { isSharedTransaction } from './sharedNoteDocuments';
import { notifyResourceChange } from './resourceEvents';

export const IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_PIXELS = 40_000_000;
export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif';
export type ImageInfo = { format: string; width: number; height: number; bytes: number; animated: boolean };
export async function imageInfo(id: string, signal?: AbortSignal) { return (await api.get<ImageInfo>(`/resources/${id}/image-info`, { signal })).data; }
export function imageNode(resourceId: string): JSONContent { return { type: 'image', attrs: { resourceId, alt: '', caption: '', width: 100, alignment: 'center' } }; }
export async function loadImage(id: string, signal: AbortSignal) {
  const info = await imageInfo(id, signal);
  const native = getPlatform().previewApiFile;
  if (native) return native(`/resources/${id}/raw`, `image.${info.format}`, signal);
  const { data } = await api.get<Blob>(`/resources/${id}/raw`, { responseType: 'blob', signal });
  const url = URL.createObjectURL(data); return { url, release: () => URL.revokeObjectURL(url) };
}
export async function copyImage(id: string) {
  const native = getPlatform().copyResourceImage;
  if (native) return native(id);
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Image clipboard unavailable. Use Download original.');
  // Start clipboard access in the gesture; the PNG promise performs authenticated loading.
  const png = (async () => {
    const controller = new AbortController(), loaded = await loadImage(id, controller.signal);
    try { const image = new Image(); image.src = loaded.url; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext('2d')!.drawImage(image, 0, 0); return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image conversion failed.')), 'image/png')); }
    finally { loaded.release(); }
  })();
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}
export const editorImageNotes = new WeakMap<Editor, string>();
export async function downloadImage(id: string) { const { data } = await api.get<{ title: string }>(`/resources/${id}/summary`); return saveApiFile(`/resources/${id}/download`, data.title); }
export type ImageJob = { id: string; noteId: string; epoch: number; file?: File; resourceId?: string; position: number; valid: boolean; status: 'pending' | 'failed' | 'ready'; progress: number; error?: string; replaceId?: string; batch: string; order: number };
const jobs = new Map<string, ImageJob>(), views = new Map<string, Set<Editor>>(), listeners = new Set<() => void>();
let version = 0;
export const imageJobVersion = () => version;
export const subscribeImageJobs = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const noteImageJobs = (noteId: string) => [...jobs.values()].filter(job => job.noteId === noteId && job.epoch === getConnection().epoch);
const emit = () => { version++; listeners.forEach(listener => listener()); for (const group of views.values()) for (const editor of group) if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('imageJobs', true)); };
export const hasPendingImages = () => [...jobs.values()].some(job => job.status === 'pending' || Boolean(job.file));
if (typeof window !== 'undefined') window.addEventListener('beforeunload', event => { if (hasPendingImages()) { event.preventDefault(); event.returnValue = ''; } });
export function attachImageUploads(noteId: string, editor: Editor) {
  editorImageNotes.set(editor, noteId);
  const group = views.get(noteId) ?? new Set<Editor>(); views.set(noteId, group); group.add(editor);
  const map = ({ transaction }: { transaction: Transaction }) => {
    if (!transaction.docChanged || isSharedTransaction(transaction)) return;
    const currentJobs = noteImageJobs(noteId); if (!currentJobs.length) return;
    for (const job of currentJobs) { const result = transaction.mapping.mapResult(job.position, 1); job.position = result.pos; job.valid &&= !result.deletedAcross; }
    emit();
  };
  editor.on('transaction', map);
  return () => { editor.off('transaction', map); group.delete(editor); if (!group.size) { views.delete(noteId); for (const job of noteImageJobs(noteId)) job.valid = false; } emit(); };
}
export function removeImageJob(id: string) { jobs.delete(id); emit(); for (const job of [...jobs.values()]) if (job.status === 'ready' && job.resourceId) insertImageJob(job.id); }
export function insertImageJob(id: string, editor?: Editor) {
  const job = jobs.get(id); if (!job?.resourceId || job.epoch !== getConnection().epoch) return;
  if ([...jobs.values()].some(prior => prior.batch === job.batch && prior.order < job.order)) { job.status = 'ready'; emit(); return; }
  const target = editor ?? [...(views.get(job.noteId) ?? [])].find(view => !view.isDestroyed);
  if (!target || (!editor && !job.valid)) { job.status = 'ready'; emit(); return; }
  if (job.replaceId && !editor) {
    const node = target.state.doc.nodeAt(job.position);
    if (node?.type.name !== 'image' || node.attrs.resourceId !== job.replaceId) { job.valid = false; job.status = 'ready'; emit(); return; }
    target.view.dispatch(closeHistory(target.state.tr).setNodeMarkup(job.position, undefined, { ...node.attrs, resourceId: job.resourceId }));
  } else {
    target.view.dispatch(closeHistory(target.state.tr));
    if (!target.commands.insertContentAt(editor ? target.state.selection.from : job.position, imageNode(job.resourceId), { errorOnInvalidContent: true })) throw new Error('Image insertion failed. Retry or reopen the source note.');
  }
  target.view.dispatch(closeHistory(target.state.tr));
  if (!job.replaceId) { let end: number | undefined; target.state.doc.descendants((node, pos) => { if (node.type.name === 'image' && node.attrs.resourceId === job.resourceId && pos >= job.position - 1 && end === undefined) end = pos + node.nodeSize; }); if (end !== undefined) for (const next of jobs.values()) if (next.batch === job.batch && next.order > job.order) next.position = end; }
  jobs.delete(id); emit(); for (const next of [...jobs.values()]) if (next.batch === job.batch && next.status === 'ready' && next.resourceId) insertImageJob(next.id);
}
export async function retryImageJob(id: string) {
  const job = jobs.get(id); if (!job || job.status === 'pending' || job.epoch !== getConnection().epoch) return;
  job.status = 'pending'; job.error = undefined; emit();
  try {
    if (!job.resourceId) {
      const file = job.file!;
      if (!file.size || file.size > IMAGE_BYTES) throw new Error('Inline images must be nonempty and at most 20 MiB. Import larger files as resources.');
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) && !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) throw new Error('Use PNG, JPEG, WebP or GIF. Other formats can be imported as files.');
      const resource = await importResource(job.id, file, undefined, undefined, percent => { job.progress = percent; emit(); }); job.resourceId = resource.id; job.progress = 90;
      notifyResourceChange({ kind: 'metadata', ids: [resource.id] });
    }
    await imageInfo(job.resourceId);
    if (!jobs.has(id)) return;
    job.file = undefined; job.progress = 100; job.status = 'ready'; insertImageJob(id);
  } catch (error) { if (jobs.has(id)) { job.status = 'failed'; job.error = error instanceof Error ? error.message : 'Image upload failed. Retry.'; emit(); } }
}
export function uploadNoteImages(noteId: string, editor: Editor, files: File[], position = editor.state.selection.from, replaceId?: string) {
  let last = Promise.resolve();
  const batch = crypto.randomUUID(); let order = 0;
  for (const file of files) {
    const id = crypto.randomUUID(); jobs.set(id, { id, noteId, epoch: getConnection().epoch, file, position, valid: true, status: 'ready', progress: 0, replaceId, batch, order: order++ });
    // Sequential insertion keeps clipboard/drop order, including uncertain retries.
    last = last.then(() => retryImageJob(id));
  }
  emit();
}
export function clipboardImages(data: DataTransfer) { return Array.from(data.files).filter(file => file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp|heic)$/i.test(file.name)); }

/** Upload widgets are view decorations only: saves never serialize pending bytes/status. */
export function imageUploadPlugin(editor: Editor) {
  return new Plugin({ props: { decorations(state) {
    const noteId = editorImageNotes.get(editor); if (!noteId) return null;
    return DecorationSet.create(state.doc, noteImageJobs(noteId).filter(job => job.valid).map(job => Decoration.widget(Math.min(job.position, state.doc.content.size), () => { const element = document.createElement('span'); element.className = 'image-upload-anchor'; element.textContent = job.status === 'failed' ? 'Image upload needs attention' : job.status === 'pending' ? 'Uploading image…' : 'Image ready'; return element; }, { key: job.id, side: 1 })));
  } } });
}

export function validateImageContent(content: unknown) {
  if (!content || typeof content !== 'object') return;
  const node = content as JSONContent;
  if (node.type === 'image' && (!node.attrs?.resourceId || ['src','url','data','token'].some(key => key in node.attrs!))) throw new Error('This image uses an unsupported document representation. The original JSON is retained.');
  node.content?.forEach(validateImageContent);
}
