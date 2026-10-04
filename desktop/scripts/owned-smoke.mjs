import { mkdtemp, mkdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const directory = await mkdtemp(join(tmpdir(), 'vaultor-owned-native-'));
const require = createRequire(import.meta.url), electron = process.argv[2] || require('electron');
const env = { ...process.env, VAULTOR_OWNED_SMOKE_DIRECTORY: directory };
delete env.ELECTRON_RUN_AS_NODE; delete env.JAVA_HOME;
// Deliberately omit the Java installation from PATH. Bundled absolute Java is required.
env.PATH = process.platform === 'win32' ? join(process.env.SystemRoot, 'System32') : '/usr/bin:/bin';
async function launch(mode) {
  await new Promise((resolve, reject) => {
    const child = spawn(electron, process.argv[2] ? [] : ['.'], { cwd: new URL('../', import.meta.url), env: { ...env, VAULTOR_SMOKE_MODE: mode }, windowsHide: true, stdio: 'inherit' });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Owned native check timed out')); }, 120000);
    child.once('error', reject); child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Owned native check failed: ' + code)); });
  });
}
await launch('first'); await launch('relaunch');
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await cp(join(directory, 'native-owned.png'), new URL('../artifacts/native-owned.png', import.meta.url));
await cp(join(directory, 'native-preview.png'), new URL('../artifacts/native-preview.png', import.meta.url));
console.log('Owned native check passed with no installed Java on PATH. Disposable data: ' + directory);
