import { readFile, lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { validateRelease, version } from '../src/updates.mjs';

export async function releaseArtifacts(directory, appVersion, publicKey, platform) {
  version(appVersion);
  if (!['win32', 'darwin'].includes(platform)) throw new Error('Only Windows x64 and Mac arm64 releases are implemented.');
  const arch = platform === 'win32' ? 'x64' : 'arm64';
  const filename = `Vaultor-${appVersion}-${platform === 'win32' ? 'windows-x64.exe' : 'mac-arm64.dmg'}`;
  const installer = join(directory, filename), sidecar = installer + '.vaultor.json';
  const metadata = await lstat(sidecar);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 16 * 1024) throw new Error('Invalid release sidecar.');
  const manifest = validateRelease(JSON.parse(await readFile(sidecar, 'utf8')), publicKey, platform, arch);
  if (manifest.filename !== filename || manifest.appVersion !== appVersion) throw new Error('Release version/filename differs from the package version.');
  const file = await lstat(installer);
  if (!file.isFile() || file.isSymbolicLink() || file.size !== manifest.size) throw new Error('Invalid installer size/type.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(installer)) hash.update(chunk);
  if (hash.digest('hex') !== manifest.sha256) throw new Error('Installer checksum mismatch.');
  return { installer, sidecar, manifest };
}
