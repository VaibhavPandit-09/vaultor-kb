import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, cp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { OwnedServer, verifyBundle } from '../src/owned-server.mjs';
import { agentAccess } from '../../scripts/agent-access.mjs';

const bundle = fileURLToPath(new URL('../bundle/', import.meta.url));
const temp = () => mkdtemp(join(tmpdir(), 'vaultor-owned-test-'));
const wait = async predicate => { for (let n = 0; n < 240; n++) { if (predicate()) return; await new Promise(r => setTimeout(r, 250)); } throw new Error('State did not settle'); };
const get = async (host, path) => { const response = await fetch(host.address + '/api' + path,{headers:{'X-Vaultor-Owner':host.accessKey}}); assert.equal(response.status, 200); return response.json(); };

test('bundle failures preserve files; space/log bounds are actionable', { timeout: 30000 }, async () => {
  const data = await temp(); await writeFile(join(data, 'sentinel'), 'keep');
  await assert.rejects(verifyBundle(data), /missing/);
  const corrupt = await temp(); await writeFile(join(corrupt, 'server.jar'), 'damaged');
  await writeFile(join(corrupt, 'manifest.json'), JSON.stringify({ version: 1, platform: process.platform, arch: process.arch, files: [{ path: 'server.jar', sha256: '0'.repeat(64) }] }));
  await assert.rejects(verifyBundle(corrupt), /damaged/); assert.equal(await readFile(join(corrupt, 'server.jar'), 'utf8'), 'damaged');
  const host = new OwnedServer({ bundle, data, freeSpace: async () => ({ bavail: 1, bsize: 1 }) });
  await assert.rejects(host.start(), /128 MiB/); assert.equal(await readFile(join(data, 'sentinel'), 'utf8'), 'keep');
  host.ownerToken = 'private'; await Promise.all(Array.from({ length: 300 }, () => host.log('private ' + 'x'.repeat(3000))));
  assert.ok(host.lines.length <= 200); assert.ok(host.lines.every(l => l.message.length <= 2000 && !l.message.includes('private')));
  const file = await readFile(join(data, 'logs', 'server.log'), 'utf8'); assert.ok(file.length <= 1024 * 1024);
  assert.equal(host.child, undefined);
});

test('real bundled JVM uses private ownership, locked data, ephemeral port and preserves data across app replacement/crash/relaunch', { timeout: 180000 }, async () => {
  const data = await temp(), host = new OwnedServer({ bundle, data, backoff: [10, 10, 10] });
  const other = new OwnedServer({ bundle, data, timeout: 30000 });
  const occupied = createServer(socket => socket.end('not Vaultor'));
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  try {
    const addresses = await Promise.all([host.start(), host.start()]); assert.equal(addresses[0], addresses[1]);
    assert.notEqual(Number(new URL(host.address).port), occupied.address().port);
    const identity = await get(host, '/workspace/identity'); assert.equal((await get(host, '/health')).status, 'UP');
    assert.equal((await fetch(host.address+'/api/health')).status,401);
    await host.log('Owner material '+host.accessKey);assert.equal(JSON.stringify(host.snapshot()).includes(host.accessKey),false);
    const previousKeyFile=process.env.VAULTOR_OWNER_KEY_FILE;
    try {
      process.env.VAULTOR_OWNER_KEY_FILE=join(data,'host-access','owner.key');const approved=await agentAccess(host.address);
      assert.equal((await approved.fetch(host.address+'/api/health')).status,200);
      await assert.rejects(approved.fetch('http://example.com/api/health'),/cross server origins/);
    } finally {if(previousKeyFile===undefined)delete process.env.VAULTOR_OWNER_KEY_FILE;else process.env.VAULTOR_OWNER_KEY_FILE=previousKeyFile;}
    const runtime=await verifyBundle(bundle);
    const output=await new Promise((resolve,reject)=>{
      const child=spawn(runtime.java,['-jar',runtime.jar,'--owner-bootstrap='+host.address,'--host-access='+join(data,'host-access')],{windowsHide:true,stdio:['ignore','pipe','pipe']});let result='';
      child.stdout.on('data',chunk=>{result+=chunk;if(result.length>8192)child.kill();});child.once('error',reject);child.once('close',code=>code===0?resolve(result.trim()):reject(new Error('Owner bootstrap command failed')));
    });
    const handoff=new URL(output);assert.equal(handoff.origin,host.address);const ticket=new URLSearchParams(handoff.hash.slice(1)).get('ticket');assert.match(ticket,/^[a-f0-9]{64}$/);
    const browser=await fetch(host.address+'/api/access/bootstrap',{method:'POST',headers:{'Content-Type':'application/json','Origin':host.address},body:JSON.stringify({ticket})});assert.equal(browser.status,200);
    const ownerCookie=browser.headers.get('set-cookie').split(';')[0];assert.equal((await fetch(host.address+'/api/owner/devices',{headers:{Cookie:ownerCookie}})).status,200);
    const hostId = host.hostId;
    const html = await fetch(host.address + '/', {headers:{'X-Vaultor-Owner':host.accessKey}}); assert.equal(html.status, 200); assert.match(await html.text(), /<html/);
    const created = await fetch(host.address + '/api/resources', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Vaultor-Owner':host.accessKey }, body: JSON.stringify({ title: 'Owned test', type: 'note', content: { type: 'doc', content: [{ type: 'paragraph' }] } }) });
    assert.ok(created.ok, await created.text());
    await assert.rejects(other.start(), /startup/); assert.ok(other.lines.some(l => l.message.includes('already in use')));
    assert.equal((await get(host, '/workspace/identity')).id, identity.id);
    const oldPid = host.child.pid; host.child.kill();
    await wait(() => host.status === 'ready' && host.child?.pid !== oldPid);
    assert.equal((await get(host, '/workspace/identity')).id, identity.id); assert.equal(host.attempts, 1);
    await host.stop(); assert.equal(host.child, null); assert.equal(host.status, 'stopped');
    const replacement = await temp(); await cp(bundle, join(replacement, 'bundle'), { recursive: true });
    const relaunched = new OwnedServer({ bundle: join(replacement, 'bundle'), data });
    try {
      await relaunched.start(); assert.equal((await get(relaunched, '/workspace/identity')).id, identity.id); assert.equal(relaunched.hostId, hostId);
      const resources = await get(relaunched, '/resources'); assert.ok(resources.items.some(r => r.title === 'Owned test'));
    } finally { await relaunched.stop(); }
    assert.ok((await readFile(join(data, 'logs', 'server.log'), 'utf8')).length > 0);
  } finally { await host.stop({ force: true }); await other.stop({ force: true }); await new Promise(r => occupied.close(r)); }
});

test('repeated owned crashes stop after three restarts; no hidden duplicate launcher', { timeout: 30000 }, async () => {
  const data = await temp(); let launches = 0;
  const fixture = `process.stdout.write('VAULTOR_OWNER_READY '+process.env.VAULTOR_OWNER_TOKEN+' 54321\\n');setTimeout(()=>process.exit(7),300);`;
  const host = new OwnedServer({ bundle, data, backoff: [1, 1, 1], spawnProcess: (_java, _args, options) => { launches++; return spawn(process.execPath, ['-e', fixture], options); } });
  try { await host.start(); await wait(() => host.status === 'failed' && host.attempts === 3 && !host.child); assert.equal(launches, 4); assert.match(host.error, /three restart/); }
  finally { await host.stop({ force: true }); }
});

test('launcher death closes the owned JVM and releases its data lock', { timeout: 90000 }, async () => {
  const data = await temp();
  const module = new URL('../src/owned-server.mjs', import.meta.url).href;
  const code = `import {OwnedServer} from ${JSON.stringify(module)};const h=new OwnedServer({bundle:${JSON.stringify(bundle)},data:${JSON.stringify(data)}});await h.start();console.log('STARTED '+h.address);setInterval(()=>{},1000);`;
  const launcher = spawn(process.execPath, ['--input-type=module', '-e', code], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const address = await new Promise((resolve, reject) => { let output = ''; launcher.stdout.on('data', c => { output += c; const match = output.match(/STARTED (http:\/\/127\.0\.0\.1:\d+)/); if (match) resolve(match[1]); }); launcher.once('exit', () => reject(new Error('Launcher exited before readiness'))); });
  launcher.kill();
  const next = new OwnedServer({ bundle, data });
  try { await wait(() => launcher.exitCode !== null || launcher.signalCode !== null); await new Promise(r => setTimeout(r, 2500)); await next.start(); assert.notEqual(next.address, undefined); }
  finally { await next.stop({ force: true }); }
  await assert.rejects(fetch(address + '/api/health'));
});
