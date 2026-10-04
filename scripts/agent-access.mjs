import { readFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import { Agent, request } from 'node:https';
import { Readable } from 'node:stream';
/** Opt-in agent credentials, never emitted or read from a portable workspace archive. */
export async function agentAccess(base) {
  const url = new URL(base), headers = {};
  if (url.username || url.password || url.search || url.hash) throw new Error('Use a server origin without credentials or query parameters.');
  if (process.env.VAULTOR_OWNER_KEY_FILE) {
    if (url.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Owner material is only usable on loopback HTTP.');
    const key = (await readFile(process.env.VAULTOR_OWNER_KEY_FILE, 'utf8')).trim();
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid owner key file.');
    headers['X-Vaultor-Owner'] = key;
  } else if (process.env.VAULTOR_DEVICE_CREDENTIAL) {
    if (url.protocol !== 'https:' || !/^[a-f0-9]{64}$/.test(process.env.VAULTOR_DEVICE_CREDENTIAL)) throw new Error('Device access needs HTTPS and a valid credential.');
    headers.Authorization = 'Bearer ' + process.env.VAULTOR_DEVICE_CREDENTIAL;
  } else throw new Error('Provide VAULTOR_OWNER_KEY_FILE on loopback, or a paired VAULTOR_DEVICE_CREDENTIAL over HTTPS.');
  let agent;
  if (url.protocol === 'https:') {
    if (!process.env.VAULTOR_HOST_CA_FILE || !/^[a-f0-9]{64}$/.test(process.env.VAULTOR_HOST_FINGERPRINT || '')) throw new Error('Supply the verified public host CA and its SHA-256 fingerprint.');
    const ca = await readFile(process.env.VAULTOR_HOST_CA_FILE);
    const certificate = new X509Certificate(ca);
    if (certificate.fingerprint256.replaceAll(':','').toLowerCase() !== process.env.VAULTOR_HOST_FINGERPRINT) throw new Error('Host trust changed. Verify its identity before reconnecting.');
    agent = new Agent({ ca, rejectUnauthorized: true, keepAlive: true });
  }
  return { fetch: async (address, options = {}) => {
    if (new URL(address).origin !== url.origin) throw new Error('Agent credentials cannot cross server origins.');
    const merged = { ...options, headers: { ...options.headers, ...headers }, redirect: 'error' };
    if (!agent) return globalThis.fetch(address, merged);
    const body = new Request(address, merged);
    return new Promise((resolve, reject) => {
      const req = request(address, { agent, method: body.method, headers: Object.fromEntries(body.headers), signal: options.signal }, res => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(res.headers)) if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
        const noBody = [204,205,304].includes(res.statusCode); if(noBody)res.resume();
        resolve(new Response(noBody ? null : Readable.toWeb(res), { status: res.statusCode, headers: responseHeaders }));
      });
      req.on('error', reject);
      if (body.body) { const stream = Readable.fromWeb(body.body); stream.on('error', error => req.destroy(error)); stream.pipe(req); } else req.end();
    });
  } };
}
