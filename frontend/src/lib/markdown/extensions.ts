import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

const sourceNode = (name: string, inline: boolean) => Node.create({
  name, inline, group: inline ? 'inline' : 'block', atom: true, selectable: true,
  addAttributes: () => ({ raw: { default: '', rendered: false }, kind: { default: '', rendered: false } }),
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
      return { dom, stopEvent: event => event.type === 'keydown', ignoreMutation: () => true };
    };
  },
});
export const markdownExtensions = () => [
  sourceNode('sourceBlock', false), sourceNode('sourceInline', true),
  Extension.create({
    name: 'markdownSourceAttributes',
    addGlobalAttributes: () => [
      { types: ['table'], attributes: { mdAlign: { default: [], rendered: false } } },
      { types: ['codeBlock'], attributes: { mdMeta: { default: null, rendered: false } } },
    ],
  }),
  Extension.create({
    name: 'markdownMarkBoundaries',
    addProseMirrorPlugins: () => [new Plugin({ appendTransaction(transactions, _old, state) {
      if (!transactions.some(tr => tr.docChanged) || transactions.some(tr => tr.getMeta('composition') !== undefined)) return null;
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
