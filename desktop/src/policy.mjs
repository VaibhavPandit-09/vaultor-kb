export const UI_ORIGIN = 'vaultor://app';
export const MAX_BYTES = 32 * 1024 * 1024;
export function apiPath(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('Invalid API path.');
  const decoded = decodeURIComponent(value);
  if (!/^\/[a-z0-9]/i.test(decoded) || /[\\#]/.test(decoded) || /(^|\/)\.\.?($|\/|\?)/.test(decoded)) throw new Error('Invalid API path.');
  return value;
}
export function loopbackAddress(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Connect only to a local HTTP server. Paired network connections are not available yet.');
  return url.origin;
}
export function externalAddress(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || value.length > 8192) throw new Error('Unsupported external link.');
  return url.href;
}
export function trustedSender(event, contents) {
  return Boolean(contents && event.sender === contents && event.senderFrame === contents.mainFrame && event.senderFrame.url === UI_ORIGIN + '/');
}
export function validateRequest(value, token) {
  if (!value || value.token !== token || typeof value.id !== 'string' || !/^[\w-]{1,80}$/.test(value.id)) throw new Error('Connection changed or request is invalid.');
  apiPath(value.path);
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(value.method)) throw new Error('Invalid request method.');
  if (!Number.isInteger(value.timeout) || value.timeout < 1 || value.timeout > 120000) throw new Error('Invalid request timeout.');
  if (!value.headers || typeof value.headers !== 'object' || Array.isArray(value.headers)) throw new Error('Invalid request headers.');
  for (const [key, item] of Object.entries(value.headers)) {
    if (!['content-type', 'if-match', 'x-request-id', 'x-vaultor-protocol', 'accept'].includes(key.toLowerCase()) || typeof item !== 'string' || item.length > 1000 || /[\r\n]/.test(item)) throw new Error('Invalid request header.');
  }
  if (value.body?.kind === 'text') {
    if (typeof value.body.value !== 'string' || Buffer.byteLength(value.body.value) > MAX_BYTES) throw new Error('Request exceeds the D2 32 MiB limit.');
  } else if (value.body?.kind === 'multipart') {
    if (!Array.isArray(value.body.parts) || value.body.parts.length > 50) throw new Error('Invalid multipart request.');
    let bytes = 0;
    for (const part of value.body.parts) {
      if (!part || typeof part.name !== 'string' || part.name.length > 200) throw new Error('Invalid multipart field.');
      if (typeof part.value === 'string') bytes += Buffer.byteLength(part.value);
      else if (part.fileId !== undefined) { if (typeof part.fileId !== 'string' || !/^[\w-]{1,80}$/.test(part.fileId) || typeof part.filename !== 'string' || part.filename.length > 500 || typeof part.type !== 'string' || part.type.length > 200) throw new Error('Invalid selected file.'); }
      else {
        if (!(part.value instanceof Uint8Array) || typeof part.filename !== 'string' || part.filename.length > 500 || typeof part.type !== 'string' || part.type.length > 200) throw new Error('Invalid multipart file.');
        bytes += part.value.byteLength;
      }
    }
    if (bytes > MAX_BYTES) throw new Error('Request exceeds the D2 32 MiB limit.');
  } else if (value.body !== undefined) throw new Error('Unsupported request body.');
  if (['GET', 'HEAD'].includes(value.method) && value.body !== undefined) throw new Error('Read requests cannot contain a body.');
}
