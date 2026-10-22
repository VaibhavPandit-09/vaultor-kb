// Controlled repeated-payload observation on the explicitly marked R10 fixture only.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const fixture = JSON.parse(await readFile(resolve('desktop/cache/r10/current.json')));
assert.ok(fixture.root.startsWith(resolve('desktop/cache/r10') + sep));
const marker = JSON.parse(await readFile(join(fixture.root, 'report.json')));
assert.equal(marker.root, fixture.root);
assert.equal(marker.source, '7b7f4f4dba7d4fbf8db67a502662e02d0c590622');
const address = process.env.R10_OWNER_ADDRESS;
assert.match(address ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
const owner = await readFile(join(fixture.root, 'host/host-access/owner.key'), 'utf8');
assert.match(owner, /^[a-f0-9]{64}$/);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(path, method = 'GET', body, match, binary = false) {
  for (let n = 0; n < 600; n++) {
    const r = await fetch(address + '/api' + path, { method, headers: {
      'X-Vaultor-Owner': owner, 'X-Vaultor-Workspace': fixture.atlas.id,
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...(match ? { 'If-Match': match } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    if (r.status === 409 && (await r.clone().json()).code === 'WORKSPACE_BUSY') { await sleep(100); continue; }
    assert.ok(r.ok, `${method} ${path}: ${r.status}`);
    return binary ? Buffer.from(await r.arrayBuffer()) : r.json();
  }
  throw Error('Maintenance did not settle');
}
const id = randomUUID();
try {
  await api('/companions/' + id, 'PUT', { generation: fixture.atlas.generation, scope: 'workspace', ids: [], dependencies: 'linked', files: 'readable' });
  let status;
  for (let n = 0; n < 1200; n++) { status = await api('/companions/' + id); if (!['QUEUED', 'RUNNING'].includes(status.status)) break; await sleep(100); }
  assert.equal(status.status, 'READY'); const match = '"' + status.manifestSha256 + '"';
  const inventory = await api('/companions/' + id + '/inventory?page=0&size=100', 'GET', null, match);
  const payload = inventory.items.find(e => e.document?.state === 'available').document;
  const samples = [];
  for (let n = 0; n < 51; n++) {
    const began = performance.now(); const bytes = await api('/companions/' + id + '/payloads/' + payload.key, 'GET', null, match, true);
    samples.push(performance.now() - began); assert.equal(bytes.length, payload.bytes); assert.equal(hash(bytes), payload.sha256);
  }
  const warm = samples.slice(1).sort((a, b) => a - b);
  const report = { source: process.env.R10_MEASUREMENT_LABEL ?? 'released-0.16.0', resources: status.resources,
    payloadBytes: payload.bytes, samples, firstMs: samples[0], warmMedianMs: (warm[24] + warm[25]) / 2,
    warmP95Ms: warm[47], warmMaxMs: warm.at(-1),
    limitations: ['51 sequential owner-loopback requests against one immutable Atlas payload, first request plus50warm samples; inventory has already verified the manifest.',
      'Not Android TLS or first-time whole-checkpoint transfer. No OS/disk cache flush. Every returned payload size/hash is checked.'] };
  const label = report.source.replace(/[^a-zA-Z0-9.-]/g, '-');
  await writeFile(resolve('desktop/cache/r10/manifest-' + label + '.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, samples: undefined }));
} finally { await api('/companions/' + id, 'DELETE').catch(() => {}); }
