import { randomUUID, randomBytes } from 'node:crypto';
import { networkInterfaces, hostname } from 'node:os';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { observeTrust, connectionFetch, networkAddress, privateIP } from './network.mjs';

async function json(current, path, method = 'GET', body, headers = {}) {
  const response = await connectionFetch(current, path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const reader = response.body?.getReader(); let bytes = 0; const chunks = [];
  try { if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 65536) throw new Error('Host response exceeded its limit.'); chunks.push(Buffer.from(value)); } } finally { await reader?.cancel().catch(() => {}); }
  let value; try { value = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw new Error('Invalid host response.'); }
  if (!response.ok) { const error = new Error(String(value.detail || `Host request failed (${response.status}).`).slice(0, 500)); error.code = value.code; throw error; }
  return value;
}
export class Connections {
  constructor({ owned, profiles, credentials, discovery }) { Object.assign(this, { owned, profiles, credentials, discovery }); this.attempt = null; }
  async owner(path, method = 'GET', body) { await this.owned.start(); return json({ profile: { kind: 'local', address: this.owned.address }, ownerKey: this.owned.accessKey }, '/owner' + path, method, body); }
  async sharing(enabled) {
    if (enabled !== undefined && typeof enabled !== 'boolean') throw new Error('Specify sharing as on or off.');
    if (enabled === undefined && !this.owned.address) {
      let saved = false;
      try { const config = JSON.parse(await readFile(join(this.owned.data, 'host-access', 'sharing.json'), 'utf8')); saved = config.enabled === true; }
      catch (error) { if (error.code !== 'ENOENT') throw new Error('Sharing preferences cannot be read. They have been preserved.'); }
      return { enabled: saved, listening: false, port: 8443, addresses: [], hostId: this.owned.hostId || '', fingerprint: '', stopped: true };
    }
    const status = await this.owner('/sharing', enabled === undefined ? 'GET' : 'PUT', enabled === undefined ? undefined : { enabled });
    if (status.listening) this.discovery.advertise(this.owned.hostId, status.port); else this.discovery.withdraw();
    const host = await json({ profile: { kind: 'local', address: this.owned.address }, ownerKey: this.owned.accessKey }, '/access/host');
    return { ...status, hostId: host.hostId, fingerprint: host.fingerprint, addresses: Object.values(networkInterfaces()).flat().filter(a => a && !a.internal && a.family === 'IPv4' && privateIP(a.address)).slice(0, 8).map(a => `https://${a.address}:${status.port}/access`) };
  }
  async resumeHosting() {
    try { const config = JSON.parse(await readFile(join(this.owned.data, 'host-access', 'sharing.json'), 'utf8')); if (config.enabled) { await this.owned.start(); await this.sharing(); } }
    catch (error) { if (error.code !== 'ENOENT') this.owned.error = 'Could not resume shared hosting. Open Hosting to inspect and retry.'; }
  }
  watchAddresses() {
    let previous = JSON.stringify(networkInterfaces()), pending = false;
    const timer = setInterval(async () => {
      const current = JSON.stringify(networkInterfaces());
      if (current === previous || pending || !this.owned.address) return;
      pending = true;
      try { await this.owner('/trust/renew', 'POST'); this.discovery.withdraw(); await this.sharing(); previous = current; }
      catch { this.owned.error = 'The network address changed. Refresh the address certificate in Hosting and check the firewall.'; }
      finally { pending = false; }
    }, 30000);
    timer.unref(); return () => clearInterval(timer);
  }
  async prepare(input) {
    if (!this.credentials.available()) throw new Error('Unlock your OS credential store before pairing.');
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100) throw new Error('Enter a connection name (up to 100 characters).');
    const address = networkAddress(input.address), trust = await observeTrust(address);
    const profile = { kind: 'remote', address, ...trust };
    const host = await json({ profile }, '/access/host');
    if (typeof host.hostId !== 'string' || !/^[\w-]{1,80}$/.test(host.hostId) || host.fingerprint !== trust.fingerprint) throw new Error('Host identity does not match its certificate.');
    const id = randomUUID(); this.attempt = { id, profile: { ...profile, hostId: host.hostId, name: input.name.trim() }, expires: Date.now() + 300000 };
    return { id, name: input.name.trim(), address, hostId: host.hostId, fingerprint: trust.fingerprint };
  }
  checked(id) { const a = this.attempt; if (!a || a.id !== id || a.expires < Date.now()) throw new Error('Pairing expired. Start again.'); return a; }
  async enroll(id) {
    const a = this.checked(id);
    if (!a.enrollment) {
      const value = await json({ profile: a.profile }, '/pairings', 'POST', { name: 'Vaultor · ' + hostname().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 60), kind: 'desktop', nonce: randomBytes(32).toString('hex'), fingerprint: a.profile.fingerprint });
      if (!/^[a-f0-9]{64}$/.test(value.secret) || !/^[\w-]{1,80}$/.test(value.id) || !/^[0-9]{6}$/.test(value.code) || value.hostId !== a.profile.hostId || value.fingerprint !== a.profile.fingerprint) throw new Error('Invalid pairing response.');
      a.enrollment = value;
    }
    return { id: a.id, code: a.enrollment.code, expiresAt: a.enrollment.expiresAt };
  }
  async poll(id) {
    const a = this.checked(id), e = a.enrollment; if (!e) throw new Error('Request approval first.');
    const headers = { 'X-Vaultor-Pairing': e.secret };
    const status = await json({ profile: a.profile }, '/pairings/' + e.id, 'GET', undefined, headers);
    if (status.state !== 'APPROVED') return { state: status.state };
    const completed = await json({ profile: a.profile }, '/pairings/' + e.id + '/complete', 'POST', {}, headers);
    if (!/^[a-f0-9]{64}$/.test(completed.credential)) throw new Error('Invalid device approval.');
    const profile = await this.profiles.paired(a.profile);
    await this.credentials.set(profile.id, completed.credential);
    this.attempt = null; return { state: 'APPROVED', profileId: profile.id };
  }
  async resolve(profile) {
    const credential = this.credentials.get(profile.id);
    const check = async p => { const host = await json({ profile: p, credential }, '/access/host'); if (host.hostId !== p.hostId || host.fingerprint !== p.fingerprint) throw new Error('This address serves a different host. Verify it explicitly before pairing.'); return p; };
    try { return await check(profile); }
    catch (original) {
      if (original.code === 'DEVICE_APPROVAL_REQUIRED') throw original;
      for (const found of await this.discovery.resolve(profile.hostId, profile.address)) {
        try { return await check({ ...profile, address: found.address }); } catch { /* Hints cannot change the certificate pin or host identity. */ }
      }
      throw original;
    }
  }
}
