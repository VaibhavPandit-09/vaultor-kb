// Reproducible evidence generator. Writes only this experiment's evidence/.
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cpus, platform, release } from 'node:os';
import { SourceSession, project } from './source-editor.mjs';
import { sha } from './filesystem.mjs';
const directory = fileURLToPath(new URL('./evidence/', import.meta.url)); mkdirSync(directory, { recursive: true });
const corpus = ['docs/CODEBASE.md', 'docs/workspace/SESSIONS.md', 'docs/workspace/NAVIGATION.md', 'docs/security/HOST-ACCESS.md', 'docs/design/UI_PHILOSOPHY.md'];
const percentile = (values, q) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
const stats = [];
for (const path of corpus) {
  const bytes = readFileSync(new URL('../../' + path, import.meta.url)), p = project(bytes);
  let textUnits = 0, protectedNodes = 0;
  const visit = n => { if (n.type === 'text') textUnits += n.value.length; n.children?.forEach(visit); }; visit(p.ast);
  p.doc.descendants(n => { if (n.type.name.startsWith('source')) protectedNodes++; });
  const literalUnits = p.spans.filter(s => s.kind === 'text').reduce((sum, s) => sum + s.to - s.from, 0);
  const times = [];
  for (let i = 0; i < 9; i++) { const start = performance.now(); project(bytes); times.push(performance.now() - start); }
  const session = new SourceSession(bytes), span = session.projection.spans.find(s => s.kind === 'text' && s.node.text.length > 80 && /[A-Za-z]{8,}/.test(s.node.text));
  const word = /[A-Za-z]{8,}/.exec(span.node.text)[0], from = span.from + span.node.text.indexOf(word);
  const start = performance.now(), result = session.apply(session.state.tr.insertText('qualified', from, from + word.length));
  if (!result.accepted) throw new Error(result.reason);
  const patch = result.patches[0];
  stats.push({ path, bytes: bytes.length, sha256: sha(bytes), textUnits, literalUnits, literalPercent: +(literalUnits / textUnits * 100).toFixed(1), protectedNodes,
    projectionMedianMs: +percentile(times, .5).toFixed(2), projectionP95Ms: +percentile(times, .95).toFixed(2), editReparseMs: +(performance.now() - start).toFixed(2),
    patch, unchangedPrefix: bytes.subarray(0, patch.start).equals(session.bytes.subarray(0, patch.start)),
    unchangedSuffix: bytes.subarray(patch.end).equals(session.bytes.subarray(patch.start + Buffer.byteLength(patch.inserted))) });
}
const synthetic = [];
for (const target of [8192, 65536, 262144, 1048576]) {
  const chunk = 'Paragraph alpha with **bold** and _italic_ 😀.\n\n';
  const bytes = Buffer.from(chunk.repeat(Math.ceil(target / Buffer.byteLength(chunk))));
  const start = performance.now(), session = new SourceSession(bytes), loaded = performance.now();
  const result = session.replace('alpha', 'changed'); if (!result.accepted) throw new Error(result.reason);
  synthetic.push({ bytes: bytes.length, nodes: session.state.doc.childCount, openMs: +(loaded - start).toFixed(2), singleEditReparseMs: +(performance.now() - loaded).toFixed(2) });
}
const before = readFileSync(new URL('./fixtures/mixed.md', import.meta.url)), session = new SourceSession(before);
for (const [a, b] of [['Paragraph original', 'Paragraph edited'], ['bold original', 'bold changed'], ['Nested original', 'Nested edited'], ['const original', 'const changed'], ['Inline original', 'Inline edited']]) {
  const result = session.replace(a, b); if (!result.accepted) throw new Error(result.reason);
}
const table = session.projection.spans.find(s => s.node.text === 'original');
if (!session.apply(session.state.tr.insertText('changed', table.from, table.to)).accepted) throw new Error('table patch failed');
writeFileSync(directory + 'mixed.before.md', before); writeFileSync(directory + 'mixed.after.md', session.bytes);
const diff = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--', 'evidence/mixed.before.md', 'evidence/mixed.after.md'], { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8', windowsHide: true });
if (![0, 1].includes(diff.status)) throw new Error(diff.stderr);
writeFileSync(directory + 'mixed.diff', diff.stdout.replaceAll(directory.replaceAll('\\', '/'), 'evidence/'));
// A real repository paragraph edit, committed as a compact diff plus original hash;
// do not maintain a second editable copy of the living guide.
const realBytes = readFileSync(new URL('../../docs/CODEBASE.md', import.meta.url)), realSession = new SourceSession(realBytes);
const realResult = realSession.replace('Vaultor is a personal', 'Vaultor remains a personal');
if (!realResult.accepted) throw new Error(realResult.reason);
writeFileSync(directory + 'corpus.before.tmp', realBytes); writeFileSync(directory + 'corpus.after.tmp', realSession.bytes);
const realDiff = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--', 'evidence/corpus.before.tmp', 'evidence/corpus.after.tmp'], { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8', windowsHide: true });
if (realDiff.status !== 1) throw new Error(realDiff.stderr);
writeFileSync(directory + 'codebase.diff', realDiff.stdout);
unlinkSync(directory + 'corpus.before.tmp'); unlinkSync(directory + 'corpus.after.tmp');
const output = { recordedAt: new Date().toISOString(), runtime: process.version, os: platform() + ' ' + release(), cpu: cpus()[0].model,
  methodology: 'Corpus projection timings:9 sequential samples after one warmup; p95 is maximum for n=9. Edit timings include one real PM transaction, patch, full reparse and document comparison; no DOM. Synthetic:one sample each, not throughput or UI latency qualification.',
  corpus: stats, synthetic, repositoryExample: { path: 'docs/CODEBASE.md', beforeSha256: sha(realBytes), afterSha256: sha(realSession.bytes), patches: realSession.events }, example: { patches: session.events, beforeSha256: sha(before), afterSha256: sha(session.bytes) } };
writeFileSync(directory + 'metrics.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
