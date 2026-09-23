// Uses only the shared application API. Run against explicitly disposable storage.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.argv[2] ?? 'http://127.0.0.1:18080';
if (!process.argv.includes('--disposable')) throw new Error('Pass --disposable for a test workspace only.');
const requestId = 'file-import-' + Date.now();
async function call(method, path, body, expected = 200) {
  const response = await fetch(base + '/api' + path, { method, headers: { 'X-Request-ID': requestId }, body, signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, expected, await (!response.ok ? response.clone().text() : Promise.resolve(path)));
  assert.equal(response.headers.get('x-request-id'), requestId);
  return response;
}
const initial = (await (await call('GET', '/resources?size=1')).json()).totalItems;
const spec = await (await call('GET', '/openapi.json')).json();
assert.equal(spec.paths['/resources/imports/{id}'].put.operationId, 'importFileResource');
const doc = (type, text) => ({ type: 'doc', content: [{ type, content: [{ type: 'text', text }] }] });
function noteForm(content, title = 'Same import title') { const form = new FormData(); form.append('title', title); form.append('content', JSON.stringify(content)); return form; }
const noteId = randomUUID(); const markdown = doc('heading', 'Imported Markdown');
await call('PUT', '/resources/imports/' + noteId, noteForm(markdown));
// Simulate a lost response: retry exactly the same operation, including its ID.
await call('PUT', '/resources/imports/' + noteId, noteForm(markdown));
assert.deepEqual((await (await call('GET', '/resources/' + noteId)).json()).content, markdown);
const conflict = await call('PUT', '/resources/imports/' + noteId, noteForm(doc('paragraph', 'Different')), 409);
assert.equal((await conflict.json()).code, 'CONFLICT');
await call('PUT', '/resources/imports/' + randomUUID(), noteForm({ type: 'doc', content: [5] }), 400);
// Duplicate titles intentionally create separate notes, never overwrite.
await call('PUT', '/resources/imports/' + randomUUID(), noteForm(doc('paragraph', 'Plain text')));
await call('PUT', '/resources/imports/' + randomUUID(), noteForm(doc('codeBlock', 'const n = 1')));
const fileId = randomUUID();
const bytes = new Uint8Array([0, 255, 10, 99, 40]);
function fileForm() { const form = new FormData(); form.append('title', 'original.bin'); form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), 'original.bin'); return form; }
await call('PUT', '/resources/imports/' + fileId, fileForm());
await call('PUT', '/resources/imports/' + fileId, fileForm());
assert.deepEqual(new Uint8Array(await (await call('GET', '/resources/' + fileId + '/raw')).arrayBuffer()), bytes);
const linked = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'resourceLink', attrs: { resourceId: fileId, type: 'file', label: 'Original' } }] }] };
const linkedId = randomUUID(); await call('PUT', '/resources/imports/' + linkedId, noteForm(linked, 'Linked import'));
assert.equal((await (await call('GET', '/resources/' + fileId + '/backlinks')).json())[0].id, linkedId);
assert.equal((await (await call('GET', '/resources?size=1')).json()).totalItems, initial + 5);
assert.equal((await (await call('GET', '/diagnostics/integrity')).json()).healthy, true);
console.log(JSON.stringify({ result: 'PASS', requestId, checks: ['OpenAPI', 'multipart note creation', 'structured read-back', 'retry identity', 'payload conflict', 'malformed document rejection', 'same-title isolation', 'binary byte preservation', 'backlinks', 'integrity'] }, null, 2));
