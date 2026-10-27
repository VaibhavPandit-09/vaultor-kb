import { describe, expect, it } from 'vitest';
import { structuralCases } from '../../../../desktop/scripts/perf-structures.mjs';
import { MarkdownEngine } from './engine';

describe('native performance structural fixtures use real admission and source patches', () => {
  for (const f of structuralCases()) it(f.caseId, () => {
    expect(Buffer.byteLength(f.text)).toBe(f.kib * 1024 - (f.kib === 1024 ? 4096 : 0));
    if (f.admission === 'expected-refusal') {
      expect(() => new MarkdownEngine(new TextEncoder().encode(f.text))).toThrow(f.id === 'size-refusal' ? 'SOURCE_SIZE_LIMIT' : 'SOURCE_COMPLEXITY_LIMIT');
      return;
    }
    const engine = new MarkdownEngine(new TextEncoder().encode(f.text));
    for (const t of f.targets) {
      const doc = structuredClone(engine.projection.doc);
      let found = 0;
      const visit = (n, ancestors = []) => {
        if (n.type === 'text' && n.text.includes(t.needle)) {
          expect(ancestors).toContain(t.kind);
          n.text = n.text.replace(t.prefix, t.prefix + ' LOCAL'); found++;
        }
        n.content?.forEach(c => visit(c, [...ancestors, n.type]));
      };
      visit(doc); expect(found).toBe(1);
      const result = engine.apply(doc);
      expect(result.accepted, result.reason).toBe(true);
      expect(engine.source).toBe(f.text.replace(t.needle, t.needle.replace(t.prefix, t.prefix + ' LOCAL')));
      expect(engine.apply(new MarkdownEngine(new TextEncoder().encode(f.text)).projection.doc).accepted).toBe(true);
      expect(engine.source).toBe(f.text);
    }
  }, 30000);
});
