import { mkdtemp, mkdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const directory = await mkdtemp(join(tmpdir(), 'vaultor-chrome-native-'));
const require = createRequire(import.meta.url), electron = process.argv[2] || require('electron');
const env = { ...process.env, VAULTOR_CHROME_SMOKE_DIRECTORY: directory, HOST_NETWORK_PORT: '0' }; delete env.ELECTRON_RUN_AS_NODE;
await new Promise((resolve, reject) => {
  const child = spawn(electron, process.argv[2]?[]:['.'], { cwd: new URL('../', import.meta.url), env, windowsHide: true, stdio: 'inherit' });
  const timer = setTimeout(() => { child.kill(); reject(new Error('Native chrome check timed out')); }, 180000);
  child.once('error', reject); child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Native chrome check failed: ' + code)); });
});
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
for (const name of process.env.VAULTOR_LAYOUT_SMOKE === '1' ? ['browse-empty.png','browse-library-dark.png','browse-library-light.png','browse-pinned.png','browse-collections.png','browse-recent.png','browse-narrow.png','browse-paginated.png'] : ['desktop-chrome-dark.png', 'desktop-chrome-light.png', 'desktop-chrome-narrow.png', 'desktop-chrome-note.png', 'desktop-hosting.png','desktop-updates.png','desktop-connections-dark.png','desktop-connections-light.png','desktop-connections-narrow.png']) await cp(join(directory, name), new URL('../artifacts/' + name, import.meta.url));
console.log('Disposable check directory: ' + directory);
