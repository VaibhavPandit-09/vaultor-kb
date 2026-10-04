import https from 'node:https';
import tls from 'node:tls';
import { lookup } from 'node:dns';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { X509Certificate, createHash } from 'node:crypto';
import { loopbackAddress } from './policy.mjs';

export function privateIP(value) {
  const p = value.split('.').map(Number);
  return isIP(value) === 4 && (p[0] === 10 || p[0] === 127 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 169 && p[1] === 254));
}
export function networkAddress(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || value.length > 1000 || !(privateIP(url.hostname) || /^[a-z0-9][a-z0-9.-]*\.local$/i.test(url.hostname) || url.hostname === 'localhost')) throw new Error('Use an HTTPS address on your private network, for example https://192.168.1.20:8443.');
  return url.origin;
}
function privateLookup(host, options, callback) {
  lookup(host, { family: 4, all: true }, (error, addresses) => {
    if (error || !addresses?.length || addresses.some(a => !privateIP(a.address))) return callback(new Error('The host must resolve only to private IPv4 addresses.'));
    callback(null, ...(options.all ? [addresses] : [addresses[0].address, 4]));
  });
}
export function trustFromDer(raw) {
  const cert = new X509Certificate(raw);
  if (!cert.ca || !cert.verify(cert.publicKey) || Date.parse(cert.validTo) <= Date.now() || Date.parse(cert.validFrom) > Date.now()) throw new Error('The host certificate authority is invalid or expired.');
  return { ca: cert.toString(), fingerprint: createHash('sha256').update(cert.raw).digest('hex') };
}
// Enrollment observes ONLY a bounded TLS chain; no workspace request or credential
// uses an unverified connection. Approval of the matching code authenticates this pin.
export async function observeTrust(address) {
  const url = new URL(networkAddress(address));
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: url.hostname, port: Number(url.port || 443), servername: isIP(url.hostname) ? undefined : url.hostname, lookup: privateLookup, minVersion: 'TLSv1.2', rejectUnauthorized: false });
    socket.setTimeout(8000, () => socket.destroy(new Error('Host did not respond. Check sharing and the private-network firewall.')));
    socket.once('error', () => reject(new Error('Cannot inspect this host. Check its address, sharing and the private-network firewall.')));
    socket.once('secureConnect', () => {
      try {
        let cert = socket.getPeerCertificate(true); const seen = new Set();
        for (let i = 0; i < 6 && cert.issuerCertificate && cert.issuerCertificate !== cert; i++) { if (seen.has(cert.fingerprint256)) throw new Error('Invalid certificate chain.'); seen.add(cert.fingerprint256); cert = cert.issuerCertificate; }
        resolve(trustFromDer(cert.raw));
      } catch (error) { reject(error); } finally { socket.destroy(); }
    });
  });
}
export async function connectionFetch(current, path, options = {}) {
  if (current.profile.kind !== 'remote') return fetch(loopbackAddress(current.profile.address) + '/api' + path, { ...options, redirect: 'error', headers: { ...options.headers, ...(current.ownerKey ? { 'X-Vaultor-Owner': current.ownerKey } : {}) } });
  const url = new URL(networkAddress(current.profile.address) + '/api' + path);
  const trust = trustFromDer(new X509Certificate(current.profile.ca).raw);
  if (trust.fingerprint !== current.profile.fingerprint) throw new Error('Host trust changed. Reconnect only after verifying the host again.');
  let body = options.body, headers = { ...options.headers, ...(current.credential ? { Authorization: 'Bearer ' + current.credential } : {}) };
  if (body instanceof FormData) { const encoded = new Request('https://localhost/', { method: 'POST', body }); headers['Content-Type'] = encoded.headers.get('content-type'); body = encoded.body; }
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: options.method || 'GET', headers, ca: trust.ca, rejectUnauthorized: true, minVersion: 'TLSv1.2', lookup: privateLookup, signal: options.signal }, incoming => {
      if (incoming.statusCode >= 300 && incoming.statusCode < 400) { incoming.destroy(); reject(new Error('Server redirects are not allowed.')); return; }
      const responseHeaders = new Headers(); for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
      resolve(new Response(['HEAD'].includes(options.method) || [204, 304].includes(incoming.statusCode) ? null : Readable.toWeb(incoming), { status: incoming.statusCode, headers: responseHeaders }));
    });
    request.once('error', error => reject(options.signal?.aborted ? new DOMException('Request cancelled.', 'AbortError') : new Error(error.code?.startsWith('ERR_TLS') || ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(error.code) ? 'Host certificate verification failed. Check the host identity and renew its certificate if its address changed.' : 'Host unavailable. Check sharing, address and the private-network firewall.')));
    if (body?.getReader) Readable.fromWeb(body).on('error', e => request.destroy(e)).pipe(request);
    else if (body?.pipe) body.on('error', e => request.destroy(e)).pipe(request);
    else request.end(body);
  });
}
