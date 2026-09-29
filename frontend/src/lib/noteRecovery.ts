import type { Resource } from '../types';
import type { Identity, LocalStore, NoteDraft, RecoveryRecord } from './sessionStore';
import { sameWorkspace } from './sessionStore';
export class NoteRecovery {
  pending = 0;
  identity?: Identity;
  tabId = '';
  private observed = new Map<string, string>();
  private revisions = new Map<string, string>();
  private records = new Map<string, RecoveryRecord>();
  private chain = Promise.resolve();
  private store: LocalStore; private changed: () => void; private storageError: (message: string) => void; private conflict: (record: RecoveryRecord) => void;
  constructor(store: LocalStore, changed: () => void, storageError: (message: string) => void, conflict: (record: RecoveryRecord) => void) { this.store=store;this.changed=changed;this.storageError=storageError;this.conflict=conflict; }
  configure(identity: Identity, tabId: string) { this.identity = identity; this.tabId = tabId; this.revisions.clear(); this.observed.clear(); this.records.clear(); }
  observe(resource: Resource, authoritative = false) { if (resource.revision && !this.records.has(resource.id) && (authoritative || this.observed.get(resource.id)!==resource.revision)) {this.revisions.set(resource.id, resource.revision);this.observed.set(resource.id,resource.revision);} }
  private persist(operation: () => Promise<void>) {
    this.pending++; this.changed();
    this.chain = this.chain.then(operation).catch(() => this.storageError('Draft recovery storage failed. Keep this tab open until changes are saved.')).finally(() => { this.pending--; this.changed(); });
    return this.chain;
  }
  queued(id: string, value: NoteDraft, version: number) {
    if (!this.identity) { this.storageError('Workspace identity is unavailable. Draft recovery is not ready.'); return; }
    const previous = this.records.get(id);
    const record: RecoveryRecord = { key: `draft:${this.identity.id}:${this.identity.generation}:${this.tabId}:${id}`, identity: this.identity, tabId: this.tabId, noteId: id, value, version, editId: crypto.randomUUID(), baseRevision: previous?.baseRevision ?? this.revisions.get(id) ?? '', copyId: crypto.randomUUID() };
    this.records.set(id, record); void this.persist(() => this.store.put(record.key, record));
  }
  async write(id: string, value: NoteDraft, version: number, update: (revision: string) => Promise<Resource>) {
    const record = this.records.get(id), revision = record?.baseRevision ?? this.revisions.get(id);
    if (!revision) throw new Error('Reload this note before saving: its server revision is unavailable. Your draft is retained.');
    try {
      const saved = await update(revision);
      if (!saved.revision) throw new Error('Save response did not include a revision.');
      if(!this.identity || !record || !sameWorkspace(record.identity,this.identity))return saved;
      this.revisions.set(id, saved.revision);
      const latest = this.records.get(id);
      if (latest && sameWorkspace(latest.identity, record.identity)) {
        if (latest.version === version && latest.value === value) {
          this.records.delete(id); await this.persist(() => this.store.delete(latest.key));
        } else {
          const rebased = { ...latest, baseRevision: saved.revision };
          this.records.set(id, rebased); await this.persist(() => this.store.put(rebased.key, rebased));
        }
      }
      return saved;
    } catch (error) {
      if ((error as { response?: { status?: number } }).response?.status === 412) {
        const latest = this.records.get(id); if (latest) this.conflict(latest);
      }
      throw error;
    }
  }
  async all(identity: Identity) {
    await this.chain;const records=await this.store.values<RecoveryRecord>('draft:'+identity.id+':');
    const valid=records.filter(r=>r&&typeof r.key==='string'&&r.identity?.id===identity.id&&typeof r.identity.generation==='string'&&typeof r.noteId==='string'&&typeof r.tabId==='string'&&typeof r.editId==='string'&&typeof r.copyId==='string'&&typeof r.baseRevision==='string'&&typeof r.value?.title==='string'&&r.value.content&&typeof r.value.content==='object');
    if(valid.length!==records.length)this.storageError('Some recovery records could not be read. They remain in local storage.');return valid;
  }
  async discard(record: RecoveryRecord) {
    const live = this.records.get(record.noteId);
    if (live?.key === record.key && live.editId !== record.editId) throw new Error('The draft changed. Review the latest recovery entry.');
    if (live?.key === record.key) this.records.delete(record.noteId);
    await this.persist(() => this.store.delete(record.key));
  }
  dirty() { return this.records.size > 0; }
  async isolate(record: RecoveryRecord) {
    if(record.key.endsWith(':'+record.editId))return record;
    const isolated={...record,key:record.key+':'+record.editId};
    await this.store.put(isolated.key,isolated); await this.store.delete(record.key); return isolated;
  }
  async retryStorage() {
    await this.chain;await this.store.get('storage-probe');
    for(const record of this.records.values()) await this.store.put(record.key,record);
  }
  current(id: string) { return this.records.get(id); }
}
