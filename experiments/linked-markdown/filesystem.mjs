// Phase 3 disposable qualification harness. NOT a production filesystem adapter.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, link, lstat, realpath, readdir, unlink } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, dirname } from 'node:path';

export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino;
export async function flushed(path, bytes, flags = 'wx') {
  const handle = await open(path, flags, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
async function ownedJournal(path, record) {
  const temp = path + '.' + randomUUID();
  await flushed(temp, JSON.stringify(record, null, 2)); await rename(temp, path);
  // Windows directory fsync is not established by Node here. No power-loss claim.
}
export async function confined(root, name) {
  if (!name || isAbsolute(name) || /[:\\\x00]/.test(name) || name.split('/').some(x => !x || x === '.' || x === '..')) throw new Error('SOURCE_PATH');
  const canonical = await realpath(root), path = resolve(canonical, name), rel = relative(canonical, path);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('SOURCE_ESCAPE');
  let current = canonical;
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink()) throw new Error('SOURCE_LINK');
  for (const segment of name.split('/')) {
    current = join(current, segment);
    try { const info = await lstat(current); if (info.isSymbolicLink()) throw new Error('SOURCE_LINK'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return path;
}
export async function snapshot(path) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error('SOURCE_NOT_REGULAR_SINGLE_LINK');
  const h = await open(path, 'r');
  try {
    const info = await h.stat(), bytes = await h.readFile(), after = await lstat(path);
    if (!sameIdentity(before, info) || !sameIdentity(info, after) || info.size !== bytes.length || info.mtimeMs !== after.mtimeMs) throw new Error('SOURCE_UNSTABLE');
    return { bytes, sha256: sha(bytes), identity: { dev: info.dev, ino: info.ino }, mode: info.mode };
  } finally { await h.close(); }
}

// Negative control: precheck + ordinary replacement is NOT compare-and-swap.
export async function conventionalSave(path, base, local, afterCheck = async () => {}) {
  if (sha(await readFile(path)) !== sha(base)) throw new Error('CONFLICT');
  const temp = join(dirname(path), '.' + randomUUID() + '.tmp');
  await flushed(temp, local); await afterCheck(); await rename(temp, path);
}

export class CaptureStore {
  constructor(root, journalRoot) { this.root = root; this.journalRoot = journalRoot; }
  async save(name, base, local, hook = async () => {}) {
    const path = await confined(this.root, name), id = randomUUID();
    await mkdir(this.journalRoot, { recursive: true });
    // Same-volume hidden staging is intentionally visible to source tools.
    const op = join(this.root, '.vaultor-proof-' + id); await mkdir(op);
    const journal = join(this.journalRoot, id + '.json'), captured = join(op, 'captured.md'), staged = join(op, 'staged.md');
    const record = { version: 1, id, name, state: 'PREPARED', base: base.bytes.toString('base64'), baseHash: base.sha256,
      baseIdentity: base.identity, local: Buffer.from(local).toString('base64'), localHash: sha(local), op };
    await ownedJournal(journal, record);
    const persist = async state => { record.state = state; await ownedJournal(journal, record); };
    await hook('prepared', record);
    const current = await snapshot(path);
    if (current.sha256 !== base.sha256 || !sameIdentity(current.identity, base.identity)) { await persist('CONFLICT'); return record; }
    await flushed(staged, local);
    await hook('staged', record);
    // Claim the actual latest directory entry rather than overwriting it.
    // Production requires handle-relative/no-reparse operations; this Node path walk is NOT race-proof confinement.
    await confined(this.root, name);
    await rename(path, captured);
    await hook('captured-before-journal', record);
    await persist('CAPTURED');
    await hook('captured', record);
    const claimed = await snapshot(captured);
    record.capturedHash = claimed.sha256;
    if (claimed.sha256 !== base.sha256 || !sameIdentity(claimed.identity, base.identity)) {
      await persist('CONFLICT_CAPTURED');
      try { await link(captured, path); record.restored = true; } catch (e) { if (e.code !== 'EEXIST') throw e; }
      await ownedJournal(journal, record); return record;
    }
    await hook('before-publish', record);
    try { await link(staged, path); }
    catch (e) { if (e.code !== 'EEXIST') throw e; await persist('CONFLICT_NEW_ENTRY'); return record; }
    await hook('published-before-journal', record);
    const final = await readFile(path);
    await persist(sha(final) === record.localHash ? 'COMMITTED' : 'EXTERNAL_AFTER_PUBLICATION');
    if (record.state === 'COMMITTED') await unlink(staged);
    // Keep all preimages/journal/local bytes for explicit recovery; no silent cleanup.
    return record;
  }
  async recover(id, { restoreMissing = false } = {}) {
    if (!/^[\da-f-]{36}$/.test(id)) throw new Error('JOURNAL_ID');
    const path = join(this.journalRoot, id + '.json'), record = JSON.parse(await readFile(path, 'utf8'));
    if (record.id !== id || sha(Buffer.from(record.base, 'base64')) !== record.baseHash || sha(Buffer.from(record.local, 'base64')) !== record.localHash) throw new Error('JOURNAL_DAMAGED');
    if (resolve(record.op) !== resolve(this.root, '.vaultor-proof-' + id)) throw new Error('JOURNAL_PATH');
    const target = await confined(this.root, record.name), captured = join(record.op, 'captured.md');
    // State may lag disk. Reconcile files rather than trusting journal status.
    let current; try { current = await readFile(target); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (current) return { record, action: sha(current) === record.localHash ? 'ALREADY_PUBLISHED' : 'KEEP_CURRENT_REVIEW_DRAFT', current };
    try {
      const info = await lstat(captured);
      if (info.isSymbolicLink() || !info.isFile()) throw new Error('CAPTURE_NOT_REGULAR');
      // Missing can mean an unrelated external delete/rename, even after a crash.
      // Never resurrect the path automatically; caller must explicitly review.
      if (!restoreMissing || record.state === 'COMMITTED') return { record, action: 'CAPTURE_AVAILABLE_REVIEW' };
      await link(captured, target);
      return { record, action: 'RESTORED_CAPTURE_KEEP_DRAFT', current: await readFile(target) };
    } catch (e) { if (e.code === 'ENOENT') return { record, action: 'SOURCE_MISSING_KEEP_DRAFT' }; throw e; }
  }
  async journals() { return (await readdir(this.journalRoot)).filter(n => n.endsWith('.json')); }
}

// Conservative real three-way comparison. One contiguous line hunk per side;
// same-line, ambiguous insertion adjacency and overlapping hunks require review.
const lines = b => b.toString('utf8').match(/[^\n]*\n|[^\n]+$/g) ?? [];
function hunk(base, changed) {
  let start = 0, end = base.length, to = changed.length;
  while (start < end && start < to && base[start] === changed[start]) start++;
  while (end > start && to > start && base[end - 1] === changed[to - 1]) { end--; to--; }
  return { start, end, lines: changed.slice(start, to) };
}
export function compareThreeWay(base, local, disk) {
  for (const bytes of [base, local, disk]) new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (base.equals(disk)) return { kind: 'LOCAL', bytes: local };
  if (base.equals(local) || disk.equals(local)) return { kind: 'DISK', bytes: disk };
  const b = lines(base), a = hunk(b, lines(local)), c = hunk(b, lines(disk));
  if (!(a.end < c.start || c.end < a.start)) return { kind: 'CONFLICT' };
  const out = [...b];
  for (const p of [a, c].sort((x, y) => y.start - x.start)) out.splice(p.start, p.end - p.start, ...p.lines);
  return { kind: 'MERGE_REVIEW', bytes: Buffer.from(out.join('')) };
}

// Journals edits before Save, including unsupported PM drafts. Immutable versions
// ensure acknowledgement of an older save cannot remove a newer draft.
export class DraftJournal {
  constructor(directory) { this.directory = directory; }
  async put(id, version, base, local, editorDraft = null) {
    if (!/^[\w-]+$/.test(id) || !Number.isSafeInteger(version) || version < 1) throw new Error('DRAFT_ID_VERSION');
    await mkdir(this.directory, { recursive: true });
    const record = { id, version, base: base.toString('base64'), baseHash: sha(base), local: local.toString('base64'), localHash: sha(local), editorDraft };
    await flushed(join(this.directory, id + '.' + version + '.draft.json'), JSON.stringify(record));
  }
  async acknowledge(id, version) {
    if (!/^[\w-]+$/.test(id) || !Number.isSafeInteger(version) || version < 1) throw new Error('DRAFT_ID_VERSION');
    const previous = await this.ack(id);
    await ownedJournal(join(this.directory, id + '.ack.json'), { version: Math.max(previous, version) });
  }
  async ack(id) {
    try { return JSON.parse(await readFile(join(this.directory, id + '.ack.json'), 'utf8')).version; }
    catch (e) { if (e.code === 'ENOENT') return 0; throw e; }
  }
  async latest(id) {
    if (!/^[\w-]+$/.test(id)) throw new Error('DRAFT_ID_VERSION');
    const names = (await readdir(this.directory)).filter(n => n.startsWith(id + '.') && n.endsWith('.draft.json'));
    const records = await Promise.all(names.map(n => readFile(join(this.directory, n), 'utf8').then(JSON.parse)));
    for (const r of records) if (r.id !== id || sha(Buffer.from(r.base, 'base64')) !== r.baseHash || sha(Buffer.from(r.local, 'base64')) !== r.localHash) throw new Error('DRAFT_DAMAGED');
    const ack = await this.ack(id);
    return records.filter(r => r.version > ack).sort((a, b) => b.version - a.version)[0] ?? null;
  }
}
