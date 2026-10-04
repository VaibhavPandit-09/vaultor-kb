import { MAX_BYTES, validateRequest, loopbackAddress } from './policy.mjs';
export async function boundedResponse(response) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new Error('Response exceeds the D2 32 MiB limit. Native streaming arrives in D4.'); }
  const reader = response.body?.getReader(); const chunks = []; let size = 0;
  if (reader) try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) throw new Error('Response exceeds the D2 32 MiB limit.'); chunks.push(value); }
  } finally { await reader.cancel().catch(() => {}); }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return { status: response.status, headers: Object.fromEntries(response.headers), data };
}
export class DesktopTransport {
  active = null; requests = new Map(); mutations = new Set();
  activate(profile, token, ownerKey) { this.cancelAll(); this.active = { profile, token, ownerKey }; }
  cancel(id) { this.requests.get(id)?.abort(); }
  cancelAll() { for (const controller of this.requests.values()) controller.abort(); }
  async request(value) {
    if (!this.active) throw new Error('Select a server first.');
    validateRequest(value, this.active.token);
    if (this.requests.size >= 16 || this.requests.has(value.id)) throw new Error('Too many requests or duplicate request ID.');
    const controller = new AbortController(); this.requests.set(value.id, controller);
    if (!['GET', 'HEAD'].includes(value.method)) this.mutations.add(value.id);
    const timer = setTimeout(() => controller.abort(), value.timeout);
    try {
    const headers = { ...value.headers, ...(this.active.ownerKey ? { 'X-Vaultor-Owner': this.active.ownerKey } : {}) }; let body;
    if (value.body?.kind === 'text') body = value.body.value;
    if (value.body?.kind === 'multipart') {
      for (const key of Object.keys(headers)) if (key.toLowerCase() === 'content-type') delete headers[key];
      if (value.body.parts.some(part => part.fileId)) {
        if (!this.files) throw new Error('Native file imports are unavailable.');
        const streamed = await this.files.multipart(value.body.parts, value.token); body = streamed.body; headers['Content-Type'] = streamed.contentType;
      } else {
        body = new FormData();
        for (const part of value.body.parts) body.append(part.name, typeof part.value === 'string' ? part.value : new Blob([part.value], { type: part.type }), ...(typeof part.value === 'string' ? [] : [part.filename]));
      }
      if (!value.body.parts.some(part => part.fileId)) for (const key of Object.keys(headers)) if (key.toLowerCase() === 'content-type') delete headers[key];
    }
      const response = await fetch(loopbackAddress(this.active.profile.address) + '/api' + value.path, { method: value.method, headers, body, ...(value.body?.parts?.some(part => part.fileId) ? { duplex: 'half' } : {}), signal: controller.signal, redirect: 'error' });
      return await boundedResponse(response);
    } finally { clearTimeout(timer); this.requests.delete(value.id); this.mutations.delete(value.id); }
  }
}
