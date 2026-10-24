import type { JSONContent } from '@tiptap/core';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown, gfmToMarkdown } from 'mdast-util-gfm';
import { frontmatter } from 'micromark-extension-frontmatter';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { directive } from 'micromark-extension-directive';
import { directiveFromMarkdown } from 'mdast-util-directive';
import { toMarkdown, defaultHandlers, type Handlers, type Handle, type State } from 'mdast-util-to-markdown';
import type { RootContent, Nodes, Parents } from 'mdast';
import { LIMITS } from './limits';
import { encodedTokens } from './sourceMap';
export { LIMITS } from './limits';

type Syntax = { type: string; value?: string; children?: Syntax[]; depth?: number; ordered?: boolean; start?: number; checked?: boolean | null; url?: string; title?: string | null; lang?: string | null; meta?: string | null; align?: (string | null)[]; position?: { start: { offset: number }; end: { offset: number } } };
export type Block = { start: number; end: number; raw: string; node: JSONContent };
export type Leaf = { node: JSONContent; start: number; end: number; raw: string };
export type Fragment = { start: number; end: number; type: string; signature: string; raw: string; url?: string; title?: string | null; suffix?: string };
export type Projection = { source: string; doc: JSONContent; blocks: Block[]; leaves: Leaf[]; fragments: Fragment[] };
function syntaxKey(n: Syntax): string { return JSON.stringify({ type: n.type, ...(n.value !== undefined ? { value: n.value } : {}), ...(n.type === 'link' ? { url: n.url, title: n.title ?? null } : {}), ...(n.children ? { children: n.children.map(c => syntaxKey(c)) } : {}) }); }
export function assertUnicode(source: string) {
  for (let i = 0; i < source.length; i++) {
    const c = source.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { const low = source.charCodeAt(++i); if (!(low >= 0xdc00 && low <= 0xdfff)) throw new Error('INVALID_UNICODE'); }
    else if (c >= 0xdc00 && c <= 0xdfff) throw new Error('INVALID_UNICODE');
  }
}
export function decode(bytes: Uint8Array) {
  if (bytes.length > LIMITS.bytes) throw new Error('SOURCE_SIZE_LIMIT');
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}
const text = (value: string, marks: JSONContent['marks'] = []): JSONContent => ({ type: 'text', text: value, ...(marks.length ? { marks } : {}) });
const paragraph = (content: JSONContent[] = []): JSONContent => ({ type: 'paragraph', content });

export function project(source: string): Projection {
  assertUnicode(source);
  const bom = source.startsWith('\ufeff') ? 1 : 0;
  const ast = fromMarkdown(source.slice(bom), { extensions: [gfm(), frontmatter(['yaml', 'toml']), directive()], mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown(['yaml', 'toml']), directiveFromMarkdown()] }) as unknown as Syntax;
  const leaves: Leaf[] = [], fragments: Fragment[] = []; let count = 0;
  const pending = [{ node: ast, depth: 0 }];
  while (pending.length) {
    const { node, depth } = pending.pop()!; if (++count > LIMITS.nodes || depth > LIMITS.depth) throw new Error('SOURCE_COMPLEXITY_LIMIT');
    if (node.position && ['text', 'link', 'inlineCode', 'strong', 'emphasis', 'delete'].includes(node.type)) {
      const start = node.position.start.offset + bom, end = node.position.end.offset + bom, raw = source.slice(start, end);
      const labelEnd = node.children?.at(-1)?.position?.end.offset;
      fragments.push({ start, end, type: node.type, signature: syntaxKey(node), raw, url: node.url, title: node.title ?? null, ...(node.type === 'link' && raw.startsWith('[') && labelEnd !== undefined ? { suffix: source.slice(labelEnd + bom, end) } : {}) });
    }
    for (const child of node.children ?? []) pending.push({ node: child, depth: depth + 1 });
  }
  const range = (n: Syntax) => { if (!n.position) throw new Error('MISSING_SOURCE_RANGE'); return { start: n.position.start.offset + bom, end: n.position.end.offset + bom }; };
  const raw = (n: Syntax) => { const r = range(n); return source.slice(r.start, r.end); };
  const opaque = (n: Syntax, inline = false): JSONContent => ({ type: inline ? 'sourceInline' : 'sourceBlock', attrs: { raw: raw(n), kind: n.type } });
  const visit = (depth: number) => { if (depth > LIMITS.depth) throw new Error('SOURCE_COMPLEXITY_LIMIT'); };
  const inline = (n: Syntax, marks: JSONContent['marks'] = [], depth = 0): JSONContent[] => {
    visit(depth);
    if (n.type === 'text') {
      if (!n.value) return [];
      if (raw(n).includes('\0')) return [opaque(n, true)];
      // CommonMark soft line breaks display as whitespace. Preserve their raw
      // spelling in source; structural editing need not put newlines in headings.
      const node = text(n.value.replace(/\r\n|\r|\n/g, ' '), marks); leaves.push({ node, ...range(n), raw: raw(n) }); return [node];
    }
    if (['strong', 'emphasis', 'delete'].includes(n.type)) return (n.children ?? []).flatMap(c => inline(c, [...marks, { type: { strong: 'bold', emphasis: 'italic', delete: 'strike' }[n.type]! }], depth + 1));
    if (n.type === 'inlineCode') return n.value ? [text(n.value, [...marks, { type: 'code' }])] : [];
    if (n.type === 'break') return [{ type: 'hardBreak' }];
    if (n.type === 'link') return (n.children ?? []).flatMap(c => inline(c, [...marks, { type: 'link', attrs: { href: n.url, title: n.title ?? null } }], depth + 1));
    return [opaque(n, true)];
  };
  const block = (n: Syntax, depth = 0): JSONContent => {
    visit(depth);
    if (n.type === 'paragraph' || n.type === 'heading') return { type: n.type, ...(n.type === 'heading' ? { attrs: { level: n.depth } } : {}), content: (n.children ?? []).flatMap(c => inline(c, [], depth + 1)) };
    if (n.type === 'code') return (n.value?.length ?? 0) > LIMITS.codeUnits ? opaque(n) : { type: 'codeBlock', attrs: { language: n.lang ?? null, mdMeta: n.meta ?? null }, content: n.value ? [text(n.value.replace(/\r\n|\r/g, '\n'))] : [] };
    if (n.type === 'thematicBreak') return { type: 'horizontalRule' };
    if (n.type === 'blockquote') return { type: 'blockquote', content: (n.children ?? []).map(c => block(c, depth + 1)) };
    if (n.type === 'list') {
      const items = n.children ?? [], task = items.length > 0 && items.every(i => typeof i.checked === 'boolean');
      if (!task && items.some(i => typeof i.checked === 'boolean')) return opaque(n);
      return { type: task ? 'taskList' : n.ordered ? 'orderedList' : 'bulletList', ...(n.ordered && !task ? { attrs: { start: n.start ?? 1 } } : {}), content: items.map(i => ({ type: task ? 'taskItem' : 'listItem', ...(task ? { attrs: { checked: i.checked } } : {}), content: i.children?.length ? i.children.map(c => block(c, depth + 1)) : [paragraph()] })) };
    }
    if (n.type === 'table') return (n.children ?? []).reduce((n, r) => n + (r.children?.length ?? 0), 0) > LIMITS.tableCells ? opaque(n) : { type: 'table', attrs: { mdAlign: n.align ?? [] }, content: (n.children ?? []).map((r, ri) => ({ type: 'tableRow', content: (r.children ?? []).map(c => ({ type: ri ? 'tableCell' : 'tableHeader', content: [paragraph((c.children ?? []).flatMap(x => inline(x, [], depth + 1)))] })) })) };
    return opaque(n);
  };
  const blocks = (ast.children ?? []).map(n => ({ ...range(n), raw: raw(n), node: block(n) }));
  return { source, blocks, leaves, fragments, doc: { type: 'doc', content: blocks.length ? blocks.map(b => b.node) : [paragraph()] } };
}

// Compare Markdown semantics, not renderer-owned IDs/widths. Unknown semantics
// are errors, never stripped into an apparently valid save.
export function canonical(node: JSONContent, root = true): JSONContent {
  const type = node.type ?? ''; const a = node.attrs ?? {}; let attrs: JSONContent['attrs'];
  switch (type) {
    case 'doc': case 'paragraph': case 'bulletList': case 'listItem': case 'blockquote': case 'horizontalRule': case 'hardBreak': case 'taskList': case 'tableRow': break;
    case 'text': break;
    case 'heading': attrs = { level: a.level ?? 1 }; break;
    case 'orderedList': attrs = { start: a.start ?? 1 }; break;
    case 'taskItem': attrs = { checked: a.checked ?? false }; break;
    case 'codeBlock': attrs = { language: a.language || null, mdMeta: a.mdMeta || null }; break;
    case 'table': attrs = { mdAlign: Array.from({ length: node.content?.[0]?.content?.length ?? 0 }, (_, i) => a.mdAlign?.[i] ?? null) }; break;
    case 'tableCell': case 'tableHeader':
      if ((a.colspan ?? 1) !== 1 || (a.rowspan ?? 1) !== 1) throw new Error('TABLE_SPANS_REQUIRE_SOURCE');
      break;
    case 'sourceBlock': case 'sourceInline': attrs = { kind: a.kind, raw: a.raw }; break;
    default: throw new Error('UNSUPPORTED_NODE:' + type);
  }
  const marks = node.marks?.map(m => {
    if (!['bold', 'italic', 'strike', 'code', 'link'].includes(m.type)) throw new Error('UNSUPPORTED_MARK:' + m.type);
    return m.type === 'link' ? { type: 'link', attrs: { href: m.attrs?.href, title: m.attrs?.title ?? null } } : { type: m.type };
  }).sort((a, b) => a.type.localeCompare(b.type));
  let content = node.content?.map(n => canonical(n, false)) ?? [];
  if (root && type === 'doc') content = content.filter(n => n.type !== 'paragraph' || n.content?.length);
  const merged: JSONContent[] = [];
  for (const n of content) {
    const last = merged.at(-1);
    if (last?.type === 'text' && n.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(n.marks ?? [])) last.text = (last.text ?? '') + (n.text ?? '');
    else merged.push(n);
  }
  return { type, ...(attrs ? { attrs } : {}), ...(type === 'text' ? { text: node.text ?? '' } : {}), ...(marks?.length ? { marks } : {}), ...(!['text', 'horizontalRule', 'hardBreak', 'sourceBlock', 'sourceInline'].includes(type) ? { content: merged } : {}) };
}
export const key = (node: JSONContent) => JSON.stringify(canonical(node));

type Output = { type: string; children?: Output[]; value?: string; [field: string]: unknown };
function toSyntax(node: JSONContent): Output {
  const children = () => (node.content ?? []).map(toSyntax);
  const a = node.attrs ?? {};
  switch (node.type) {
    case 'text': {
      let out: Output = { type: 'text', value: node.text ?? '' };
      // Code is a literal; nesting styles around it is explicit.
      for (const mark of [...(node.marks ?? [])].sort((x, y) => (x.type === 'code' ? -1 : y.type === 'code' ? 1 : x.type.localeCompare(y.type)))) {
        if (mark.type === 'code') out = { type: 'inlineCode', value: node.text ?? '' };
        else if (mark.type === 'link') out = { type: 'link', url: mark.attrs?.href, title: mark.attrs?.title ?? null, children: [out] };
        else { const type = { bold: 'strong', italic: 'emphasis', strike: 'delete' }[mark.type]; if (!type) throw new Error('UNSUPPORTED_MARK:' + mark.type); out = { type, children: [out] }; }
      }
      return out;
    }
    case 'paragraph': return { type: 'paragraph', children: children() };
    case 'heading': return { type: 'heading', depth: a.level, children: children() };
    case 'hardBreak': return { type: 'break' };
    case 'horizontalRule': return { type: 'thematicBreak' };
    case 'codeBlock': return { type: 'code', lang: a.language || null, meta: a.mdMeta || null, value: (node.content ?? []).map(n => n.text ?? '').join('') };
    case 'bulletList': case 'orderedList': case 'taskList': return { type: 'list', ordered: node.type === 'orderedList', start: a.start ?? 1, spread: false, children: children() };
    case 'listItem': case 'taskItem': return { type: 'listItem', spread: false, checked: node.type === 'taskItem' ? a.checked : null, children: children() };
    case 'blockquote': return { type: 'blockquote', children: children() };
    case 'table': return { type: 'table', align: a.mdAlign ?? [], children: children() };
    case 'tableRow': return { type: 'tableRow', children: children() };
    case 'tableCell': case 'tableHeader': {
      if (node.content?.length !== 1 || node.content[0].type !== 'paragraph') throw new Error('RICH_TABLE_CELL_REQUIRES_SOURCE');
      return { type: 'tableCell', children: (node.content[0].content ?? []).map(toSyntax) };
    }
    case 'sourceBlock': case 'sourceInline': return { type: 'html', value: a.raw };
    default: throw new Error('UNSUPPORTED_NODE:' + node.type);
  }
}
export function writeBlock(node: JSONContent, eol: string, fragments: Fragment[] = [], previous?: Block): string {
  const normalized = canonical(node, false);
  if (node.type === 'sourceBlock') return node.attrs?.raw ?? '';
  if (node.type === 'codeBlock' && previous?.node.type === 'codeBlock' && JSON.stringify(normalized.attrs) === JSON.stringify(canonical(previous.node, false).attrs)) {
    const raw = previous.raw, first = raw.indexOf('\n'), last = raw.lastIndexOf('\n');
    const open = /^(\x60{3,}|~{3,})(.*)$/.exec(raw.slice(0, first).replace(/\r$/, '')), close = /^(\x60{3,}|~{3,})([ \t]*)$/.exec(raw.slice(last + 1));
    if (first >= 0 && open && close && open[1][0] === close[1][0]) {
      const body = (node.content ?? []).map(n => n.text ?? '').join(''), marker = open[1][0];
      let width = open[1].length;
      for (const line of body.split('\n')) { const run = /^ {0,3}(\x60+|~+)/.exec(line); if (run?.[1][0] === marker) width = Math.max(width, run[1].length + 1); }
      const localEol = raw[first - 1] === '\r' ? '\r\n' : '\n';
      return marker.repeat(width) + open[2] + localEol + body.replaceAll('\n', localEol) + localEol + marker.repeat(Math.max(width, close[1].length)) + close[2];
    }
  }
  const gfmExtension = gfmToMarkdown(), builtInHandlers: Partial<Handlers> = { ...defaultHandlers, ...gfmExtension.handlers }, handlers: Partial<Handlers> = {};
  for (const type of ['text', 'link', 'inlineCode', 'strong', 'emphasis', 'delete'] as const) {
  handlers[type] = (n, parent, state, info) => {
    const signature = syntaxKey(n as unknown as Syntax), matching = fragments.filter(f => f.type === type && f.signature === signature);
    const raw = new Set(matching.map(f => f.raw));
    if (raw.size > 1) throw new Error('AMBIGUOUS_INLINE_PROVENANCE_REQUIRES_SOURCE');
    if (raw.size === 1) {
      const value = matching[0].raw;
      if (/[\r\n]/.test(value)) throw new Error('MULTILINE_INLINE_PROVENANCE_REQUIRES_SOURCE');
      if (['strong', 'emphasis', 'delete'].includes(type)) {
        const width = type === 'strong' ? 2 : type === 'delete' && value.startsWith('~~') ? 2 : 1;
        const word = (c: string) => !!c && !/[\s\p{P}\p{S}]/u.test(c);
        const needsOutside = (outside: string, inside: string) => word(outside) && (value[0] === '_' || /[\p{P}\p{S}]/u.test(inside));
        // Preserve raw delimiters while escaping only newly problematic adjacent
        // text. This is the serializer's surrounding-attention protocol.
        state.attentionEncodeSurroundingInfo = { before: needsOutside(info.before.slice(-1), value[width] ?? ''), after: needsOutside(info.after[0] ?? '', value[value.length - width - 1] ?? '') };
      }
      return value;
    }
    if (type === 'link') {
      const link = n as unknown as Syntax;
      const candidates = fragments.filter(f => f.type === 'link' && f.url === link.url && f.title === (link.title ?? null) && f.suffix?.startsWith(']('));
      const suffixes = new Set(candidates.map(f => f.suffix));
      if (suffixes.size > 1) throw new Error('AMBIGUOUS_LINK_PROVENANCE_REQUIRES_SOURCE');
      if (suffixes.size === 1) {
        const suffix = candidates[0].suffix!, tracker = state.createTracker(info), exit = state.enter('link'), label = state.enter('label');
        if (/[\r\n]/.test(suffix)) throw new Error('MULTILINE_LINK_PROVENANCE_REQUIRES_SOURCE');
        let value = tracker.move('[');
        value += tracker.move(state.containerPhrasing(n as Parameters<typeof state.containerPhrasing>[0], { before: '[', after: suffix, ...tracker.current() }));
        label(); value += tracker.move(suffix); exit(); return value;
      }
    }
    const handler = builtInHandlers[type];
    if (!handler) throw new Error('MISSING_INLINE_WRITER:' + type);
    return handler(n, parent, state, info);
  };
  type PeekWriter = Handle & { peek?: (n: Nodes, parent: Parents | undefined, state: State) => string };
  (handlers[type] as PeekWriter).peek = (n, parent, state) => {
    const matching = fragments.filter(f => f.type === type && f.signature === syntaxKey(n as unknown as Syntax));
    return matching[0]?.raw[0] ?? (builtInHandlers[type] as PeekWriter | undefined)?.peek?.(n, parent, state) ?? (n.type === 'text' ? n.value[0] : '') ?? '';
  };
  }
  const out = toMarkdown({ type: 'root', children: [toSyntax(normalized) as RootContent] }, { extensions: [gfmExtension], handlers, bullet: '-', fences: true, listItemIndent: 'one', emphasis: '_', strong: '*' });
  const encoded = fragments.filter(f => f.type === 'text').flatMap(f => encodedTokens(f.raw));
  for (const token of new Set(encoded)) if (out.split(token).length - 1 < encoded.filter(t => t === token).length) throw new Error('ENCODED_TEXT_PROVENANCE_REQUIRES_SOURCE');
  return out.replace(/\n$/, '').replaceAll('\n', eol);
}
