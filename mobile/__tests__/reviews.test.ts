import { captureSeed, locatorLabel } from '../src/reviews';
import { MobileWorkspace } from '../src/workspace';
const host = '00000000-0000-4000-8000-000000000001',
  workspace = '00000000-0000-4000-8000-000000000002';
const state = () => ({
  ...new MobileWorkspace({} as any).snapshot(),
  host: {
    hostId: host,
    epoch: 'e',
    address: 'https://127.0.0.1:1',
    workspaceId: workspace,
  },
  scope: JSON.stringify([host, workspace, 'generation']),
  note: {
    id: host,
    type: 'note',
    title: 'Saved',
    revision: 'r',
    content: { type: 'doc' },
  },
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'alpha ' },
          { type: 'text', text: 'beta', marks: [{ type: 'bold' }] },
        ],
      },
    ],
  },
  downloaded: true,
});
test('full source and exact block evidence freeze independently of focus and original JSON', () => {
  const s = state(),
    original = JSON.stringify(s.content);
  const seed = captureSeed(s, {
    quote: 'alpha beta',
    context: 'alpha beta',
    path: '/0',
    revision: 'r',
  });
  s.scope = JSON.stringify([host, host, 'replacement']);
  s.note.title = 'Changed';
  expect(seed.scope).toBe(JSON.stringify([host, workspace, 'generation']));
  expect(seed.targetTitle).toBe('Saved');
  expect(seed.locator).toEqual({ kind: 'block', path: '0' });
  expect(JSON.stringify(s.content)).toBe(original);
});
test('rejects stale, fabricated, oversized and foreign evidence without shortening it', () => {
  const s = state();
  for (const evidence of [
    { quote: 'alpha', context: '', path: '/0', revision: 'old' },
    { quote: 'wrong', context: '', path: '/0', revision: 'r' },
    { quote: 'a'.repeat(4001), context: '', revision: 'r' },
    { quote: 'alpha', context: '', path: '/999', revision: 'r' },
  ])
    expect(() => captureSeed(s, evidence)).toThrow();
  s.host.workspaceId = host;
  expect(() => captureSeed(s)).toThrow();
});
test('rendered PDF page binds the file, never its parent note or zero-based request', () => {
  const s = {
    ...state(),
    preview: {
      id: workspace,
      title: 'File',
      type: 'file',
      mimeType: 'application/pdf',
      revision: 'pdf-r',
    },
  };
  const seed = captureSeed(s, undefined, 8);
  expect(seed.resourceId).toBe(workspace);
  expect(seed.baseRevision).toBe('pdf-r');
  expect(seed.locator).toEqual({ kind: 'page', page: 8 });
  expect(locatorLabel(seed.locator)).toBe('PDF page 8');
  for (const page of [0, 1.5, 100001])
    expect(() => captureSeed(s, undefined, page)).toThrow();
});
