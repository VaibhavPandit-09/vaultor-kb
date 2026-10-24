import type { JSONContent } from '@tiptap/core';
import { canonical, decode, key, LIMITS, project, writeBlock, assertUnicode, type Projection } from './syntax';
import { literalPatch } from './sourceMap';

export type SourcePatch = { start: number; end: number; text: string; removed: string };
export type EngineResult = { accepted: boolean; source: string; patches: SourcePatch[]; reason?: string; patchMs: number; validationMs: number; totalMs?: number };
const encode = new TextEncoder();
type CharPatch = { start: number; end: number; text: string; removed: string };
function difference(source: string, candidate: string): CharPatch {
  let start = 0, end = source.length, tail = candidate.length;
  while (start < end && start < tail && source[start] === candidate[start]) start++;
  while (end > start && tail > start && source[end - 1] === candidate[tail - 1]) { end--; tail--; }
  if (start > 0 && /[\udc00-\udfff]/.test(source[start] ?? '')) start--;
  if (/[\udc00-\udfff]/.test(source[end] ?? '')) { end++; tail++; }
  return { start, end, text: candidate.slice(start, tail), removed: source.slice(start, end) };
}
// Cache hint only, never an authority/security revision: every hit is reparsed
// and compared with the complete intended JSON, so a collision cannot admit it.
function fingerprint(value: string) {
  let a = 2166136261, b = 2246822507;
  for (let i = 0; i < value.length; i++) { const c = value.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 3266489909); }
  return (a >>> 0).toString(16) + ':' + (b >>> 0).toString(16);
}
function protectedValues(doc: JSONContent): string[] {
  const result: string[] = [];
  const walk = (n: JSONContent) => { if (n.type === 'sourceBlock' || n.type === 'sourceInline') result.push(JSON.stringify(canonical(n).attrs)); n.content?.forEach(walk); };
  walk(doc); return result.sort();
}
function tables(doc: JSONContent) { const result: JSONContent[] = []; const walk = (n: JSONContent) => { if (n.type === 'table') result.push(n); n.content?.forEach(walk); }; walk(doc); return result; }
function singleTextChange(a: JSONContent, b: JSONContent): { old: JSONContent; next: string } | null {
  const changes: { old: JSONContent; next: string }[] = [];
  const visit = (x: JSONContent, y: JSONContent): boolean => {
    if (x.type === 'text' && y.type === 'text') {
      if (JSON.stringify(canonical(x).marks ?? []) !== JSON.stringify(canonical(y).marks ?? [])) return false;
      if (x.text !== y.text) changes.push({ old: x, next: y.text ?? '' }); return true;
    }
    if (x.type !== y.type || JSON.stringify(canonical({ ...x, content: [] }, false).attrs ?? {}) !== JSON.stringify(canonical({ ...y, content: [] }, false).attrs ?? {}) || (x.content?.length ?? 0) !== (y.content?.length ?? 0)) return false;
    return (x.content ?? []).every((c, i) => visit(c, y.content![i]));
  };
  return visit(a, b) && changes.length === 1 ? changes[0] : null;
}

/** Source-authoritative engine. All expensive work belongs in its worker. */
export class MarkdownEngine {
  projection: Projection;
  private history: { hash: string; patch?: CharPatch }[] = [];
  private cursor = 0;
  private historySize = 0;
  private byteLimit: number;
  private historyLimit: number;
  constructor(bytes: Uint8Array, byteLimit = LIMITS.bytes, historyLimit = LIMITS.historyEntries) { if (!Number.isSafeInteger(byteLimit) || byteLimit < 1 || !Number.isSafeInteger(historyLimit) || historyLimit < 1) throw new Error('INVALID_ENGINE_LIMIT'); this.historyLimit = Math.min(historyLimit, LIMITS.historyEntries); this.byteLimit = Math.min(byteLimit, LIMITS.bytes); if (bytes.length > this.byteLimit) throw new Error('SOURCE_SIZE_LIMIT'); this.projection = project(decode(bytes)); this.history = [{ hash: fingerprint(key(this.projection.doc)) }]; }
  get source() { return this.projection.source; }
  private remember(k: string, patch: CharPatch) {
    const retained = this.history.slice(0, this.cursor + 1);
    const memory = retained.reduce((sum, r) => sum + ((r.patch?.removed.length ?? 0) + (r.patch?.text.length ?? 0)) * 2 + 64, 0) + (patch.removed.length + patch.text.length) * 2 + 64;
    if (retained.length >= this.historyLimit || memory > LIMITS.historyBytes) throw new Error('SOURCE_HISTORY_LIMIT');
    this.history = [...retained, { hash: fingerprint(k), patch }]; this.cursor++; this.historySize = memory;
  }
  private restore(index: number) {
    let source = this.source;
    for (let i = this.cursor; i > index; i--) { const p = this.history[i].patch!; source = source.slice(0, p.start) + p.removed + source.slice(p.start + p.text.length); }
    for (let i = this.cursor + 1; i <= index; i++) { const p = this.history[i].patch!; source = source.slice(0, p.start) + p.text + source.slice(p.end); }
    return source;
  }
  get historyBytes() { return this.historySize; }
  apply(target: JSONContent): EngineResult {
    const begin = performance.now(); let patchMs = 0, speculativeValidationMs = 0;
    try {
      const intended = canonical(target), k = JSON.stringify(intended), source = this.source;
      if (key(this.projection.doc) === k) return { accepted: true, source, patches: [], patchMs: performance.now() - begin, validationMs: 0 };
      if (JSON.stringify(protectedValues(this.projection.doc)) !== JSON.stringify(protectedValues(target))) throw new Error('PROTECTED_SYNTAX_REQUIRES_TARGETED_SOURCE');
      const oldTables = tables(this.projection.doc), newTables = tables(target);
      oldTables.forEach((t, i) => {
        if (t.attrs?.mdAlign?.some((value: string | null) => value) && newTables[i] && t.content?.[0]?.content?.length !== newTables[i].content?.[0]?.content?.length) throw new Error('ALIGNED_TABLE_COLUMNS_REQUIRE_SOURCE');
      });
      let candidate: string; let start = 0, end = source.length, replacement: string;
      const targetHash = fingerprint(k), historical = this.history.findIndex(r => r.hash === targetHash);
      if (historical >= 0) {
        // Exact provenance restoration, not serialization. Minimize its source diff.
        candidate = this.restore(historical);
        while (start < source.length && start < candidate.length && source[start] === candidate[start]) start++;
        let tail = candidate.length;
        while (end > start && tail > start && source[end - 1] === candidate[tail - 1]) { end--; tail--; }
        if (start > 0 && /[\udc00-\udfff]/.test(source[start] ?? '')) start--;
        if (/[\udc00-\udfff]/.test(source[end] ?? '')) { end++; tail++; }
        replacement = candidate.slice(start, tail);
      } else {
        const change = singleTextChange(this.projection.doc, target);
        const leaf = change && this.projection.leaves.find(l => l.node === change.old);
        const literal = change && leaf ? literalPatch(leaf, change.next) : undefined;
        if (literal) {
          start = literal.start; end = literal.end; replacement = literal.text;
          candidate = source.slice(0, start) + replacement + source.slice(end);
          // A literal edit introducing syntax must use an escaping block writer.
          const speculativeStart = performance.now(), matches = key(project(candidate).doc) === k;
          speculativeValidationMs += performance.now() - speculativeStart;
          if (!matches) {
            replacement = replacement ? writeBlock({ type: 'paragraph', content: [{ type: 'text', text: replacement }] }, '\n') : '';
            candidate = source.slice(0, start) + replacement + source.slice(end);
            const retryStart = performance.now(), escapedMatches = key(project(candidate).doc) === k;
            speculativeValidationMs += performance.now() - retryStart;
            if (!escapedMatches) {
              // Entity spelling changes only the intentionally inserted text;
              // useful next to existing underscore delimiters without touching
              // their original source or an adjacent existing entity.
              replacement = [...literal.text].map(c => '&#x' + c.codePointAt(0)!.toString(16) + ';').join('');
              candidate = source.slice(0, start) + replacement + source.slice(end);
              const entityStart = performance.now(), entityMatches = key(project(candidate).doc) === k;
              speculativeValidationMs += performance.now() - entityStart;
              if (!entityMatches) candidate = '';
            }
          }
        } else candidate = '';
        if (!candidate) {
          const old = this.projection.blocks, next = (target.content ?? []).filter(n => n.type !== 'paragraph' || n.content?.length);
          const oldKeys = old.map(b => key(b.node)), newKeys = next.map(n => key(n));
          let a = 0, b = old.length, to = next.length;
          while (a < b && a < to && oldKeys[a] === newKeys[a]) a++;
          while (b > a && to > a && oldKeys[b - 1] === newKeys[to - 1]) { b--; to--; }
          start = old[a]?.start ?? old.at(-1)?.end ?? (source.startsWith('\ufeff') ? 1 : 0);
          end = b > a ? old[b - 1].end : start;
          const eol = source.includes('\r\n') ? '\r\n' : '\n';
          const available = new Map<string, { raw: string; index: number }[]>();
          for (let i = a; i < b; i++) available.set(oldKeys[i], [...(available.get(oldKeys[i]) ?? []), { raw: old[i].raw, index: i }]);
          const pieces = next.slice(a, to).map((n, i) => {
            const retained = available.get(key(n))?.shift(); if (retained) return retained;
            const index = b - a === to - a ? a + i : -1, low = index >= 0 ? old[index].start : start, high = index >= 0 ? old[index].end : end;
            return { raw: writeBlock(n, eol, this.projection.fragments.filter(f => f.start >= low && f.end <= high), index >= 0 ? old[index] : undefined), index };
          });
          replacement = pieces.map((part, i) => {
            if (!i) return part.raw;
            const prev = pieces[i - 1];
            const gap = prev.index >= 0 && part.index === prev.index + 1 ? source.slice(old[prev.index].end, old[part.index].start) : eol + eol;
            return gap + part.raw;
          }).join('');
          if (a === b && replacement) replacement = a < old.length ? replacement + eol + eol : (old.length ? eol + eol : '') + replacement;
          candidate = source.slice(0, start) + replacement + source.slice(end);
        }
      }
      assertUnicode(candidate);
      if (encode.encode(candidate).length > this.byteLimit) throw new Error('SOURCE_SIZE_LIMIT');
      const local = difference(source, candidate);
      patchMs = performance.now() - begin - speculativeValidationMs;
      const validationStart = performance.now(), parsed = project(candidate);
      if (key(parsed.doc) !== k) throw new Error('REPARSE_MISMATCH: targeted source editing required');
      const validationMs = speculativeValidationMs + performance.now() - validationStart;
      if (historical >= 0) this.cursor = historical; else this.remember(k, local);
      const patch = { start: encode.encode(source.slice(0, local.start)).length, end: encode.encode(source.slice(0, local.end)).length, text: local.text, removed: local.removed };
      this.projection = parsed;
      return { accepted: true, source: candidate, patches: [patch], patchMs, validationMs, totalMs: performance.now() - begin };
    } catch (e) { return { accepted: false, source: this.source, patches: [], reason: e instanceof Error ? e.message : 'VALIDATION_FAILED', patchMs, validationMs: performance.now() - begin - patchMs }; }
  }
  /** Explicit reviewed source-region replacement; no implicit whole-file fallback. */
  editSource(blockIndex: number, replacement: string) {
    const block = this.projection.blocks[blockIndex]; if (!block) throw new Error('SOURCE_BLOCK_MISSING');
    const source = this.source.slice(0, block.start) + replacement + this.source.slice(block.end);
    assertUnicode(source); if (encode.encode(source).length > this.byteLimit) throw new Error('SOURCE_SIZE_LIMIT');
    const next = project(source), delta = replacement.length - (block.end - block.start);
    for (const other of this.projection.blocks) {
      if (other === block) continue;
      const shift = other.start >= block.end ? delta : 0;
      const retained = next.blocks.find(n => n.start === other.start + shift && n.end === other.end + shift);
      if (!retained || retained.raw !== other.raw || key(retained.node) !== key(other.node)) throw new Error('SOURCE_EDIT_CROSSES_BOUNDARY');
    }
    this.history = [{ hash: fingerprint(key(next.doc)) }]; this.cursor = 0; this.historySize = 0; this.projection = next; return next.doc;
  }
}
