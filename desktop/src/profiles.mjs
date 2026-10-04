import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loopbackAddress } from './policy.mjs';
export class Profiles {
  constructor(directory) { this.directory = directory; }
  async load() {
    try {
      this.data = JSON.parse(await readFile(join(this.directory, 'connections.json'), 'utf8'));
      if (this.data.version !== 1 || typeof this.data.clientId !== 'string' || !Array.isArray(this.data.profiles) || this.data.profiles.length > 21 || this.data.profiles.filter(p => p.source !== 'bundled').length > 20) throw new Error('Invalid connection storage.');
      for (const p of this.data.profiles) this.validate(p);
      if (!/^[\w-]{1,80}$/.test(this.data.clientId) || new Set(this.data.profiles.map(p => p.id)).size !== this.data.profiles.length || (this.data.active !== null && !this.data.profiles.some(p => p.id === this.data.active))) throw new Error('Invalid connection ownership.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Connection storage could not be read. It has been preserved; repair connections.json or choose another desktop data directory.');
      this.data = { version: 1, clientId: randomUUID(), active: null, profiles: [{ id: randomUUID(), name: 'Local server', address: 'http://127.0.0.1:8080', kind: 'local' }] };
      await this.persist();
    }
    return this.snapshot();
  }
  validate(p) {
    if (!p || typeof p.id !== 'string' || !/^[\w-]{1,80}$/.test(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100 || p.kind !== 'local') throw new Error('Invalid connection profile.');
    loopbackAddress(p.address);
    if ((p.source !== undefined && (p.source !== 'bundled' || p.id !== 'this-computer')) || (p.id === 'this-computer' && p.source !== 'bundled')) throw new Error('Invalid managed connection.');
  }
  snapshot() { return structuredClone(this.data); }
  async ensureManaged() {
    if (!this.data.profiles.some(p => p.source === 'bundled')) {
      const previous = this.snapshot();
      this.data.profiles.unshift({ id: 'this-computer', name: 'This computer', address: 'http://127.0.0.1:0', kind: 'local', source: 'bundled' });
      if (!this.data.active) this.data.active = 'this-computer';
      try { await this.persist(); } catch (error) { this.data = previous; throw error; }
    }
  }
  get(id) { const p = this.data.profiles.find(p => p.id === id); if (!p) throw new Error('Connection profile not found.'); return structuredClone(p); }
  async persist() {
    await mkdir(this.directory, { recursive: true });
    const temp = join(this.directory, 'connections.json.tmp');
    await writeFile(temp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    await rename(temp, join(this.directory, 'connections.json'));
  }
  async add(input) {
    if (this.data.profiles.filter(p => p.source !== 'bundled').length >= 20) throw new Error('At most 20 connection profiles are supported.');
    const profile = { id: randomUUID(), name: input?.name?.trim(), address: loopbackAddress(input?.address), kind: 'local' };
    this.validate(profile);
    if (this.data.profiles.some(p => p.address === profile.address)) throw new Error('This server is already remembered.');
    const previous = this.snapshot(); this.data.profiles.push(profile);
    try { await this.persist(); return profile; } catch (error) { this.data = previous; throw error; }
  }
  async activate(id, workspaceId) {
    const previous = this.snapshot(); this.get(id);
    this.data.active = id; this.data.profiles.find(p => p.id === id).workspaceId = workspaceId;
    try { await this.persist(); } catch (error) { this.data = previous; throw error; }
  }
}
