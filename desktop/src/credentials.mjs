import { readFile, open, mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** OS-protected credentials never cross preload, logs, profile snapshots or archives. */
export class Credentials {
  constructor(directory, storage) { this.directory = directory; this.storage = storage; this.data = {}; }
  available() { return this.storage.isEncryptionAvailable() && this.storage.getSelectedStorageBackend?.() !== 'basic_text'; }
  async load() {
    try { const file = join(this.directory, 'device-credentials.json'); if ((await stat(file)).size > 131072) throw new Error(); this.data = JSON.parse(await readFile(file, 'utf8')); if (!this.data || typeof this.data !== 'object' || Array.isArray(this.data) || Object.keys(this.data).length > 20 || Object.entries(this.data).some(([id, value]) => !/^[\w-]{1,80}$/.test(id) || typeof value !== 'string' || value.length > 4096 || !/^[A-Za-z0-9+/]+=*$/.test(value))) throw new Error(); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Protected connection storage could not be read. It has been preserved.'); }
  }
  get(id) {
    if (!this.available()) throw new Error('OS-protected credential storage is unavailable. Unlock the system keychain and retry.');
    const value = this.data[id]; if (!value) throw new Error('This connection needs pairing.');
    try { const secret = this.storage.decryptString(Buffer.from(value, 'base64')); if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error(); return secret; }
    catch { throw new Error('This device credential cannot be unlocked. Pair again; drafts remain separate.'); }
  }
  async set(id, secret) {
    if (!this.available() || !/^[a-f0-9]{64}$/.test(secret)) throw new Error('OS-protected credential storage is unavailable.');
    const previous = this.data; this.data = { ...previous, [id]: this.storage.encryptString(secret).toString('base64') };
    try { await this.persist(); } catch (error) { this.data = previous; throw error; }
  }
  async remove(id) { const previous = this.data; this.data = { ...previous }; delete this.data[id]; try { await this.persist(); } catch (error) { this.data = previous; throw error; } }
  async persist() { await mkdir(this.directory, { recursive: true }); const temp = join(this.directory, 'device-credentials.json.tmp'); const file = await open(temp, 'w', 0o600); try { await file.writeFile(JSON.stringify(this.data)); await file.sync(); } finally { await file.close(); } await rename(temp, join(this.directory, 'device-credentials.json')); }
}
