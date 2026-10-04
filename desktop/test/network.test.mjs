import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { copyProductionDependencies } from '../scripts/production-dependencies.mjs';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { OwnedServer } from '../src/owned-server.mjs';
import { Connections } from '../src/connections.mjs';
import { Credentials } from '../src/credentials.mjs';
import { Profiles } from '../src/profiles.mjs';
import { DesktopTransport } from '../src/transport.mjs';
import { connectionFetch, networkAddress, privateIP } from '../src/network.mjs';
import { serviceItems } from '../src/discovery.mjs';
// Test-only encrypted store. Native smoke uses Electron's actual safeStorage.
const key = randomBytes(32);
const storage = { isEncryptionAvailable: () => true, encryptString: text => { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv); const bytes = Buffer.concat([c.update(text), c.final()]); return Buffer.concat([iv, c.getAuthTag(), bytes]); }, decryptString: bytes => { const c = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); c.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([c.update(bytes.subarray(28)), c.final()]).toString(); } };

test('private addresses and bounded discovery hints do not authorize names or copied identities', () => {
  for (const address of ['http://192.168.1.3:8443', 'https://example.com', 'https://8.8.8.8', 'https://user:pass@192.168.1.3', 'https://192.168.1.3/path']) assert.throws(() => networkAddress(address));
  assert.equal(networkAddress('https://10.1.2.3:8443'), 'https://10.1.2.3:8443'); assert.ok(privateIP('172.31.2.3')); assert.ok(!privateIP('172.32.2.3'));
  const services = Array.from({ length: 200 }, (_, i) => ({ name: 'Same name', txt: { hostId: 'host-' + i, protocol: '1' }, port: 8443, addresses: ['192.168.1.3', '8.8.8.8'] }));
  const items = serviceItems(services); assert.equal(items.length, 64); assert.ok(items.every(i => !i.address.includes('8.8.8.8')));
});
test('packaged discovery resolves its locked production tree without development dependencies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vaultor-discovery-package-'));
  try {
    const root = fileURLToPath(new URL('../', import.meta.url)); await copyProductionDependencies(root, directory);
    await cp(join(root, 'src'), join(directory, 'src'), { recursive: true });
    const module = await import(pathToFileURL(join(directory, 'src', 'discovery.mjs')).href); const discovery = new module.Discovery(); discovery.destroy();
    await assert.rejects(readFile(join(directory, 'node_modules', 'electron', 'package.json')), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('two real hosts pair, pin, reconnect, isolate copied workspaces, recover address hints and revoke without data loss', { timeout: 180000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vaultor-network-test-'));
  const priorPort = process.env.HOST_NETWORK_PORT; process.env.HOST_NETWORK_PORT = '0';
  const bundle = fileURLToPath(new URL('../bundle/', import.meta.url));
  const a = new OwnedServer({ bundle, data: join(directory, 'a') }), b = new OwnedServer({ bundle, data: join(directory, 'b') });
  const discovery = { advertise() {}, withdraw() {}, resolve: async () => [] };
  try {
    const profiles = new Profiles(join(directory, 'client')); await profiles.load(); await profiles.ensureManaged();
    const credentials = new Credentials(join(directory, 'client'), storage); await credentials.load();
    const ca = new Connections({ owned: a, profiles, credentials, discovery }), cb = new Connections({ owned: b, profiles, credentials, discovery });
    await Promise.all([a.start(), b.start()]);
    const first = await ca.sharing(true), second = await cb.sharing(true);
    const addressA = `https://127.0.0.1:${first.port}`, addressB = `https://127.0.0.1:${second.port}`;
    // Public TLS still fails system trust until this application explicitly pins it.
    await assert.rejects(fetch(addressA + '/api/access/host'));
    async function pair(host, address) {
      const inspect = await ca.prepare({ name: 'Same name', address }), enrollment = await ca.enroll(inspect.id);
      assert.equal((await ca.poll(inspect.id)).state, 'PENDING');
      const request = (await host.owner('/pairings')).find(r => r.code === enrollment.code); assert.ok(request);
      await assert.rejects(host.owner('/pairings/' + request.id + '/approve', 'POST', { code: '000000' === request.code ? '111111' : '000000' }));
      await host.owner('/pairings/' + request.id + '/approve', 'POST', { code: enrollment.code });
      const result = await ca.poll(inspect.id); assert.equal(result.state, 'APPROVED'); return profiles.get(result.profileId);
    }
    const pa = await pair(ca, addressA), pb = await pair(cb, addressB);
    assert.notEqual(pa.id, pb.id); assert.notEqual(pa.hostId, pb.hostId);
    await profiles.activate(pa.id, 'copied-workspace'); await profiles.activate(pb.id, 'copied-workspace');
    const reloaded = new Profiles(join(directory, 'client')); await reloaded.load();
    assert.equal(reloaded.get(pa.id).workspaceId, reloaded.get(pb.id).workspaceId);
    assert.ok(!JSON.stringify(reloaded.snapshot()).includes('BEGIN CERTIFICATE'));
    const restored = new Credentials(join(directory, 'client'), storage); await restored.load();
    assert.equal(restored.get(pa.id), credentials.get(pa.id));
    assert.ok(!(await readFile(join(directory, 'client', 'device-credentials.json'), 'utf8')).includes(credentials.get(pa.id)));
    const transport = new DesktopTransport(); transport.activate(pa, 'epoch-a', undefined, restored.get(pa.id));
    const request = (token, path = '/health') => ({ id: 'read', token, path, method: 'GET', headers: {}, timeout: 10000 });
    assert.equal((await transport.request(request('epoch-a'))).status, 200);
    const wrongPin = { ...pa, ca: pb.ca, fingerprint: pb.fingerprint };
    await assert.rejects(connectionFetch({ profile: wrongPin, credential: credentials.get(pa.id) }, '/health', { signal: AbortSignal.timeout(5000) }));
    await ca.owner('/trust/renew', 'POST'); assert.equal((await transport.request(request('epoch-a'))).status, 200);
    await a.stop(); await a.start(); const restarted = await ca.sharing();
    discovery.resolve = async hostId => hostId === pa.hostId ? [{ address: `https://127.0.0.1:${restarted.port}`, hostId: pa.hostId }] : [];
    const resolved = await ca.resolve(pa); assert.equal(resolved.address, `https://127.0.0.1:${restarted.port}`); assert.equal(resolved.fingerprint, pa.fingerprint);
    transport.activate(pb, 'epoch-b', undefined, restored.get(pb.id)); await assert.rejects(transport.request(request('epoch-a')), /Connection changed/);
    assert.equal((await transport.request(request('epoch-b'))).status, 200);
    assert.ok(a.address); // Switching client transport never stops the local host.
    transport.activate(resolved, 'epoch-c', undefined, restored.get(pa.id));
    const devices = await ca.owner('/devices'); await ca.owner('/devices/' + devices.find(d => d.kind === 'desktop').id, 'DELETE');
    assert.equal((await transport.request(request('epoch-c'))).status, 401);
    await profiles.forget(pa.id); await credentials.remove(pa.id); assert.equal((await ca.owner('/sharing')).enabled, true);
    const rememberedAgain = await profiles.paired({ ...pa, name: 'Back again', address: resolved.address }); assert.equal(rememberedAgain.id, pa.id); assert.equal(rememberedAgain.workspaceId, 'copied-workspace');
    await assert.rejects(profiles.update(pb.id, { address: 'https://example.com' })); assert.equal(profiles.get(pb.id).address, pb.address);
    assert.equal((await readFile(join(directory, 'a', 'host.json'), 'utf8')).includes(pa.hostId), true);
    const corrupt = join(directory, 'client', 'device-credentials.json'); await writeFile(corrupt, 'broken'); await assert.rejects(new Credentials(join(directory, 'client'), storage).load(), /preserved/); assert.equal(await readFile(corrupt, 'utf8'), 'broken');
  } finally { await Promise.allSettled([a.stop({ force: true }), b.stop({ force: true })]); if (priorPort === undefined) delete process.env.HOST_NETWORK_PORT; else process.env.HOST_NETWORK_PORT = priorPort; await rm(directory, { recursive: true, force: true }); }
});
