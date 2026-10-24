import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rename, rm, readdir, symlink, link, open } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { CaptureStore, DraftJournal, snapshot, sha, conventionalSave, confined, compareThreeWay } from './filesystem.mjs';

const scratch = fileURLToPath(new URL('./scratch/', import.meta.url));
async function setup(t) {
  await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(join(scratch, 'p3-')), root = join(dir, 'source'), journal = join(dir, 'journal');
  await mkdir(root); await mkdir(journal); const path = join(root, 'doc.md'); await writeFile(path, 'Base document\n');
  t.after(async () => {
    const absolute = resolve(dir);
    if (!absolute.startsWith(resolve(scratch) + sep)) throw new Error('Refuse cleanup outside disposable scratch');
    await rm(absolute, { recursive: true, force: true });
  });
  return { dir, root, journal, path, store: new CaptureStore(root, journal), base: await snapshot(path) };
}
function external(path, value) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[1],process.argv[2]);", path, value], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
}

test('P3 SHA-256 content revision detects same-size external edit', async t => {
  const f = await setup(t); external(f.path, 'Disk document\n');
  assert.notEqual((await snapshot(f.path)).sha256, f.base.sha256);
  const r = await f.store.save('doc.md', f.base, Buffer.from('Local\n'));
  assert.equal(r.state, 'CONFLICT'); assert.equal(await readFile(f.path, 'utf8'), 'Disk document\n');
  assert.equal((await f.store.recover(r.id)).action, 'KEEP_CURRENT_REVIEW_DRAFT');
});
test('P3 negative control reproduces lost disk edit between hash check and rename', async t => {
  const f = await setup(t);
  await conventionalSave(f.path, f.base.bytes, Buffer.from('Local\n'), () => external(f.path, 'Intervening disk edit\n'));
  assert.equal(await readFile(f.path, 'utf8'), 'Local\n');
  assert(!(await readFile(f.path)).includes(Buffer.from('Intervening')));
});
test('P3 capture/recheck preserves intervening external write and retains local draft', async t => {
  const f = await setup(t);
  const r = await f.store.save('doc.md', f.base, Buffer.from('Local\n'), async step => {
    if (step === 'staged') external(f.path, 'Intervening disk edit\n');
  });
  assert.equal(r.state, 'CONFLICT_CAPTURED'); assert.equal(await readFile(f.path, 'utf8'), 'Intervening disk edit\n');
  assert.equal(await readFile(join(r.op, 'captured.md'), 'utf8'), 'Intervening disk edit\n');
  assert.equal(Buffer.from(r.local, 'base64').toString(), 'Local\n');
});
test('P3 external creation during capture gap is never overwritten', async t => {
  const f = await setup(t);
  const r = await f.store.save('doc.md', f.base, Buffer.from('Local\n'), async step => {
    if (step === 'before-publish') external(f.path, 'New disk entry\n');
  });
  assert.equal(r.state, 'CONFLICT_NEW_ENTRY'); assert.equal(await readFile(f.path, 'utf8'), 'New disk entry\n');
  assert.deepEqual(await readFile(join(r.op, 'captured.md')), f.base.bytes);
});
test('P3 two successive successful saves preserve independent preimages', async t => {
  const f = await setup(t);
  const a = await f.store.save('doc.md', f.base, Buffer.from('Local one\n'));
  assert.equal(a.state, 'COMMITTED');
  const b = await f.store.save('doc.md', await snapshot(f.path), Buffer.from('Local two\n'));
  assert.equal(b.state, 'COMMITTED'); assert.equal(await readFile(f.path, 'utf8'), 'Local two\n');
  assert.equal(await readFile(join(a.op, 'captured.md'), 'utf8'), 'Base document\n');
  assert.equal(await readFile(join(b.op, 'captured.md'), 'utf8'), 'Local one\n');
});
test('P3 identical-byte replacement still changes file identity and requires review', async t => {
  const f = await setup(t), replacement = join(f.root, 'git.tmp'); await writeFile(replacement, f.base.bytes); await rename(replacement, f.path);
  assert.equal((await snapshot(f.path)).sha256, f.base.sha256);
  assert.equal((await f.store.save('doc.md', f.base, Buffer.from('Local\n'))).state, 'CONFLICT');
});
for (const action of ['delete', 'rename']) test('P3 source ' + action + ' retains durable local/base journal', async t => {
  const f = await setup(t);
  if (action === 'delete') await rm(f.path); else await rename(f.path, join(f.root, 'renamed.md'));
  await assert.rejects(f.store.save('doc.md', f.base, Buffer.from('Local\n')), { code: 'ENOENT' });
  const files = await f.store.journals(); assert.equal(files.length, 1);
  const recovered = await f.store.recover(files[0].slice(0, -5));
  assert.equal(recovered.action, 'SOURCE_MISSING_KEEP_DRAFT'); assert.equal(Buffer.from(recovered.record.local, 'base64').toString(), 'Local\n');
  await assert.rejects(readFile(f.path), { code: 'ENOENT' });
});
for (const boundary of ['prepared', 'staged', 'captured-before-journal', 'captured', 'published-before-journal']) test('P3 real worker exit recovery: ' + boundary, async t => {
  const f = await setup(t), worker = fileURLToPath(new URL('./crash-worker.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [worker, f.root, f.journal, boundary], { encoding: 'utf8', windowsHide: true });
  assert.equal(child.status, 73, child.stderr);
  const names = await f.store.journals(); assert.equal(names.length, 1);
  const recovered = await f.store.recover(names[0].slice(0, -5));
  const expected = boundary === 'published-before-journal' ? 'ALREADY_PUBLISHED' : boundary.startsWith('captured') ? 'CAPTURE_AVAILABLE_REVIEW' : 'KEEP_CURRENT_REVIEW_DRAFT';
  assert.equal(recovered.action, expected);
  if (boundary.startsWith('captured')) {
    await assert.rejects(readFile(f.path), { code: 'ENOENT' });
    assert.equal((await f.store.recover(recovered.record.id, { restoreMissing: true })).action, 'RESTORED_CAPTURE_KEEP_DRAFT');
  }
  assert.equal(await readFile(f.path, 'utf8'), boundary === 'published-before-journal' ? 'Vaultor local\n' : 'Base document\n');
  assert.equal(Buffer.from(recovered.record.local, 'base64').toString(), 'Vaultor local\n');
});
test('P3 journal write/storage refusal prevents source mutation', async t => {
  const f = await setup(t), invalid = join(f.dir, 'file-instead-of-directory'); await writeFile(invalid, 'x');
  await assert.rejects(new CaptureStore(f.root, invalid).save('doc.md', f.base, Buffer.from('Local\n')));
  assert.deepEqual(await readFile(f.path), f.base.bytes);
});
test('P3 injected permission failure after capture recovers without overwriting', async t => {
  const f = await setup(t);
  await assert.rejects(f.store.save('doc.md', f.base, Buffer.from('Local\n'), async step => {
    if (step === 'before-publish') throw Object.assign(new Error('Injected access denied'), { code: 'EACCES' });
  }), { code: 'EACCES' });
  const [name] = await f.store.journals(); assert.equal((await f.store.recover(name.slice(0, -5))).action, 'CAPTURE_AVAILABLE_REVIEW');
  await f.store.recover(name.slice(0, -5), { restoreMissing: true });
  assert.deepEqual(await readFile(f.path), f.base.bytes);
});
test('P3 corrupt journal fails closed and source remains intact', async t => {
  const f = await setup(t), r = await f.store.save('doc.md', f.base, Buffer.from('Local\n'));
  r.local = Buffer.from('damaged').toString('base64'); await writeFile(join(f.journal, r.id + '.json'), JSON.stringify(r));
  await assert.rejects(f.store.recover(r.id), /JOURNAL_DAMAGED/); assert.equal(await readFile(f.path, 'utf8'), 'Local\n');
});
test('P3 ordinary watcher events are invalidations and hashes identify self/external state', async t => {
  const f = await setup(t), events = [], watcher = watch(f.root, (type, name) => events.push({ type, name: String(name) }));
  t.after(() => watcher.close());
  const r = await f.store.save('doc.md', f.base, Buffer.from('Local\n'));
  await setTimeout(100); assert(events.length > 0); assert.equal(sha(await readFile(f.path)), r.localHash);
  external(f.path, 'External after self write\n'); await setTimeout(100);
  assert.notEqual(sha(await readFile(f.path)), r.localHash);
  // Do not ignore a time window of watcher events: reconcile the latest bytes.
});
test('P3 rapid Git-style replacements reconcile latest bytes rather than event count', async t => {
  const f = await setup(t);
  for (let i = 0; i < 20; i++) { const temp = join(f.root, 'git-' + i); await writeFile(temp, 'Revision ' + i); await rename(temp, f.path); }
  assert.equal((await snapshot(f.path)).bytes.toString(), 'Revision 19');
  assert.equal((await f.store.save('doc.md', f.base, Buffer.from('Local\n'))).state, 'CONFLICT');
});
test('P3 path traversal, absolute paths and Windows alternate streams rejected', async t => {
  const f = await setup(t);
  for (const name of ['../outside.md', 'nested/../../outside', 'C:/outside', '/outside', 'doc.md:stream', 'nested\\doc.md']) await assert.rejects(confined(f.root, name), /SOURCE_/);
});
test('P3 real directory junction/symlink escape is rejected', async t => {
  const f = await setup(t), outside = join(f.dir, 'outside'); await mkdir(outside); await writeFile(join(outside, 'doc.md'), 'outside');
  await symlink(outside, join(f.root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(confined(f.root, 'escape/doc.md'), /SOURCE_LINK/);
  assert.equal(await readFile(join(outside, 'doc.md'), 'utf8'), 'outside');
});
test('P3 multiple hardlink authority rejected', async t => {
  const f = await setup(t); await link(f.path, join(f.root, 'alias.md'));
  await assert.rejects(snapshot(f.path), /SINGLE_LINK/);
});
test('P3 external open handle can mutate retained captured inode: retain and reconcile it', async t => {
  const f = await setup(t), handle = await open(f.path, 'r+'); t.after(() => handle.close());
  const r = await f.store.save('doc.md', f.base, Buffer.from('Local\n'), async step => {
    if (step === 'before-publish') { await handle.write(Buffer.from('Late external\n'), 0, 14, 0); await handle.sync(); }
  });
  assert.equal(r.state, 'COMMITTED'); assert.equal(await readFile(f.path, 'utf8'), 'Local\n');
  assert((await readFile(join(r.op, 'captured.md'), 'utf8')).startsWith('Late external'));
});
test('P3 three-way compare: disjoint lines yield reviewed merge, overlap stays conflict', () => {
  const b = Buffer.from('one\n\nthree\n\nfive\n'), l = Buffer.from('ONE\n\nthree\n\nfive\n'), d = Buffer.from('one\n\nthree\n\nFIVE\n');
  assert.equal(compareThreeWay(b, l, d).kind, 'MERGE_REVIEW');
  assert.equal(compareThreeWay(b, l, d).bytes.toString(), 'ONE\n\nthree\n\nFIVE\n');
  assert.equal(compareThreeWay(b, l, Buffer.from('OTHER\n\nthree\n\nfive\n')).kind, 'CONFLICT');
  assert.equal(compareThreeWay(b, l, b).kind, 'LOCAL'); assert.equal(compareThreeWay(b, b, d).kind, 'DISK');
});
for (const mode of ['race', 'locked']) test('P3 Windows ReplaceFileW native backup / sharing behavior: ' + mode, { skip: process.platform !== 'win32' }, async t => {
  const f = await setup(t), script = fileURLToPath(new URL('./replacefile-proof.ps1', import.meta.url));
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script, '-Root', f.root, '-Mode', mode], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr); const output = JSON.parse(result.stdout.trim());
  if (mode === 'race') {
    assert.equal(output.success, true);
    assert.equal(await readFile(f.path, 'utf8'), 'Native local\n');
    assert.equal(await readFile(join(f.root, 'native-backup.md'), 'utf8'), 'Intervening native disk\n');
    assert.notEqual(sha(await readFile(join(f.root, 'native-backup.md'))), f.base.sha256);
  } else {
    assert.equal(output.success, false); assert.equal(output.error, 32); assert.equal(output.backupExists, false);
    assert.deepEqual(await readFile(f.path), f.base.bytes);
    assert.equal(await readFile(join(f.root, 'native-stage.md'), 'utf8'), 'Native local\n');
  }
});
test('P3 durable pre-Save drafts recover unsupported editor JSON after reopening journal', async t => {
  const f = await setup(t), directory = join(f.dir, 'drafts'), journal = new DraftJournal(directory);
  await journal.put('document', 1, f.base.bytes, Buffer.from('Validated local\n'), { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Unsafe draft' }] }] });
  const recovered = await new DraftJournal(directory).latest('document');
  assert.equal(recovered.editorDraft.content[0].content[0].text, 'Unsafe draft');
  assert.equal(Buffer.from(recovered.base, 'base64').toString(), 'Base document\n');
  assert.deepEqual(await readFile(f.path), f.base.bytes);
});
test('P3 exact-version acknowledgement cannot clear a newer durable draft', async t => {
  const f = await setup(t), journal = new DraftJournal(join(f.dir, 'drafts'));
  await journal.put('document', 1, f.base.bytes, Buffer.from('First\n'));
  await journal.put('document', 2, f.base.bytes, Buffer.from('Second\n'));
  await journal.acknowledge('document', 1); assert.equal((await journal.latest('document')).version, 2);
  await journal.acknowledge('document', 2); assert.equal(await journal.latest('document'), null);
});
test('P3 injected ENOSPC before staging retains source and recoverable journal', async t => {
  const f = await setup(t);
  await assert.rejects(f.store.save('doc.md', f.base, Buffer.from('Local\n'), async step => {
    if (step === 'prepared') throw Object.assign(new Error('Injected disk full'), { code: 'ENOSPC' });
  }), { code: 'ENOSPC' });
  assert.deepEqual(await readFile(f.path), f.base.bytes);
  const [name] = await f.store.journals(); assert.equal((await f.store.recover(name.slice(0, -5))).action, 'KEEP_CURRENT_REVIEW_DRAFT');
});
test('P3 external deletion after committed save is never resurrected by recovery', async t => {
  const f = await setup(t), r = await f.store.save('doc.md', f.base, Buffer.from('Local\n'));
  await rm(f.path);
  assert.equal((await f.store.recover(r.id)).action, 'CAPTURE_AVAILABLE_REVIEW');
  assert.equal((await f.store.recover(r.id, { restoreMissing: true })).action, 'CAPTURE_AVAILABLE_REVIEW');
  await assert.rejects(readFile(f.path), { code: 'ENOENT' });
});
test('P3 three-way merge refuses invalid UTF-8 rather than decoding replacement characters', () => {
  assert.throws(() => compareThreeWay(Buffer.from([128]), Buffer.from('local'), Buffer.from('disk')));
});
