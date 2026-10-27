import type { JSONContent } from '@tiptap/core';
import { canonical, decode, key, LIMITS, project, writeBlock, assertUnicode, type Projection } from './syntax';
import { decodedBoundaries, literalPatch } from './sourceMap';
import { assertProjectionShape } from './foreground';

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
type TextChange = { old: JSONContent; next: string };
function textChanges(a: JSONContent, b: JSONContent, retained?: WeakMap<JSONContent, JSONContent>): TextChange[] | null {
  const changes: { old: JSONContent; next: string }[] = [];
  const children = (n: JSONContent) => n.type === 'doc' ? (n.content ?? []).filter(c => c.type !== 'paragraph' || c.content?.length) : n.content ?? [];
  const visit = (x: JSONContent, y: JSONContent): boolean => {
    if (retained?.get(x) === y) return true;
    if (x.type === 'text' && y.type === 'text') {
      if (JSON.stringify(canonical(x).marks ?? []) !== JSON.stringify(canonical(y).marks ?? [])) return false;
      if (x.text !== y.text) changes.push({ old: x, next: y.text ?? '' }); return true;
    }
    // Tiptap may append empty root paragraphs (not Markdown source blocks).
    // Match canonical's root semantics while retaining the original leaf nodes
    // needed by literalPatch. Otherwise an ordinary cell edit rewrites a table.
    const a = children(x), b = children(y);
    if (x.type !== y.type || JSON.stringify(canonical({ ...x, content: [] }, false).attrs ?? {}) !== JSON.stringify(canonical({ ...y, content: [] }, false).attrs ?? {}) || a.length !== b.length) return false;
    return a.every((c, i) => visit(c, b[i]));
  };
  return visit(a, b) ? changes : null;
}
function literalBatch(projection: Projection, changes: TextChange[]): string | undefined {
  // A text permutation may be a block move. Keep the structural writer's raw
  // fragment provenance for that case rather than rewriting text in place.
  const previous = new Set(changes.map(change => change.old.text ?? ''));
  if (changes.some(change => previous.has(change.next))) return;
  const leaves = new Map(projection.leaves.map(leaf => [leaf.node, leaf]));
  const patches: NonNullable<ReturnType<typeof literalPatch>>[] = [];
  for (const change of changes) {
    const leaf = leaves.get(change.old), patch = leaf && literalPatch(leaf, change.next);
    if (!patch) return;
    patches.push(patch);
  }
  patches.sort((a, b) => a.start - b.start);
  const pieces: string[] = []; let end = 0;
  for (const patch of patches) {
    if (patch.start < end) return;
    pieces.push(projection.source.slice(end, patch.start), patch.text); end = patch.end;
  }
  pieces.push(projection.source.slice(end)); return pieces.join('');
}
function addedFormatting(projection: Projection, target: JSONContent): CharPatch | undefined {
  const old = projection.blocks, next = (target.content ?? []).filter(n => n.type !== 'paragraph' || n.content?.length);
  if (old.length !== next.length) return;
  const changed = old.map((b, i) => key(b.node) === key(next[i]) ? -1 : i).filter(i => i >= 0);
  if (changed.length !== 1) return;
  const index = changed[0], collect = (n: JSONContent): JSONContent[] => n.type === 'text' ? [n] : (n.content ?? []).flatMap(collect);
  const strip = (n: JSONContent): JSONContent => ({ ...n, marks: undefined, content: n.content?.map(strip) });
  if (key(strip(old[index].node)) !== key(strip(next[index]))) return;
  const a = collect(old[index].node), b = collect(next[index]);
  const marks = (n: JSONContent) => (canonical(n).marks ?? []).map(m => JSON.stringify(m));
  const expand = (nodes: JSONContent[]) => nodes.flatMap(n => Array.from({ length: n.text?.length ?? 0 }, () => marks(n)));
  const am = expand(a), bm = expand(b); let from = -1, to = 0, added: string | undefined;
  for (let i = 0; i < am.length; i++) {
    if (JSON.stringify(am[i]) === JSON.stringify(bm[i])) continue;
    const plus = bm[i].filter(m => !am[i].includes(m)), minus = am[i].filter(m => !bm[i].includes(m));
    if (minus.length || plus.length !== 1 || (added && added !== plus[0])) return;
    if (from < 0) from = i; to = i + 1; added = plus[0];
  }
  if (from < 0 || !added) return;
  for (let i = from; i < to; i++) if (!bm[i].includes(added) || am[i].includes(added)) return;
  const marker = { bold: '**', italic: '_', strike: '~~' }[JSON.parse(added).type as 'bold']; if (!marker) return;
  let offset = 0, start: number | undefined, end: number | undefined;
  for (const n of a) {
    const size = n.text?.length ?? 0, leaf = projection.leaves.find(l => l.node === n);
    if (leaf) {
      const bounds = decodedBoundaries(leaf.raw, n.text ?? '');
      if (from >= offset && from < offset + size) { const p = bounds?.get(from - offset); if (p !== undefined) start = leaf.start + p; }
      if (to > offset && to <= offset + size) { const p = bounds?.get(to - offset); if (p !== undefined) end = leaf.start + p; }
    }
    offset += size;
  }
  if (start === undefined || end === undefined) return;
  const removed = projection.source.slice(start, end);
  return { start, end, removed, text: marker + removed + marker };
}

/** Source-authoritative engine. All expensive work belongs in its worker. */
export class MarkdownEngine {
  projection: Projection;
  private history: { hash: string; patch?: CharPatch }[] = [];
  private cursor = 0;
  private historySize = 0;
  private byteLimit: number;
  private historyLimit: number;
  private regionEpoch = 0;
  private regions = new Map<string, { index: number; epoch: number }>();
  private canonicalBlocks = new WeakMap<JSONContent, JSONContent>();
  private retained = new WeakMap<JSONContent, JSONContent>();
  private projectionKey = '';
  sourceRegion(index: number, expected: JSONContent) {
    const block = this.projection.blocks[index];
    if (!block || key(block.node) !== key(expected)) throw new Error('SOURCE_REGION_MAPPING_AMBIGUOUS');
    if (this.regions.size >= 8) throw new Error('SOURCE_REGION_TICKET_LIMIT');
    const token = crypto.randomUUID(); this.regions.set(token, { index, epoch: this.regionEpoch });
    return { text: block.raw, token };
  }
  editRegion(token: string, replacement: string) {
    const ticket = this.regions.get(token); this.regions.delete(token);
    if (!ticket || ticket.epoch !== this.regionEpoch) throw new Error('SOURCE_REGION_TICKET_STALE');
    return this.editSource(ticket.index, replacement);
  }
  constructor(bytes: Uint8Array, byteLimit = LIMITS.bytes, historyLimit = LIMITS.historyEntries) { if (!Number.isSafeInteger(byteLimit) || byteLimit < 1 || !Number.isSafeInteger(historyLimit) || historyLimit < 1) throw new Error('INVALID_ENGINE_LIMIT'); this.historyLimit = Math.min(historyLimit, LIMITS.historyEntries); this.byteLimit = Math.min(byteLimit, LIMITS.bytes); if (bytes.length > this.byteLimit) throw new Error('SOURCE_SIZE_LIMIT'); this.projection = project(decode(bytes)); assertProjectionShape(this.projection.doc, this.byteLimit > LIMITS.interactiveBytes); this.history = [{ hash: fingerprint(key(this.projection.doc)) }]; }
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
  apply(target: JSONContent, immutable = false): EngineResult {
    const begin = performance.now(); let patchMs = 0, speculativeValidationMs = 0;
    try {
      // Only worker-owned immutable snapshots may reuse semantic blocks. Public
      // callers/tests can mutate JSON between apply calls and keep the full path.
      const intended = immutable && target.type === 'doc' && target.content?.every(n => n.type !== 'text') ? {
        ...canonical({ ...target, content: [] }),
        content: target.content.filter(n => n.type !== 'paragraph' || n.content?.length).map(n => {
          let value = this.canonicalBlocks.get(n);
          if (!value) { value = canonical(n, false); this.canonicalBlocks.set(n, value); }
          return value;
        }),
      } : canonical(target);
      const k = JSON.stringify(intended), source = this.source;
      assertProjectionShape(target, this.byteLimit > LIMITS.interactiveBytes);
      this.projectionKey ||= key(this.projection.doc);
      if (this.projectionKey === k) return { accepted: true, source, patches: [], patchMs: performance.now() - begin, validationMs: 0 };
      if (JSON.stringify(protectedValues(this.projection.doc)) !== JSON.stringify(protectedValues(target))) throw new Error('PROTECTED_SYNTAX_REQUIRES_TARGETED_SOURCE');
      let candidate: string; let start = 0, end = source.length, replacement: string;
      let validated: Projection | undefined;
      let validatedKey: string | undefined;
      const matchesCandidate = (value: string) => {
        const start = performance.now(); validated = this.projectCandidate(value);
        validatedKey = key(validated.doc);
        const matches = validatedKey === k;
        speculativeValidationMs += performance.now() - start; return matches;
      };
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
        const changes = textChanges(this.projection.doc, target, immutable ? this.retained : undefined);
        const change = changes?.length === 1 ? changes[0] : undefined;
        const formatting = !change ? addedFormatting(this.projection, target) : undefined;
        const leaf = change && this.projection.leaves.find(l => l.node === change.old);
        const literal = change && leaf ? literalPatch(leaf, change.next) : undefined;
        // Independent protection may skip intermediate renderer Undo/typing
        // snapshots. Preserve mapped text in every changed leaf before trying
        // structural writers; otherwise a coalesced revert rewrites table padding.
        // The entire candidate must still reparse to the complete intended JSON.
        const batch = changes && changes.length > 1 ? literalBatch(this.projection, changes) : undefined;
        if (batch !== undefined && matchesCandidate(batch)) {
          candidate = batch;
        } else if (!change && formatting && matchesCandidate(source.slice(0, formatting.start) + formatting.text + source.slice(formatting.end))) {
          start = formatting.start; end = formatting.end; replacement = formatting.text;
          candidate = source.slice(0, start) + replacement + source.slice(end);
        } else if (literal) {
          start = literal.start; end = literal.end; replacement = literal.text;
          candidate = source.slice(0, start) + replacement + source.slice(end);
          // A literal edit introducing syntax must use an escaping block writer.
          const matches = matchesCandidate(candidate);
          if (!matches) {
            replacement = replacement ? writeBlock({ type: 'paragraph', content: [{ type: 'text', text: replacement }] }, '\n') : '';
            candidate = source.slice(0, start) + replacement + source.slice(end);
            const escapedMatches = matchesCandidate(candidate);
            if (!escapedMatches) {
              // Entity spelling changes only the intentionally inserted text;
              // useful next to existing underscore delimiters without touching
              // their original source or an adjacent existing entity.
              replacement = [...literal.text].map(c => '&#x' + c.codePointAt(0)!.toString(16) + ';').join('');
              candidate = source.slice(0, start) + replacement + source.slice(end);
              const entityMatches = matchesCandidate(candidate);
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
      const validationStart = performance.now(), parsed = validated?.source === candidate ? validated : this.projectCandidate(candidate);
      // matchesCandidate already compared this exact parsed projection. A new
      // candidate (e.g. writer fallback) still requires its own complete key.
      if ((parsed === validated && validatedKey !== undefined ? validatedKey : key(parsed.doc)) !== k) throw new Error('REPARSE_MISMATCH: targeted source editing required');
      const validationMs = speculativeValidationMs + performance.now() - validationStart;
      if (historical >= 0) this.cursor = historical; else this.remember(k, local);
      const patch = { start: encode.encode(source.slice(0, local.start)).length, end: encode.encode(source.slice(0, local.end)).length, text: local.text, removed: local.removed };
      this.projection = parsed;
      this.projectionKey = k;
      if (immutable) {
        const roots = (target.content ?? []).filter(n => n.type !== 'paragraph' || n.content?.length);
        parsed.blocks.forEach((block, index) => { const raw = roots[index]; if(raw) this.retained.set(block.node,raw); });
      }
      this.regionEpoch++; this.regions.clear();
      return { accepted: true, source: candidate, patches: [patch], patchMs, validationMs, totalMs: performance.now() - begin };
    } catch (e) { return { accepted: false, source: this.source, patches: [], reason: e instanceof Error ? e.message : 'VALIDATION_FAILED', patchMs, validationMs: performance.now() - begin - patchMs }; }
  }
  /** Reparse a self-contained root region, retaining the
   * already parsed ranges elsewhere. Cross-block/context-sensitive syntax always
   * uses the full parser. The complete intended document is still compared by apply.
   */
  private projectCandidate(candidate: string): Projection {
    const previous = this.projection, source = previous.source;
    const patch = difference(source, candidate);
    const index = previous.blocks.findIndex(b => patch.start >= b.start && patch.end <= b.end);
    const block = previous.blocks[index];
    if (!block || !['paragraph', 'heading', 'codeBlock', 'bulletList', 'orderedList', 'blockquote', 'table'].includes(block.node.type!) || /[[\]]/.test(block.raw + patch.text)) return project(candidate);
    const delta = candidate.length - source.length;
    const raw = candidate.slice(block.start, block.end + delta);
    // Blank-line boundaries isolate the region. Bracket-bearing regions always
    // take the full path: definitions/references can affect distant blocks.
    if (
      (block.start > (source.startsWith('\ufeff') ? 1 : 0) && !/(?:\r?\n)[ \t]*(?:\r?\n)$/.test(source.slice(0, block.start))) ||
      (block.end < source.trimEnd().length && !/^(?:\r?\n)[ \t]*(?:\r?\n)/.test(source.slice(block.end)))) return project(candidate);
    const local = project(raw);
    if (!local.blocks.length || local.blocks[0].start !== 0 || local.blocks.at(-1)!.end !== raw.length) return project(candidate);
    const syntaxNodes = previous.syntaxNodes - block.syntaxNodes + local.syntaxNodes - 1;
    if (syntaxNodes > LIMITS.nodes) throw new Error('SOURCE_COMPLEXITY_LIMIT');
    const shifted = <T extends { start: number; end: number }>(entry: T, by: number): T => ({ ...entry, start: entry.start + by, end: entry.end + by });
    const retain = <T extends { start: number; end: number }>(entries: T[], added: T[]) => [
      ...entries.filter(e => e.end <= block.start),
      ...added.map(e => shifted(e, block.start)),
      ...entries.filter(e => e.start >= block.end).map(e => shifted(e, delta)),
    ];
    const blocks = [ ...previous.blocks.slice(0,index), ...local.blocks.map(b=>shifted(b,block.start)), ...previous.blocks.slice(index+1).map(b=>shifted(b,delta)) ];
    return { source: candidate, blocks, leaves: retain(previous.leaves, local.leaves), fragments: retain(previous.fragments, local.fragments), syntaxNodes, doc: { type: 'doc', content: blocks.map(b => b.node) } };
  }
  /** Explicit reviewed source-region replacement; no implicit whole-file fallback. */
  editSource(blockIndex: number, replacement: string) {
    const block = this.projection.blocks[blockIndex]; if (!block) throw new Error('SOURCE_BLOCK_MISSING');
    const source = this.source.slice(0, block.start) + replacement + this.source.slice(block.end);
    assertUnicode(source); if (encode.encode(source).length > this.byteLimit) throw new Error('SOURCE_SIZE_LIMIT');
    const next = project(source), delta = replacement.length - (block.end - block.start);
    assertProjectionShape(next.doc, this.byteLimit > LIMITS.interactiveBytes);
    for (const other of this.projection.blocks) {
      if (other === block) continue;
      const shift = other.start >= block.end ? delta : 0;
      const retained = next.blocks.find(n => n.start === other.start + shift && n.end === other.end + shift);
      if (!retained || retained.raw !== other.raw || key(retained.node) !== key(other.node)) throw new Error('SOURCE_EDIT_CROSSES_BOUNDARY');
    }
    this.history = [{ hash: fingerprint(key(next.doc)) }]; this.cursor = 0; this.historySize = 0; this.projection = next; this.projectionKey = ''; this.retained = new WeakMap(); this.regionEpoch++; this.regions.clear(); return next.doc;
  }
}
