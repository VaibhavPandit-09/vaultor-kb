import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { readFile, writeFile, mkdir, readdir, cp, rename, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const platform = process.platform, arch = process.arch;
if (!((platform === 'win32' && arch === 'x64') || (platform === 'darwin' && arch === 'arm64'))) throw new Error('D3 packaging supports Windows x64 and macOS Apple Silicon. Build on the target OS.');
const key = platform + '-' + arch, lockFile = join(root, 'runtime-lock.json');
const os = platform === 'win32' ? 'windows' : 'mac', architecture = arch === 'arm64' ? 'aarch64' : 'x64';
const digest = async path => { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); };
const run = (command, args, options = {}) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { stdio: 'inherit', windowsHide: true, ...options });
  child.once('error', reject); child.once('close', code => code === 0 ? resolveRun() : reject(new Error(command + ' failed (' + code + ')')));
});
let lock = JSON.parse(await readFile(lockFile, 'utf8').catch(e => { if (e.code === 'ENOENT') return '{"version":1,"targets":{}}'; throw e; }));
if (!lock.targets[key]) {
  const url = `https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=${architecture}&image_type=jre&os=${os}&vendor=eclipse`;
  const response = await fetch(url); if (!response.ok) throw new Error('Cannot discover Temurin runtime: ' + response.status);
  const releases = await response.json(), release = releases[0];
  if (!release?.binary?.package?.checksum || !release?.binary?.package?.link) throw new Error('Temurin runtime metadata missing.');
  lock.targets[key] = { name: release.release_name, url: release.binary.package.link, sha256: release.binary.package.checksum, source: release.source?.link ?? `https://github.com/adoptium/temurin25-binaries/releases/tag/${encodeURIComponent(release.release_name)}` };
  await writeFile(lockFile, JSON.stringify(lock, null, 2) + '\n');
}
const pinned = lock.targets[key];
if (!/^[a-f0-9]{64}$/.test(pinned.sha256) || new URL(pinned.url).hostname !== 'github.com') throw new Error('Invalid pinned Temurin runtime metadata.');
const cache = join(root, 'cache', key + '-' + pinned.sha256.slice(0, 12)); await mkdir(cache, { recursive: true });
const archive = join(cache, platform === 'win32' ? 'runtime.zip' : 'runtime.tar.gz');
if (await digest(archive).catch(() => '') !== pinned.sha256) {
  const response = await fetch(pinned.url); if (!response.ok) throw new Error('Runtime download failed: ' + response.status);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
  if (await digest(archive) !== pinned.sha256) throw new Error('Runtime checksum mismatch. Nothing was bundled.');
}
const unpacked = join(cache, 'unpacked');
if (!(await stat(unpacked).catch(() => null))) {
  await mkdir(unpacked); await run('tar', ['-xf', archive, '-C', unpacked]);
}
const entries = await readdir(unpacked), runtimeRoot = join(unpacked, entries.find(name => name.startsWith('jdk-')) ?? '');
const runtime = platform === 'darwin' ? join(runtimeRoot, 'Contents', 'Home') : runtimeRoot;
const staging = join(root, 'cache', 'bundle-' + Date.now()); await mkdir(staging);
await cp(runtime, join(staging, 'runtime'), { recursive: true, dereference: true });
const backend = resolve(root, '../backend');
// cmd.exe is used only for the checked-in Maven wrapper, never for filesystem operations.
await run(platform === 'win32' ? 'cmd.exe' : './mvnw', platform === 'win32' ? ['/d', '/c', 'mvnw.cmd -Pdesktop -DskipTests clean package'] : ['-Pdesktop', '-DskipTests', 'clean', 'package'], { cwd: backend });
await cp(join(backend, 'target', 'vaultor-0.0.1-SNAPSHOT.jar'), join(staging, 'server.jar'));
await writeFile(join(staging, 'THIRD-PARTY.md'), `# Bundled runtime and server notices\n\nRuntime: Eclipse Temurin ${pinned.name}, GPL-2.0 with Classpath Exception; all runtime legal notices retained under runtime/legal. Corresponding source/release: ${pinned.source}\nArchive: ${pinned.url}\nSHA-256: ${pinned.sha256}\n\nThe Spring Boot JAR retains dependency license/notice files in its nested BOOT-INF/lib JARs. Dependency versions and origins are in backend/pom.xml and the embedded Maven metadata. Electron's LICENSE and LICENSES.chromium.html travel with the development package. This package does not include a paid Oracle runtime.\n`);
const files = [];
async function walk(directory, prefix = '') { for (const entry of await readdir(directory, { withFileTypes: true })) { const relative = prefix + entry.name, path = join(directory, entry.name); if (entry.isDirectory()) await walk(path, relative + '/'); else files.push({ path: relative, sha256: await digest(path) }); } }
await walk(staging);
await writeFile(join(staging, 'manifest.json'), JSON.stringify({ version: 1, platform, arch, runtime: pinned.name, files }, null, 2));
const destination = process.env.VAULTOR_BUILD_BUNDLE ? resolve(process.env.VAULTOR_BUILD_BUNDLE) : join(root, 'bundle');
if (process.env.VAULTOR_BUILD_BUNDLE && !destination.startsWith(resolve(root, 'cache') + (platform === 'win32' ? '\\' : '/'))) throw new Error('Alternate build bundles must stay inside desktop/cache.');
// Never recursively delete a bundle; retain its previous copy outside installation data.
if (await stat(destination).catch(() => null)) await rename(destination, join(root, 'cache', 'previous-bundle-' + Date.now()));
await rename(staging, destination);
console.log(`Bundled ${key} Java/server. No workspace data was accessed.`);
