import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node } from '@tiptap/pm/model';
import type { createLowlight } from 'lowlight';

/** Optional source-adapter policy. Cache immutable code nodes weakly; cap total
 * highlighted text per document, not just each fence. Plain code stays editable.
 * Ordinary managed notes retain the standard Lowlight plugin. */
export function boundedCodeHighlighting(lowlight: ReturnType<typeof createLowlight>, budget: number) {
  type Span = { from: number; to: number; classes: string };
  const cache = new WeakMap<Node, Span[]>(), languages = new Set(lowlight.listLanguages());
  const decorate = (doc: Node) => {
    let remaining = budget;
    const decorations: Decoration[] = [];
    doc.descendants((node, pos) => {
      if (node.type.name !== 'codeBlock') return;
      const language = node.attrs.language, size = node.textContent.length;
      if (size > remaining || !language || (!languages.has(language) && !lowlight.registered(language))) return false;
      remaining -= size;
      let spans = cache.get(node);
      if (!spans) {
        spans = []; let offset = 0;
        const walk = (children: ReturnType<typeof lowlight.highlight>['children'], classes: string[] = []) => {
          for (const child of children) {
            if (child.type === 'element') walk(child.children, [...classes, ...((child.properties.className ?? []) as string[])]);
            else if (child.type === 'text') { const from = offset; offset += child.value.length; if (classes.length) spans!.push({ from, to: offset, classes: classes.join(' ') }); }
          }
        };
        walk(lowlight.highlight(language, node.textContent).children); cache.set(node, spans);
      }
      for (const span of spans) decorations.push(Decoration.inline(pos + 1 + span.from, pos + 1 + span.to, { class: span.classes }));
      return false;
    });
    return DecorationSet.create(doc, decorations);
  };
  const codeNodes = (doc: Node) => {
    const nodes: Node[] = [];
    doc.descendants(node => { if (node.type.name === 'codeBlock') { nodes.push(node); return false; } });
    return nodes;
  };
  const plugin: Plugin<DecorationSet> = new Plugin<DecorationSet>({ state: {
    init: (_, state) => decorate(state.doc),
    apply: (tr, value, old) => {
      if (!tr.docChanged) return value;
      const before=codeNodes(old.doc), after=codeNodes(tr.doc);
      // Preserve decoration identity as positions move. Recreating equivalent
      // spans makes every React code node view update on unrelated prose input.
      if (before.length===after.length && before.every((node,i)=>node===after[i])) return value.map(tr.mapping,tr.doc);
      return decorate(tr.doc);
    },
  }, props: { decorations: state => plugin.getState(state) } });
  return plugin;
}
