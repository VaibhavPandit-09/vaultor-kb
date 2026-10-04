import { cp, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
/** Preserve the exact locked tree; never ship Electron/build tools as app dependencies. */
export async function copyProductionDependencies(root, app) {
  const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path || entry.dev) continue;
    if (!path.startsWith('node_modules/') || path.includes('..') || path.includes('\\')) throw new Error('Invalid locked production dependency path.');
    const source = resolve(root, path), target = resolve(app, path);
    if (!source.startsWith(resolve(root) + sep) || !target.startsWith(resolve(app) + sep)) throw new Error('Dependency escapes the package directory.');
    await cp(source, target, { recursive: true });
  }
}
