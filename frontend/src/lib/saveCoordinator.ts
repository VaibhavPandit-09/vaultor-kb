export type SaveStatus = 'saved' | 'saving' | 'failed';
type Entry<T> = { value: T; version: number; saved: number; status: SaveStatus; timer?: ReturnType<typeof setTimeout>; running?: Promise<void> };

/** One writer per note, coalescing edits without letting an older response win. */
export class SaveCoordinator<T> {
  private entries = new Map<string, Entry<T>>();
  private write: (id: string, value: T) => Promise<unknown>;
  private changed: () => void;
  constructor(write: (id: string, value: T) => Promise<unknown>, changed: () => void) { this.write = write; this.changed = changed; }
  latest(id: string) { return this.entries.get(id)?.value; }
  status(id: string): SaveStatus { return this.entries.get(id)?.status ?? 'saved'; }
  dirty() { return [...this.entries.values()].some(e => e.version !== e.saved); }
  forget(id: string) { const e = this.entries.get(id); clearTimeout(e?.timer); this.entries.delete(id); }
  clear() { for (const id of this.entries.keys()) this.forget(id); }
  enqueue(id: string, value: T, delay: number) {
    const e = this.entries.get(id) ?? { value, version: 0, saved: 0, status: 'saved' as SaveStatus };
    e.value = value; e.version++; e.status = 'saving'; clearTimeout(e.timer);
    this.entries.set(id, e); this.changed();
    e.timer = setTimeout(() => { void this.flush(id).catch(() => {}); }, delay);
  }
  async flush(id: string): Promise<void> {
    const e = this.entries.get(id); if (!e) return;
    clearTimeout(e.timer);
    if (e.running) { await e.running; if (e.saved !== e.version) return this.flush(id); return; }
    e.running = (async () => {
      try {
        while (e.saved !== e.version) {
          const version = e.version; const value = e.value;
          e.status = 'saving'; this.changed();
          await this.write(id, value); e.saved = version;
        }
        e.status = 'saved';
      } catch (error) { e.status = 'failed'; throw error; }
      finally { this.changed(); }
    })();
    try { await e.running; } finally { e.running = undefined; }
  }
  async flushAll() { await Promise.all([...this.entries.keys()].map(id => this.flush(id))); }
}
