import {
  MobileWorkspace,
  HostError,
  type Port,
  type Draft,
} from '../src/workspace';
import { scopeFor, type Note } from '../src/bridge';
const id = '00000000-0000-4000-8000-000000000001',
  other = '00000000-0000-4000-8000-000000000002';
const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
function setup() {
  const scope = scopeFor('host', 'workspace', 'g1'),
    draft: Draft = {
      scope,
      noteId: id,
      title: 'Unsaved',
      revision: 'r0',
      content: doc('legacy unsaved'),
      version: 'v1',
      sent: {
        version: 'v1',
        revision: 'r0',
        title: 'Unsaved',
        content: doc('uncertain'),
      },
    };
  const notes: Record<string, Note> = {
    [id]: {
      id,
      type: 'note',
      title: 'Saved title',
      revision: 'r1',
      content: doc('saved'),
    },
    [other]: {
      id: other,
      type: 'note',
      title: 'Other',
      revision: 'r1',
      content: doc('other'),
    },
  };
  const writes: string[] = [],
    storageWrites: string[] = [],
    sessions: Record<string, any> = {},
    cache: Record<string, Note> = {};
  let offline = false,
    storageFailure = false,
    generation = 'g1',
    hold: Promise<void> | undefined;
  const port: Port = {
    uuid: async () => other,
    activate: async () => ({
      hostId: 'host',
      address: 'https://192.168.1.2',
      epoch: 'e2',
    }),
    storage: async <T>(action: string, v: any = {}): Promise<T> => {
      if (
        ['putDraft', 'ackDraft', 'ackCreation', 'ackOrganization'].includes(
          action,
        )
      )
        throw Error('Recovery must not change');
      if (action.startsWith('put')) {
        storageWrites.push(action);
        if (storageFailure) throw Error('Storage full');
      }
      if (action === 'bootstrap')
        return {
          selected: 'host',
          epoch: 'e1',
          profiles: [{ hostId: 'host', address: 'https://192.168.1.2' }],
          drafts: [draft],
          sessions,
        } as T;
      if (action === 'getSession') return (sessions[v.scope] ?? null) as T;
      if (action === 'putSession') sessions[v.scope] = v;
      if (action === 'getCache') return (cache[v.noteId] ?? null) as T;
      if (action === 'putCache') cache[v.noteId] = v.note;
      return {} as T;
    },
    api: async (_h, path, method = 'GET') => {
      if (method !== 'GET') {
        writes.push(path);
        if (!path.endsWith('/open')) throw Error('Mutation');
        return {};
      }
      if (offline) throw Error('Offline');
      if (path === '/capabilities')
        return { apiProtocolVersion: 3, minimumClientProtocolVersion: 3 };
      if (path === '/workspace/identity')
        return { id: 'workspace', generation };
      if (path === '/settings/workspace') return {};
      if (path.includes('/summary')) return notes[path.split('/')[2]];
      if (path.startsWith('/resources/')) {
        if (hold && path.endsWith(other)) await hold;
        const n = notes[path.split('/')[2]];
        if (!n) throw new HostError(404, 'Missing');
        return n;
      }
      return { items: [] };
    },
  };
  const model = new MobileWorkspace(port);
  return {
    model,
    draft,
    notes,
    writes,
    storageWrites,
    sessions,
    scope,
    cache,
    setOffline: (v: boolean) => {
      offline = v;
    },
    setStorageFailure: (v: boolean) => {
      storageFailure = v;
    },
    setGeneration: (v: string) => {
      generation = v;
    },
    setHold: (v: Promise<void>) => {
      hold = v;
    },
  };
}
test('upgrade reads saved content, retaining uncertain draft without acknowledgement', async () => {
  const x = setup();
  await x.model.initialize();
  await x.model.open(id);
  expect(x.model.state.content).toEqual(doc('saved'));
  expect(x.model.state.draft).toBeUndefined();
  expect(x.model.state.recovery).toEqual([x.draft]);
  expect(x.draft.sent?.content).toEqual(doc('uncertain'));
});
test('editing, creation and recovery-host writes are refused', async () => {
  const x = setup();
  await x.model.initialize();
  await x.model.open(id);
  x.model.changed(doc('evil'));
  x.model.enableAutosave(true);
  await expect(x.model.save()).rejects.toThrow('read-only');
  await expect(x.model.createNote('test')).rejects.toThrow('retired');
  await expect(x.model.recoveredCopy(x.draft)).rejects.toThrow('desktop');
  await expect(x.model.organizationApi('/tags', 'POST', {})).rejects.toThrow(
    'read-only',
  );
  await x.model.background();
  expect(x.writes).toEqual([]);
  expect(x.model.state.content).toEqual(doc('saved'));
});
test('background reconnect does not replay legacy receipts', async () => {
  const x = setup();
  await x.model.initialize();
  await x.model.open(id);
  await x.model.connect(false);
  await x.model.changedFeed();
  expect(x.writes).toEqual([]);
  expect(x.model.state.recovery[0].version).toBe('v1');
});
test('recovery storage failure does not gate loaded saved reading', async () => {
  const x = setup();
  await x.model.initialize();
  x.setStorageFailure(true);
  await x.model.open(id);
  expect(x.model.state.note?.id).toBe(id);
  expect(x.model.state.error).toContain('Storage full');
});
test('offline restore uses saved cache, never a draft as original', async () => {
  const x = setup();
  await x.model.initialize();
  await x.model.open(id);
  await x.model.background();
  x.setOffline(true);
  const m = new MobileWorkspace((x.model as any).port);
  await m.initialize();
  expect(m.state.content).toEqual(doc('saved'));
  expect(m.state.connection).toBe('offline');
  expect(x.draft.content).toEqual(doc('legacy unsaved'));
});
test('linked cycles are distinct and history reuses one reading surface', async () => {
  const x = setup();
  await x.model.initialize();
  await x.model.navigate(id);
  await x.model.navigate(other, 'linked');
  await x.model.navigate(id, 'linked');
  expect(x.model.state.journey.visits.map(v => v.id)).toEqual([id, other, id]);
  await x.model.history(0);
  expect(x.model.state.journey.cursor).toBe(0);
  await x.model.navigate(other, 'linked');
  expect(x.model.state.journey.visits).toHaveLength(2);
});
test('superseded destination cannot replace later reading choice', async () => {
  const x = setup();
  await x.model.initialize();
  await x.model.open(id);
  let done!: () => void;
  x.setHold(
    new Promise(r => {
      done = r;
    }),
  );
  const pending = x.model.navigate(other, 'linked');
  await x.model.navigate(id);
  done();
  await pending;
  expect(x.model.state.note?.id).toBe(id);
});
test('failed destination leaves saved source and trail intact', async () => {
  const x = setup();
  await x.model.initialize();
  await x.model.navigate(id);
  await expect(x.model.navigate('missing', 'linked')).rejects.toThrow(
    'Missing',
  );
  expect(x.model.state.note?.id).toBe(id);
  expect(x.model.state.journey.visits).toHaveLength(1);
  expect(x.model.state.navigationRetry?.id).toBe('missing');
});
test('source replacement retains former recovery, clears reading', async () => {
  const x = setup();
  await x.model.initialize();
  await x.model.open(id);
  x.setGeneration('g2');
  await x.model.connect(false);
  expect(x.model.state.note).toBeUndefined();
  expect(x.model.state.recovery[0].scope).toBe(x.scope);
  expect(x.writes).toEqual([]);
});
test('reading position and browsing context persist independently of drafts', async () => {
  const x = setup();
  await x.model.initialize();
  await x.model.open(id);
  x.model.reading({ anchor: 0, head: 0, scroll: 420 });
  await x.model.background();
  expect(x.sessions[x.scope].position.scroll).toBe(420);
  expect(x.storageWrites).not.toContain('putDraft');
});

test('unchanged saved refresh does not reload the selected reading DOM', async () => {
  const x = setup();
  await x.model.initialize();
  await x.model.open(id);
  const load = x.model.state.loadId;
  await x.model.reconcile();
  expect(x.model.state.loadId).toBe(load);
});

test('remote refresh updates hidden saved content without leaving browsing', async () => {
  const x = setup();
  await x.model.initialize();
  await x.model.open(id);
  await x.model.showBrowser();
  x.notes[id] = {
    ...x.notes[id],
    revision: 'r2',
    content: doc('remote saved update'),
  };
  await x.model.reconcile();
  expect(x.model.state.view).toBe('browse');
  expect(x.model.state.content).toEqual(doc('remote saved update'));
});

test('history between two visits of the same note restores their distinct positions', async () => {
  const x = setup();
  await x.model.initialize();
  await x.model.navigate(id);
  x.model.reading({
    anchor: 0,
    head: 0,
    scroll: 120,
    path: '/0',
    offset: 12,
    revision: 'r1',
  });
  await x.model.navigate(other, 'linked');
  await x.model.navigate(id, 'linked');
  x.model.reading({ anchor: 0, head: 0, scroll: 800 });
  const last = x.model.state.loadId;
  await x.model.history(0);
  expect(x.model.state.position?.scroll).toBe(120);
  expect(x.model.state.position?.path).toBe('/0');
  expect(x.model.state.loadId).toBeGreaterThan(last);
  expect(x.writes.filter(p => p.includes('/note'))).toEqual([]);
});

test('image gallery is source-bound, leaves the journey alone and retains its current file on failure', async () => {
  const x = setup(),
    a = '00000000-0000-4000-8000-000000000003',
    b = '00000000-0000-4000-8000-000000000004';
  x.notes[id].content = {
    type: 'doc',
    content: [
      { type: 'image', attrs: { resourceId: a } },
      { type: 'image', attrs: { resourceId: b } },
    ],
  } as any;
  x.notes[a] = {
    id: a,
    type: 'file',
    title: 'First image',
    mimeType: 'image/png',
  } as any;
  x.notes[b] = {
    id: b,
    type: 'file',
    title: 'Second image',
    mimeType: 'image/png',
  } as any;
  await x.model.initialize();
  await x.model.navigate(id);
  await x.model.routeResource(a, true);
  expect(x.model.state.previewGallery).toEqual([a, b]);
  const journey = x.model.state.journey;
  await x.model.previewGalleryItem(b);
  expect(x.model.state.preview?.id).toBe(b);
  expect(x.model.state.journey).toBe(journey);
  x.setOffline(true);
  await expect(x.model.previewGalleryItem(a)).rejects.toThrow('Offline');
  expect(x.model.state.preview?.id).toBe(b);
  expect(x.model.state.note?.id).toBe(id);
  x.model.dismissPreview();
  expect(x.model.state.previewGallery).toBeUndefined();
});

test('leaving for Library supersedes a pending linked-note load', async () => {
  const x = setup();
  await x.model.initialize();
  await x.model.navigate(id);
  let finish!: () => void;
  x.setHold(
    new Promise(r => {
      finish = r;
    }),
  );
  const pending = x.model.navigate(other, 'linked');
  await x.model.showBrowser();
  finish();
  await pending;
  expect(x.model.state.view).toBe('browse');
  expect(x.model.state.note?.id).toBe(id);
  expect(x.model.state.journey.visits).toHaveLength(1);
});
