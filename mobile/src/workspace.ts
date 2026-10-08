import { type Doc, type Note, scopeFor } from './bridge';

export type Host = { hostId: string; address: string; epoch: string };
export type Position = { anchor: number; head: number; scroll: number };
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
};
export type Summary = Pick<
  Draft,
  'scope' | 'noteId' | 'title' | 'version' | 'resolved' | 'recoveryKey'
>;
export type Session = {
  scope: string;
  hostId: string;
  noteId?: string;
  position?: Position;
  at?: number;
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
};
export interface Port {
  storage<T>(action: string, value?: object): Promise<T>;
  activate(id: string): Promise<Host>;
  api(
    host: Host,
    path: string,
    method?: string,
    body?: unknown,
    revision?: string,
  ): Promise<any>;
  uuid(): Promise<string>;
}
export class HostError extends Error {
  constructor(public status: number, message: string) {
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
  };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private epoch = 0;
  private navigation = 0;
  private edits = 0;
  constructor(private port: Port) {}
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
        });
      }
      this.patch({ scope, connection: 'online' });
      const list = await this.port.api(
        host,
        '/resources?page=0&size=30&type=note',
      );
      this.valid(epoch);
      this.patch({ notes: list.items });
      if (restore && !this.state.note) {
        const session = await this.port.storage<Session | null>('getSession', {
          scope,
        });
        this.valid(epoch);
        const b = await this.port.storage<Bootstrap>('bootstrap');
        this.valid(epoch);
        const id =
          session?.noteId ??
          b.drafts.find(d => d.scope === scope && !d.resolved)?.noteId;
        if (id) await this.open(id, session?.position);
      } else if (this.state.note) await this.reconcile();
      await this.refreshRecovery();
    } catch (e) {
      if (epoch !== this.epoch) return;
      const revoked =
        e instanceof HostError && (e.status === 401 || e.status === 403);
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
      .filter(s => s.hostId === host.hostId && s.noteId)
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
    if (!session?.noteId) return;
    const note = await this.port.storage<Note | null>('getCache', {
      scope: session.scope,
      noteId: session.noteId,
    });
    if (!note) return;
    const draft = await this.port.storage<Draft | null>('getDraft', {
      scope: session.scope,
      noteId: session.noteId,
    });
    this.valid(epoch);
    this.patch({
      scope: session.scope,
      note,
      draft: draft?.resolved ? undefined : draft ?? undefined,
      content: draft && !draft.resolved ? draft.content : contentOf(note),
      position: session.position,
      loadId: this.state.loadId + 1,
      status: 'Offline · last opened note retained',
      supported: false,
      conflict: false,
      unavailable: false,
    });
  }
  async open(id: string, position?: Position) {
    await this.protect();
    const host = this.state.host;
    if (!host) return;
    const epoch = this.epoch,
      ticket = ++this.navigation,
      scope = this.state.scope;
    let note: Note;
    try {
      note = await this.port.api(host, '/resources/' + id);
    } catch (e) {
      if (e instanceof HostError && (e.status === 404 || e.status === 410)) {
        const cached = await this.port.storage<Note | null>('getCache', {
          scope,
          noteId: id,
        });
        const d = await this.port.storage<Draft | null>('getDraft', {
          scope,
          noteId: id,
        });
        this.valid(epoch);
        if (ticket !== this.navigation) return;
        if (cached || d) {
          note = cached ?? {
            id,
            type: 'note',
            title: d!.title,
            revision: d!.revision,
            content: d!.content,
          };
          const retained = d ?? {
            scope,
            noteId: id,
            title: note.title,
            revision: note.revision,
            content: contentOf(note),
            version: Date.now() + ':' + ++this.edits,
          };
          await this.port.storage('putDraft', retained);
          this.valid(epoch);
          if (ticket !== this.navigation) return;
          this.patch({
            note,
            draft: retained,
            content: retained.content,
            position,
            loadId: this.state.loadId + 1,
            unavailable: true,
            conflict: true,
            supported: false,
            status: 'Saved note unavailable · local version retained',
          });
          return;
        }
      }
      throw e;
    }
    this.valid(epoch);
    if (ticket !== this.navigation) return;
    if (note.type !== 'note')
      throw Error('This destination is not an editable note.');
    const d = await this.port.storage<Draft | null>('getDraft', {
      scope,
      noteId: id,
    });
    this.valid(epoch);
    if (ticket !== this.navigation) return;
    let draft =
      d && !d.resolved
        ? {
            ...d,
            title:
              d.title === 'Recovered note' || !d.title ? note.title : d.title,
          }
        : undefined;
    if (note.trashedAt && !draft) {
      draft = {
        scope,
        noteId: id,
        title: note.title,
        revision: note.revision,
        content: contentOf(note),
        version: Date.now() + ':' + ++this.edits,
      };
      await this.port.storage('putDraft', draft);
      this.valid(epoch);
      if (ticket !== this.navigation) return;
    }
    const conflict = Boolean(
      note.trashedAt || (draft && draft.revision !== note.revision),
    );
    await this.port.storage('putCache', { scope, noteId: id, note });
    this.valid(epoch);
    if (ticket !== this.navigation) return;
    this.patch({
      note,
      draft,
      content: draft?.content ?? contentOf(note),
      position,
      loadId: this.state.loadId + 1,
      supported: false,
      conflict,
      unavailable: Boolean(note.trashedAt),
      status: note.trashedAt
        ? 'Note is in Trash · local version retained'
        : conflict
        ? 'Saved version changed · review recovery'
        : draft
        ? 'Recovered protected draft'
        : 'Saved',
    });
    await this.session();
  }
  loaded() {
    this.patch({ supported: true });
  }
  unsupported() {
    this.patch({
      supported: false,
      error: 'Unsupported content retained. Editing and saving are disabled.',
    });
  }
  changed(content: Doc) {
    const { note, host, scope } = this.state;
    if (!note || !host || this.state.conflict || this.state.unavailable) return;
    const draft: Draft = {
      scope,
      noteId: note.id,
      title: note.title,
      revision: this.state.draft?.revision ?? note.revision,
      content,
      version: Date.now() + ':' + ++this.edits,
    };
    this.patch({ draft, content, status: 'Protecting draft…' });
    this.queue = this.queue
      .catch(() => {})
      .then(() => this.port.storage('putDraft', draft))
      .then(() => {
        if (this.state.draft?.version === draft.version)
          this.patch({ status: 'Unsaved · protected on this device' });
      })
      .catch(e => {
        this.patch({ status: 'Recovery write failed' });
        this.report(e);
        throw e;
      });
    void this.queue.catch(() => {});
  }
  async protect() {
    await this.queue.catch(() => {});
    if (this.state.draft) await this.port.storage('putDraft', this.state.draft);
  }
  reading(position: Position) {
    this.patch({ position });
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
      });
  }
  async save() {
    const { draft, host, note, scope } = this.state;
    if (!draft) return;
    if (
      !host ||
      !note ||
      !this.state.supported ||
      this.state.conflict ||
      this.state.unavailable
    )
      throw Error(
        'Save is unavailable. Review recovery, or explicitly keep the protected draft and switch.',
      );
    const epoch = this.epoch;
    await this.protect();
    this.valid(epoch);
    this.patch({ status: 'Saving…' });
    try {
      const saved: Note = await this.port.api(
        host,
        '/resources/' + note.id + '/note',
        'PUT',
        { title: draft.title, content: draft.content },
        `"${draft.revision}"`,
      );
      this.valid(epoch);
      await this.port.storage('ackDraft', {
        scope,
        noteId: note.id,
        version: draft.version,
      });
      this.valid(epoch);
      const latest = this.state.draft;
      if (latest && latest.version !== draft.version) {
        const rebased = { ...latest, revision: saved.revision };
        await this.port.storage('putDraft', rebased);
        this.valid(epoch);
        this.patch({
          note: saved,
          draft: rebased,
          status: 'Unsaved · protected on this device',
        });
      } else
        this.patch({
          note: saved,
          draft: undefined,
          status: 'Saved',
          connection: 'online',
        });
      await this.port.storage('putCache', {
        scope,
        noteId: note.id,
        note: saved,
      });
      await this.refreshRecovery();
    } catch (e) {
      if (epoch !== this.epoch) return;
      if (e instanceof HostError && e.status === 412) {
        this.patch({
          conflict: true,
          status: 'Saved version changed · draft retained',
        });
      } else if (
        e instanceof HostError &&
        (e.status === 404 || e.status === 410)
      ) {
        this.patch({
          conflict: true,
          unavailable: true,
          status: 'Saved note unavailable · draft retained',
        });
      } else {
        this.patch({
          status: 'Save failed · draft retained',
          connection:
            e instanceof HostError && (e.status === 401 || e.status === 403)
              ? 'revoked'
              : 'offline',
        });
      }
      throw e;
    }
  }
  async reconcile() {
    const { host, note, scope } = this.state;
    if (!host || !note) return;
    const epoch = this.epoch,
      ticket = this.navigation;
    try {
      const saved: Note = await this.port.api(host, '/resources/' + note.id);
      this.valid(epoch);
      if (ticket !== this.navigation) return;
      if (saved.trashedAt) throw new HostError(410, 'Note is in Trash.');
      if (saved.revision === note.revision) {
        this.patch({ connection: 'online', unavailable: false });
        return;
      }
      if (this.state.draft) {
        this.patch({
          conflict: true,
          status: 'Changed on another device · draft retained',
        });
        return;
      }
      await this.port.storage('putCache', {
        scope,
        noteId: note.id,
        note: saved,
      });
      this.valid(epoch);
      if (ticket !== this.navigation) return;
      if (this.state.draft) {
        this.patch({
          conflict: true,
          status: 'Changed on another device · draft retained',
        });
        return;
      }
      this.patch({
        note: saved,
        content: contentOf(saved),
        loadId: this.state.loadId + 1,
        connection: 'online',
        status: 'Updated from host',
        supported: false,
        conflict: false,
        unavailable: false,
      });
    } catch (e) {
      if (epoch !== this.epoch) return;
      if (e instanceof HostError && (e.status === 404 || e.status === 410)) {
        if (!this.state.draft) this.changed(contentOf(note));
        await this.protect();
        this.patch({
          unavailable: true,
          conflict: true,
          status: 'Saved note unavailable · local version retained',
        });
      } else {
        this.patch({
          connection:
            e instanceof HostError && (e.status === 401 || e.status === 403)
              ? 'revoked'
              : 'offline',
        });
        throw e;
      }
    }
  }
  async useSaved() {
    const { host, note, draft, scope } = this.state;
    if (!host || !note) return;
    await this.protect();
    const epoch = this.epoch;
    const saved: Note = await this.port.api(host, '/resources/' + note.id);
    this.valid(epoch);
    if (saved.trashedAt)
      throw Error(
        'Note is in Trash. Restore it on the host or create a recovered copy.',
      );
    await this.port.storage('putCache', {
      scope,
      noteId: note.id,
      note: saved,
    });
    this.valid(epoch);
    if (draft)
      await this.port.storage('keepSaved', {
        scope,
        noteId: note.id,
        version: draft.version,
      });
    this.valid(epoch);
    this.patch({
      draft: undefined,
      note: saved,
      content: contentOf(saved),
      conflict: false,
      unavailable: false,
      status: 'Saved version · former draft retained in Recovery',
      loadId: this.state.loadId + 1,
      supported: false,
    });
    await this.refreshRecovery();
  }
  async recoveredCopy(summary: Summary) {
    const { host, scope } = this.state;
    if (!host) return;
    await this.protect();
    const draft = await this.port.storage<Draft | null>('getDraft', summary);
    if (!draft) throw Error('Recovery record is no longer available.');
    const epoch = this.epoch;
    if (draft.copyScope && draft.copyScope !== scope)
      throw Error(
        'Retry this pending copy on its original destination before copying to another workspace.',
      );
    const copy = {
      ...draft,
      copyId: draft.copyId ?? (await this.port.uuid()),
      copyScope: scope,
    };
    await this.port.storage('putDraft', copy);
    this.valid(epoch);
    if (
      this.state.draft?.version === copy.version &&
      this.state.draft.scope === copy.scope &&
      this.state.draft.noteId === copy.noteId
    ) {
      this.patch({
        draft: copy,
        conflict: true,
        status: 'Recovery copy pending · original draft retained',
      });
    }
    // Retry this exact UUID/title/document; an uncertain result cannot duplicate the copy.
    const saved: Note = await this.port.api(
      host,
      '/resources/imports/' + copy.copyId,
      'PUT',
      {
        title: copy.title.slice(0, 460) + ' (recovered)',
        content: copy.content,
      },
    );
    this.valid(epoch);
    await this.port.storage('ackDraft', {
      scope: summary.scope,
      noteId: summary.noteId,
      version: copy.version,
      recoveryKey: copy.recoveryKey,
    });
    this.valid(epoch);
    if (
      this.state.draft?.version === copy.version &&
      this.state.draft.scope === copy.scope &&
      this.state.draft.noteId === copy.noteId
    )
      this.patch({ draft: undefined });
    await this.open(saved.id);
    this.patch({ status: 'Recovered copy created' });
    await this.refreshRecovery();
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
    });
    await this.session();
    await this.refreshRecovery();
  }
  async switchHost(id: string, keep = false) {
    await this.protect();
    if (this.state.draft && !keep) await this.save();
    await this.protect();
    const host = await this.port.activate(id);
    this.epoch++;
    this.navigation++;
    this.patch({
      host,
      scope: '',
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
  async removeRecovery(summary: Summary) {
    await this.port.storage('ackDraft', summary);
    await this.refreshRecovery();
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
      });
    }
  }
  async changedFeed() {
    if (!this.state.busy) await this.connect(false);
  }
}
