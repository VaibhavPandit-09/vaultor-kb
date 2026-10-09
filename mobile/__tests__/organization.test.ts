import { Organization } from '../src/organization';
import { HostError, type MobileWorkspace } from '../src/workspace';
const id = '00000000-0000-4000-8000-000000000001',
  op = '00000000-0000-4000-8000-000000000002';
function setup() {
  const journal = new Map<string, any>(),
    requests: any[] = [];
  const state: any = {
    scope: 'scope',
    browse: {},
    host: { epoch: 'epoch' },
    note: undefined,
  };
  let reply: any;
  let failure = false;
  const model: any = {
    state,
    operationId: jest.fn(async () => op),
    organizationChanged: jest.fn(async () => {}),
    prepareResource: jest.fn(async () => {}),
    report: jest.fn(),
    organizationStorage: jest.fn(async (action: string, v: any) => {
      if (action === 'putOrganization')
        journal.set(v.key, JSON.parse(JSON.stringify(v)));
      if (action === 'getOrganization') return journal.get(v.key) ?? null;
      if (action === 'ackOrganization' && journal.get(v.key)?.id === v.id)
        journal.delete(v.key);
    }),
    organizationApi: jest.fn(
      async (path: string, method: string, body: any, revision: string) => {
        requests.push({ path, method, body, revision });
        if (failure) throw Error('Offline');
        if (reply !== undefined) return reply;
        if (path.endsWith('/summary'))
          return { id, title: 'Note', type: 'note', revision: 'r1' };
        if (path.endsWith('/usage')) return { sources: 2 };
        return {};
      },
    ),
  };
  return {
    model,
    org: new Organization(model as MobileWorkspace),
    journal,
    requests,
    setReply: (v: any) => (reply = v),
    setFailure: (v: boolean) => (failure = v),
  };
}
const resource = { id, title: 'Note', type: 'note', revision: 'r1' };
test('lost lifecycle acknowledgement reuses exact durable UUID/body after reopening', async () => {
  const t = setup();
  t.setFailure(true);
  await expect(t.org.lifecycle(resource, 'trash')).rejects.toThrow('Offline');
  expect(t.journal.size).toBe(1);
  t.setFailure(false);
  t.setReply([{ resourceId: id, operationId: op, status: 'trashed' }]);
  await new Organization(t.model).lifecycle(
    { ...resource, revision: 'r2' },
    'trash',
  );
  expect(t.requests[1].body).toEqual(t.requests[0].body);
  expect(t.journal.size).toBe(0);
  expect(t.model.operationId).toHaveBeenCalledTimes(1);
});
test('failed and cleanup-pending operations stay durable; cleanup reuses server identity', async () => {
  const t = setup();
  t.setReply([{ resourceId: id, operationId: op, status: 'failed' }]);
  await t.org.lifecycle(resource, 'trash');
  expect(t.journal.size).toBe(1);
  t.setReply([{ resourceId: id, operationId: op, status: 'cleanup-pending' }]);
  await t.org.lifecycle({ ...resource, trashedAt: 'now' }, 'purge');
  expect(t.journal.size).toBe(2);
  await expect(
    t.org.reviewLatest({ ...resource, cleanupPending: true }, 'purge'),
  ).rejects.toThrow('existing');
});
test('uncertain collection creation preserves original name and identity', async () => {
  const t = setup();
  t.setFailure(true);
  await expect(t.org.createCollection(' First ')).rejects.toThrow();
  t.setFailure(false);
  await new Organization(t.model).createCollection('Different');
  expect(t.requests[1].body).toEqual({ name: 'First', resourceIds: [] });
  expect(t.requests[1].path).toBe(t.requests[0].path);
  expect(t.journal.size).toBe(0);
});
test('duplicate concurrent execution is rejected before dispatch', async () => {
  const t = setup();
  let release!: () => void;
  t.model.organizationApi.mockImplementation(
    () =>
      new Promise(r => {
        release = () =>
          r([{ resourceId: id, operationId: op, status: 'trashed' }]);
      }),
  );
  const first = t.org.lifecycle(resource, 'trash');
  await expect(t.org.lifecycle(resource, 'trash')).rejects.toThrow(
    'already pending',
  );
  for (let i = 0; i < 10; i++) await Promise.resolve();
  release();
  await first;
  expect(t.model.organizationApi).toHaveBeenCalledTimes(1);
});
test('workspace/connection generation changes cannot target another host', async () => {
  const t = setup();
  t.model.state.host.epoch = 'next';
  await expect(
    t.org.pin({ kind: 'resource', id, title: 'Note' }, true),
  ).rejects.toThrow('Workspace changed');
  expect(t.requests).toHaveLength(0);
});
test('membership explicitly adds/removes originals without delete calls', async () => {
  const t = setup();
  await t.org.membership([id], op, true);
  await t.org.membership([id], op, false);
  expect(t.requests.map(r => r.body.action)).toEqual(['add', 'remove']);
  expect(t.requests.every(r => r.path === '/organization/memberships')).toBe(
    true,
  );
  await expect(t.org.membership([], op, true)).rejects.toThrow();
});
test('saved usage review requires protected source and fresh revision; keep drafts is explicit', async () => {
  const t = setup();
  const r = await t.org.review([resource], 'trash', true);
  expect(t.model.prepareResource).toHaveBeenCalledWith(id, true);
  expect(r[0].sources).toBe(2);
  t.model.prepareResource.mockRejectedValue(Error('Save failed'));
  await expect(t.org.review([resource], 'trash')).rejects.toThrow(
    'Save failed',
  );
  expect(t.requests.every(r => r.method !== 'PUT')).toBe(true);
});
test('references are bounded and title rename uses revision checks', async () => {
  const t = setup();
  await t.org.references(id, 'outgoing', 2);
  expect(t.requests[0].path).toBe(
    '/resources/' + id + '/references?direction=outgoing&page=2&size=30',
  );
  await t.org.rename({ kind: 'resource', id, title: 'Note' }, ' New ', 'r1');
  expect(t.requests.at(-1)).toMatchObject({
    method: 'PATCH',
    body: { title: 'New' },
    revision: '"r1"',
  });
  await expect(
    t.org.rename({ kind: 'resource', id, title: 'Note' }, 'Changed', 'stale'),
  ).rejects.toThrow('Resource changed');
});

test('tag names use JSON and membership IDs without encoded paths', async () => {
  const t = setup();
  t.setReply({ id: op });
  await t.org.tag(id, ' With spaces ', true);
  expect(t.requests[0]).toMatchObject({
    path: '/tags',
    method: 'POST',
    body: { name: 'With spaces' },
  });
  expect(t.requests[1].body).toMatchObject({
    kind: 'tag',
    targetId: op,
    action: 'add',
  });
  await t.org.tag(id, 'With spaces', false, op);
  expect(t.requests.at(-1).body.action).toBe('remove');
});

test('cleanup retry uses the committed server intent even after another device superseded a failed request', async () => {
  const t = setup();
  const remote = '00000000-0000-4000-8000-000000000003';
  t.journal.set('lifecycle:' + id + ':purge', {
    scope: 'scope',
    key: 'lifecycle:' + id + ':purge',
    id: op,
    body: { operationId: op, resourceId: id, action: 'purge', revision: 'old' },
  });
  const committed = {
    operationId: remote,
    resourceId: id,
    action: 'purge',
    revision: 'committed',
  };
  t.model.organizationApi.mockImplementation(
    async (path: string, method: string, body: any) =>
      path.endsWith('/lifecycle-pending')
        ? committed
        : (expect(body).toEqual([committed]),
          [{ operationId: remote, resourceId: id, status: 'purged' }]),
  );
  await t.org.lifecycle({ ...resource, cleanupPending: true }, 'purge');
  expect(t.model.operationId).not.toHaveBeenCalled();
  expect(t.journal.size).toBe(0);
});

test('reviewing a new revision cannot discard an uncertain lifecycle identity', async () => {
  const t = setup();
  t.setFailure(true);
  await expect(t.org.lifecycle(resource, 'restore')).rejects.toThrow();
  await expect(t.org.reviewLatest(resource, 'restore')).rejects.toThrow(
    'uncertain',
  );
  expect(t.journal.size).toBe(1);
  t.setFailure(false);
  t.setReply([{ operationId: op, resourceId: id, status: 'failed' }]);
  await t.org.lifecycle(resource, 'restore');
  await t.org.reviewLatest(resource, 'restore');
  expect(t.journal.size).toBe(0);
});

test('confirmed absent collection UUID after a name conflict permits a new name without losing input identity', async () => {
  const t = setup();
  t.model.organizationApi
    .mockRejectedValueOnce(new HostError(409, 'Conflict', 'CONFLICT'))
    .mockRejectedValueOnce(new HostError(404, 'Missing', 'NOT_FOUND'));
  await expect(t.org.createCollection('Taken')).rejects.toThrow(
    'Choose another name',
  );
  expect(t.journal.size).toBe(0);
  t.model.operationId.mockResolvedValue('00000000-0000-4000-8000-000000000003');
  t.model.organizationApi.mockResolvedValue({ id, name: 'Available' });
  await t.org.createCollection('Available');
  expect(t.model.organizationApi.mock.calls[2][0]).toContain(
    '00000000-0000-4000-8000-000000000003',
  );
  expect(t.model.organizationApi.mock.calls[2][2].name).toBe('Available');
});
test.each(['busy', 'unknown', 'existing', 'lookup-failed'])(
  'collection %s outcome cannot release an uncertain creation identity',
  async kind => {
    const t = setup();
    t.model.organizationApi.mockRejectedValueOnce(
      new HostError(
        409,
        'Conflict',
        kind === 'busy'
          ? 'WORKSPACE_BUSY'
          : kind === 'unknown'
          ? undefined
          : 'CONFLICT',
      ),
    );
    if (kind === 'existing')
      t.model.organizationApi.mockResolvedValueOnce({ id: op });
    if (kind === 'lookup-failed')
      t.model.organizationApi.mockRejectedValueOnce(
        new HostError(503, 'Offline'),
      );
    await expect(t.org.createCollection('Original')).rejects.toThrow(
      'Conflict',
    );
    expect(t.journal.get('collection:create').body.name).toBe('Original');
    expect(t.model.organizationApi).toHaveBeenCalledTimes(
      kind === 'busy' || kind === 'unknown' ? 1 : 2,
    );
  },
);
