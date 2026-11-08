import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHelp, validateHelp, helpHashes } from './validate-help.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const original = loadHelp();
test('canonical Help validates', () => assert.deepEqual(validateHelp(original.catalogue, original.files), []));
for (const [label, mutate] of [
  ['duplicate identifier', c => c.features.push(c.features[0])],
  ['unsafe path', c => c.articles[0].path = '../secret.md'],
  ['invalid category', c => c.features[0].areas = ['bogus']],
  ['missing article', c => c.features[0].article = 'bogus'],
  ['invalid platform', c => c.features[0].availability.plan9 = { status: 'available' }],
  ['invalid version', c => c.features[0].availability.windows.verifiedVersion = 'future'],
  ['broken context', c => c.context.library = 'bogus'],
]) test('rejects ' + label, () => { const c = structuredClone(original.catalogue); mutate(c); assert.ok(validateHelp(c, original.files).length); });
for (const link of ['missing.md', 'notes.md#missing', '../outside.md', 'file:///secret', 'javascript:alert(1)', 'https://user:pass@example.com']) test('rejects link ' + link, () => assert.ok(validateHelp(original.catalogue, { ...original.files, 'notes.md': original.files['notes.md'] + `\n[unsafe](${link})` }).length));
test('rejects unbundled article and raw HTML', () => {
  assert.ok(validateHelp(original.catalogue, { ...original.files, 'extra.md': '# Extra' }).length);
  assert.ok(validateHelp(original.catalogue, { ...original.files, 'notes.md': '<script>alert(1)</script>' }).length);
});
test('packaging verification detects stale and missing bundled bytes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vaultor-help-validation-'));
  const help = join(directory, 'help'); mkdirSync(help);
  try {
    for (const [path, content] of Object.entries({ ...original.files, 'catalogue.json': JSON.stringify(original.catalogue), 'provenance.json': JSON.stringify({ hashes: helpHashes(original.catalogue, original.files) }) })) writeFileSync(join(help, path), content);
    const run = () => spawnSync(process.execPath, [fileURLToPath(new URL('./validate-help.mjs', import.meta.url)), '--dist', directory], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    writeFileSync(join(help, 'notes.md'), '# Stale');
    assert.notEqual(run().status, 0);
    unlinkSync(join(help, 'notes.md'));
    assert.notEqual(run().status, 0);
  } finally {
    for (const name of readdirSync(help)) unlinkSync(join(help, name));
    rmdirSync(help); rmdirSync(directory);
  }
});
