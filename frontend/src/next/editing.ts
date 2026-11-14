import type { JSONContent } from '@tiptap/core';
import { command, type Draft, type Note } from './client';
type Entry = { note: Note; token: string; sequence: number; committed: number; protected: number; snapshot?: Draft; capture?: () => JSONContent; protection?: Promise<void>; saving?: Promise<void>; timer?: ReturnType<typeof setTimeout>; deadline?: ReturnType<typeof setTimeout>; saveTimer?: ReturnType<typeof setTimeout>; error?: string; conflict: boolean };
/** One journal and writer per document, independent of view lifetime. No idle work. */
export class EditingSession {
  private entries = new Map<string, Entry>();
  private changed: (savedId?: string) => void;
  private conflicted: (id: string) => void;
  private invoke: typeof command;
  private autosaveDelay = 1000;
  setAutosaveDelay(delay:number) { this.autosaveDelay=Math.max(0,Math.min(1000,delay)); }
  constructor(changed: (savedId?: string) => void, conflicted: (id: string) => void, invoke = command) { this.changed = changed; this.conflicted = conflicted; this.invoke = invoke; }
  get(id: string) { return this.entries.get(id)?.note; }
  status(id: string) {
    const e = this.entries.get(id);
    return !e ? 'saved' : e.conflict ? 'conflict' : e.error ? 'failed' : e.saving ? 'saving' : e.committed === e.sequence ? 'saved' : e.protected === e.sequence ? 'draft protected' : 'pending';
  }
  failed() { return [...this.entries.values()].some(e => e.error); }
  dirty(id: string) { const e = this.entries.get(id); return !!e && e.committed !== e.sequence; }
  adopt(note: Note, draft?: Draft) {
    const entry: Entry = { note, token: draft?.token ?? crypto.randomUUID(), sequence: draft?.sequence ?? 0, committed: 0, protected: draft?.sequence ?? 0, snapshot: draft, conflict: false };
    this.entries.set(note.id, entry);
    if (draft) entry.saveTimer = setTimeout(() => void this.flush(note.id).catch(() => {}), 1000);
  }
  edit(id: string, patch: { title?: string; capture?: () => JSONContent }) {
    const e = this.entries.get(id)!; const before = this.status(id);
    if (patch.title !== undefined) e.note.title = patch.title;
    if (patch.capture) e.capture = patch.capture;
    e.sequence++; e.error = undefined;
    clearTimeout(e.timer); clearTimeout(e.saveTimer);
    e.timer = setTimeout(() => void this.protect(id).catch(() => {}), 250);
    e.deadline ??= setTimeout(() => void this.protect(id).catch(() => {}), 1000);
    if (!e.conflict) e.saveTimer = setTimeout(() => void this.flush(id).catch(() => {}), this.autosaveDelay);
    if (before !== this.status(id) || patch.title !== undefined) this.changed();
  }
  async protect(id: string, fromSave = false): Promise<void> {
    const e = this.entries.get(id); if (!e) return;
    if (e.saving && !fromSave) { await e.saving.catch(() => {}); return this.protect(id); }
    clearTimeout(e.timer); clearTimeout(e.deadline); e.deadline = undefined;
    if (e.protection) { await e.protection; if (e.protected !== e.sequence) return this.protect(id, fromSave); return; }
    e.protection = (async () => {
      while (e.protected !== e.sequence) {
        const snapshot: Draft = { id, title: e.note.title, baseRevision: e.note.revision, token: e.token, sequence: e.sequence, content: e.capture?.() ?? e.note.content };
        await this.invoke({ kind: 'draft', ...snapshot });
        e.note.content = snapshot.content; e.snapshot = snapshot; e.protected = snapshot.sequence;
        this.changed();
      }
    })();
    try { await e.protection; } catch (error) { e.error = String(error); this.changed(); throw error; }
    finally { e.protection = undefined; }
  }
  async flush(id: string): Promise<void> {
    const e = this.entries.get(id); if (!e) return;
    clearTimeout(e.saveTimer);
    if (e.conflict) throw new Error('Saved version changed. Review the protected draft.');
    if (e.saving) { await e.saving; if (e.committed !== e.sequence) return this.flush(id); return; }
    if (e.committed === e.sequence) return;
    e.saving = (async () => {
      while (e.committed !== e.sequence) {
        await this.protect(id, true);
        const snapshot = e.snapshot!;
        const receipt = await this.invoke<{ revision: number }>({ kind: 'save', id, title: snapshot.title, content: snapshot.content, revision: e.note.revision, proof: { token: e.token, sequence: snapshot.sequence } });
        e.note.revision = receipt.revision; e.committed = snapshot.sequence; e.error = undefined;
        this.changed(id);
      }
    })();
    this.changed();
    try { await e.saving; }
    catch (error) { e.error = String(error); if (/revision conflict/.test(e.error)) { e.conflict = true; this.conflicted(id); } throw error; }
    finally { e.saving = undefined; this.changed(); }
  }
  async flushAll() { await Promise.all([...this.entries.keys()].map(id => this.flush(id))); }
  async park(id: string) {
    const e = this.entries.get(id); if (!e) return;
    clearTimeout(e.timer); clearTimeout(e.deadline); clearTimeout(e.saveTimer);
    await e.saving?.catch(() => {}); await this.protect(id);
    this.entries.delete(id);
  }
  forget(id: string) {
    const e = this.entries.get(id); if (!e) return;
    if (this.dirty(id)) throw new Error('Protect or resolve this draft before closing it.');
    clearTimeout(e.timer); clearTimeout(e.deadline); clearTimeout(e.saveTimer); this.entries.delete(id);
  }
  releaseViews() { for(const entry of this.entries.values())if(entry.protected===entry.sequence)entry.capture=undefined; }
  releaseInactive(active:readonly string[]) { const keep=new Set(active);for(const [id,e] of this.entries)if(!keep.has(id)&&!this.dirty(id)&&!e.saving&&!e.protection&&!e.error&&!e.conflict)this.forget(id); }
  ids() { return this.entries.keys(); }
}
