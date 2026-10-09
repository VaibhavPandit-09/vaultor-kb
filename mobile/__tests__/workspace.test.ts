import {
  MobileWorkspace,
  HostError,
  type Host,
  type Port,
  type Draft,
} from '../src/workspace';
import { scopeFor, type Doc, type Note } from '../src/bridge';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const doc = (text: string): Doc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const id = '00000000-0000-4000-8000-000000000001',
  other = '00000000-0000-4000-8000-000000000002';
function setup() {
  const hosts = [
    { hostId: 'a', address: 'https://192.168.1.2' },
    { hostId: 'b', address: 'https://192.168.1.3' },
  ];
  const data = {
    selected: 'a',
    epoch: 'e1',
    profiles: hosts,
    drafts: {} as Record<string, Draft>,
    sessions: {} as Record<string, any>,
    cache: {} as Record<string, Note>,
  };
  const server: Record<string, Record<string, Note>> = {
    a: {
      [id]: {
        id,
        type: 'note',
        title: 'Original',
        revision: 'r1',
        content: doc('saved'),
      },
    },
    b: {
      [id]: {
        id,
        type: 'note',
        title: 'Other host',
        revision: 'b1',
        content: doc('other'),
      },
    },
  };
  let generation = 'g1',
    failure = 0,
    offline = false,
    copies: string[] = [],
    hold: Promise<void> | undefined;
  const key = (v: any) => v.recoveryKey || v.scope + '\n' + v.noteId;
  const port: Port = {
    uuid: async () => other,
    activate: async hostId => {
      data.selected = hostId;
      data.epoch += 'x';
      return { ...hosts.find(h => h.hostId === hostId)!, epoch: data.epoch };
    },
    storage: async <T>(action: string, value: any = {}): Promise<T> => {
      const k = key(value);
      let result: any = {};
      if (action === 'bootstrap')
        result = { ...data, drafts: Object.values(data.drafts) };
      if (action === 'getDraft') result = data.drafts[k] ?? null;
      if (action === 'putDraft') data.drafts[k] = clone(value);
      if (action === 'ackDraft' && data.drafts[k]?.version === value.version)
        delete data.drafts[k];
      if (action === 'keepSaved' && data.drafts[k]?.version === value.version) {
        const archive = k + '\n' + value.version;
        data.drafts[archive] = {
          ...data.drafts[k],
          resolved: true,
          recoveryKey: archive,
        };
        delete data.drafts[k];
      }
      if (action === 'getSession') result = data.sessions[value.scope] ?? null;
      if (action === 'putSession') data.sessions[value.scope] = clone(value);
      if (action === 'getCache') result = data.cache[k] ?? null;
      if (action === 'putCache') data.cache[k] = clone(value.note);
      return clone(result);
    },
    api: async (host: Host, path, method = 'GET', body: any, revision) => {
      if (hold && method === 'PUT') await hold;
      if (offline) throw Error('Host offline');
      if (failure) throw new HostError(failure, 'Refused');
      if (path === '/capabilities')
        return { apiProtocolVersion: 3, minimumClientProtocolVersion: 3 };
      if (path === '/workspace/identity')
        return { id: 'workspace', generation };
      if (path.includes('?'))
        return { items: Object.values(server[host.hostId]) };
      if (path.includes('/imports/')) {
        const target = path.split('/').at(-1)!;
        copies.push(target);
        return (server[host.hostId][target] ??= {
          id: target,
          type: 'note',
          title: body.title,
          content: body.content,
          revision: 'copy1',
        });
      }
      const target = path.split('/')[2],
        n = server[host.hostId][target];
      if (!n) throw new HostError(404, 'Missing');
      if (method === 'PUT') {
        if (revision !== `"${n.revision}"`) throw new HostError(412, 'Changed');
        server[host.hostId][target] = {
          ...n,
          ...body,
          revision: n.revision + 'x',
        };
      }
      return clone(server[host.hostId][target]);
    },
  };
  const model = new MobileWorkspace(port);
  return {
    model,
    port,
    data,
    server,
    copies,
    setFailure: (v: number) => (failure = v),
    setOffline: (v: boolean) => (offline = v),
    setGeneration: (v: string) => (generation = v),
    setHold: (v: Promise<void> | undefined) => (hold = v),
  };
}
async function opened() {
  const x = setup();
  await x.model.initialize();
  await x.model.open(id);
  x.model.loaded();
  return x;
}

test('linked journey, history positions and browse context persist without losing drafts', async () => {
  const x = await opened();
  x.server.a[other] = { ...x.server.a[id], id: other, title: 'Second' };
  x.model.changed(doc('protected'));
  x.model.reading({ anchor: 2, head: 2, scroll: 70 });
  await x.model.navigate(other, 'linked');
  expect(x.model.state.journey.visits.map(v => v.id)).toEqual([id, other]);
  await x.model.history(0);
  expect(x.model.state.content).toEqual(doc('protected'));
  expect(x.model.state.position?.scroll).toBe(70);
  x.model.updateBrowse({
    ...x.model.state.browse,
    query: 'find',
    type: 'note',
    scroll: 83,
  });
  const load = x.model.state.loadId;
  await x.model.showBrowser();
  await x.model.returnToNote();
  expect(x.model.state.loadId).toBe(load);
  const restored = new MobileWorkspace(x.port);
  await restored.initialize();
  expect(restored.state.journey.cursor).toBe(0);
  expect(restored.state.browse.query).toBe('find');
  expect(restored.state.browse.scroll).toBe(83);
  const twice = new MobileWorkspace(x.port);
  await twice.initialize();
  expect(twice.state.journey.cursor).toBe(0);
  expect(twice.state.browse.query).toBe('find');
});
test('failed journey leaves source visible and deleted history step retryable', async () => {
  const x = await opened();
  x.server.a[other] = { ...x.server.a[id], id: other };
  await x.model.navigate(other, 'linked');
  delete x.server.a[id];
  await expect(x.model.history(0)).rejects.toThrow('Missing');
  expect(x.model.state.note?.id).toBe(other);
  expect(x.model.state.journey.cursor).toBe(1);
  expect(x.model.state.journey.visits[0].unavailable).toBe(true);
  expect(x.model.state.navigationRetry?.id).toBe(id);
  x.server.a[id] = { ...x.server.a[other], id, title: 'Restored' };
  await x.model.retryNavigation();
  expect(x.model.state.journey.visits[0].unavailable).toBe(false);
});
test('rapid destination loads cannot commit an obsolete note', async () => {
  const x = await opened();
  x.server.a[other] = { ...x.server.a[id], id: other, title: 'Second' };
  const original = x.port.api;
  let release!: (n: Note) => void;
  x.port.api = async (h, path, ...args) =>
    path === '/resources/' + other
      ? new Promise<Note>(r => (release = r))
      : original(h, path, ...args);
  const first = x.model.navigate(other, 'linked');
  await new Promise<void>(r => setTimeout(r, 0));
  // A subsequent direct open of the current note must supersede the pending load.
  await x.model.routeResource(id);
  release(x.server.a[other]);
  await first;
  expect(x.model.state.note?.id).toBe(id);
  expect(x.model.state.journey.visits).toHaveLength(1);
});
test('file links never replace note or extend journey; generation resets layout only', async () => {
  const x = await opened();
  x.server.a[other] = { ...x.server.a[id], id: other, type: 'file' };
  const journey = x.model.state.journey;
  await x.model.routeResource(other, true);
  expect(x.model.state.preview?.id).toBe(other);
  expect(x.model.state.note?.id).toBe(id);
  expect(x.model.state.journey).toBe(journey);
  x.model.changed(doc('local'));
  await x.model.protect();
  x.setGeneration('g2');
  await x.model.connect();
  expect(x.model.state.journey.visits).toHaveLength(0);
  expect(x.model.state.view).toBe('browse');
  expect(Object.values(x.data.drafts)).toHaveLength(1);
});
test('pending drafts restore by matching host/workspace/revision and session position', async () => {
  const x = await opened();
  x.model.changed(doc('draft'));
  x.model.reading({ anchor: 3, head: 3, scroll: 90 });
  await x.model.protect();
  const restored = new MobileWorkspace(x.port);
  await restored.initialize();
  expect(restored.state.content).toEqual(doc('draft'));
  expect(restored.state.position?.scroll).toBe(90);
  expect(restored.state.conflict).toBe(false);
});
test('Save acknowledges only its edit; typing during save remains dirty on new revision', async () => {
  const x = await opened();
  x.model.changed(doc('first'));
  await x.model.protect();
  let release!: () => void;
  x.setHold(new Promise<void>(r => (release = r)));
  const saving = x.model.save();
  await new Promise<void>(r => setTimeout(r, 0));
  x.model.changed(doc('later'));
  release();
  await saving;
  expect(x.model.state.draft?.content).toEqual(doc('later'));
  expect(x.model.state.draft?.revision).toBe('r1x');
  expect(Object.values(x.data.drafts)[0].content).toEqual(doc('later'));
});
test('foreign edits retain both versions; use saved retains separate recovery', async () => {
  const x = await opened();
  x.model.changed(doc('mine'));
  await x.model.protect();
  x.server.a[id].revision = 'r2';
  x.server.a[id].content = doc('theirs');
  await x.model.reconcile();
  expect(x.model.state.conflict).toBe(true);
  await expect(x.model.save()).rejects.toThrow();
  await x.model.useSaved();
  expect(x.model.state.content).toEqual(doc('theirs'));
  expect(Object.values(x.data.drafts)[0].resolved).toBe(true);
  expect(Object.values(x.data.drafts)[0].content).toEqual(doc('mine'));
});
test('412 from conditional Save keeps protected original', async () => {
  const x = await opened();
  x.model.changed(doc('mine'));
  x.server.a[id].revision = 'r2';
  await expect(x.model.save()).rejects.toBeInstanceOf(HostError);
  expect(x.model.state.conflict).toBe(true);
  expect(Object.values(x.data.drafts)[0].content).toEqual(doc('mine'));
});
test('failed Save retries exact draft without changing saved revision', async () => {
  const x = await opened();
  x.model.changed(doc('mine'));
  x.setOffline(true);
  await expect(x.model.save()).rejects.toThrow();
  expect(x.model.state.connection).toBe('offline');
  expect(x.server.a[id].revision).toBe('r1');
  x.setOffline(false);
  await x.model.save();
  expect(Object.values(x.data.drafts)).toHaveLength(0);
  expect(x.server.a[id].content).toEqual(doc('mine'));
});
test('unknown successful outcome is retained and cannot overwrite a foreign revision', async () => {
  const x = await opened();
  x.model.changed(doc('mine'));
  const api = x.port.api;
  x.port.api = async (...args) => {
    const result = await api(...args);
    if (args[2] === 'PUT') throw Error('Lost reply');
    return result;
  };
  await expect(x.model.save()).rejects.toThrow();
  expect(x.model.state.draft).toBeDefined();
  x.port.api = api;
  await expect(x.model.save()).rejects.toBeInstanceOf(HostError);
  expect(x.server.a[id].content).toEqual(doc('mine'));
});
test('recovered copy uncertain retry reuses import UUID and retains original', async () => {
  const x = await opened();
  let uuidCalls = 0;
  x.port.uuid = async () => {
    uuidCalls++;
    return uuidCalls === 1 ? other : '00000000-0000-4000-8000-000000000099';
  };
  x.model.changed(doc('mine'));
  await x.model.protect();
  await x.model.refreshRecovery();
  const api = x.port.api;
  let uncertain = true;
  x.port.api = async (...args) => {
    const result = await api(...args);
    if (args[1].includes('/imports/') && uncertain) {
      uncertain = false;
      throw Error('Lost reply');
    }
    return result;
  };
  const summary = x.model.state.recovery[0];
  await expect(x.model.recoveredCopy(summary)).rejects.toThrow();
  await x.model.recoveredCopy(summary);
  expect(x.copies).toEqual([other, other]);
  expect(uuidCalls).toBe(1);
  expect(Object.keys(x.server.a)).toHaveLength(2);
  expect(x.server.a[id].content).toEqual(doc('saved'));
});
test('switch failure stays at source until explicit keep; other host never receives draft', async () => {
  const x = await opened();
  x.model.changed(doc('mine'));
  x.setOffline(true);
  await expect(x.model.switchHost('b')).rejects.toThrow();
  expect(x.model.state.host?.hostId).toBe('a');
  x.setOffline(false);
  await x.model.switchHost('b', true);
  expect(x.model.state.host?.hostId).toBe('b');
  expect(x.model.state.draft).toBeUndefined();
  expect(x.server.b[id].content).toEqual(doc('other'));
  expect(Object.values(x.data.drafts)[0].scope).toBe(
    scopeFor('a', 'workspace', 'g1'),
  );
});
test('new generation invalidates layout while retaining separate draft', async () => {
  const x = await opened();
  x.model.changed(doc('mine'));
  await x.model.protect();
  x.setGeneration('g2');
  await x.model.connect(false);
  expect(x.model.state.note).toBeUndefined();
  expect(x.model.state.scope).toBe(scopeFor('a', 'workspace', 'g2'));
  expect(Object.values(x.data.drafts)[0].scope).toBe(
    scopeFor('a', 'workspace', 'g1'),
  );
});
test('missing saved note is read-only with recoverable content', async () => {
  const x = await opened();
  delete x.server.a[id];
  await x.model.reconcile();
  expect(x.model.state.unavailable).toBe(true);
  expect(x.model.state.draft?.content).toEqual(doc('saved'));
});
test('clean notification accepts saved state; dirty notification never replaces editor', async () => {
  const x = await opened();
  x.server.a[id].revision = 'r2';
  x.server.a[id].content = doc('foreign');
  await x.model.reconcile();
  expect(x.model.state.content).toEqual(doc('foreign'));
  x.model.loaded();
  x.model.changed(doc('mine'));
  x.server.a[id].revision = 'r3';
  await x.model.reconcile();
  expect(x.model.state.content).toEqual(doc('mine'));
});
test('offline restart retains last cached note and protected draft without claiming full offline access', async () => {
  const x = await opened();
  x.model.changed(doc('mine'));
  await x.model.protect();
  x.setOffline(true);
  const restored = new MobileWorkspace(x.port);
  await restored.initialize();
  expect(restored.state.connection).toBe('offline');
  expect(restored.state.content).toEqual(doc('mine'));
});
test('revoked approval keeps draft, locks connection, does not restore clean offline content', async () => {
  const x = await opened();
  x.model.changed(doc('mine'));
  await x.model.protect();
  x.setFailure(401);
  await x.model.connect(false);
  expect(x.model.state.connection).toBe('revoked');
  expect(x.model.state.draft).toBeDefined();
});
test('an obsolete delayed resource response cannot replace the new host', async () => {
  const x = await opened();
  let release!: (v: Note) => void;
  const api = x.port.api;
  x.port.api = (h, p, ...rest) =>
    h.hostId === 'a' && p === '/resources/' + other
      ? new Promise<Note>(r => (release = r))
      : api(h, p, ...rest);
  const opening = x.model.open(other);
  await new Promise<void>(r => setTimeout(r, 0));
  await x.model.switchHost('b', true);
  release({
    id: other,
    type: 'note',
    title: 'Stale',
    revision: 'r1',
    content: doc('stale'),
  });
  await expect(opening).rejects.toThrow('Connection changed');
  expect(x.model.state.host?.hostId).toBe('b');
  expect(x.model.state.note).toBeUndefined();
});

test('choosing saved content retains an independent former draft after new editing', async () => {
  const x = await opened();
  x.model.changed(doc('former'));
  await x.model.protect();
  x.server.a[id].revision = 'foreign';
  x.server.a[id].content = doc('foreign');
  await x.model.reconcile();
  await x.model.useSaved();
  const retained = x.model.state.recovery[0];
  x.model.loaded();
  x.model.changed(doc('new edit'));
  await x.model.protect();
  expect(Object.values(x.data.drafts)).toHaveLength(2);
  expect((await x.port.storage<Draft>('getDraft', retained)).content).toEqual(
    doc('former'),
  );
  expect(x.data.cache[x.model.state.scope + '\n' + id].content).toEqual(
    doc('foreign'),
  );
});
test('copying active recovery does not recreate the acknowledged source draft', async () => {
  const x = await opened();
  x.model.changed(doc('local'));
  await x.model.protect();
  await x.model.refreshRecovery();
  await x.model.recoveredCopy(x.model.state.recovery[0]);
  expect(Object.values(x.data.drafts)).toHaveLength(0);
  expect(x.model.state.note?.id).toBe(other);
  expect(x.server.a[id].content).toEqual(doc('saved'));
});
test('foreign trash retains source locally and prevents saving', async () => {
  const x = await opened();
  x.server.a[id].trashedAt = 'now';
  await x.model.reconcile();
  expect(x.model.state.unavailable).toBe(true);
  expect(x.model.state.draft?.content).toEqual(doc('saved'));
  await expect(x.model.save()).rejects.toThrow('Save is unavailable');
});

test('restart after foreign trash turns a cached clean note into recoverable content', async () => {
  const x = await opened();
  delete x.server.a[id];
  const restored = new MobileWorkspace(x.port);
  await restored.initialize();
  expect(restored.state.unavailable).toBe(true);
  expect(restored.state.draft?.content).toEqual(doc('saved'));
  expect(restored.state.recovery).toHaveLength(1);
  await restored.recoveredCopy(restored.state.recovery[0]);
  expect(restored.state.note?.id).toBe(other);
});

test('Home origin, retained draft and Library query survive direct opens and restart', async () => {
  const { model, data, port } = setup();
  await model.initialize();
  await model.showHome();
  await model.navigate(id, 'direct');
  model.loaded();
  model.changed(doc('protected from Home'));
  await model.protect();
  expect(model.snapshot().noteOrigin).toBe('home');
  await model.leaveNote();
  expect(model.snapshot().view).toBe('home');
  expect(model.snapshot().content).toEqual(doc('protected from Home'));
  expect(Object.values(data.sessions)[0].view).toBe('home');
  const restored = new MobileWorkspace(port);
  await restored.initialize();
  expect(restored.snapshot().view).toBe('home');
  expect(restored.snapshot().noteOrigin).toBe('home');
  await restored.returnToNote();
  expect(restored.snapshot().content).toEqual(doc('protected from Home'));
});
