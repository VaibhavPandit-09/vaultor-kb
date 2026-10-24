// Phase 2 qualification only. No production imports, DOM, network, or file writes.
import { getSchema, Node as TiptapNode } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { EditorState } from '@tiptap/pm/state';
import { history } from '@tiptap/pm/history';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { frontmatter } from 'micromark-extension-frontmatter';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { directive } from 'micromark-extension-directive';
import { directiveFromMarkdown } from 'mdast-util-directive';

const protectedNode = (name, inline) => TiptapNode.create({
  name, group: inline ? 'inline' : 'block', inline, atom: true,
  addAttributes: () => ({ raw: { default: '' }, kind: { default: '' } }),
});
export const schema = getSchema([
  StarterKit.configure({ undoRedo: false }), Table, TableRow, TableCell, TableHeader,
  protectedNode('sourceBlock', false), protectedNode('sourceInline', true),
]);
export const parse = source => {
  const bom = source.startsWith('\ufeff');
  const tree = fromMarkdown(bom ? source.slice(1) : source, {
  extensions: [gfm(), frontmatter(['yaml', 'toml']), directive()],
  mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown(['yaml', 'toml']), directiveFromMarkdown()],
  });
  if (bom) {
    const shift = n => {
      if (n.position) for (const p of [n.position.start, n.position.end]) { p.offset++; if (p.line === 1) p.column++; }
      n.children?.forEach(shift);
    };
    shift(tree);
  }
  return tree;
};

// Boundary table contains no entry inside an astral UTF-16 surrogate pair.
export function decode(bytes) {
  const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (!Buffer.from(source).equals(bytes)) throw new Error('Non-roundtrippable UTF-8');
  const byteAt = new Map([[0, 0]]);
  let units = 0, count = 0;
  for (const point of source) { units += point.length; count += Buffer.byteLength(point); byteAt.set(units, count); }
  return { source, byteAt };
}

export function project(bytes) {
  const { source, byteAt } = decode(bytes), ast = parse(source), pending = new Map();
  const raw = n => source.slice(n.position.start.offset, n.position.end.offset);
  const opaque = (n, inline = false) => schema.nodes[inline ? 'sourceInline' : 'sourceBlock'].create({ raw: raw(n), kind: n.type });
  const literal = (n, marks = []) => {
    // Decoded entities, escapes, CRLF and continuation indentation are not bijective.
    if (raw(n) !== n.value || !n.value) return opaque(n, true);
    const node = schema.text(n.value, marks);
    pending.set(node, { node, start: n.position.start.offset, end: n.position.end.offset, kind: 'text' });
    return node;
  };
  const inline = (n, marks = []) => {
    if (n.type === 'text') return [literal(n, marks)];
    if (['strong', 'emphasis', 'delete'].includes(n.type)) {
      const type = { strong: 'bold', emphasis: 'italic', delete: 'strike' }[n.type];
      return n.children.flatMap(c => inline(c, [...marks, schema.marks[type].create()]));
    }
    if (n.type === 'link') return n.children.flatMap(c => inline(c, [...marks, schema.marks.link.create({ href: n.url, title: n.title })]));
    // Reference labels must not detach from their source label/definition dependency.
    if (n.type === 'linkReference' || n.type === 'imageReference') return [opaque(n, true)];
    return [opaque(n, true)];
  };
  const block = n => {
    if (n.type === 'paragraph' || n.type === 'heading') return schema.nodes[n.type].create(n.type === 'heading' ? { level: n.depth } : null, n.children.flatMap(c => inline(c)));
    if (n.type === 'list') {
      if (n.children.some(c => c.checked !== null && c.checked !== undefined)) return opaque(n);
      return schema.nodes[n.ordered ? 'orderedList' : 'bulletList'].create(n.ordered ? { start: n.start } : null,
        n.children.map(c => schema.nodes.listItem.create(null, c.children.map(block))));
    }
    if (n.type === 'blockquote') return schema.nodes.blockquote.create(null, n.children.map(block));
    if (n.type === 'thematicBreak') return schema.nodes.horizontalRule.create();
    if (n.type === 'table') return schema.nodes.table.create(null, n.children.map((r, ri) => schema.nodes.tableRow.create(null,
      r.children.map(c => schema.nodes[ri ? 'tableCell' : 'tableHeader'].create(null, schema.nodes.paragraph.create(null, c.children.flatMap(x => inline(x))))))));
    if (n.type === 'code') {
      // Only unindented closed fences whose body is a direct literal source slice.
      const chunk = raw(n), fence = /^(\x60{3,}|~{3,})[^\r\n]*(\r?\n)/.exec(chunk);
      if (!fence || !n.value || n.value.includes('\n') && chunk.includes('\r\n')) return opaque(n);
      const start = n.position.start.offset + fence[0].length;
      const body = source.slice(start, start + n.value.length);
      if (body !== n.value || !new RegExp('\\r?\\n' + fence[1][0] + '{' + fence[1].length + ',}\\s*$').test(chunk.slice(fence[0].length))) return opaque(n);
      const text = schema.text(n.value);
      pending.set(text, { node: text, start, end: start + n.value.length, kind: 'code' });
      return schema.nodes.codeBlock.create({ language: n.lang }, text);
    }
    return opaque(n);
  };
  const doc = schema.nodes.doc.create(null, ast.children.map(block));
  const spans = [];
  doc.descendants((node, pos) => {
    const p = pending.get(node);
    if (p) spans.push({ ...p, from: pos, to: pos + node.nodeSize });
  });
  return { source, byteAt, ast, doc, spans };
}

export function patchTransaction(bytes, projection, transaction) {
  let current = bytes, mapped = projection;
  const patches = [];
  for (let i = 0; i < transaction.steps.length; i++) {
    const step = transaction.steps[i], json = step.toJSON();
    if (json.stepType !== 'replace' || json.structure || step.slice.openStart || step.slice.openEnd || step.slice.content.childCount > 1 ||
        step.slice.content.childCount === 1 && !step.slice.content.firstChild.isText) throw new Error('Protected: structural/mark operation requires targeted source editing');
    const span = mapped.spans.find(s => json.from >= s.from && json.to <= s.to);
    if (!span) throw new Error('Protected: edit does not belong to one literal source leaf');
    const replacement = step.slice.content.textBetween(0, step.slice.content.size);
    if (json.from === span.from && json.to === span.to && !replacement) throw new Error('Protected: removing final leaf loses reverse source mapping');
    if (/[\r\n]/.test(replacement)) throw new Error('Protected: line structure change');
    const a = span.start + json.from - span.from, b = span.start + json.to - span.from;
    const byteStart = mapped.byteAt.get(a), byteEnd = mapped.byteAt.get(b);
    if (byteStart === undefined || byteEnd === undefined) throw new Error('Protected: surrogate boundary');
    // Reject unpaired surrogates in new text too.
    if (replacement.isWellFormed && !replacement.isWellFormed()) throw new Error('Protected: malformed Unicode');
    const inserted = Buffer.from(replacement);
    const candidate = Buffer.concat([current.subarray(0, byteStart), inserted, current.subarray(byteEnd)]);
    const next = project(candidate);
    const expected = i + 1 < transaction.steps.length ? transaction.docs[i + 1] : transaction.doc;
    if (!next.doc.eq(expected)) throw new Error('Protected: reparsed Markdown differs from intended editor document');
    patches.push({ start: byteStart, end: byteEnd, inserted: inserted.toString(), removed: current.subarray(byteStart, byteEnd).toString() });
    current = candidate; mapped = next;
  }
  return { bytes: current, projection: mapped, patches };
}

export class SourceSession {
  constructor(bytes) {
    this.bytes = Buffer.from(bytes); this.projection = project(this.bytes);
    this.state = EditorState.create({ schema, doc: this.projection.doc, plugins: [history()] });
    this.draft = null; this.events = [];
  }
  apply(transaction) {
    try {
      if (this.draft) throw new Error('Resolve retained editor draft before further source patches');
      const result = patchTransaction(this.bytes, this.projection, transaction);
      this.state = this.state.apply(transaction); this.bytes = result.bytes; this.projection = result.projection;
      this.events.push(...result.patches); return { accepted: true, patches: result.patches };
    } catch (error) {
      this.draft = transaction.doc.toJSON();
      return { accepted: false, reason: error.message, draft: this.draft };
    }
  }
  locate(text, occurrence = 0) {
    let found;
    this.state.doc.descendants((node, pos) => { if (!node.isText) return; const offset = node.text.indexOf(text); if (offset >= 0 && occurrence-- === 0) found = pos + offset; });
    if (found === undefined) throw new Error('No literal editor text: ' + text);
    return found;
  }
  replace(oldText, newText) { const from = this.locate(oldText); return this.apply(this.state.tr.insertText(newText, from, from + oldText.length)); }
}
