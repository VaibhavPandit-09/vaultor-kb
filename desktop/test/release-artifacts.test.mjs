import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { releaseArtifacts } from '../scripts/release-artifacts.mjs';

test('release upload preflight checks original signature, platform, version and exact installer bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vaultor-release-test-'));
  try {
    const keys = generateKeyPairSync('ed25519'), bytes = Buffer.from('disposable installer');
    const filename = 'Vaultor-0.3.0-windows-x64.exe', installer = join(directory, filename);
    const manifest = { format: 1, appVersion: '0.3.0', platform: 'win32', arch: 'x64', filename, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), minimumProtocol: 1 };
    const signature = sign(null, Buffer.from(JSON.stringify(manifest)), keys.privateKey).toString('base64');
    await writeFile(installer, bytes);
    await writeFile(installer + '.vaultor.json', JSON.stringify({ manifest, signature }));
    assert.equal((await releaseArtifacts(directory, '0.3.0', keys.publicKey, 'win32')).manifest.filename, filename);
    await assert.rejects(releaseArtifacts(directory, '0.3.0', generateKeyPairSync('ed25519').publicKey, 'win32'), /signature/);
    await assert.rejects(releaseArtifacts(directory, '0.3.0', keys.publicKey, 'linux'), /implemented/);
    await assert.rejects(releaseArtifacts(directory, '0.3.1', keys.publicKey, 'win32'), /ENOENT/);
    await writeFile(installer, Buffer.alloc(bytes.length));
    await assert.rejects(releaseArtifacts(directory, '0.3.0', keys.publicKey, 'win32'), /checksum/);
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('vaultor-release-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});
