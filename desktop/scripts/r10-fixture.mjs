// R10 disposable qualification host. Never opens a source dataset's database.
import assert from 'node:assert/strict';
import { OwnedServer } from '../src/owned-server.mjs';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { cpus, totalmem, release } from 'node:os';

const resume = process.env.R10_RESUME;
const root = resume ? resolve(resume) : resolve('desktop/cache/r10', randomUUID());
assert.ok(root.startsWith(resolve('desktop/cache/r10') + '\\'), 'R10 root must stay inside its ignored fixture directory');
await mkdir(root, { recursive: true });
assert.equal(await realpath(root), root, 'Fixture cannot be a junction');
const bundle = process.env.VAULTOR_BUILD_BUNDLE;
assert.ok(bundle, 'An explicit released Windows bundle is required');
const corpusRoot = process.env.R10_CORPUS_ROOT;
assert.ok(corpusRoot, 'Set R10_CORPUS_ROOT to the existing Atlas fixture root');
process.env.HOST_NETWORK_PORT = '0';
const owned = new OwnedServer({ bundle, data: join(root, 'host') });
const report = resume ? JSON.parse(await readFile(join(root, 'report.json'))) : { source: '7b7f4f4dba7d4fbf8db67a502662e02d0c590622', root,
  hardware: { cpu: cpus()[0].model, ram: totalmem(), os: release() }, measurements: {}, checks: [],
  limitations: ['Loopback HTTPS; no real LAN, macOS or physical Android qualification.',
    'New host process; OS and disk caches are not flushed. Timings include polling where stated.'] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function api(path, method = 'GET', body, workspace, binary = false) {
  for (let retry = 0; retry < 600; retry++) {
    const form = body instanceof FormData;
    const response = await fetch(owned.address + '/api' + path, { method,
      headers: { 'X-Vaultor-Owner': owned.accessKey, 'X-Vaultor-Protocol': '3',
        ...(workspace ? { 'X-Vaultor-Workspace': workspace } : {}),
        ...(body && !form ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? form ? body : JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120000) });
    if (response.status === 409) {
      const problem = await response.clone().json().catch(() => ({}));
      if (problem.code === 'WORKSPACE_BUSY' || (method === 'GET' && path.startsWith('/operations/') && problem.detail === 'Workspace maintenance is in progress. Retry shortly.')) { await sleep(100); continue; }
    }
    assert.ok(response.ok, `${method} ${path}: ${response.status}`);
    if (binary) return Buffer.from(await response.arrayBuffer());
    const text = await response.text(); return text ? JSON.parse(text) : null;
  }
  throw Error('Maintenance did not settle: ' + path);
}
async function finish(id, workspace) {
  for (let n = 0; n < 3600; n++) {
    const op = await api('/operations/' + id, 'GET', null, workspace);
    if (op.status === 'SUCCEEDED') return op;
    assert.ok(!['FAILED', 'CANCELLED'].includes(op.status), 'Operation failed: ' + op.detail);
    await sleep(100);
  }
  throw Error('Operation deadline exceeded');
}
async function measure(name, fn) {
  const start = performance.now(); const result = await fn();
  report.measurements[name] = performance.now() - start; return result;
}
async function archive(corpus) {
  const dir = corpus === 'small' ? join(corpusRoot, 'small') : corpusRoot;
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json')));
  assert.equal(manifest.seed, 'atlas-2026-10-v1');
  const bytes = await readFile(join(dir, 'baseline.zip'));
  assert.equal(hash(bytes), manifest.archive.sha256);
  return { bytes, manifest };
}
async function importInto(bytes, workspace) {
  const form = new FormData(); form.set('file', new Blob([bytes]), 'fixture.zip');
  const preview = await api('/imports/preview', 'POST', form, workspace);
  await api('/imports/' + preview.operation.id + '/commit', 'POST', { mode: 'replace', confirmation: 'replace' }, workspace);
  await finish(preview.operation.id, workspace);
}
async function sample(name, path, workspace) {
  const times = [];
  for (let n = 0; n < 11; n++) {
    const start = performance.now(); await api(path, 'GET', null, workspace); times.push(performance.now() - start);
  }
  const warm = times.slice(1).sort((a, b) => a - b);
  report.measurements[name] = { samples: times, firstMs: times[0], warmMedianMs: (warm[4] + warm[5]) / 2, warmMaxMs: warm.at(-1) };
}
async function exportFull(workspace) {
  const op = await api('/exports', 'POST', { scope: 'workspace', format: 'zip' }, workspace);
  await finish(op.id, workspace);
  return api('/exports/' + op.id + '/download', 'GET', null, workspace, true);
}
async function serve(descriptor) {
  await writeFile(join(root, 'fixture.json'), JSON.stringify(descriptor, null, 2));
  await writeFile(resolve('desktop/cache/r10/current.json'), JSON.stringify(descriptor, null, 2));
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ready: true, ...descriptor }));
  for await (const line of createInterface({ input: process.stdin, terminal: false })) {
    const command = JSON.parse(line); if (command.stop) break;
    if (command.approve) {
      assert.match(command.approve, /^\d{6}$/);
      const pending = (await api('/owner/pairings')).find(p => p.code === command.approve && p.name === 'Vaultor Android');
      assert.ok(pending, 'Matching fixture comparison code required');
      await api('/owner/pairings/' + pending.id + '/approve', 'POST', { code: command.approve });
      for (const device of await api('/owner/devices')) if (device.name === 'Vaultor Android') {
        for (const id of [descriptor.small.id, descriptor.atlas.id]) await api('/owner/workspaces/' + id + '/grants', 'PUT', { deviceId: device.id, allowed: true });
      }
      console.log('Matching fixture code approved; separate workspace grants recorded');
    }
    if (command.status) console.log(JSON.stringify({ small: (await api('/resources?size=1')).totalItems, atlas: (await api('/resources?size=1', 'GET', null, descriptor.atlas.id)).totalItems }));
  }
}
try {
  await measure(resume ? 'resumeHostReadyMs' : 'hostReadyMs', () => owned.start());
  const sharing = await api('/owner/sharing', 'PUT', { enabled: true });
  if (resume) {
    assert.equal(report.root, root); assert.equal(report.source, '7b7f4f4dba7d4fbf8db67a502662e02d0c590622');
    const descriptor = JSON.parse(await readFile(join(root, 'fixture.json')));
    await serve({ ...descriptor, address: `https://127.0.0.1:${sharing.port}`, port: sharing.port });
  } else {
  const small = await archive('small'), atlas = await archive('atlas');
  await measure('smallImportMs', () => importInto(small.bytes));
  const smallIdentity = await api('/workspace/identity');
  const atlasId = randomUUID(); await api('/owner/workspaces/' + atlasId, 'PUT', { name: 'R10 Atlas 5000' });
  await measure('atlasImportMs', () => importInto(atlas.bytes, atlasId));
  const atlasIdentity = await api('/workspace/identity', 'GET', null, atlasId);
  assert.equal((await api('/resources?size=1')).totalItems, 70);
  assert.equal((await api('/resources?size=1', 'GET', null, atlasId)).totalItems, 5000);
  const sharedId = small.manifest.resources.find(r => r.category === 'note').id;
  const original = await api('/resources/' + sharedId);
  const other = await api('/resources/' + sharedId, 'GET', null, atlasId);
  assert.equal(original.id, other.id);
  const changed = { title: original.title + ' — independent Small edit', content: original.content };
  // Normal conditional desktop edit; never bypass revision checks.
  const edited = await fetch(owned.address + '/api/resources/' + sharedId + '/note', { method: 'PUT', headers: {
    'X-Vaultor-Owner': owned.accessKey, 'Content-Type': 'application/json', 'If-Match': '"' + original.revision + '"' }, body: JSON.stringify(changed) });
  assert.ok(edited.ok, 'Conditional edit failed');
  assert.equal((await api('/resources/' + sharedId, 'GET', null, atlasId)).revision, other.revision);
  report.checks.push('Equal resource IDs remain isolated across Small and Atlas after conditional edit');
  await Promise.all([sample('smallLibrary', '/resources?size=100'), sample('atlasLibrary', '/resources?size=100', atlasId)]);
  await sample('atlasTitleSearch', '/resources?q=field&size=100', atlasId);
  await sample('atlasSavedSearch', '/resources/query?q=atlasbeacon0317&size=100', atlasId);
  const full = await measure('atlasFullExportMs', () => exportFull(atlasId));
  report.atlasExport = { bytes: full.length, sha256: hash(full) };
  const smallFull = await measure('smallFullExportMs', () => exportFull());
  // W3 import-as-new preserves IDs in an independent namespace.
  const form = new FormData(); form.set('name', 'R10 independent Small copy'); form.set('file', new Blob([smallFull]), 'small.zip');
  const copyId = randomUUID(); await api('/workspace-imports/' + copyId, 'PUT', form);
  await api('/workspace-imports/' + copyId + '/commit', 'POST');
  let copy;
  for (let n = 0; n < 1200; n++) { copy = await api('/workspace-imports/' + copyId); if (copy.state === 'SUCCEEDED') break; assert.notEqual(copy.state, 'FAILED'); await sleep(100); }
  assert.equal(copy.state, 'SUCCEEDED'); report.checks.push('Full ZIP W3 import-as-new completed');
  const descriptor = { root, address: `https://127.0.0.1:${sharing.port}`, port: sharing.port,
    small: smallIdentity, atlas: atlasIdentity, sharedId, noteId: atlas.manifest.expected.cycle[0],
    imageId: atlas.manifest.expected.sharedImage, pdfId: atlas.manifest.resources.find(r => r.category === 'pdf').id };
  await serve(descriptor);
  }
} catch (error) { report.failure = error.message; throw error; }
finally { await owned.stop(); await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2)); }
