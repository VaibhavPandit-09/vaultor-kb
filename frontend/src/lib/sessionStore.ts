import type { Pane, ReadingPosition } from './paneNavigation';
import type { OrganizationItem } from './organization';
export type Identity = { id: string; generation: string };
export type LibraryContext = { query: string; searchMode: 'title' | 'content'; type: string; sort: 'title' | 'updated' | 'recent' };
export const defaultLibrary: LibraryContext = { query: '', searchMode: 'title', type: 'all', sort: 'updated' };
export type SessionSnapshot = { version: 1; identity: Identity; panes: Pane[]; activePaneId: string | null; positions: Record<string, ReadingPosition>; library: { visible: boolean; section: 'library' | 'recent' | 'favorites' | 'collections'; collection: OrganizationItem | null; tags: string[]; context: LibraryContext } };
export type NoteDraft = { title: string; content: unknown };
export type RecoveryRecord = { key: string; identity: Identity; tabId: string; noteId: string; editId: string; version: number; baseRevision: string; value: NoteDraft; copyId: string };
export interface LocalStore { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void>; delete(key: string): Promise<void>; values<T>(prefix: string): Promise<T[]> }
/** Separate keys per tab; transactions complete before a write is considered durable. */
export class IndexedSessionStore implements LocalStore {
  private db?: Promise<IDBDatabase>;
  private open() {
    return this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vaultor-working-sessions', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records');
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); this.db = undefined; }; resolve(request.result); };
      request.onerror = () => { this.db = undefined; reject(request.error); };
      request.onblocked = () => { this.db=undefined;reject(new Error('Local session storage is blocked by another window.')); };
    });
  }
  private async transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', mode), request = operation(tx.objectStore('records'));
      tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('Local storage write aborted.'));
    });
  }
  get<T>(key: string) { return this.transaction<T | undefined>('readonly', store => store.get(key)); }
  async put(key: string, value: unknown) { await this.transaction('readwrite', store => store.put(value, key)); }
  async delete(key: string) { await this.transaction('readwrite', store => store.delete(key)); }
  values<T>(prefix: string) { return this.transaction<T[]>('readonly', store => store.getAll(IDBKeyRange.bound(prefix, prefix + '\uffff'))); }
}
let tabClaim: Promise<{ id: string; seed?: string }> | undefined;
/** A duplicated tab can inherit sessionStorage. Web Locks prevent it claiming the same record. */
export function claimTab(): Promise<{ id: string; seed?: string }> {
  return tabClaim ??= (async () => {
    let previous: string | undefined;
    try { previous = sessionStorage.getItem('vaultor-session-tab') ?? undefined; } catch { /* IndexedDB can still work. */ }
    let id = previous ?? crypto.randomUUID();
    if (navigator.locks) {
      const acquire = (key: string) => new Promise<boolean>(resolve => { void navigator.locks.request('vaultor-session-' + key, { ifAvailable: true }, lock => { resolve(Boolean(lock)); return lock ? new Promise<void>(() => {}) : undefined; }).catch(() => resolve(false)); });
      if (!await acquire(id)) { id = crypto.randomUUID(); await acquire(id); }
    } else id = crypto.randomUUID(); // No lock support: never overwrite an inherited tab record.
    try { sessionStorage.setItem('vaultor-session-tab', id); } catch { /* Report durable storage errors separately. */ }
    return { id, seed: previous && previous !== id ? previous : undefined };
  })();
}
export function validSession(value: SessionSnapshot) {
  return value.version===1 && typeof value.identity?.id==='string' && typeof value.identity.generation==='string'
    && Array.isArray(value.panes) && value.panes.every(p=>typeof p.paneId==='string' && typeof p.id==='string' && Array.isArray(p.history) && p.history.length>0 && p.history.length<=200 && Number.isInteger(p.cursor) && p.cursor>=0 && p.cursor<p.history.length && p.history.every(v=>typeof v.visitId==='string'&&typeof v.resourceId==='string'&&typeof v.title==='string'))
    && value.positions && Object.values(value.positions).every(p=>Number.isFinite(p.scrollTop)&&Number.isFinite(p.scrollLeft)&&(!p.selection||(Number.isFinite(p.selection.from)&&Number.isFinite(p.selection.to))))
    && value.library && typeof value.library.visible==='boolean' && ['library','recent','favorites','collections'].includes(value.library.section)
    && Array.isArray(value.library.tags) && value.library.tags.every(t=>typeof t==='string') && (!value.library.collection||(typeof value.library.collection.id==='string'&&typeof value.library.collection.name==='string')) && typeof value.library.context?.type==='string' && typeof value.library.context.query==='string' && ['title','content'].includes(value.library.context.searchMode) && ['title','updated','recent'].includes(value.library.context.sort);
}
export const sameWorkspace = (a: Identity, b: Identity) => a.id === b.id && a.generation === b.generation;
export const sessionKey = (identity: Identity, tab: string) => `session:${identity.id}:${tab}`;
export class SessionPersistence {
  pending = 0;
  private latest?: SessionSnapshot;
  private chain = Promise.resolve();
  readonly store: LocalStore; readonly tabId: string; private error: (message: string) => void;
  constructor(store: LocalStore, tabId: string, error: (message: string) => void) {this.store=store;this.tabId=tabId;this.error=error;}
  async load(identity: Identity, seed?: string) {
    const own = await this.store.get<SessionSnapshot>(sessionKey(identity, this.tabId));
    const previous = seed ? await this.store.get<SessionSnapshot>(sessionKey(identity, seed)) : undefined;
    const latest = await this.store.get<string>('latest:' + identity.id);
    const value = own ?? previous ?? (latest ? await this.store.get<SessionSnapshot>(sessionKey(identity, latest)) : undefined);
    if(!value)return undefined;
    if(!validSession(value)){this.error('Stored session layout could not be read. Recovery drafts are kept separately.');return undefined;}
    return sameWorkspace(value.identity, identity) ? value : undefined;
  }
  retry() { return this.latest ? this.save(this.latest) : Promise.resolve(); }
  save(value: SessionSnapshot) {
    this.latest=value; this.pending++;
    this.chain = this.chain.then(async () => {
      await this.store.put(sessionKey(value.identity, this.tabId), value);
      await this.store.put('latest:' + value.identity.id, this.tabId);
    }).catch(() => this.error('Session storage failed. Your layout may not survive a refresh.')).finally(() => { this.pending--; });
    return this.chain;
  }
}
