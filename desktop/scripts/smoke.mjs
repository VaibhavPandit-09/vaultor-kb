import { createServer } from 'node:http';
import { mkdtemp, writeFile, mkdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const directory = await mkdtemp(join(tmpdir(), 'vaultor-desktop-test-'));
const note = { id: 'native-note', type: 'note', title: 'Native test note', revision: 'r1', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Native editor fixture.' }] }] }, tags: [], collections: [], favorite: false, createdAt: '2026-10-04T00:00:00', updatedAt: '2026-10-04T00:00:00' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname.replace(/^\/api/, '');
  let body = ''; for await (const chunk of req) body += chunk;
  let data;
  if (path === '/capabilities') data = { serverBuild: 'desktop-smoke', apiProtocolVersion: 1, minimumClientProtocolVersion: 1, authentication: false };
  else if (path === '/workspace/identity') data = { id: 'native-workspace', generation: 'g1' };
  else if (path === '/settings') data = req.method === 'PUT' ? JSON.parse(body) : { workspace: { maxOpenNotes: 2, openBehavior: 'split', autosaveDelay: 0, focusMode: false }, local: {}, keybindings: {} };
  else if (path === '/tags' || path === '/organization/selection' || path.endsWith('/backlinks')) data = [];
  else if (path === '/resources/native-note/note' && req.method === 'PUT') { const update = JSON.parse(body); Object.assign(note, update, { revision: 'r' + Date.now() }); data = note; }
  else if (path === '/resources/native-note' || path === '/resources/native-note/summary') data = note;
  else if (path === '/resources') data = { items: [note], page: 0, size: 50, totalItems: 1, totalPages: 1 };
  else if (path === '/resources/counts') data = { all: 1, note: 1, file: 0, favorites: 0, unfiled: 1 };
  else if (req.method === 'POST' && path.endsWith('/open')) data = {};
  else data = { items: [], page: 0, size: 50, totalItems: 0, totalPages: 0 };
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-Request-ID': req.headers['x-request-id'] || 'fixture' }); res.end(JSON.stringify(data));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await writeFile(join(directory, 'connections.json'), JSON.stringify({ version: 1, clientId: randomUUID(), active: null, profiles: [{ id: 'native-profile', kind: 'local', name: 'Disposable fixture', address: 'http://127.0.0.1:' + server.address().port }] }));
const require = createRequire(import.meta.url), electron = require('electron');
const env = { ...process.env, VAULTOR_SMOKE_DIRECTORY: directory }; delete env.ELECTRON_RUN_AS_NODE;
async function launch(mode) {
  await new Promise((resolve, reject) => {
    const child = spawn(electron, ['.'], { cwd: new URL('../', import.meta.url), env: { ...env, VAULTOR_SMOKE_MODE: mode }, windowsHide: true, stdio: 'inherit' });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Native check timed out.')); }, 45000);
    child.on('error', reject); child.on('exit', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error('Electron check failed: ' + code)); });
  });
}
try {
  await launch('first'); await launch('relaunch');
  const artifacts = new URL('../artifacts/', import.meta.url); await mkdir(artifacts, { recursive: true });
  await cp(join(directory, 'native.png'), new URL('native.png', artifacts));
  console.log('Native launch/editor/relaunch check passed. Disposable profile: ' + directory);
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
