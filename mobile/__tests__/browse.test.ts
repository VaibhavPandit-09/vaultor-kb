import {
  MobileBrowser,
  browsePath,
  defaultBrowse,
  normalizeBrowse,
  presentation,
} from '../src/browse';
import { advance, emptyJourney, normalizeJourney } from '../src/journey';
const id = '00000000-0000-4000-8000-000000000001';
const page = (title = 'One') => ({
  items: [{ id, type: 'note', title }],
  totalItems: 1,
  totalPages: 1,
});
test('title and content contracts preserve collection, query and bounded paging', () => {
  const c = {
    ...defaultBrowse(),
    query: 'a & b',
    collection: { id, name: 'Scope' },
    type: 'pdf',
    page: 3,
  };
  expect(browsePath(c)).toContain('/resources?page=3&size=100&q=a%20%26%20b');
  expect(browsePath(c)).toContain('collection=' + id);
  expect(browsePath(c)).toContain('category=pdf');
  expect(browsePath({ ...c, mode: 'content' })).toContain('/resources/query?');
  expect(browsePath({ ...c, destination: 'recent' })).toContain('sort=recent');
  expect(
    browsePath({ ...c, destination: 'pinned', type: 'collection' }),
  ).toContain('kind=collection');
  expect(
    browsePath({ ...c, destination: 'pinned', mode: 'content' }),
  ).toContain('favorites=true');
});
test('preferences reject invalid values and distinguish formats from storage kinds', () => {
  expect(
    normalizeBrowse({ type: 'collection', destination: 'library', page: -1 })
      .type,
  ).toBe('');
  expect(
    normalizeBrowse({
      type: 'collection',
      destination: 'pinned',
      mode: 'content',
    }).type,
  ).toBe('');
  expect(
    normalizeBrowse({ query: 'x'.repeat(600), scroll: Infinity }).query,
  ).toHaveLength(500);
  expect(presentation({ type: 'file', mimeType: 'image/png' })).toMatchObject({
    label: 'Image',
    action: 'preview',
  });
  expect(presentation({ type: 'future' })).toMatchObject({
    action: 'unsupported',
    icon: '◇',
  });
});
test('mixed pins preserve server order, collection identity and exact totals', async () => {
  const b = new MobileBrowser(
    async () => ({
      items: [
        { id, kind: 'collection', name: 'Alpha', count: 4 },
        {
          id: 'file',
          kind: 'file',
          resource: { id: 'file', type: 'file', title: 'Beta' },
        },
      ],
      totalItems: 201,
      totalPages: 3,
    }),
    () => {},
    () => {},
  );
  b.bind('host');
  await b.refresh();
  expect(b.state.rows.map(r => r.title)).toEqual(['Alpha', 'Beta']);
  expect(b.state.rows[0].kind).toBe('collection');
  expect(b.state.total).toBe(201);
});
test('late response ignored; background failure retains rows; scope switch clears unrelated rows', async () => {
  let resolve!: (v: any) => void;
  let fail = false;
  let slow = false;
  const b = new MobileBrowser(
    () =>
      fail
        ? Promise.reject(Error('Offline'))
        : slow
        ? new Promise(r => (resolve = r))
        : Promise.resolve(page()),
    jest.fn(),
    jest.fn(),
  );
  b.bind('host');
  await b.refresh();
  fail = true;
  await b.refresh();
  expect(b.state.rows).toHaveLength(1);
  expect(b.state.error).toBe('Offline');
  fail = false;
  slow = true;
  const old = b.refresh();
  b.configure({ query: 'latest' });
  resolve(page('Obsolete'));
  await old;
  expect(b.state.rows[0].title).toBe('One');
  b.configure({ collection: { id, name: 'Other' } });
  expect(b.state.rows).toEqual([]);
  b.bind('different-host');
  expect(b.state.applied).toBe('');
});
test('hidden requests are cancelled and cannot apply; reopening refreshes cached page', async () => {
  let resolve!: (v: any) => void;
  let slow = false;
  const cancel = jest.fn();
  const b = new MobileBrowser(
    () => (slow ? new Promise(r => (resolve = r)) : Promise.resolve(page())),
    cancel,
    () => {},
  );
  b.bind('host');
  await b.refresh();
  slow = true;
  const pending = b.refresh();
  b.suspend();
  resolve(page('Late'));
  await pending;
  expect(cancel).toHaveBeenCalled();
  expect(b.state.rows[0].title).toBe('One');
  slow = false;
  await b.refresh();
  expect(b.state.rows[0].title).toBe('One');
});
test('cycles are visits, current link no-op, branching drops forward and bounds to 200', () => {
  let j = advance(emptyJourney(), { id, title: 'A' }, false);
  j = advance(j, { id: 'b', title: 'B' }, true);
  j = advance(j, { id, title: 'A' }, true);
  expect(j.visits.map(v => v.title)).toEqual(['A', 'B', 'A']);
  expect(advance(j, { id, title: 'A' }, true)).toBe(j);
  j = { ...j, cursor: 0 };
  j = advance(j, { id: 'c', title: 'C' }, true);
  expect(j.visits.map(v => v.title)).toEqual(['A', 'C']);
  for (let n = 0; n < 250; n++)
    j = advance(j, { id: String(n), title: String(n) }, true);
  expect(j.visits).toHaveLength(200);
  expect(j.cursor).toBe(199);
  expect(
    normalizeJourney({
      visits: [
        { id, title: 'A', position: { anchor: -1, head: 2, scroll: 0 } },
      ],
      cursor: 0,
    }).visits[0].position,
  ).toBeUndefined();
});

test('Trash restores only title browsing without silently retained scope/type filters', () => {
  const b = normalizeBrowse({
    ...defaultBrowse(),
    destination: 'trash',
    mode: 'content',
    type: 'image',
    collection: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Collection',
    },
    query: 'image',
  });
  expect(b.mode).toBe('title');
  expect(b.type).toBe('');
  expect(b.collection).toBeUndefined();
  expect(browsePath(b)).toBe('/resources/trash?page=0&size=100&q=image');
});
