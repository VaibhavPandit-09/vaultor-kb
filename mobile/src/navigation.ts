import type { Destination } from './browse';

export type RootDestination = 'home' | Destination;
export function backIntent(s: {
  transient: boolean;
  keyboard: boolean;
  editing: boolean;
  view: 'home' | 'browse' | 'note';
  cursor: number;
  collection: boolean;
}):
  | 'dismiss'
  | 'keyboard'
  | 'read'
  | 'history'
  | 'browse'
  | 'library'
  | 'home'
  | 'exit' {
  if (s.transient) return 'dismiss';
  if (s.keyboard) return 'keyboard';
  if (s.view === 'note')
    return s.editing ? 'read' : s.cursor > 0 ? 'history' : 'browse';
  if (s.view === 'browse') return s.collection ? 'library' : 'home';
  return 'exit';
}

// One sequential metadata request stream: the native browsing channel cancels
// preceding requests. Cache belongs to the selected host/workspace/generation.
export class QuickAccess {
  private ticket = 0;
  private scope = '';
  private listeners = new Set<() => void>();
  state: { recent: any[]; pinned: any[]; error: string; loading: boolean } = {
    recent: [],
    pinned: [],
    error: '',
    loading: false,
  };
  constructor(
    private load: (path: string) => Promise<any>,
    private cancel: () => void,
  ) {}
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  snapshot = () => this.state;
  private patch(value: Partial<typeof this.state>) {
    this.state = { ...this.state, ...value };
    this.listeners.forEach(f => f());
  }
  bind(scope: string) {
    if (scope === this.scope) return;
    this.suspend();
    this.scope = scope;
    this.patch({ recent: [], pinned: [], error: '' });
  }
  suspend() {
    this.ticket++;
    this.cancel();
    this.patch({ loading: false });
  }
  async refresh() {
    const ticket = ++this.ticket;
    this.patch({ loading: true, error: '' });
    try {
      for (const [name, path] of [
        ['recent', '/resources?page=0&size=12&q=&sort=recent'],
        ['pinned', '/organization/pins?page=0&size=12&q='],
      ] as const) {
        const page = await this.load(path);
        if (ticket !== this.ticket) return;
        if (!Array.isArray(page.items) || page.items.length > 12)
          throw Error('Invalid quick-access response.');
        this.patch({ [name]: page.items });
      }
    } catch (e) {
      if (ticket === this.ticket) this.patch({ error: (e as Error).message });
    } finally {
      if (ticket === this.ticket) this.patch({ loading: false });
    }
  }
}
