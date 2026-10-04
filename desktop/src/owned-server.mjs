import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, appendFile, rename, rm, stat, statfs } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

export const MIN_FREE_BYTES = 128 * 1024 * 1024;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function verifyBundle(directory) {
  let manifest;
  try { manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')); }
  catch { throw new Error('Bundled server is missing. Run desktop bundle preparation or reinstall the application; workspace data is preserved.'); }
  if (manifest.version !== 1 || manifest.platform !== process.platform || manifest.arch !== process.arch || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Bundled runtime does not match this computer. Rebuild for this platform; workspace data is preserved.');
  const root = resolve(directory);
  for (const file of manifest.files) {
    const path = resolve(root, file.path);
    if (!path.startsWith(root + sep) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid bundled runtime manifest. Reinstall the application.');
    try { if (createHash('sha256').update(await readFile(path)).digest('hex') !== file.sha256) throw new Error('checksum'); }
    catch { throw new Error('Bundled server/runtime is damaged. Rebuild or reinstall; workspace data is preserved.'); }
  }
  return { java: join(root, 'runtime', 'bin', process.platform === 'win32' ? 'java.exe' : 'java'), jar: join(root, 'server.jar') };
}

/** Only owns its directly spawned child; never discovers, adopts or kills another process. */
export class OwnedServer extends EventEmitter {
  constructor({ bundle, data, timeout = 90000, backoff = [1000, 3000, 7000], spawnProcess = spawn, freeSpace = statfs }) {
    super(); Object.assign(this, { bundle, data, timeout, backoff, spawnProcess, freeSpace });
    this.status = 'stopped'; this.address = null; this.error = ''; this.lines = []; this.attempts = 0; this.stopping = false; this.logs = Promise.resolve();
  }
  snapshot() { return { status: this.status, address: this.address, hostId: this.hostId, error: this.error, restartAttempts: this.attempts, dataDirectory: this.data, logError: this.logError ?? '', logs: this.lines.slice(-80) }; }
  async log(message) {
    if ((this.logPending ?? 0) >= 200) return; // Bound disk-write backlog as well as the visible ring.
    this.logPending = (this.logPending ?? 0) + 1;
    const clean = String(message).replaceAll(this.ownerToken ?? '\0', '[redacted]').slice(0, 2000);
    this.lines.push({ timestamp: new Date().toISOString(), message: clean }); if (this.lines.length > 200) this.lines.shift();
    const item = JSON.stringify(this.lines.at(-1)) + '\n';
    this.logs = this.logs.catch(() => {}).then(async () => {
      const directory = join(this.data, 'logs'), file = join(directory, 'server.log'); await mkdir(directory, { recursive: true });
      const size = await stat(file).then(s => s.size, () => 0);
      if (size + Buffer.byteLength(item) > 1024 * 1024) {
        await rm(join(directory, 'server.2.log'), { force: true });
        await rename(join(directory, 'server.1.log'), join(directory, 'server.2.log')).catch(e => { if (e.code !== 'ENOENT') throw e; });
        await rename(file, join(directory, 'server.1.log')).catch(e => { if (e.code !== 'ENOENT') throw e; });
      }
      await appendFile(file, item, { mode: 0o600 });
    }).catch(() => { this.logError = 'Startup log could not be written. Check application-data permissions and free space.'; });
    await this.logs; this.logPending--;
  }
  async start() {
    if (this.status === 'ready') return this.address;
    if (this.starting) return this.starting;
    if (this.restarting) { await this.restarting; if (this.status === 'ready') return this.address; throw new Error(this.error); }
    if (this.child) throw new Error('Local server is stopping. Retry after it has stopped.');
    this.stopping = false; this.attempts = 0;
    this.starting = this.launch().finally(() => { this.starting = null; });
    return this.starting;
  }
  async launch() {
    this.status = 'starting'; this.error = ''; this.address = null; this.emit('status');
    try {
      const files = await verifyBundle(this.bundle);
      await mkdir(join(this.data, 'files'), { recursive: true });
      const space = await this.freeSpace(this.data);
      if (Number(space.bavail) * Number(space.bsize) < MIN_FREE_BYTES) throw new Error('Local workspace needs at least 128 MiB free to start. Free disk space and retry; data is preserved.');
      const check = join(this.data, '.write-' + randomBytes(8).toString('hex'));
      await writeFile(check, '', { flag: 'wx', mode: 0o600 }); await rm(check);
      const hostFile = join(this.data, 'host.json');
      try { await writeFile(hostFile, JSON.stringify({ version: 1, id: randomUUID() }), { flag: 'wx', mode: 0o600 }); }
      catch (e) { if (e.code !== 'EEXIST') throw e; }
      const host = JSON.parse(await readFile(hostFile, 'utf8'));
      if (host.version !== 1 || typeof host.id !== 'string' || !/^[a-f0-9-]{36}$/.test(host.id)) throw new Error('Local host identity is damaged. Restore host.json from backup; no data was reset.');
      this.hostId = host.id;
      if (this.stopping) throw new Error('Local server startup was cancelled. Reconnect to start it again.');
      this.ownerToken = randomBytes(32).toString('hex');
      const env = { ...process.env, VAULTOR_DESKTOP_DATA: this.data, VAULTOR_OWNER_PID: String(process.pid), VAULTOR_OWNER_TOKEN: this.ownerToken, DB_PATH: join(this.data, 'app.db'), STORAGE_PATH: join(this.data, 'files'), BUILD_VERSION: 'desktop-d3' };
      for (const key of ['JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', '_JAVA_OPTIONS', 'CLASSPATH']) delete env[key];
      const child = this.spawnProcess(files.java, ['-Xms64m', '-Xmx768m', '-jar', files.jar, '--server.address=127.0.0.1', '--server.port=0', '--server.shutdown=graceful', '--spring.lifecycle.timeout-per-shutdown-phase=15s'], { cwd: this.data, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child;
      child.stdin.on('error', () => {}); // A crashed child can close its private pipe before shutdown writes.
      this.exited = new Promise(resolve => child.once('close', resolve));
      await new Promise((resolveReady, rejectReady) => {
        let settled = false, buffers = { stdout: '', stderr: '' };
        const timer = setTimeout(() => fail(new Error('Local server startup timed out. Check startup logs and retry.')), this.timeout);
        const fail = error => { if (!settled) { settled = true; clearTimeout(timer); rejectReady(error); } };
        child.once('error', e => fail(new Error('Bundled Java could not start: ' + e.message)));
        for (const stream of ['stdout', 'stderr']) child[stream].on('data', chunk => {
          buffers[stream] += chunk.toString();
          const lines = buffers[stream].split(/\r?\n/); buffers[stream] = lines.pop().slice(-8192);
          for (const line of lines) {
            if (stream === 'stdout' && line === 'VAULTOR_OWNER_BLOCKED ' + this.ownerToken) {
              this.stopBlocked?.();
            } else if (stream === 'stdout' && line.startsWith('VAULTOR_OWNER_READY ')) {
              const parts = line.split(' '), port = Number(parts[2]);
              if (parts[1] === this.ownerToken && Number.isInteger(port) && port > 0 && port <= 65535 && !settled) {
                settled = true; clearTimeout(timer); this.address = 'http://127.0.0.1:' + port; this.status = 'ready'; this.emit('status'); resolveReady();
              }
            } else if (line) { void this.log(line); }
          }
        });
        child.once('close', (code, signal) => {
          clearTimeout(timer); if (this.child === child) this.child = null;
          const wasReady = this.status === 'ready'; this.address = null;
          if (this.stopping) { this.status = 'stopped'; this.emit('status'); }
          fail(new Error('Local server exited during startup. Check startup logs; the workspace may already be in use.'));
          if (!this.stopping && wasReady) { this.status = 'restarting'; void this.log(`Owned server exited (${code ?? signal}).`); this.emit('status'); this.restarting = this.restart().finally(() => { this.restarting = null; }); }
        });
      });
      return this.address;
    } catch (error) {
      this.error = error.code === 'EACCES' || error.code === 'EPERM' ? 'Cannot write the local workspace directory. Check permissions and retry; data is preserved.' : error.code === 'ENOSPC' ? 'Application-data disk is full. Free space and retry; data is preserved.' : error.message;
      // A timed-out failed startup is still ours. Stop it before enabling retry.
      if (this.child) { this.child.kill(); await this.exited; }
      this.status = 'failed'; await this.log(this.error); this.emit('status'); throw new Error(this.error);
    }
  }
  async restart() {
    while (!this.stopping && this.attempts < 3) {
      const wait = this.backoff[this.attempts++] ?? 7000; await delay(wait);
      if (this.stopping) return;
      try { await this.launch(); return; } catch { /* Retain actionable error and bounded attempts. */ }
    }
    if (!this.stopping) { this.status = 'failed'; this.error = 'Local server stopped after three restart attempts. Check logs, then reconnect to retry.'; this.emit('status'); }
  }
  async stop({ force = false } = {}) {
    this.stopping = true;
    const child = this.child;
    if (!child) { this.status = 'stopped'; this.address = null; return; }
    this.status = 'stopping'; this.emit('status');
    if (force) child.kill(); else child.stdin.write('STOP ' + this.ownerToken + '\n', () => {});
    let timeout;
    const stopped = await Promise.race([this.exited.then(() => true), new Promise(resolve => { timeout = setTimeout(() => resolve(false), 20000); }), new Promise(resolve=>{this.stopBlocked=()=>resolve(false);})]);
    clearTimeout(timeout);
    this.stopBlocked=null;
    if (!stopped) {this.stopping=false;this.status='ready';this.emit('status');throw new Error('Local server is still finishing work. Keep running or explicitly force quit.');}
    this.status = 'stopped'; this.address = null; await this.logs; this.emit('status');
  }
}
