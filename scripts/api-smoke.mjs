// Node 20+. Mutates only an explicitly acknowledged, initially empty test workspace.
import assert from 'node:assert/strict';
const base = process.argv[2] ?? 'http://127.0.0.1:18080';
if (!process.argv.includes('--disposable')) throw new Error('Pass --disposable only for an empty disposable workspace. This test performs replacement imports.');
const requestId = `smoke-${Date.now()}`;
async function request(method, path, body, raw = false) {
  const multipart = body instanceof FormData;
  const response = await fetch(base + '/api' + path, {
    method, headers: { 'X-Request-ID': requestId, ...(!multipart && body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.headers.get('x-request-id'), requestId);
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${await (!response.ok ? response.text() : Promise.resolve(''))}`);
  if (raw) return response;
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
async function finish(id) {
  for (let i = 0; i < 120; i++) {
    const operation = await request('GET', '/operations/' + id);
    if (operation.status === 'SUCCEEDED') return operation;
    assert.notEqual(operation.status, 'FAILED', operation.detail);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Operation timeout: ' + id);
}
const document = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const initial = await request('GET', '/resources?size=1');
assert.equal(initial.totalItems, 0, 'Refusing to modify a nonempty workspace');
const spec = await request('GET', '/openapi.json'); assert.equal(spec.openapi, '3.1.0');
const a = await request('POST', '/resources', { title: 'Smoke A', content: document('Original') });
const b = await request('POST', '/resources', { title: 'Smoke B', content: document('Target') });
const data = new FormData(); data.append('file', new Blob(['name,value\nhello,42\n'], { type: 'text/csv' }), 'sample.csv');
const file = await request('POST', '/resources/file', data);
const linked = { type: 'doc', content: [
  { type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Worker-Sharing Formula', marks: [{ type: 'bold' }] }] }] }] },
  { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'R × category remaining demand / total remaining demand' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Updated ' }, { type: 'resourceLink', attrs: { resourceId: b.id, label: b.title, type: 'note' } }] },
  { type: 'table', attrs: { sourceResourceId: file.id, sourceResourceTitle: file.title, sourceResourceType: 'file' }, content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '42' }] }] }] }] },
] };
await request('PUT', '/resources/' + a.id + '/note', { title: 'Smoke A edited', content: linked });
assert.deepEqual((await request('GET', '/resources/' + a.id)).content, linked);
assert.equal((await request('GET', '/resources/' + b.id + '/backlinks'))[0].id, a.id);
await request('POST', '/resources/' + a.id + '/tags/smoke');
const tag = (await request('GET', '/tags'))[0]; await request('PUT', '/tags/' + tag.id + '/color', { color: '#123456' });
const settings = await request('GET', '/settings'); settings.workspace.maxOpenNotes = 3; settings.local['smoke-device'] = { theme: 'light' };
await request('PUT', '/settings', settings);
assert.equal((await request('GET', '/settings')).workspace.maxOpenNotes, 3);
assert.equal((await request('GET', '/resources?size=1')).totalPages, 3);
assert.equal(await (await request('GET', '/resources/' + file.id + '/raw', undefined, true)).text(), 'name,value\nhello,42\n');
assert.equal((await request('GET', '/diagnostics/integrity')).healthy, true);
const operation = await request('POST', '/exports', { scope: 'workspace', format: 'zip' }); await finish(operation.id);
const zip = await (await request('GET', '/exports/' + operation.id + '/download', undefined, true)).blob();
async function preview() { const form = new FormData(); form.append('file', zip, 'workspace.zip'); return request('POST', '/imports/preview', form); }
const merged = await preview(); assert.equal(merged.files, 1); assert.equal(merged.notes, 2);
await request('POST', '/imports/' + merged.operation.id + '/commit', { mode: 'merge' }); await finish(merged.operation.id);
await request('POST', '/imports/' + merged.operation.id + '/commit', { mode: 'merge' });
assert.equal((await request('GET', '/resources')).totalItems, 6);
assert.equal((await request('GET', '/diagnostics/integrity')).healthy, true);
const replaced = await preview(); await request('POST', '/imports/' + replaced.operation.id + '/commit', { mode: 'replace', confirmation: 'replace' }); await finish(replaced.operation.id);
assert.equal((await request('GET', '/resources')).totalItems, 3);
assert.equal((await request('GET', '/settings')).local['smoke-device'].theme, 'light');
assert.deepEqual((await request('GET', '/resources/' + a.id)).content, linked);
assert.equal((await request('GET', '/diagnostics/integrity')).healthy, true);
const cancelled = await preview(); assert.equal((await request('POST', '/operations/' + cancelled.operation.id + '/cancel')).status, 'CANCELLED');
const bad = await fetch(base + '/api/resources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '', content: document('') }) });
assert.equal(bad.status, 400); assert.equal((await bad.json()).code, 'INVALID_REQUEST');
await request('POST', '/diagnostics/events', [{ id: requestId, action: 'smoke.completed', message: 'Agent API smoke passed', build: 'smoke' }]);
assert.ok((await request('GET', '/diagnostics/events')).some(e => e.id === requestId));
console.log(JSON.stringify({ result: 'PASS', base, requestId, resources: 3, checks: ['OpenAPI', 'request IDs', 'CRUD', 'structured notes', 'Notion list/code/table save round trip', 'backlinks', 'tags', 'settings', 'files', 'pagination', 'ZIP export', 'merge', 'idempotency', 'replace', 'cancel', 'integrity', 'problem details', 'diagnostics'] }, null, 2));
