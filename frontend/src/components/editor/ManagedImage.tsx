/* eslint-disable react-refresh/only-export-components -- The Tiptap node owns its React node-view renderer. */
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState, useId } from 'react';
import { ImageIcon, MoreHorizontal } from 'lucide-react';
import { copyImage, downloadImage, loadImage, imageUploadPlugin } from '../../lib/noteImages';
import {requestResourceAction} from '../../lib/resourceActions';
import api from '../../lib/api';
import type {Resource} from '../../types';
import { openResourceLink } from '../../lib/resourceLinkNavigation';
import { useEscapeLayer, ESCAPE_PRIORITIES } from '../../lib/escape/escape';

function ImagePlacement({ node, selected, updateAttributes, deleteNode, editor, getPos }: NodeViewProps) {
  const escapeId = useId();
  const root = useRef<HTMLDivElement>(null), [url, setUrl] = useState<string>(), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [more, setMore] = useState(false), [width, setWidth] = useState<number>(), [details, setDetails] = useState(false);
  const attrs = node.attrs as { resourceId: string; alt: string; caption: string; width: number; alignment: string };
  useEscapeLayer({ id: 'image-tools-' + escapeId, active: more || details, priority: ESCAPE_PRIORITIES.popover, close: () => { setMore(false); setDetails(false); } });
  useEffect(() => {
    const controller = new AbortController(); let active = true, release: (() => void) | undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a placement owns its authenticated request and cache.
    setUrl(undefined); setError('');
    const load = () => { void loadImage(attrs.resourceId, controller.signal).then(file => { if (!active) { file.release(); return; } release = file.release; setUrl(file.url); }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Image unavailable.'); }); };
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); load(); } }, { rootMargin: '300px' });
    if (observer && root.current) observer.observe(root.current); else load();
    return () => { active = false; controller.abort(); observer?.disconnect(); release?.(); };
  }, [attrs.resourceId, attempt]);
  const replace = () => editor.view.dom.dispatchEvent(new CustomEvent('vaultor:image-picker', { detail: { position: getPos(), replaceId: attrs.resourceId } }));
  const action = (work: () => Promise<unknown>) => { void work().catch(error => setError(error instanceof Error ? error.message : 'Image action failed.')); };
  const resize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const parent = root.current?.parentElement; if (!parent) return;
    event.preventDefault(); const handle = event.currentTarget; handle.setPointerCapture(event.pointerId);
    const start = event.clientX, original = attrs.width, canvas = parent.clientWidth; let next = original;
    const move = (e: PointerEvent) => { next = Math.round(Math.max(20, Math.min(100, original + (e.clientX - start) / canvas * 100))); setWidth(next); };
    const end = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', cancel); updateAttributes({ width: next }); setWidth(undefined); };
    const cancel = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', cancel); setWidth(undefined); };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', end, { once: true }); handle.addEventListener('pointercancel', cancel, { once: true });
  };
  return <NodeViewWrapper className="managed-image" data-selected={selected} data-alignment={attrs.alignment} contentEditable={false}>
    <div ref={root} className="managed-image-frame" style={{ width: `${width ?? attrs.width}%` }} tabIndex={0} aria-label={attrs.alt || 'Image in note'}>
      {url ? <img src={url} alt={attrs.alt} draggable={false} onError={() => setError('Image could not be displayed. Retry or replace it.')} /> : <div className="managed-image-loading"><ImageIcon size={24} />{error ? 'Image unavailable' : 'Loading image…'}</div>}
      <button className="image-resize-handle" onPointerDown={resize} aria-label="Drag to resize image" />
    </div>
    <div className="image-toolbar" role="toolbar" aria-label="Image tools">
      <label>Width <input aria-label="Image width percent" type="number" min={20} max={100} value={width ?? attrs.width} onChange={event => setWidth(Number(event.target.value))} onBlur={() => { if (width !== undefined && width >= 20 && width <= 100) updateAttributes({ width: Math.round(width) }); setWidth(undefined); }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur(); }} />%</label>
      {['left', 'center', 'right'].map(alignment => <button key={alignment} aria-label={`Align image ${alignment}`} aria-pressed={attrs.alignment === alignment} onClick={() => updateAttributes({ alignment })}>{alignment}</button>)}
      <button onClick={() => setDetails(value => !value)} aria-expanded={details}>Caption & alt</button><button onClick={replace}>Replace</button>
      <button aria-label="More image actions" aria-expanded={more} onClick={() => setMore(value => !value)}><MoreHorizontal size={16} /></button>
      {more && <div className="image-more" role="group" aria-label="More image actions"><button onClick={() => { setMore(false); openResourceLink(editor, attrs.resourceId, false); }}>Preview</button><button onClick={() => action(() => copyImage(attrs.resourceId))}>Copy image</button><button onClick={() => action(() => downloadImage(attrs.resourceId))}>Download original</button><button onClick={()=>action(async()=>{const {data}=await api.get<Resource>('/resources/'+attrs.resourceId+'/summary');setMore(false);await requestResourceAction('references',[data]);})}>Used in…</button><button onClick={deleteNode}>Remove from note</button></div>}
    </div>
    {details && <div className="image-details"><label>Alternative text<input maxLength={2000} value={attrs.alt} onChange={event => updateAttributes({ alt: event.target.value })} /></label><label>Caption<input maxLength={2000} value={attrs.caption} onChange={event => updateAttributes({ caption: event.target.value })} /></label></div>}
    {attrs.caption && <div className="image-caption">{attrs.caption}</div>}
    {error && <div className="image-error" role="status">{error}<button onClick={() => setAttempt(value => value + 1)}>Retry</button><button onClick={replace}>Replace</button><button onClick={() => action(() => downloadImage(attrs.resourceId))}>Download original</button></div>}
  </NodeViewWrapper>;
}
export const ManagedImage = Node.create({
  name: 'image', group: 'block', atom: true, draggable: true,
  addAttributes() { return { resourceId: { default: null }, alt: { default: '' }, caption: { default: '' }, width: { default: 100 }, alignment: { default: 'center' } }; },
  // External HTML images are not imported or fetched implicitly.
  parseHTML() { return [{ tag: 'figure[data-vaultor-image]', getAttrs: element => ({ resourceId: element.getAttribute('data-vaultor-image') }) }]; },
  renderHTML({ HTMLAttributes }) { return ['figure', mergeAttributes({ 'data-vaultor-image': HTMLAttributes.resourceId }, HTMLAttributes), ['figcaption', HTMLAttributes.caption || HTMLAttributes.alt || 'Image']]; },
  addNodeView() { return ReactNodeViewRenderer(ImagePlacement); },
  addProseMirrorPlugins() { return [imageUploadPlugin(this.editor)]; },
});
