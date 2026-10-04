import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm, stat, readdir } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { Readable } from 'node:stream';
import { connectionFetch } from './network.mjs';

export const FILE_LIMIT = 512 * 1024 * 1024;
const safeName = value => { if (typeof value !== 'string' || !value || value.length > 500) throw new Error('Invalid filename.'); return basename(value.replaceAll('\\', '/')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'); };
export function fileApiPath(path) { if (typeof path !== 'string' || !/^\/(?:exports\/[\w-]+\/download|resources\/[\w-]+\/(?:raw|download)|openapi\.json)$/.test(path)) throw new Error('Invalid file endpoint.'); return path; }
const openable = name => /\.(pdf|png|jpe?g|gif|webp|txt|md|csv|tsv|docx|xlsx|pptx|mp3|mp4)$/i.test(name);
export class NativeFiles {
  constructor({ directory, dialogs, owner, openPath, limit = FILE_LIMIT }) { Object.assign(this, { directory, dialogs, owner, openPath, limit }); this.picked = new Map(); this.saves = new Map(); this.previews = new Map(); this.active = new Set(); this.jobs = new Map(); this.pendingCache = new Map(); this.dialogPending=false; }
  connection(token) { const current = this.owner(); if (!current || token !== current.token) throw new Error('Connection changed. Retry from the current workspace.'); return current; }
  async cleanup() {
    await mkdir(this.directory, { recursive: true });
    for (const name of await readdir(this.directory)) if (/^[\w-]+\.[\w]+$/.test(name)) { const path = join(this.directory, name); if ((await stat(path)).mtimeMs < Date.now() - 86400000) await rm(path, { force: true }); }
  }
  async dialog(kind, options) {
    if(this.dialogPending) throw new Error('Close the current file dialog first.');
    this.dialogPending=true;try{return await this.dialogs[kind](options);}finally{this.dialogPending=false;}
  }
  async pick({ token, accept = '', multiple = false }) {
    this.connection(token);
    if (typeof accept !== 'string' || accept.length > 500 || typeof multiple !== 'boolean') throw new Error('Invalid file picker.');
    const extensions = accept.split(',').map(s => s.trim()).filter(s => /^\.[a-z0-9]+$/i.test(s)).map(s => s.slice(1));
    const result = await this.dialog('open', { properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'], ...(extensions.length ? { filters: [{ name: 'Supported files', extensions }, { name: 'All files', extensions: ['*'] }] } : {}) });
    if (result.canceled) return []; this.connection(token);
    if (result.filePaths.length > 50) throw new Error('Select at most 50 files at once.');
    for(const [id,file] of this.picked) if(file.created<Date.now()-3600000) this.picked.delete(id);
    if(this.picked.size+result.filePaths.length>200) throw new Error('Too many retained file selections. Reconnect before choosing more files.');
    const descriptors = [];
    for (const path of result.filePaths) {
      const info = await stat(path); if (!info.isFile() || info.size > this.limit) throw new Error('Selected file exceeds the desktop 512 MiB limit or is not a regular file.');
      const id = randomUUID(), name = basename(path);
      this.picked.set(id, { path, token, size: info.size, modified: info.mtimeMs, created:Date.now() });
      descriptors.push({ id, name, size: info.size, lastModified: info.mtimeMs });
    }
    return descriptors;
  }
  async selected(id, token) {
    this.connection(token); const file = this.picked.get(id);
    if (!file || file.token !== token) throw new Error('File selection expired. Choose the file again.');
    const info = await stat(file.path); if (info.size !== file.size || info.mtimeMs !== file.modified) throw new Error('Selected file changed. Choose it again before importing.'); return file;
  }
  async read({ token, id, offset, length }) {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > 1024 * 1024) throw new Error('Invalid file read.');
    const file = await this.selected(id, token), handle = await open(file.path, 'r');
    try { const data = Buffer.alloc(Math.min(length, Math.max(0, file.size - offset))); const result = await handle.read(data, 0, data.length, offset); return new Uint8Array(data.subarray(0, result.bytesRead)); } finally { await handle.close(); }
  }
  async multipart(parts, token) {
    let size = 0; const items = [];
    for (const part of parts) { const file = part.fileId ? await this.selected(part.fileId, token) : undefined; size += file ? file.size : typeof part.value === 'string' ? Buffer.byteLength(part.value) : part.value.byteLength; items.push({ part, file }); }
    if (size > this.limit) throw new Error('Upload exceeds the desktop 512 MiB limit.');
    const boundary = 'vaultor-' + randomUUID();
    const quoted = value => String(value).replace(/[\r\n"]/g, '_');
    async function* bytes() {
      for (const { part, file } of items) {
        yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${quoted(part.name)}"${typeof part.value === 'string' && !file ? '' : `; filename="${quoted(part.filename)}"`}\r\n${typeof part.value === 'string' && !file ? '' : `Content-Type: ${quoted(part.type || 'application/octet-stream')}\r\n`}\r\n`);
        if (file) yield* createReadStream(file.path); else yield typeof part.value === 'string' ? Buffer.from(part.value) : part.value;
        yield Buffer.from('\r\n');
      }
      yield Buffer.from(`--${boundary}--\r\n`);
    }
    return { body: Readable.from(bytes()), contentType: 'multipart/form-data; boundary=' + boundary };
  }
  async begin({ token, filename }) {
    this.connection(token);
    if (this.active.size || this.saves.size) throw new Error('Finish the current file operation first.');
    const result = await this.dialog('save', { defaultPath: safeName(filename) });
    if (result.canceled || !result.filePath) return { outcome: 'cancelled' }; this.connection(token);
    const id = randomUUID(), target = result.filePath, temp = target + '.vaultor-' + id + '.part';
    const handle = await open(temp, 'wx', 0o600); this.saves.set(id, { handle, target, temp, token, bytes: 0 }); return { id };
  }
  async chunk({ token, id, data }) {
    this.connection(token); const save = this.saves.get(id);
    if (!save || save.token !== token || !(data instanceof Uint8Array) || data.byteLength > 1024 * 1024) throw new Error('Invalid save chunk.');
    save.bytes += data.byteLength; if (save.bytes > this.limit) throw new Error('File exceeds the desktop 512 MiB limit.');
    let offset = 0; while (offset < data.byteLength) { const { bytesWritten } = await save.handle.write(data, offset, data.byteLength - offset); if (!bytesWritten) throw new Error('Disk write failed.'); offset += bytesWritten; }
  }
  async finish({ token, id }) {
    this.connection(token); const save = this.saves.get(id); if (!save || save.token !== token) throw new Error('Save expired.');
    try { await save.handle.sync(); await save.handle.close(); await rename(save.temp, save.target); return 'saved'; }
    finally { this.saves.delete(id); await save.handle.close().catch(() => {}); await rm(save.temp, { force: true }).catch(() => {}); }
  }
  async cancel({ token, id }) { this.connection(token); const save = this.saves.get(id); if (save?.token === token) { this.saves.delete(id); await save.handle.close(); await rm(save.temp, { force: true }); } }
  async response(path, token, signal) {
    const current = this.connection(token); fileApiPath(path);
    const response = await connectionFetch(current, path, { signal, headers: { 'X-Request-ID': randomUUID() } });
    if (!response.ok) { const reader = response.body?.getReader(); let message = ''; try { const part = await reader?.read(); if (part) message = new TextDecoder().decode(part.value.subarray(0, 65536)); } finally { await reader?.cancel(); } let detail; try { detail = JSON.parse(message).detail; } catch {} throw new Error((detail || `File request failed (${response.status})`) + ' · ' + (response.headers.get('x-request-id') ?? '')); }
    if (Number(response.headers.get('content-length')) > this.limit) { await response.body?.cancel(); throw new Error('File exceeds the desktop 512 MiB limit.'); } return response;
  }
  async download({ token, path, filename, mode = 'save', requestId }) {
    if (!['save', 'open', 'preview'].includes(mode)) throw new Error('Invalid file action.'); fileApiPath(path); this.connection(token); filename = safeName(filename);
    if(this.dialogPending || this.saves.size || (mode !== 'preview' && this.active.size) || this.active.size>=4)throw new Error('Finish the current file operation first.');
    if(requestId !== undefined && (typeof requestId !== 'string' || !/^[\w-]{1,80}$/.test(requestId) || this.jobs.has(requestId)))throw new Error('Invalid file request ID.');
    if (mode === 'open' && !openable(filename)) throw new Error('This file type cannot be opened automatically. Save it and choose an application yourself.');
    let id, destination;
    if (mode === 'save') { const result = await this.begin({ token, filename }); if (result.outcome) return { outcome: result.outcome }; id = result.id; }
    else { if (this.previews.size >= 20) throw new Error('Close some file previews before opening another.'); await mkdir(this.directory, { recursive: true }); id = randomUUID(); destination = join(this.directory, id + (extname(filename) || '.bin')); }
    const controller = new AbortController(); this.active.add(controller);if(requestId)this.jobs.set(requestId,{controller,token});if(destination)this.pendingCache.set(id,{path:destination,size:0});
    try {
      const response = await this.response(path, token, controller.signal); let size = 0;const limit=this.limit;
      let cached=0;if(mode!=='save')for(const name of await readdir(this.directory)){const path=join(this.directory,name);if(/^[\w-]+\.[\w]+$/.test(name)&&![...this.pendingCache.values()].some(job=>job.path===path))cached+=(await stat(path).catch(()=>({size:0}))).size;}
      const input = Readable.fromWeb(response.body);
      const pendingCache=this.pendingCache;
      async function* bounded() { for await (const data of input) { controller.signal.throwIfAborted();size += data.length;const reserved=[...pendingCache.entries()].reduce((total,[key,job])=>total+(key===id?0:job.size),0);if (size > limit || (mode!=='save' && size+cached+reserved>limit)) throw new Error('File or preview cache exceeds the desktop 512 MiB limit.');if(destination)pendingCache.get(id).size=size;yield data; } }
      if (mode === 'save') {
        for await (const data of bounded()) await this.chunk({ token, id, data });
        return { outcome: await this.finish({ token, id }) };
      }
      const handle = await open(destination, 'wx', 0o600);
      try { for await(const data of bounded()){let offset=0;while(offset<data.length){const written=await handle.write(data,offset,data.length-offset);if(!written.bytesWritten)throw new Error('Disk write failed.');offset+=written.bytesWritten;}} await handle.sync(); } finally { await handle.close(); }
      if (mode === 'open') { const error = await this.openPath(destination); if (error) throw new Error(error); return { outcome: 'opened' }; }
      this.previews.set(id, { path: destination, token, size, mime: response.headers.get('content-type') || 'application/octet-stream' }); return { url: 'vaultor-file://cache/' + id, id };
    } catch (e) { if (mode === 'save') await this.cancel({ token, id }).catch(() => {}); else await rm(destination, { force: true }).catch(() => {}); throw e; }
    finally { this.active.delete(controller);if(requestId)this.jobs.delete(requestId);if(!this.active.size)this.pendingCache.clear(); }
  }
  cancelRequest({token,requestId}) { const job=this.jobs.get(requestId);if(job?.token===token)job.controller.abort(); }
  async release({ token, id }) { const file = this.previews.get(id); if (file?.token === token) { this.previews.delete(id); await rm(file.path, { force: true }); } }
  async reset() { for (const job of this.active) job.abort(); for (const [id, save] of this.saves){this.saves.delete(id);await save.handle.close().catch(()=>{});await rm(save.temp,{force:true}).catch(()=>{});} for (const [id, file] of this.previews) await this.release({ token: file.token, id }).catch(() => {}); this.picked.clear(); }
  async serve(request) {
    const url = new URL(request.url), id = url.pathname.slice(1), file = this.previews.get(id);
    if (url.hostname !== 'cache' || request.method !== 'GET' || !file || file.token !== this.owner()?.token) return new Response('Not found', { status: 404 });
    const range = request.headers.get('range'); let start = 0, end = file.size - 1;
    if (range) { const match = /^bytes=(\d+)-(\d*)$/.exec(range); if (!match) return new Response(null, { status: 416 }); start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end; if (start > end || start >= file.size) return new Response(null, { status: 416 }); }
    // Chromium's built-in PDF extension owns its viewer policy (PDF JavaScript stays blocked).
    // A sandbox/default-src policy on the PDF response prevents that plugin from displaying it.
    const headers = { 'Content-Type': file.mime, 'Content-Length': String(Math.max(0, end - start + 1)), 'Accept-Ranges': 'bytes', ...(file.mime==='application/pdf' ? {} : {'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"}) };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${file.size}`;
    return new Response(file.size ? Readable.toWeb(createReadStream(file.path, { start, end })) : null, { status: range ? 206 : 200, headers });
  }
}
