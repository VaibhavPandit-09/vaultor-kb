import { MobileWorkspace, HostError, type Port } from '../src/workspace';
const scope = JSON.stringify(['host', 'workspace', 'generation']);
function setup() {
  const note = {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'note',
    title: 'Offline title',
    revision: 'r1',
    content: { type: 'doc', content: [] },
  };
  let revoked = false;
  const sessions: Record<string, any> = {
    [scope]: {
      scope,
      hostId: 'host',
      noteId: note.id,
      view: 'note',
      localOnly: true,
      journey: { visits: [{ id: note.id, title: note.title }], cursor: 0 },
    },
  };
  const api = jest.fn(async () => {
    if (revoked) throw new HostError(403, 'Revoked');
    throw Error('Outside LAN');
  });
  const local = jest.fn(async (action: string, a: any) => {
    if (action === 'available') return { scope };
    if (action === 'activate')
      return { hostId: 'host', workspaceId: 'workspace', epoch: 'e1' };
    if (action === 'read') {
      if (a.path.includes(note.id)) return note;
      return { items: [note], totalItems: 1, totalPages: 1 };
    }
  });
  const port: Port = {
    api,
    companion: local as any,
    activate: jest.fn(),
    uuid: async () => '',
    storage: async <T>(action: string, a: any = {}) => {
      if (action === 'bootstrap')
        return {
          selected: 'host',
          epoch: 'e1',
          profiles: [{ hostId: 'host', workspaceId: 'workspace' }],
          drafts: [],
          sessions,
        } as T;
      if (action === 'putSession') sessions[a.scope] = a;
      if (action === 'getSession') return sessions[a.scope] as T;
      return null as T;
    },
  };
  return {
    model: new MobileWorkspace(port),
    api,
    local,
    note,
    revoke: () => {
      revoked = true;
    },
    sessions,
  };
}
test('explicit offline companion cold restores without network; linked opens and browse use only its scope', async () => {
  const x = setup();
  await x.model.initialize();
  expect(x.api).not.toHaveBeenCalled();
  expect(x.model.state.downloaded).toBe(true);
  expect(x.model.state.note?.title).toBe('Offline title');
  await x.model.browseApi('/resources?q=body');
  await x.model.quickApi('/organization/pins');
  expect(
    x.local.mock.calls.every(c => c[0] !== 'read' || c[1].scope === scope),
  ).toBe(true);
  expect(x.api).not.toHaveBeenCalled();
});
test('verified revocation hides mounted offline original and never falls back to downloaded bytes', async () => {
  const x = setup();
  await x.model.initialize();
  x.revoke();
  await x.model.connect(false);
  expect(x.model.state.connection).toBe('revoked');
  expect(x.model.state.note).toBeUndefined();
  expect(x.model.state.content).toBeUndefined();
  expect(x.model.state.downloaded).toBe(false);
});
test('removal clears only matching downloaded UI; quick requests do not own Library cancellation', async () => {
  const x = setup();
  await x.model.initialize();
  x.model.removedCompanion('different');
  expect(x.model.state.note).toBeDefined();
  x.model.removedCompanion(scope);
  expect(x.model.state.note).toBeUndefined();
  expect(x.model.state.scope).toBe('');
});
test('optional offline storage failure does not stop connected reading', async () => {
  const note = {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'note',
    title: 'Connected',
    revision: 'r1',
    content: { type: 'doc', content: [] },
  };
  const storage = async <T>(action: string) =>
    (action === 'bootstrap'
      ? {
          selected: 'host',
          epoch: 'e',
          profiles: [{ hostId: 'host' }],
          drafts: [],
          sessions: {},
        }
      : null) as T;
  const port: Port = {
    storage,
    activate: jest.fn(),
    uuid: async () => '',
    companion: async () => {
      throw Error('Damaged optional database');
    },
    api: async (_h, path) =>
      path === '/capabilities'
        ? { apiProtocolVersion: 3, minimumClientProtocolVersion: 3 }
        : path === '/workspace/identity'
        ? { id: 'workspace', generation: 'generation' }
        : note,
  };
  const model = new MobileWorkspace(port);
  await model.initialize();
  expect(model.state.connection).toBe('online');
  expect(model.state.offlineWarning).toContain('Offline storage');
  await model.open(note.id);
  expect(model.state.note?.title).toBe('Connected');
});
test('shortcut cancellation and requests are independent of the Library lane', async () => {
  const api = jest.fn(async (..._args: any[]) => ({
      items: [],
      totalItems: 0,
      totalPages: 0,
    })),
    cancelBrowse = jest.fn(),
    cancelQuick = jest.fn();
  const model = new MobileWorkspace({
    api,
    cancelBrowse,
    cancelQuick,
    storage: jest.fn(),
    activate: jest.fn(),
    uuid: async () => '',
  });
  model.state = {
    ...model.state,
    host: { hostId: 'host', epoch: 'e', address: 'https://127.0.0.1:1' },
    scope,
    connection: 'online',
  };
  await model.browseApi('/resources?page=0&size=100');
  await model.quickApi('/organization/pins?page=0&size=12&q=');
  model.cancelQuick();
  expect(api.mock.calls[0][5]).toBe('browse');
  expect(api.mock.calls[1][5]).toBe('quick');
  expect(cancelQuick).toHaveBeenCalledTimes(1);
  expect(cancelBrowse).not.toHaveBeenCalled();
});
test('verified local refresh preserves the reading destination and ignores another source', async () => {
  const x = setup();
  await x.model.initialize();
  await x.model.showBrowser();
  const before = x.model.state.browseVersion;
  x.local.mockClear();
  await x.model.refreshDownloaded('another scope');
  expect(x.local).not.toHaveBeenCalled();
  expect(x.model.state.browseVersion).toBe(before);
  x.note.revision = 'r2';
  x.note.content = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [] }],
  } as any;
  await x.model.refreshDownloaded(scope);
  expect(x.model.state.view).toBe('browse');
  expect(x.model.state.note?.revision).toBe('r2');
  expect(x.model.state.browseVersion).toBe(before + 1);
});
test('a refreshed checkpoint with an unavailable current note keeps its old reading copy visibly identified', async () => {
  const x = setup();
  await x.model.initialize();
  const content = x.model.state.content;
  x.local.mockRejectedValueOnce(Error('Not downloaded'));
  await x.model.refreshDownloaded(scope);
  expect(x.model.state.content).toBe(content);
  expect(x.model.state.error).toContain('older reading copy');
});

test('a missed native lock event is caught on foreground without network or protected-data writes', async () => {
  const x = setup();
  await x.model.initialize();
  expect(x.model.state.content).toBeDefined();
  x.local.mockImplementationOnce(async () => ({ scope, locked: true }));
  await x.model.verifyRetainedAccess();
  expect(x.model.state.connection).toBe('revoked');
  expect(x.model.state.content).toBeUndefined();
  expect(x.model.state.note).toBeUndefined();
  expect(x.model.state.preview).toBeUndefined();
  expect(x.api).not.toHaveBeenCalled();
});

test('an inactive source lock cannot clear the current reader', async () => {
  const x = setup();
  await x.model.initialize();
  const content = x.model.state.content;
  x.model.lockCompanion(JSON.stringify(['other', 'workspace', 'generation']));
  expect(x.model.state.content).toBe(content);
  expect(x.model.state.downloaded).toBe(true);
});
