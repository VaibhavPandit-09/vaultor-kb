import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loopbackAddress } from './policy.mjs';
import { networkAddress, trustFromDer } from './network.mjs';
import { X509Certificate } from 'node:crypto';
export class Profiles {
  constructor(directory) { this.directory = directory; }
  async load() {
    try {
      if ((await stat(join(this.directory, 'connections.json'))).size > 1048576) throw new Error('Connection storage exceeds its limit.');
      this.data = JSON.parse(await readFile(join(this.directory, 'connections.json'), 'utf8'));
      if (this.data.version !== 1 || typeof this.data.clientId !== 'string' || !Array.isArray(this.data.profiles) || this.data.profiles.length > 21 || this.data.profiles.filter(p => p.source !== 'bundled').length > 20) throw new Error('Invalid connection storage.');
      for (const p of this.data.profiles) this.validate(p);
      this.data.retired ??= [];
      if (!Array.isArray(this.data.retired) || this.data.retired.length > 100) throw new Error('Invalid retired connection identities.');
      for (const p of this.data.retired) { this.validate(p); if (p.source) throw new Error('Managed host cannot be forgotten.'); }
      if (new Set([...this.data.profiles, ...this.data.retired].map(p => p.id)).size !== this.data.profiles.length + this.data.retired.length) throw new Error('Duplicate connection identity.');
      if (!/^[\w-]{1,80}$/.test(this.data.clientId) || new Set(this.data.profiles.map(p => p.id)).size !== this.data.profiles.length || (this.data.active !== null && !this.data.profiles.some(p => p.id === this.data.active))) throw new Error('Invalid connection ownership.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Connection storage could not be read. It has been preserved; repair connections.json or choose another desktop data directory.');
      this.data = { version: 1, clientId: randomUUID(), active: null, profiles: [] };
      await this.persist();
    }
    return this.snapshot();
  }
  validate(p) {
    if (!p || typeof p.id !== 'string' || !/^[\w-]{1,80}$/.test(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100 || !['local', 'remote'].includes(p.kind)) throw new Error('Invalid connection profile.');
    if (p.kind === 'remote') {
      networkAddress(p.address);
      if (typeof p.hostId !== 'string' || !/^[\w-]{1,80}$/.test(p.hostId) || typeof p.ca !== 'string' || p.ca.length > 16000 || trustFromDer(new X509Certificate(p.ca).raw).fingerprint !== p.fingerprint || p.source) throw new Error('Invalid paired host profile.');
    } else loopbackAddress(p.address);
    if ((p.source !== undefined && (p.source !== 'bundled' || p.id !== 'this-computer')) || (p.id === 'this-computer' && p.source !== 'bundled')) throw new Error('Invalid managed connection.');
  }
  snapshot() { const data = structuredClone(this.data); delete data.retired; data.profiles = data.profiles.map(({ ca, ...publicProfile }) => publicProfile); return data; }
  backup() { return structuredClone(this.data); }
  async ensureManaged() {
    if (!this.data.profiles.some(p => p.source === 'bundled')) {
      const previous = this.backup();
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
    const previous = this.backup(); this.data.profiles.push(profile);
    try { await this.persist(); return profile; } catch (error) { this.data = previous; throw error; }
  }
  async activate(id, workspaceId) {
    const previous = this.backup(); this.get(id);
    this.data.active = id; this.data.profiles.find(p => p.id === id).workspaceId = workspaceId;
    try { await this.persist(); } catch (error) { this.data = previous; throw error; }
  }
  async paired(input) {
    const existing = this.data.profiles.find(p => p.hostId === input.hostId && p.fingerprint === input.fingerprint);
    if (existing) { await this.update(existing.id, { address: input.address, name: input.name }); return this.get(existing.id); }
    if (this.data.profiles.filter(p => p.source !== 'bundled').length >= 20) throw new Error('At most 20 connection profiles are supported.');
    const retired = this.data.retired?.find(p => p.hostId === input.hostId && p.fingerprint === input.fingerprint);
    const profile = { ...retired, ...input, id: retired?.id || randomUUID(), kind: 'remote' }; this.validate(profile);
    const previous = this.backup(); this.data.profiles.push(profile); this.data.retired = (this.data.retired || []).filter(p => p.id !== profile.id);
    try { await this.persist(); return profile; } catch (error) { this.data = previous; throw error; }
  }
  async update(id, patch) {
    const previous = this.backup(), profile = this.data.profiles.find(p => p.id === id); if (!profile) throw new Error('Profile not found.');
    try { Object.assign(profile, patch); this.validate(profile); await this.persist(); } catch (error) { this.data = previous; throw error; }
  }
  async forget(id) {
    const retired = this.get(id);
    if (id === this.data.active || retired.source === 'bundled') throw new Error('Switch away from this server before forgetting it.');
    if ((this.data.retired?.length || 0) >= 100) throw new Error('Retained connection identity limit reached. Existing recovery identities have been preserved.');
    const previous = this.backup(); this.data.profiles = this.data.profiles.filter(p => p.id !== id); this.data.retired = [...(this.data.retired || []), retired];
    try { await this.persist(); } catch (error) { this.data = previous; throw error; }
  }
}
