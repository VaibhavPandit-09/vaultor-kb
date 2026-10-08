export type Destination = 'library' | 'recent' | 'pinned' | 'collections';
export type ResourceSummary = {
  id: string;
  type: string;
  title: string;
  mimeType?: string;
  updatedAt?: string;
  lastOpenedAt?: string;
  collections?: { id: string; name: string }[];
};
export type BrowseRow = {
  id: string;
  title: string;
  kind: 'resource' | 'collection';
  resource?: ResourceSummary;
  count?: number;
  snippet?: { text: string; highlights: { start: number; end: number }[] };
};
export type BrowseConfig = {
  destination: Destination;
  query: string;
  mode: 'title' | 'content';
  type: string;
  collection?: { id: string; name: string };
  sort: 'updated' | 'title' | 'recent';
  page: number;
  scroll: number;
};
export const defaultBrowse = (): BrowseConfig => ({
  destination: 'library',
  query: '',
  mode: 'title',
  type: '',
  sort: 'updated',
  page: 0,
  scroll: 0,
});
export function normalizeBrowse(value: unknown): BrowseConfig {
  const v = value as Partial<BrowseConfig> | undefined;
  if (!v) return defaultBrowse();
  return {
    ...defaultBrowse(),
    destination: ['library', 'recent', 'pinned', 'collections'].includes(
      v.destination ?? '',
    )
      ? v.destination!
      : 'library',
    query: typeof v.query === 'string' ? v.query.slice(0, 500) : '',
    mode: v.mode === 'content' ? 'content' : 'title',
    type:
      filters.some(f => f.value === v.type) ||
      (v.destination === 'pinned' &&
        v.mode !== 'content' &&
        v.type === 'collection')
        ? v.type!
        : '',
    collection:
      v.collection && /^[a-f0-9-]{36}$/i.test(v.collection.id)
        ? { id: v.collection.id, name: String(v.collection.name).slice(0, 500) }
        : undefined,
    sort: ['title', 'recent', 'updated'].includes(v.sort ?? '')
      ? v.sort!
      : 'updated',
    page:
      Number.isInteger(v.page) && v.page! >= 0 && v.page! <= 100000
        ? v.page!
        : 0,
    scroll: Number.isFinite(v.scroll)
      ? Math.max(0, Math.min(10000000, v.scroll!))
      : 0,
  };
}
export const filters = [
  { value: '', label: 'All types' },
  { value: 'note', label: 'Notes' },
  { value: 'file', label: 'Files' },
  { value: 'image', label: 'Images' },
  { value: 'pdf', label: 'PDFs' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'text', label: 'Text files' },
  { value: 'other', label: 'Other files' },
];
export function presentation(
  resource: Pick<ResourceSummary, 'type' | 'mimeType'>,
) {
  if (resource.type === 'note')
    return { label: 'Note', icon: '▤', action: 'editor' as const };
  if (resource.type !== 'file')
    return {
      label: resource.type || 'Resource',
      icon: '◇',
      action: 'unsupported' as const,
    };
  const mime = (resource.mimeType ?? '').toLowerCase().split(';')[0];
  const label = mime.startsWith('image/')
    ? 'Image'
    : mime === 'application/pdf'
    ? 'PDF'
    : mime.startsWith('audio/')
    ? 'Audio'
    : mime.startsWith('video/')
    ? 'Video'
    : mime.startsWith('text/')
    ? 'Text file'
    : 'File';
  return {
    label,
    icon: label === 'Image' ? '▧' : '↗',
    action: 'preview' as const,
  };
}
export function browsePath(c: BrowseConfig) {
  const q: Record<string, string> = {
    page: String(c.page),
    size: '100',
    q: c.query,
  };
  let path = '/resources';
  if (c.destination === 'collections') path = '/collections';
  else if (
    c.destination === 'pinned' &&
    !(c.mode === 'content' && c.query.trim())
  ) {
    path = '/organization/pins';
    if (c.type)
      q.kind = ['note', 'file', 'collection'].includes(c.type)
        ? c.type
        : 'file';
    if (c.type && !['note', 'file', 'collection'].includes(c.type))
      q.category = c.type;
  } else {
    if (c.mode === 'content' && c.query.trim()) path = '/resources/query';
    if (c.type) {
      q.type = ['note', 'file'].includes(c.type) ? c.type : 'file';
      if (!['note', 'file'].includes(c.type)) q.category = c.type;
    }
    if (c.collection) q.collection = c.collection.id;
    if (c.destination === 'pinned') q.favorites = 'true';
    if (path === '/resources')
      q.sort = c.destination === 'recent' ? 'recent' : c.sort;
  }
  return (
    path +
    '?' +
    Object.entries(q)
      .map(([key, value]) => key + '=' + encodeURIComponent(value))
      .join('&')
  );
}
export type BrowseState = {
  config: BrowseConfig;
  rows: BrowseRow[];
  total: number;
  pages: number;
  loading: boolean;
  error: string;
  coverage?: { files: number; indexed: number; complete: boolean };
  applied: string;
  milliseconds?: number;
};
export class MobileBrowser {
  state: BrowseState = {
    config: defaultBrowse(),
    rows: [],
    total: 0,
    pages: 0,
    loading: false,
    error: '',
    applied: '',
  };
  private listeners = new Set<() => void>();
  private ticket = 0;
  private scope = '';
  private cache = new Map<string, BrowseState>();
  constructor(
    private load: (path: string) => Promise<any>,
    private cancel: () => void,
    private persist: (config: BrowseConfig) => void,
  ) {}
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  snapshot = () => this.state;
  private patch(value: Partial<BrowseState>) {
    this.state = { ...this.state, ...value };
    this.listeners.forEach(f => f());
  }
  bind(scope: string, config?: BrowseConfig) {
    if (scope === this.scope) {
      if (
        config &&
        JSON.stringify(config) !== JSON.stringify(this.state.config)
      )
        this.patch({ config: normalizeBrowse(config) });
      return;
    }
    this.suspend();
    this.scope = scope;
    this.cache.clear();
    this.patch({
      config: normalizeBrowse(config),
      rows: [],
      total: 0,
      pages: 0,
      error: '',
      applied: '',
    });
  }
  configure(value: Partial<BrowseConfig>) {
    this.suspend();
    const config = normalizeBrowse({
      ...this.state.config,
      ...value,
      page: value.page ?? 0,
      scroll: 0,
    });
    const differentDestination =
      config.destination !== this.state.config.destination ||
      config.collection?.id !== this.state.config.collection?.id;
    this.patch({
      config,
      ...(differentDestination
        ? {
            rows: [],
            total: 0,
            pages: 0,
            applied: '',
            error: '',
            coverage: undefined,
          }
        : {}),
    });
    this.persist(config);
  }
  scroll(scroll: number) {
    const config = { ...this.state.config, scroll };
    this.state = { ...this.state, config };
    this.persist(config);
  }
  suspend() {
    this.ticket++;
    this.cancel();
    this.patch({ loading: false });
  }
  async refresh() {
    const ticket = ++this.ticket,
      scope = this.scope,
      path = browsePath(this.state.config),
      started = Date.now();
    const cached = this.cache.get(path);
    if (cached) this.patch({ ...cached, config: this.state.config });
    this.patch({ loading: true, error: '' });
    try {
      const page = await this.load(path);
      if (ticket !== this.ticket || scope !== this.scope) return;
      if (
        !Array.isArray(page.items) ||
        page.items.length > 100 ||
        !Number.isFinite(page.totalItems)
      )
        throw Error('Invalid bounded browsing response.');
      const rows: BrowseRow[] = page.items.map((item: any) =>
        item.kind
          ? item.kind === 'collection'
            ? {
                kind: 'collection',
                id: item.id,
                title: item.name,
                count: item.count,
              }
            : {
                kind: 'resource',
                id: item.id,
                title: item.resource.title,
                resource: item.resource,
              }
          : item.resource
          ? {
              kind: 'resource',
              id: item.resource.id,
              title: item.resource.title,
              resource: item.resource,
              snippet: item.snippet,
            }
          : item.type
          ? { kind: 'resource', id: item.id, title: item.title, resource: item }
          : {
              kind: 'collection',
              id: item.id,
              title: item.name,
              count: item.resourceCount ?? item.count ?? 0,
            },
      );
      this.patch({
        rows,
        total: page.totalItems,
        pages: page.totalPages,
        loading: false,
        error: '',
        coverage: page.fileCoverage,
        applied: path,
        milliseconds: Date.now() - started,
      });
      this.cache.set(path, this.state);
      while (this.cache.size > 3)
        this.cache.delete(this.cache.keys().next().value!);
    } catch (e) {
      if (ticket !== this.ticket) return;
      this.patch({
        loading: false,
        error: e instanceof Error ? e.message : 'Refresh failed. Retry.',
      });
    }
  }
}
