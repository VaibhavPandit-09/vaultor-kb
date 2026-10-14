import { noteImages } from './reading';
import { type Doc, type Note, scopeFor } from './bridge';
import {
  advance,
  emptyJourney,
  normalizeJourney,
  type Journey,
} from './journey';
import {
  defaultBrowse,
  normalizeBrowse,
  type BrowseConfig,
  type ResourceSummary,
} from './browse';

export type Host = {
  hostId: string;
  address: string;
  epoch: string;
  workspaceId?: string;
};
export type WorkspaceChoice = { id: string; name: string };
export type Position = {
  anchor: number;
  head: number;
  scroll: number;
  path?: string;
  offset?: number;
  revision?: string;
};
export type Draft = {
  scope: string;
  noteId: string;
  title: string;
  revision: string;
  content: Doc;
  version: string;
  resolved?: boolean;
  recoveryKey?: string;
  copyId?: string;
  copyScope?: string;
  // Durable receipt: a timeout is not evidence that the host rejected this edit.
  sent?: { version: string; revision: string; title: string; content: Doc };
};
export type Summary = Pick<
  Draft,
  'scope' | 'noteId' | 'title' | 'version' | 'resolved' | 'recoveryKey'
>;
export type Creation = {
  scope: string;
  id: string;
  title: string;
  collectionId?: string;
};
export type Session = {
  scope: string;
  hostId: string;
  noteId?: string;
  position?: Position;
  at?: number;
  journey?: Journey;
  browse?: BrowseConfig;
  view?: 'home' | 'browse' | 'note';
  noteOrigin?: 'home' | 'browse';
};
type Bootstrap = {
  profiles: Omit<Host, 'epoch'>[];
  selected: string;
  epoch: string;
  drafts: Summary[];
  sessions: Record<string, Session>;
};
export type WorkspaceState = {
  hosts: Omit<Host, 'epoch'>[];
  workspaces?: WorkspaceChoice[];
  multiWorkspace?: boolean;
  host?: Host;
  scope: string;
  notes: Note[];
  note?: Note;
  draft?: Draft;
  recovery: Summary[];
  position?: Position;
  connection: 'connecting' | 'online' | 'offline' | 'revoked';
  status: string;
  error: string;
  supported: boolean;
  conflict: boolean;
  unavailable: boolean;
  busy: boolean;
  loadId: number;
  content?: Doc;
  journey: Journey;
  browse: BrowseConfig;
  view: 'home' | 'browse' | 'note';
  noteOrigin: 'home' | 'browse';
  preview?: ResourceSummary;
  previewGallery?: string[];
  browseVersion: number;
  createdNoteId?: string;
  referenceSelection?: { path: string; targetId: string; revision: string };
  navigationRetry?: {
    id: string;
    intent: 'direct' | 'linked' | 'history';
    index?: number;
  };
};
export interface Port {
  storage<T>(action: string, value?: object): Promise<T>;
  activate(id: string): Promise<Host>;
  selectWorkspace?(host: Host, id: string, generation: string): Promise<Host>;
  api(
    host: Host,
    path: string,
    method?: string,
    body?: unknown,
    revision?: string,
    channel?: 'browse',
  ): Promise<any>;
  uuid(): Promise<string>;
  cancelBrowse?(): void;
}
export class HostError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}
const contentOf = (n: Note): Doc =>
  typeof n.content === 'string' ? JSON.parse(n.content) : n.content;
export class MobileWorkspace {
  state: WorkspaceState = {
    hosts: [],
    scope: '',
    notes: [],
    recovery: [],
    connection: 'offline',
    status: '',
    error: '',
    supported: false,
    conflict: false,
    unavailable: false,
    busy: false,
    loadId: 0,
    journey: emptyJourney(),
    navigationRetry: undefined,
    browse: defaultBrowse(),
    view: 'home',
    noteOrigin: 'browse',
    browseVersion: 0,
  };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private navigation = 0;
  private journeyRequest = 0;
  private saveRequest?: Promise<void>;
  constructor(private port: Port) {}
  enableAutosave(_enabled: boolean) {
    // Compatibility shim: no automatic or manual original-note writes.
  }
  async background() {
    this.enableAutosave(false);
    await this.protect();
    await this.session().catch(e => this.report(e));
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private patch(value: Partial<WorkspaceState>) {
    this.state = { ...this.state, ...value };
    this.listeners.forEach(f => f());
  }
  private valid(epoch: number) {
    if (epoch !== this.epoch)
      throw Error('Connection changed; obsolete result ignored.');
  }
  report(error: unknown) {
    this.patch({
      error:
        error instanceof Error
          ? error.message
          : 'Failed. Your protected drafts remain on this device.',
    });
  }
  async perform(action: () => Promise<void>) {
    if (this.state.busy) return;
    this.patch({ busy: true, error: '' });
    try {
      await action();
    } catch (e) {
      this.report(e);
    } finally {
      this.patch({ busy: false });
    }
  }
  async refreshRecovery() {
    const epoch = this.epoch;
    const b = await this.port.storage<Bootstrap>('bootstrap');
    this.valid(epoch);
    this.patch({ hosts: b.profiles, recovery: b.drafts });
    return b;
  }
  async initialize() {
    const b = await this.refreshRecovery();
    if (!b.selected) return;
    const host = b.profiles.find(p => p.hostId === b.selected);
    if (!host) return;
    this.patch({ host: { ...host, epoch: b.epoch } });
    await this.connect(true);
  }
  async adopted() {
    const b = await this.refreshRecovery();
    const h = b.profiles.find(p => p.hostId === b.selected);
    if (!h) throw Error('Approve the host first.');
    this.epoch++;
    this.navigation++;
    this.patch({
      host: { ...h, epoch: b.epoch },
      note: undefined,
      draft: undefined,
      scope: '',
      journey: emptyJourney(),
      navigationRetry: undefined,
      browse: defaultBrowse(),
      view: 'browse',
      preview: undefined,
      content: undefined,
    });
    await this.connect(true);
  }
  async connect(restore = false) {
    const host = this.state.host;
    if (!host) return;
    const epoch = this.epoch;
    this.patch({
      connection: this.state.connection === 'online' ? 'online' : 'connecting',
      error: '',
    });
    try {
      const caps = await this.port.api(host, '/capabilities');
      this.valid(epoch);
      if (caps.apiProtocolVersion < 3 || caps.minimumClientProtocolVersion > 3)
        throw Error('Incompatible host. Update the required client or host.');
      this.patch({ multiWorkspace: caps.multiWorkspace === true });
      if (caps.multiWorkspace === true) await this.refreshWorkspaces();
      const identity = await this.port.api(host, '/workspace/identity');
      this.valid(epoch);
      const scope = scopeFor(
        host.hostId,
        identity.id ?? identity.workspaceId,
        String(identity.generation),
      );
      if (this.state.scope && this.state.scope !== scope) {
        await this.protect();
        this.valid(epoch);
        this.navigation++;
        this.patch({
          note: undefined,
          draft: undefined,
          content: undefined,
          supported: false,
          status: 'Workspace replaced. Former drafts remain in Recovery.',
          position: undefined,
          journey: emptyJourney(),
          navigationRetry: undefined,
          browse: defaultBrowse(),
          view: 'browse',
          preview: undefined,
        });
      }
      this.patch({
        scope,
        host:
          host.workspaceId === identity.id
            ? host
            : { ...host, workspaceId: identity.id },
        connection: 'online',
      });
      if (restore && !this.state.note) {
        const session = await this.port.storage<Session | null>('getSession', {
          scope,
        });
        this.valid(epoch);

        const id = session?.noteId;
        if (id) await this.open(id, session?.position);
        this.valid(epoch);
        const journey = normalizeJourney(session?.journey);
        this.patch({
          browse: normalizeBrowse(session?.browse),
          noteOrigin: session?.noteOrigin === 'home' ? 'home' : 'browse',
          view:
            session?.view === 'home'
              ? 'home'
              : session?.view === 'browse'
              ? 'browse'
              : !this.state.note
              ? 'home'
              : 'note',
          journey:
            journey.visits[journey.cursor]?.id === this.snapshot().note?.id
              ? journey
              : this.state.journey,
        });
        await this.session();
      } else if (this.state.note) await this.reconcile();
      await this.refreshRecovery();
    } catch (e) {
      if (epoch !== this.epoch) return;
      const revoked =
        e instanceof HostError &&
        (e.status === 401 ||
          e.status === 403 ||
          e.code === 'WORKSPACE_UNAVAILABLE');
      this.patch({
        connection: revoked ? 'revoked' : 'offline',
        error:
          e instanceof Error
            ? e.message
            : 'Host unavailable. Protected drafts retained.',
      });
      if (restore && !revoked && !this.state.note)
        await this.restoreOffline(host);
    }
  }
  private async restoreOffline(host: Host) {
    const epoch = this.epoch;
    const b = await this.port.storage<Bootstrap>('bootstrap');
    const session = Object.values(b.sessions)
      .filter(
        s =>
          s.hostId === host.hostId &&
          s.noteId &&
          (!host.workspaceId || JSON.parse(s.scope)[1] === host.workspaceId),
      )
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
    if (!session?.noteId) return;
    if (
      !host.workspaceId &&
      new Set(
        Object.values(b.sessions)
          .filter(v => v.hostId === host.hostId)
          .map(v => JSON.parse(v.scope)[1]),
      ).size > 1
    )
      return;
    const note = await this.port.storage<Note | null>('getCache', {
      scope: session.scope,
      noteId: session.noteId,
    });
    if (!note) return;
    this.valid(epoch);
    this.patch({
      scope: session.scope,
      note,
      draft: undefined,
      content: contentOf(note),
      position: session.position,
      loadId: this.state.loadId + 1,
      status: 'Offline · last opened note retained',
      supported: false,
      conflict: false,
      unavailable: false,
      journey: normalizeJourney(session.journey),
      browse: normalizeBrowse(session.browse),
      noteOrigin: session.noteOrigin === 'home' ? 'home' : 'browse',
      view:
        session.view === 'home'
          ? 'home'
          : session.view === 'browse'
          ? 'browse'
          : 'note',
    });
  }
  private async openReader(
    id: string,
    position?: Position,
    strict = false,
    reveal = true,
  ) {
    const ticket = ++this.navigation,
      epoch = this.epoch,
      host = this.state.host,
      scope = this.state.scope;
    if (!host) return;
    let note: Note;
    try {
      note = await this.port.api(host, '/resources/' + id);
    } catch (e) {
      if (
        strict ||
        (e instanceof HostError && [401, 403, 404, 410].includes(e.status))
      )
        throw e;
      const cached = await this.port.storage<Note | null>('getCache', {
        scope,
        noteId: id,
      });
      if (!cached) throw e;
      note = cached;
    }
    this.valid(epoch);
    if (ticket !== this.navigation) return;
    if (note.type !== 'note' || note.trashedAt)
      throw Error('Note unavailable. Legacy recovery remains separate.');
    const content = contentOf(note);
    if (
      strict &&
      !reveal &&
      this.state.note?.id === id &&
      this.state.note.revision === note.revision &&
      this.state.note.title === note.title &&
      JSON.stringify(this.state.content) === JSON.stringify(content)
    )
      return;
    // Cache/storage failure cannot prevent a successfully loaded saved note from being read.
    try {
      await this.port.storage('putCache', { scope, noteId: id, note });
    } catch (e) {
      this.report(e);
    }
    this.valid(epoch);
    if (ticket !== this.navigation) return;
    this.patch({
      note,
      draft: undefined,
      content,
      position,
      loadId: this.state.loadId + 1,
      supported: true,
      conflict: false,
      unavailable: false,
      status: 'Saved version',
      view: reveal ? 'note' : this.state.view,
      journey: strict
        ? this.state.journey
        : advance(emptyJourney(), { id, title: note.title, position }, false),
    });
    if (!strict) await this.session().catch(e => this.report(e));
  }
  async open(id: string, position?: Position, strict = false) {
    return this.openReader(id, position, strict);
  }
  loaded() {
    this.patch({
      supported: true,
      error: [
        'Reader stopped. Refresh the saved note; recovery is unchanged.',
        'Unsupported content retained. Editing and saving are disabled.',
      ].includes(this.state.error)
        ? ''
        : this.state.error,
    });
  }
  unsupported() {
    this.patch({
      supported: false,
      error: 'Unsupported content retained. Editing and saving are disabled.',
    });
  }
  changed(_content: Doc) {
    return;
  }
  async protect() {
    return;
  }
  reading(position: Position) {
    const journey = normalizeJourney(this.state.journey);
    if (journey.cursor >= 0) journey.visits[journey.cursor].position = position;
    this.patch({ position, journey });
    void this.session().catch(e => this.report(e));
  }
  private async session() {
    const { host, scope, note, position } = this.state;
    if (host && scope)
      await this.port.storage('putSession', {
        hostId: host.hostId,
        scope,
        noteId: note?.id,
        position,
        journey: this.state.journey,
        browse: this.state.browse,
        view: this.state.view,
        noteOrigin: this.state.noteOrigin,
      });
  }
  async save() {
    throw Error('Android is read-only. Export legacy recovery instead.');
  }
  async reconcile() {
    if (this.state.note)
      await this.openReader(
        this.state.note.id,
        this.state.position,
        true,
        false,
      );
  }
  async useSaved() {
    throw Error('Legacy recovery stays separate from saved reading.');
  }
  async recoveredCopy(_summary: Summary) {
    throw Error('Export legacy recovery for desktop review.');
  }
  async pendingCreation() {
    return this.port.storage<Creation | null>('getCreation', {
      scope: this.state.scope,
    });
  }
  async organizationApi(
    path: string,
    method = 'GET',
    body?: unknown,
    revision?: string,
  ) {
    if (method !== 'GET') throw Error('Android organization is read-only.');
    const { host, scope } = this.state,
      epoch = this.epoch;
    if (!host || !scope) throw Error('Connect to a workspace first.');
    const result = await this.port.api(host, path, method, body, revision);
    this.valid(epoch);
    if (scope !== this.state.scope)
      throw Error('Workspace changed. Reopen Actions.');
    return result;
  }
  organizationStorage<T>(action: string, value: object) {
    return this.port.storage<T>(action, value);
  }
  operationId() {
    return this.port.uuid();
  }
  async prepareResource(id: string, keep = false) {
    if (this.state.note?.id !== id) return;
    await this.saveRequest?.catch(() => {});
    if (keep) await this.protect();
    else if (this.state.draft) await this.save();
    await this.protect();
  }
  async organizationChanged(id?: string, unavailable = false) {
    this.patch({ browseVersion: this.state.browseVersion + 1 });
    if (unavailable && this.state.preview?.id === id) this.dismissPreview();
    if (id && this.state.note?.id === id) {
      if (unavailable) await this.reconcile();
      else {
        const fresh = await this.organizationApi(
          '/resources/' + id + '/summary',
        );
        if (this.state.note?.id !== id) return;
        if (this.state.draft && fresh.revision !== this.state.note.revision) {
          await this.reconcile();
          return;
        }
        this.patch({
          note: {
            ...this.state.note,
            title: fresh.title,
            revision: fresh.revision,
          },
          journey: {
            ...this.state.journey,
            visits: this.state.journey.visits.map(v =>
              v.id === id
                ? { ...v, title: fresh.title, unavailable: false }
                : v,
            ),
          },
        });
      }
    }
  }
  async openOccurrence(
    sourceId: string,
    revision: string,
    path: string,
    targetId: string,
  ) {
    await this.navigate(sourceId);
    if (this.state.note?.id !== sourceId)
      throw Error('Source could not be opened.');
    if (
      this.state.draft ||
      this.state.note.revision !== revision ||
      !/^\/\d+(?:\/\d+)*$/.test(path)
    ) {
      this.report(
        Error(
          'Source opened. This saved occurrence may have moved; no selection was applied.',
        ),
      );
      return;
    }
    this.patch({ referenceSelection: { path, targetId, revision } });
  }
  consumeReference() {
    this.patch({ referenceSelection: undefined });
  }
  async createNote(_title: string, _collectionId?: string) {
    throw Error('Android note creation is retired.');
  }
  async leave() {
    await this.protect();
    this.navigation++;
    this.patch({
      note: undefined,
      draft: undefined,
      content: undefined,
      position: undefined,
      supported: false,
      conflict: false,
      unavailable: false,
      view: 'browse',
      journey: emptyJourney(),
      navigationRetry: undefined,
      preview: undefined,
    });
    await this.session();
    await this.refreshRecovery();
  }
  async refreshWorkspaces() {
    const host = this.state.host,
      epoch = this.epoch;
    if (!host) return;
    const value = await this.port.api(host, '/workspaces');
    this.valid(epoch);
    if (
      !Array.isArray(value) ||
      value.length > 8 ||
      value.some(
        v =>
          typeof v.id !== 'string' ||
          !/^[-a-f0-9]{36}$/.test(v.id) ||
          typeof v.name !== 'string',
      )
    )
      throw Error('Invalid workspace list.');
    this.patch({ workspaces: value });
  }
  async switchWorkspace(id: string, _keep = false) {
    const host = this.state.host,
      epoch = this.epoch;
    if (!host || !this.port.selectWorkspace)
      throw Error('Workspace selection unavailable.');
    if (host.workspaceId === id) return;
    const destination = await this.port.api(host, '/workspaces/' + id);
    this.valid(epoch);
    await this.saveRequest?.catch(() => {});
    await this.protect();
    await this.protect();
    await this.session();
    this.valid(epoch);
    const next = await this.port.selectWorkspace(
      host,
      id,
      destination.generation,
    );
    this.valid(epoch);
    await this.adoptHost(next);
  }
  private async adoptHost(host: Host) {
    this.epoch++;
    this.navigation++;
    this.patch({
      host,
      scope: '',
      workspaces: [],
      journey: emptyJourney(),
      navigationRetry: undefined,
      browse: defaultBrowse(),
      view: 'browse',
      preview: undefined,
      note: undefined,
      draft: undefined,
      content: undefined,
      notes: [],
      position: undefined,
      supported: false,
      conflict: false,
      unavailable: false,
      status: '',
    });
    await this.connect(true);
  }
  async switchHost(id: string, _keep = false) {
    await this.saveRequest?.catch(() => {});
    await this.protect();

    await this.protect();
    await this.session();
    const host = await this.port.activate(id);
    await this.adoptHost(host);
  }
  async removeRecovery(_summary: Summary) {
    throw Error('Legacy records are retained. Export for desktop review.');
  }
  forgotten(id: string) {
    if (this.state.host?.hostId === id) {
      this.epoch++;
      this.navigation++;
      this.patch({
        host: undefined,
        scope: '',
        note: undefined,
        draft: undefined,
        notes: [],
        content: undefined,
        supported: false,
        conflict: false,
        connection: 'offline',
        journey: emptyJourney(),
        navigationRetry: undefined,
        browse: defaultBrowse(),
        view: 'browse',
        preview: undefined,
      });
    }
  }
  async changedFeed() {
    if (!this.state.busy) {
      await this.connect(false);
      this.patch({ browseVersion: this.state.browseVersion + 1 });
    }
  }
  browseApi(path: string) {
    if (!this.state.host || this.state.connection !== 'online')
      return Promise.reject(
        Error(
          'Host unavailable. Reconnect to browse; protected drafts remain.',
        ),
      );
    return this.port.api(
      this.state.host,
      path,
      'GET',
      undefined,
      undefined,
      'browse',
    );
  }
  cancelBrowse() {
    this.port.cancelBrowse?.();
  }
  updateBrowse(browse: BrowseConfig) {
    this.patch({ browse });
    void this.session().catch(e => this.report(e));
  }
  async leaveNote() {
    if (this.state.noteOrigin === 'home') await this.showHome();
    else await this.showBrowser();
  }
  async showHome() {
    this.navigation++;
    this.journeyRequest++;
    await this.protect();
    this.patch({ view: 'home', preview: undefined });
    await this.session();
  }
  async showBrowser() {
    this.navigation++;
    this.journeyRequest++;
    await this.protect();
    this.patch({ view: 'browse', preview: undefined });
    await this.session();
  }
  async returnToNote() {
    if (this.state.note) {
      this.navigation++;
      this.journeyRequest++;
      this.patch({ view: 'note' });
      await this.session();
    }
  }
  dismissPreview() {
    this.patch({ preview: undefined, previewGallery: undefined });
  }
  async previewGalleryItem(id: string) {
    const gallery = this.state.previewGallery;
    if (!gallery?.includes(id)) return;
    const host = this.state.host,
      epoch = this.epoch;
    if (!host) return;
    const ticket = ++this.journeyRequest;
    const resource: ResourceSummary = await this.port.api(
      host,
      '/resources/' + id + '/summary',
    );
    this.valid(epoch);
    if (ticket !== this.journeyRequest || this.state.previewGallery !== gallery)
      return;
    if (resource.type !== 'file' || !resource.mimeType?.startsWith('image/'))
      throw Error('Image no longer available. The source note is unchanged.');
    this.patch({ preview: resource });
  }
  async routeResource(id: string, linked = false) {
    this.navigation++; // Supersede loads before waiting for destination metadata.
    const host = this.state.host,
      epoch = this.epoch,
      request = ++this.journeyRequest;
    if (!host) return;
    const resource: ResourceSummary = await this.port.api(
      host,
      '/resources/' + id + '/summary',
    );
    this.valid(epoch);
    if (request !== this.journeyRequest) return;
    if (resource.type === 'note')
      await this.navigate(id, linked ? 'linked' : 'direct');
    else if (resource.type === 'file') {
      this.patch({
        preview: resource,
        previewGallery:
          linked && resource.mimeType?.startsWith('image/')
            ? noteImages(this.state.content)
            : undefined,
      });
      void this.port
        .api(host, '/resources/' + id + '/open', 'POST')
        .catch(() => {});
    } else
      throw Error('Unsupported resource type: ' + (resource.type || 'unknown'));
  }
  async navigate(
    id: string,
    intent: 'direct' | 'linked' | 'history' = 'direct',
    index?: number,
  ) {
    const origin =
      this.state.view === 'home'
        ? 'home'
        : this.state.view === 'browse'
        ? 'browse'
        : this.state.noteOrigin;
    if (this.state.note?.id === id && intent !== 'history') {
      this.navigation++;
      this.journeyRequest++;
      if (intent === 'direct')
        this.patch({
          journey: advance(
            emptyJourney(),
            { id, title: this.state.note.title, position: this.state.position },
            false,
          ),
          view: 'note',
          noteOrigin: origin,
        });
      await this.session();
      return;
    }
    const old = normalizeJourney(this.state.journey),
      epoch = this.epoch,
      request = ++this.journeyRequest;
    const position =
      intent === 'history' && index !== undefined
        ? old.visits[index]?.position
        : undefined;
    try {
      await this.open(id, position, true);
      this.valid(epoch);
      if (request !== this.journeyRequest || this.state.note?.id !== id) return;
      let journey: Journey;
      if (intent === 'history' && index !== undefined) {
        journey = {
          visits: old.visits.map(v => ({
            ...v,
            title: v.id === id ? this.state.note!.title : v.title,
          })),
          cursor: index,
        };
        journey.visits[index].unavailable = false;
      } else
        journey = advance(
          old,
          { id, title: this.state.note.title, position },
          intent === 'linked',
        );
      this.patch({
        journey,
        view: 'note',
        noteOrigin: intent === 'direct' ? origin : this.state.noteOrigin,
      });
      this.patch({ navigationRetry: undefined });
      await this.session();
      const host = this.state.host;
      if (host)
        void this.port
          .api(host, '/resources/' + id + '/open', 'POST')
          .catch(() => {});
    } catch (e) {
      if (epoch !== this.epoch || request !== this.journeyRequest) return;
      this.patch({ navigationRetry: { id, intent, index } });
      if (
        e instanceof HostError &&
        [404, 410].includes(e.status) &&
        index !== undefined
      ) {
        old.visits[index].unavailable = true;
        this.patch({ journey: old });
        await this.session();
      }
      throw e;
    }
  }
  async history(index: number) {
    const j = this.state.journey;
    if (index < 0 || index >= j.visits.length || index === j.cursor) return;
    await this.navigate(j.visits[index].id, 'history', index);
  }
  async retryNavigation() {
    const retry = this.state.navigationRetry;
    if (retry) await this.navigate(retry.id, retry.intent, retry.index);
  }
}
