import { decodeString } from 'micromark-util-decode-string';
import type { Leaf } from './syntax';
const token = /^(?:\\[!-/:-@[-`{-~]|&(?:#[xX][\da-fA-F]+|#\d+|[a-zA-Z][a-zA-Z\d]+);)/;
export function encodedTokens(raw: string) { return [...raw.matchAll(new RegExp(token.source.slice(1), 'g'))].map(m => m[0]).filter(value => decodeString(value) !== value); }
/** Token boundaries map decoded UTF16 to raw UTF16. Entity interiors and
 * surrogate interiors have no mapping; no byte/codepoint guessing. */
export function decodedBoundaries(raw: string, old: string) {
  const boundaries = new Map<number, number>([[0, 0]]);
  let r = 0, d = 0;
  while (r < raw.length) {
    const begin = r; let value: string;
    const eol = /^(?:\r\n|\r|\n)/.exec(raw.slice(r));
    if (eol) {
      value = ' '; r += eol[0].length;
      const rawIndent = /^[ \t]*/.exec(raw.slice(r))![0], visibleIndent = /^[ \t]*/.exec(old.slice(d + 1))![0];
      if (!rawIndent.endsWith(visibleIndent)) return;
      r += rawIndent.length - visibleIndent.length;
    } else {
      const encoded = token.exec(raw.slice(r))?.[0];
      const part = encoded ?? String.fromCodePoint(raw.codePointAt(r)!);
      value = decodeString(part); r += part.length;
    }
    if (!old.startsWith(value, d)) return;
    boundaries.set(d, begin); d += value.length; boundaries.set(d, r);
  }
  if (d !== old.length) return;
  return boundaries;
}
export function literalPatch(leaf: Leaf, next: string) {
  const old = leaf.node.text ?? '', boundaries = decodedBoundaries(leaf.raw, old);
  if (!boundaries) return;
  let a = 0, b = old.length, to = next.length;
  while (a < b && a < to && old[a] === next[a]) a++;
  while (b > a && to > a && old[b - 1] === next[to - 1]) { b--; to--; }
  if (a > 0 && /[\udc00-\udfff]/.test(old[a] ?? '')) a--;
  if (/[\udc00-\udfff]/.test(old[b] ?? '')) { b++; to++; }
  const start = boundaries.get(a), end = boundaries.get(b);
  if (start === undefined || end === undefined || /[\r\n]/.test(next.slice(a, to))) return;
  return { start: leaf.start + start, end: leaf.start + end, text: next.slice(a, to) };
}
