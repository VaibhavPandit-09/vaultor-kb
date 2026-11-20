import assert from 'node:assert/strict';
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {mkdir, readFile, stat, unlink, writeFile} from 'node:fs/promises';
import {request} from 'node:https';
import {join} from 'node:path';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function qualifyAutomaticTls({evaluate, wait, report, folder, restart}) {
  const access = join(folder, 'host-access');
  const admin = (op, fields = {}) => evaluate(`window.__TAURI_INTERNALS__.invoke('hosting',{command:${JSON.stringify({op,...fields})}})`);
  async function descriptor(status, ca) {
    return new Promise((resolve, reject) => {
      const url = `https://${status.address}/api/access/host`;
      const req = request(url, {ca, agent:false}, res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            assert.equal(res.statusCode, 200);
            resolve(JSON.parse(body));
          } catch (error) { reject(error); }
        });
      });
      req.setTimeout(4000, () => req.destroy(Error('Managed host timed out')));
      req.on('error', reject);
      req.end();
    });
  }
  assert.equal((await admin('status')).running, false);
  await assert.rejects(stat(access), {code:'ENOENT'});
  await evaluate("document.querySelector('button[title=Settings]').click()");
  await evaluate("[...document.querySelectorAll('.settings-rail button')].find(button=>button.textContent.trim()==='Hosting').click()");
  await wait("[...document.querySelectorAll('button')].some(button=>button.textContent==='Start hosting'&&!button.disabled)", 'Hosting controls ready');
  const startTime = performance.now();
  const status = await admin('start', {address:'127.0.0.1:0'});
  assert(status.running && status.certificate?.expiresAt > Math.floor(Date.now()/1000));
  await assert.rejects(stat(join(access,'server-key.pem')), {code:'ENOENT'});
  const ca = await readFile(join(access,'ca.pem'));
  const first = await descriptor(status, ca);
  report.firstManagedTlsReadinessMs = performance.now() - startTime;
  assert.equal(status.fingerprint, first.fingerprint);
  assert.equal((await admin('startup',{enabled:true})).startup, true);
  await restart();
  const restored = await admin('status');
  assert.equal(restored.running, true);
  assert.equal(restored.address, status.address);
  assert.deepEqual(await descriptor(restored, ca), first);
  const stopped = await admin('stop');
  assert(!stopped.running && !stopped.startup);
  await assert.rejects(descriptor(restored, ca), {code:'ECONNREFUSED'});
  report.checks.push('No certificate created while disabled', 'Native Windows provisioning and verified TLS', 'Pin continuity and opt-in restart', 'Stopping disables the listener and startup preference');
}

export async function qualifyHost({evaluate, wait, record, report, folder}) {
  const access = join(folder, 'host-access');
  const host = process.env.VAULTOR_BENCH_HEADLESS;
  const openssl = process.env.VAULTOR_BENCH_OPENSSL;
  assert(host && openssl, 'Set VAULTOR_BENCH_HEADLESS and VAULTOR_BENCH_OPENSSL');
  await mkdir(access);
  const silent = {cwd: access, stdio: 'ignore', windowsHide: true};
  const opensslRun = (...args) => execFileSync(openssl, args, silent);
  opensslRun('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-subj', '/CN=Vaultor M24 fixture CA',
    '-days', '2', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
    '-keyout', 'fixture-ca.key', '-out', 'ca.pem');
  opensslRun('req', '-new', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-subj', '/CN=Vaultor M24 fixture',
    '-keyout', 'server-key.pem', '-out', 'server.csr');
  await writeFile(join(access, 'server.ext'), 'subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n');
  opensslRun('x509', '-req', '-in', 'server.csr', '-CA', 'ca.pem', '-CAkey', 'fixture-ca.key', '-CAcreateserial',
    '-days', '1', '-extfile', 'server.ext', '-out', 'leaf.pem');
  await unlink(join(access, 'fixture-ca.key'));
  const ca = await readFile(join(access, 'ca.pem'));
  await writeFile(join(access, 'chain.pem'), Buffer.concat([await readFile(join(access, 'leaf.pem')), ca]));
  execFileSync(host, ['init', access, join(access, 'ca.pem')], silent);

  const invoke = (command, args) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`);
  const admin = command => invoke('hosting', {command});
  const ws = resource => invoke('workspace', {request: resource});
  const note = await ws({kind: 'createNote', title: 'M24 managed note'});
  report.dataset = createHash('sha256').update('M24: 1 default rich note, isolated Windows WebView2, explicit loopback TLS').digest('hex');
  report.hostBenchWindows = [];
  const idle = async phase => {
    await sleep(2000);
    const start = Date.now();
    await sleep(6500);
    report.hostBenchWindows.push({phase, start, end: Date.now()});
    for (let i = 1; i <= 8; i++) {
      const before = performance.now();
      assert.equal((await ws({kind: 'read', id: note.id})).revision, 1);
      record(phase, i, 'saved_note_ipc_round_trip', performance.now() - before, 'ms', 'CDP and Tauri IPC through saved-note JSON receipt.');
    }
  };
  assert.equal((await admin({op: 'status'})).running, false);
  await evaluate("document.querySelector('button[title=Settings]').click()");
  await evaluate("[...document.querySelectorAll('.settings-rail button')].find(button=>button.textContent.trim()==='Hosting').click()");
  await wait("[...document.querySelectorAll('button')].some(button=>button.textContent==='Start hosting'&&!button.disabled)", 'Hosting controls ready');
  await evaluate(`document.querySelector('[aria-label="Close settings"]').click()`);
  await idle('m24-desktop-disabled');
  const started = performance.now();
  const status = await admin({op: 'start', address: '127.0.0.1:0'});
  assert.equal(status.running, true);
  record('m24-desktop-enabled', 1, 'host_startup', performance.now() - started, 'ms', 'Native IPC start through effective HTTPS listener.');
  await idle('m24-desktop-enabled');

  const port = Number(status.address.split(':').at(-1));
  function api(method, path, options = {}) {
    return new Promise((resolve, reject) => {
      const body = options.body === undefined ? undefined : JSON.stringify(options.body);
      const headers = {...options.headers};
      if (body) Object.assign(headers, {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)});
      const req = request({host: '127.0.0.1', port: options.port ?? port, method, path, ca, agent: false, headers}, res => {
        const data = [];
        res.on('data', chunk => data.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(data).toString();
          resolve({status: res.statusCode, value: text && res.headers['content-type']?.includes('json') ? JSON.parse(text) : text});
        });
        res.on('error', reject);
      });
      req.setTimeout(4000, () => req.destroy(Error('Host request timed out')));
      req.on('error', reject);
      req.end(body);
    });
  }
  const descriptor = await api('GET', '/api/access/host');
  assert.equal(descriptor.status, 200);
  assert.equal(descriptor.value.fingerprint, status.fingerprint);
  const pairingStart = performance.now();
  const pending = await api('POST', '/api/pairings', {body:{
    name:'M24 loopback client', kind:'agent', nonce:randomBytes(32).toString('hex'), fingerprint:status.fingerprint,
  }});
  assert.equal(pending.status, 200);
  await admin({op:'decide', id:pending.value.id, code:pending.value.code, approve:true});
  const done = await api('POST', `/api/pairings/${pending.value.id}/complete`,
    {headers:{'X-Vaultor-Pairing':pending.value.secret}, body:{}});
  assert.equal(done.status, 200);
  record('m24-desktop-loopback-client', 1, 'pairing_round_trip', performance.now() - pairingStart, 'ms', 'Scripted owner decision. No user comparison delay.');
  const device = done.value.deviceId;
  const auth = {headers:{Authorization:`Bearer ${done.value.credential}`}};
  await admin({op:'grant', id:device, allow:true});
  const workspaces = await api('GET', '/api/next/v1/workspaces', auth);
  const base = `/api/next/v1/workspaces/${workspaces.value[0].id}`;
  for (const [metric, path] of [
    ['workspace_list', '/api/next/v1/workspaces'], ['saved_note', `${base}/notes/${note.id}`],
    ['managed_search', `${base}/resources?query=M24`],
  ]) {
    for (let i = 1; i <= 12; i++) {
      const before = performance.now();
      assert.equal((await api('GET', path, auth)).status, 200);
      record('m24-desktop-loopback-client', i, metric, performance.now() - before, 'ms', 'Node client, new verified loopback TLS connection per request.');
    }
  }
  await admin({op:'grant', id:device, allow:false});
  assert.equal((await api('GET', `${base}/notes/${note.id}`, auth)).status, 403);
  await admin({op:'revoke', id:device});
  assert.equal((await api('GET', '/api/next/v1/workspaces', auth)).status, 401);
  const stop = performance.now();
  assert.equal((await admin({op:'stop'})).running, false);
  await assert.rejects(api('GET', '/api/access/host'), {code:'ECONNREFUSED'});
  record('m24-desktop-loopback-client', 1, 'host_stop', performance.now() - stop, 'ms', 'Stop IPC and observed connection refusal.');
  assert.equal((await ws({kind:'read',id:note.id})).title, note.title);
  report.checks.push('Optimized Windows Settings hosting category', 'Loopback TLS and paired read/search', 'Grant withdrawal and revocation', 'Hosting stopped with local IPC still usable');

  const runtimeArgs = workspace => [workspace, access, join(access, 'chain.pem'), join(access, 'server-key.pem'),
    join(access, 'ca.pem'), '127.0.0.1:0'];
  const occupied = spawnSync(host, runtimeArgs(join(folder, 'workspace')), {windowsHide:true, encoding:'utf8', timeout:8000});
  assert.notEqual(occupied.status, 0);
  assert.match(occupied.stderr, /Workspace is already open/);
  const headlessStart = performance.now();
  const headless = spawn(host, runtimeArgs(join(folder, 'headless')), {windowsHide:true, stdio:['ignore','pipe','ignore']});
  try {
    const headlessPort = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(Error('Headless HTTPS timed out')), 8000);
      headless.stdout.on('data', data => {
        output += data;
        const endpoint = output.match(/HTTPS listening at 127\.0\.0\.1:(\d+)/);
        if (endpoint) {
          clearTimeout(timer);
          resolve(Number(endpoint[1]));
        }
      });
      headless.once('error', error => { clearTimeout(timer); reject(error); });
      headless.once('exit', () => { clearTimeout(timer); reject(Error('Headless host exited')); });
    });
    const ready = await api('GET', '/api/access/host', {port:headlessPort});
    assert.equal(ready.value.hostId, descriptor.value.hostId);
    record('m24-headless-loopback', 1, 'startup_usable', performance.now() - headlessStart, 'ms',
      'Optimized headless process spawn through verified descriptor on a newly initialized workspace.');
    assert.equal((await api('GET', '/api/next/v1/workspaces', {port:headlessPort})).status, 401);
    await sleep(3000);
    const sampleFile = join(folder, 'headless-sample.json');
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      join(import.meta.dirname, 'process-sample.ps1'), '-RootPid', String(headless.pid),
      '-Output', sampleFile, '-StopFile', join(folder, 'headless-stop'), '-Once'], silent);
    const sample = JSON.parse((await readFile(sampleFile, 'utf8')).replace(/^\uFEFF/, ''));
    record('m24-headless-loopback', 1, 'process_tree_working_set', sample.workingSet / 1048576, 'MiB');
    record('m24-headless-loopback', 1, 'process_tree_private_bytes', sample.privateBytes / 1048576, 'MiB');
    report.checks.push('Headless process rejected an already-owned workspace and served verified TLS from an independent workspace');
  } finally {
    if (headless.exitCode === null) {
      await new Promise(resolve => { headless.once('exit', resolve); headless.kill(); });
    }
  }

  try {
    const running = await admin({op:'start', address:'127.0.0.1:0'});
    const quitPort = Number(running.address.split(':').at(-1));
    await assert.rejects(ws({kind:'new', path:join(folder, 'blocked-switch')}), /Stop hosting/);
    await evaluate("setTimeout(() => void window.__TAURI_INTERNALS__.invoke('close_next',{quit:true}), 250); true");
    const timeout = Date.now() + 8_000;
    while (true) {
      try {
        await api('GET', '/api/access/host', {port:quitPort});
      } catch (error) {
        if (error.code === 'ECONNREFUSED') break;
        if (error.code !== 'ECONNRESET') throw error;
      }
      assert(Date.now() < timeout, 'Explicit Quit must close the listener');
      await sleep(50);
    }
    report.checks.push('Hosting blocked a workspace switch, and explicit native Quit closed the listener');
  } finally {
    await unlink(join(access, 'server-key.pem'));
  }
}
