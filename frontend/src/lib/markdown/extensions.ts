import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { isInTable, selectedRect } from '@tiptap/pm/tables';
import { LIMITS } from './limits';
import { clipboardReason, shapeCache, shapeReason } from './foreground';

/** Column semantics travel with cells through real PM column operations. */
export function setMarkdownAlignment(editor: Editor, alignment: 'left' | 'center' | 'right' | null) {
  if (!isInTable(editor.state)) return false;
  const rect = selectedRect(editor.state), tr = editor.state.tr;
  for (const pos of new Set(rect.map.cellsInRect({ left: rect.left, right: rect.right, top: 0, bottom: rect.map.height }))) {
    const cell = rect.table.nodeAt(pos)!;
    tr.setNodeMarkup(rect.tableStart + pos, undefined, { ...cell.attrs, mdAlignment: alignment });
  }
  editor.view.dispatch(tr); return true;
}

type SourceImage = (href:string)=>Promise<{url:string;release:()=>void}>;
const sourceNode = (name: string, inline: boolean, image?:SourceImage) => Node.create({
  name, inline, group: inline ? 'inline' : 'block', atom: true, selectable: true,
  addAttributes: () => ({ raw: { default: '', rendered: false }, kind: { default: '', rendered: false },mdUrl:{default:null,rendered:false},mdAlt:{default:null,rendered:false} }),
  parseHTML: () => [],
  renderHTML({ node, HTMLAttributes }) {
    // Content is text, never executable imported HTML. Action is owned by the
    // harness via click/keyboard delegation; raw source stays on the node.
    return [inline ? 'span' : 'div', mergeAttributes(HTMLAttributes, { 'data-source-kind': node.attrs.kind, role: 'button', tabindex: '0', contenteditable: 'false', 'aria-label': `Edit ${node.attrs.kind} source`, class: 'source-protected' }), `${node.attrs.kind}: ${String(node.attrs.raw).slice(0, 120)}`];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement(inline ? 'span' : 'div');
      dom.setAttribute('data-source-kind', node.attrs.kind); dom.setAttribute('role', 'button'); dom.setAttribute('tabindex', '0'); dom.setAttribute('contenteditable', 'false'); dom.setAttribute('aria-label', `Edit ${node.attrs.kind} source`); dom.className = 'source-protected'; dom.textContent = `${node.attrs.kind}: ${String(node.attrs.raw).slice(0, 120)}`;
      let disposed=false,release:(()=>void)|undefined;
      if(image&&node.attrs.kind==='image'&&typeof node.attrs.mdUrl==='string'){
        const preview=document.createElement('img');preview.alt=node.attrs.mdAlt??'';preview.loading='lazy';preview.className='max-h-96 max-w-full object-contain';
        void image(node.attrs.mdUrl).then(asset=>{if(disposed){asset.release();return;}release=asset.release;preview.src=asset.url;dom.replaceChildren(preview);dom.setAttribute('title','Edit image Markdown');}).catch(()=>{dom.setAttribute('title','Image unavailable; edit its preserved Markdown source.');});
      }
      return { dom, stopEvent: event => event.type === 'keydown', ignoreMutation: () => true,destroy(){disposed=true;release?.();} };
    };
  },
});
export type RefusedInput = { reason: string; text?: string; html?: string; steps?: unknown[] };
export const markdownExtensions = (options: { stress?: boolean; onRefused?: (input: RefusedInput) => void;image?:SourceImage } = {}) => [
  sourceNode('sourceBlock', false,options.image), sourceNode('sourceInline', true,options.image),
  Extension.create({
    name: 'markdownInputAdmission',
    addProseMirrorPlugins() {
      const shape = shapeCache();
      let clipboard: { text: string; html: string } | undefined;
      return [new Plugin({
        filterTransaction(tr) {
          if (!tr.docChanged) return true;
          const reason = shapeReason(shape(tr.doc), tr.doc.childCount, options.stress);
          if (!reason) return true;
          options.onRefused?.({ reason, ...clipboard, ...(shape(tr.doc).units <= LIMITS.bytes ? { steps: tr.steps.map(step => step.toJSON()) } : {}) }); return false;
        },
        props: { handleDOMEvents: { paste(_view, event) {
          const text = event.clipboardData?.getData('text/plain') ?? '', html = event.clipboardData?.getData('text/html') ?? '';
          if (text.length + html.length <= LIMITS.bytes) { clipboard = { text, html }; queueMicrotask(() => { clipboard = undefined; }); }
          const reason = clipboardReason(text, html); if (!reason) return false;
          event.preventDefault();
          options.onRefused?.({ reason: reason + ': input was not inserted; original clipboard is unchanged', ...(text.length + html.length <= LIMITS.bytes ? { text, html } : {}) });
          return true;
        } } },
      })];
    },
  }),
  Extension.create({
    name: 'markdownSourceAttributes',
    addGlobalAttributes: () => [
      { types: ['table'], attributes: { mdAlign: { default: [], rendered: false } } },
      { types: ['tableCell', 'tableHeader'], attributes: { mdAlignment: { default: null, parseHTML: (el: HTMLElement) => el.style.textAlign || el.getAttribute('align') || null, renderHTML: (a: Record<string, unknown>) => a.mdAlignment ? { style: `text-align: ${a.mdAlignment}` } : {} } } },
      { types: ['codeBlock'], attributes: { mdMeta: { default: null, rendered: false } } },
    ],
    addProseMirrorPlugins: () => [new Plugin({ appendTransaction(transactions, _old, state) {
      if (!transactions.some(tr => tr.docChanged)) return null;
      const tr = state.tr;
      state.doc.descendants((table, pos) => {
        if (table.type.name !== 'table') return;
        const header = table.firstChild;
        table.forEach((row, rowPos) => row.forEach((cell, cellPos, index) => {
          const alignment = header?.maybeChild(index)?.attrs.mdAlignment;
          if (cell.attrs.mdAlignment == null && alignment != null) tr.setNodeMarkup(pos + rowPos + cellPos + 2, undefined, { ...cell.attrs, mdAlignment: alignment });
        }));
      });
      return tr.docChanged ? tr : null;
    } })],
  }),
  Extension.create({
    name: 'markdownMarkBoundaries',
    addProseMirrorPlugins: () => [new Plugin({ appendTransaction(transactions, _old, state) {
      if ((!transactions.some(tr => tr.docChanged) && !transactions.some(tr => tr.getMeta('markdownCompositionEnd'))) || transactions.some(tr => tr.getMeta('composition') !== undefined)) return null;
      const tr = state.tr;
      state.doc.descendants((node, pos) => {
        if (!node.isText) return;
        const prefix = /^[ \t]+/.exec(node.text!)?.[0].length ?? 0, suffix = /[ \t]+$/.exec(node.text!)?.[0].length ?? 0;
        for (const mark of node.marks) {
          if (!['bold', 'italic', 'strike'].includes(mark.type.name)) continue;
          const before = state.doc.resolve(pos).nodeBefore, after = state.doc.resolve(pos + node.nodeSize).nodeAfter;
          if (prefix && !before?.marks.some(m => m.eq(mark))) tr.removeMark(pos, pos + prefix, mark);
          if (suffix && !after?.marks.some(m => m.eq(mark))) tr.removeMark(pos + node.nodeSize - suffix, pos + node.nodeSize, mark);
        }
      });
      return tr.docChanged ? tr : null;
    } })],
  }),
];
