// Installed Windows qualification against fresh portable copies of Small/Atlas.
import assert from 'node:assert/strict';
import { OwnedServer } from '../src/owned-server.mjs';
import { Profiles } from '../src/profiles.mjs';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { performance } from 'node:perf_hooks';

const app = process.env.R10_APP, bundle = process.env.VAULTOR_BUILD_BUNDLE, corpusRoot = process.env.R10_CORPUS_ROOT;
assert.ok(app && bundle && corpusRoot, 'Explicit installed executable, released bundle and corpus root required');
const corpus = process.argv.includes('--small') ? 'small' : 'atlas';
const expected = corpus === 'small' ? 70 : 5000;
const resume=process.env.R10_DESKTOP_RESUME;
const root = resume?resolve(resume):resolve('desktop/cache/r10', 'desktop-' + corpus + '-' + randomUUID());
assert.ok(root.startsWith(resolve('desktop/cache/r10')+sep));
const profile = join(root, 'profile'); await mkdir(profile, { recursive: true });
assert.equal(await realpath(root),root);
if(resume){const prior=JSON.parse(await readFile(join(root,'report.json')));assert.equal(prior.corpus,corpus);assert.equal(prior.expected,expected);}
const report = { corpus, expected, app, started: new Date().toISOString(), samples: {},
  limitations: ['New processes with OS/disk caches retained; one native observation per corpus.',
    'Working-set sums can double-count shared pages; private bytes are sampled, not continuous peaks.',
    'CDP DOM readiness does not establish physical display timing or complete image decoding.'] };
const owned = new OwnedServer({ bundle, data: join(profile, 'local-workspace') });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(path, method = 'GET', body) {
  for (let n = 0; n < 1200; n++) {
    const form = body instanceof FormData;
    const r = await fetch(owned.address + '/api' + path, { method, headers: { 'X-Vaultor-Owner': owned.accessKey,
      ...(body && !form ? { 'Content-Type': 'application/json' } : {}) }, body: body ? form ? body : JSON.stringify(body) : undefined });
    if (r.status === 409 && method === 'GET') { await sleep(100); continue; }
    assert.ok(r.ok, path + ': ' + r.status); return r.json();
  }
  throw Error('Fixture maintenance timeout');
}
let child, ws, serial = 0; const pending = new Map();
async function command(method, params = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 60000);
    pending.set(id, { resolve: r => { clearTimeout(timeout); resolve(r); }, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert.ok(!r.exceptionDetails, r.exceptionDetails?.exception?.description); return r.result?.value;
}
async function wait(expression) {
  for (let n = 0; n < 600; n++) { if (await evaluate(expression).catch(() => false)) return; await sleep(100); }
  throw Error('Native condition timeout: ' + expression);
}
async function frame(name) {
  const r = await command('Page.captureScreenshot', { format: 'png' }); await writeFile(join(root, name + '.png'), Buffer.from(r.data, 'base64'));
}
function memory() {
  const code = `$taskPid=${child.pid}; $all=Get-CimInstance Win32_Process; $ids=@($taskPid); do {$next=@($all|Where-Object {$_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids}|Select-Object -ExpandProperty ProcessId);$ids+=$next} while($next.Count); @(Get-Process -Id $ids -ErrorAction SilentlyContinue|Select-Object ProcessName,WorkingSet64,PrivateMemorySize64)|ConvertTo-Json -Compress`;
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', code], { encoding: 'utf8', windowsHide: true }));
}
try {
  if(!resume){const dir = corpus === 'small' ? join(corpusRoot, 'small') : corpusRoot;
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'))), bytes = await readFile(join(dir, 'baseline.zip'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.archive.sha256);
  await owned.start(); const form = new FormData(); form.set('file', new Blob([bytes]), 'fixture.zip');
  const preview = await api('/imports/preview', 'POST', form);
  await api('/imports/' + preview.operation.id + '/commit', 'POST', { mode: 'replace', confirmation: 'replace' });
  let done = false;
  for (let n = 0; n < 3600; n++) { const op = await api('/operations/' + preview.operation.id); if (op.status === 'SUCCEEDED') { done = true; break; } assert.notEqual(op.status, 'FAILED'); await sleep(100); }
  assert.ok(done); assert.equal((await api('/resources?size=1')).totalItems, expected); await owned.stop();}
  const profiles = new Profiles(profile); await profiles.load(); await profiles.ensureManaged();
  const socket = createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r)); const port = socket.address().port; await new Promise(r => socket.close(r));
  const env = { ...process.env, VAULTOR_DESKTOP_TEST_DIRECTORY: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const began = performance.now(); child = spawn(app, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { env, windowsHide: true, stdio: 'ignore' });
  let target;
  for (let n = 0; n < 600; n++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page' && t.url.startsWith('vaultor:')); if (target) break; } catch {} await sleep(100); }
  assert.ok(target, 'Installed app CDP missing'); ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  ws.addEventListener('message', e => { const r = JSON.parse(e.data), p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(Error(r.error.message)) : p.resolve(r.result); } });
  await wait("document.querySelectorAll('.library-resource').length>0||document.querySelector('.tiptap')?.innerText.includes('Atlas — Start here')");
  report.samples.processToFirstContentMs = performance.now() - began;
  await evaluate("[...document.querySelectorAll('.sidebar-nav')].find(b=>b.textContent.trim()==='Library')?.click()");
  await wait("Boolean(document.querySelector('input[aria-label=\"Search resources\"]'))");
  await evaluate("(()=>{const e=document.querySelector('input[aria-label=\"Search resources\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await wait(`document.querySelectorAll('.library-resource').length===${Math.min(expected,100)}`);
  report.samples.processToLibraryUsableMs=performance.now()-began;
  assert.equal(await evaluate("document.querySelectorAll('.library-resource').length"), Math.min(expected, 100));
  report.memoryLibrary = memory(); await frame('library');
  report.samples.scrollFrames = await evaluate(`new Promise(resolve=>{const box=document.querySelector('.library-view');const samples=[];let previous=performance.now(),start=previous;function tick(now){samples.push(now-previous);previous=now;box.scrollTop=(now-start)/2000*(box.scrollHeight-box.clientHeight);if(now-start<2000)requestAnimationFrame(tick);else resolve(samples)}requestAnimationFrame(tick)})`);
  await evaluate("document.querySelector('.library-view').scrollTop=0");
  await evaluate("(()=>{const e=document.querySelector('input[aria-label=\"Search resources\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Atlas — Start here');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await wait("[...document.querySelectorAll('.library-resource')].some(e=>e.textContent.includes('Atlas — Start here'))");
  const reader = performance.now(); await evaluate("[...document.querySelectorAll('.library-resource')].find(e=>e.textContent.includes('Atlas — Start here')).querySelector('button').click()");
  await wait("document.querySelector('.tiptap')?.innerText.includes('Atlas — Start here')&&[...document.querySelectorAll('.tiptap img')].some(img=>img.complete&&img.naturalWidth>0)");
  report.samples.longImageNoteDomMs = performance.now() - reader; report.memoryReader = memory(); await frame('reader');
  const saved = await evaluate("JSON.stringify(document.querySelector('.tiptap').editor.getJSON())");
  await evaluate("document.querySelector('.tiptap').editor.commands.insertContent('R10 disposable desktop edit ')");
  await wait("document.querySelector('.tiptap').innerText.includes('R10 disposable desktop edit')");
  await evaluate("document.querySelector('.tiptap').editor.commands.undo()");
  await wait(`JSON.stringify(document.querySelector('.tiptap').editor.getJSON())===${JSON.stringify(saved)}`);
  report.conditionalEditUndo = true; report.memorySettled = memory(); report.success = true;
} catch (error) { report.failure = error.message; if (ws?.readyState === 1) await frame('failure').catch(() => {}); throw error; }
finally {
  if (ws?.readyState === 1) { await evaluate("window.vaultorDesktop.hostAction('stop')").catch(() => {}); ws.close(); }
  // Only the directly spawned disposable shell, after requesting owned host stop.
  child?.kill();
  await owned.stop(); await writeFile(join(root, resume?'report-rerun-'+Date.now()+'.json':'report.json'), JSON.stringify({...report,resumed:!!resume}, null, 2));
  console.log(JSON.stringify({ root, success: report.success ?? false, samples: { ...report.samples, scrollFrames: undefined }, failure: report.failure }));
}
