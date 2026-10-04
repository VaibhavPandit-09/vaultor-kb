import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Profiles } from '../src/profiles.mjs';
import { DesktopTransport } from '../src/transport.mjs';
import { apiPath, loopbackAddress, externalAddress, validateRequest, trustedSender, UI_ORIGIN, MAX_BYTES } from '../src/policy.mjs';
const request = (id = 'request') => ({ id, token: 'token', path: '/resources', method: 'GET', timeout: 1000, headers: { 'X-Request-ID': 'test-id' } });

test('managed profile is idempotent and preserves an existing selected server', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vaultor-desktop-test-'));
  try {
    const profiles = new Profiles(directory); await profiles.load(); await profiles.ensureManaged(); await profiles.ensureManaged();
    assert.equal(profiles.data.active, 'this-computer'); assert.equal(profiles.data.profiles.filter(p => p.source === 'bundled').length, 1);
    const existing = await profiles.add({ name: 'Existing', address: 'http://127.0.0.1:8091' }); await profiles.activate(existing.id, 'old-workspace');
    const restored = new Profiles(directory); await restored.load(); await restored.ensureManaged(); assert.equal(restored.data.active, existing.id);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('profiles retain desktop identity/selection across relaunch and never reset malformed storage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vaultor-desktop-test-'));
  try {
    const first = new Profiles(directory); await first.load(); const p = await first.add({ name: 'Other server', address: 'http://127.0.0.1:8090' }); await first.activate(p.id, 'workspace');
    const second = new Profiles(directory); const restored = await second.load();
    assert.equal(restored.clientId, first.data.clientId); assert.equal(restored.active, p.id); assert.equal(second.get(p.id).workspaceId, 'workspace');
    await assert.rejects(second.add({ name: 'Remote', address: 'http://192.168.1.5:8080' }), /only to a local/);
    await assert.rejects(second.add({ name: 'Duplicate', address: p.address }), /already remembered/);
    await writeFile(join(directory, 'connections.json'), 'broken'); await assert.rejects(new Profiles(directory).load(), /preserved/);
    assert.equal(await readFile(join(directory, 'connections.json'), 'utf8'), 'broken');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('renderer boundaries reject external APIs, arbitrary headers/methods, oversized bodies and child frames', () => {
  for (const value of ['https://host/api', '//host', '/resources/../settings', '/resources/%2e%2e/settings', '/%2fhost', '/resources\\settings']) assert.throws(() => apiPath(value));
  for (const value of ['http://evil.local', 'file:///tmp', 'http://127.0.0.1/api', 'http://user:pass@localhost:8080']) assert.throws(() => loopbackAddress(value));
  assert.equal(loopbackAddress('http://localhost:8080'), 'http://localhost:8080');
  for (const value of ['file:///tmp/a', 'javascript:alert(1)', 'vaultor://app/']) assert.throws(() => externalAddress(value));
  assert.equal(externalAddress('https://example.com'), 'https://example.com/');
  assert.throws(() => validateRequest({ ...request(), headers: { Authorization: 'anything' } }, 'token'));
  assert.throws(() => validateRequest({ ...request(), headers: { 'X-Vaultor-Owner': 'anything' } }, 'token'));
  assert.throws(() => validateRequest({ ...request(), method: 'CONNECT' }, 'token'));
  assert.throws(() => validateRequest({ ...request(), token: 'old' }, 'token'));
  assert.throws(() => validateRequest({ ...request(), method: 'POST', body: { kind: 'text', value: 'x'.repeat(MAX_BYTES + 1) } }, 'token'));
  const frame = { url: UI_ORIGIN + '/' }, contents = { mainFrame: frame };
  assert.equal(trustedSender({ sender: contents, senderFrame: frame }, contents), true);
  assert.equal(trustedSender({ sender: contents, senderFrame: { url: frame.url } }, contents), false);
  assert.equal(trustedSender({ sender: {}, senderFrame: frame }, contents), false);
});
test('transport preserves bytes/status/IDs and multipart; redirects and old tokens fail without retries', async () => {
  let mutations = 0; let multipart = '';
  const server = createServer(async (req, res) => {
    if (req.url === '/api/redirect') { res.writeHead(302, { Location: 'https://example.com' }); return res.end(); }
    if (req.method === 'POST') { mutations++; for await (const chunk of req) multipart += chunk; }
    res.writeHead(req.url === '/api/failure' ? 409 : 200, { 'Content-Type': 'application/octet-stream', 'X-Request-ID': req.headers['x-request-id'] }); res.end(Buffer.from([0, 1, 255]));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const transport = new DesktopTransport(); transport.activate({ address: 'http://127.0.0.1:' + server.address().port }, 'token');
  try {
    const response = await transport.request(request()); assert.deepEqual([...response.data], [0, 1, 255]); assert.equal(response.headers['x-request-id'], 'test-id');
    assert.equal((await transport.request({ ...request(), path: '/failure' })).status, 409);
    await transport.request({ ...request(), method: 'POST', body: { kind: 'multipart', parts: [{ name: 'title', value: 'Test' }, { name: 'file', value: new Uint8Array([65, 66]), filename: 'a.txt', type: 'text/plain' }] } });
    assert.equal(mutations, 1); assert.match(multipart, /filename="a.txt"/); assert.match(multipart, /AB/);
    await assert.rejects(transport.request({ ...request(), path: '/redirect' }), /fetch failed/);
    transport.activate({ address: 'http://127.0.0.1:' + server.address().port }, 'next'); await assert.rejects(transport.request(request()), /Connection changed/);
  } finally { transport.cancelAll(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('unreachable servers, cancellation and oversized responses release request ownership', async () => {
  const transport = new DesktopTransport(); transport.activate({ address: 'http://127.0.0.1:1' }, 'token');
  await assert.rejects(transport.request(request())); assert.equal(transport.requests.size, 0);
  const server = createServer((req, res) => { if (req.url === '/api/huge') { res.writeHead(200, { 'Content-Length': MAX_BYTES + 1 }); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); transport.activate({ address: 'http://127.0.0.1:' + server.address().port }, 'token');
  try {
    const pending = transport.request(request('cancel')); transport.cancel('cancel'); await assert.rejects(pending); assert.equal(transport.requests.size, 0);
    await assert.rejects(transport.request({ ...request(), path: '/huge' }), /32 MiB/); assert.equal(transport.requests.size, 0);
  } finally { transport.cancelAll(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
