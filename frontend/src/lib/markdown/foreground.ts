import type { JSONContent } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { LIMITS } from './limits';

/** PM nodes are immutable. Weak caches reuse unchanged subtrees without keeping
 * obsolete documents alive. Only serialize the changed path on ordinary input. */
export function snapshotCache() {
  const cache = new WeakMap<Node, JSONContent>();
  const read = (node: Node): JSONContent => {
    const existing = cache.get(node); if (existing) return existing;
    const json: JSONContent = { type: node.type.name };
    if (Object.keys(node.attrs).length) json.attrs = node.attrs;
    if (node.content.size) { json.content = []; node.forEach(child => json.content!.push(read(child))); }
    if (node.marks.length) json.marks = node.marks.map(mark => mark.toJSON());
    if (node.isText) json.text = node.text;
    cache.set(node, json); return json;
  };
  return read;
}
export type Shape = { nodes: number; units: number; depth: number; longest: number };
export function shapeCache() {
  const cache = new WeakMap<Node, Shape>();
  const read = (node: Node): Shape => {
    const found = cache.get(node); if (found) return found;
    const result: Shape = { nodes: 1, units: node.text?.length ?? 0, depth: 1, longest: 0 };
    node.forEach(child => { const c = read(child); result.nodes += c.nodes; result.units += c.units; result.depth = Math.max(result.depth, c.depth + 1); result.longest = Math.max(result.longest, c.longest); });
    if (node.isTextblock) result.longest = Math.max(result.longest, result.units);
    cache.set(node, result); return result;
  };
  return read;
}
export function shapeReason(shape: Shape, roots: number, stress = false) {
  if (shape.nodes > (stress ? LIMITS.nodes : LIMITS.renderNodes) || roots > (stress ? 5000 : LIMITS.rootBlocks) || shape.depth > LIMITS.depth || shape.longest > LIMITS.textBlockUnits) return 'RENDER_COMPLEXITY_LIMIT';
  if (shape.units > (stress ? LIMITS.bytes : LIMITS.interactiveBytes)) return 'RENDER_SIZE_LIMIT';
}
export function assertProjectionShape(doc: JSONContent, stress: boolean) {
  const read = (node: JSONContent): Shape => {
    const parts = (node.content ?? []).map(read), units = (node.text?.length ?? 0) + parts.reduce((sum, p) => sum + p.units, 0);
    return { nodes: 1 + parts.reduce((sum, p) => sum + p.nodes, 0), units, depth: 1 + Math.max(0, ...parts.map(p => p.depth)), longest: Math.max(['paragraph', 'heading', 'codeBlock'].includes(node.type!) ? units : 0, ...parts.map(p => p.longest)) };
  };
  const reason = shapeReason(read(doc), doc.content?.length ?? 0, stress); if (reason) throw new Error(reason);
}
/** Cheap lexical work bounds before the browser parses clipboard HTML. This is
 * conservative admission, not an HTML parser or sanitizer. */
export function clipboardReason(text: string, html: string) {
  if (text.length > LIMITS.pasteUnits || html.length > LIMITS.pasteUnits) return 'CLIPBOARD_SIZE_LIMIT';
  if ((text.match(/\r\n|\r|\n/g)?.length ?? 0) > 1500) return 'CLIPBOARD_COMPLEXITY_LIMIT';
  let tags = 0, depth = 0;
  if ((html.match(/</g)?.length ?? 0) > 1500) return 'CLIPBOARD_COMPLEXITY_LIMIT';
  for (const match of html.matchAll(/<\s*(\/?)([a-z][a-z\d-]*)\b[^<>]*>/gi)) {
    if (++tags > 1500) return 'CLIPBOARD_COMPLEXITY_LIMIT';
    if (match[1]) depth = Math.max(0, depth - 1);
    else if (!/\/\s*>$/.test(match[0]) && !/^(?:br|hr|img|input|meta|link|area|base|col|embed|param|source|track|wbr)$/i.test(match[2])) depth++;
    if (depth > 32) return 'CLIPBOARD_COMPLEXITY_LIMIT';
  }
}
