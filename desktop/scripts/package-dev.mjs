import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { verifyBundle } from '../src/owned-server.mjs';
import { copyProductionDependencies } from './production-dependencies.mjs';
import {brandWindows} from './brand-windows.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
await verifyBundle(join(root, 'bundle'));
const destination = join(root, 'packages', `${process.platform}-${process.arch}-${Date.now()}`);
await mkdir(destination, { recursive: true });
await cp(join(root, 'node_modules', 'electron', 'dist'), destination, { recursive: true, verbatimSymlinks: true });
if(process.platform==='win32'){const {rename}=await import('node:fs/promises');await rename(join(destination,'electron.exe'),join(destination,'Vaultor.exe'));await brandWindows(join(destination,'Vaultor.exe'),join(root,'assets','vaultor.ico'));}
const resources = process.platform === 'darwin' ? join(destination, 'Electron.app', 'Contents', 'Resources') : join(destination, 'resources');
const app = join(resources, 'app'); await mkdir(app, { recursive: true });
for (const name of ['src', 'ui', 'assets','release-trust.json']) await cp(join(root, name), join(app, name), { recursive: true });
await cp(join(root,'bundle'),join(resources,'bundle'),{recursive:true});
await mkdir(join(app, 'scripts'));
await cp(join(root, 'scripts', 'native-owned-smoke.mjs'), join(app, 'scripts', 'native-owned-smoke.mjs'));
await cp(join(root, 'scripts', 'native-chrome-smoke.mjs'), join(app, 'scripts', 'native-chrome-smoke.mjs'));
await cp(join(root, 'scripts', 'native-pointer.ps1'), join(app, 'scripts', 'native-pointer.ps1'));
await copyProductionDependencies(root, app);
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'vaultor-desktop', version: pkg.version, type: 'module', main: 'src/main.mjs', dependencies: pkg.dependencies }));
if (process.platform === 'darwin') {
  // Local ad-hoc signing is free; this is neither publisher signing nor notarization.
  await new Promise((resolve, reject) => { const child = spawn('codesign', ['--force', '--deep', '--sign', '-', join(destination, 'Electron.app')], { stdio: 'inherit' }); child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Ad-hoc signing failed'))); });
}
console.log('Development package (unsigned, no installer): ' + destination);
