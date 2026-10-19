import {
  BrowseMemory,
  navigationLayout,
  reviewGroups,
} from '../src/navigationPresentation';
import { defaultBrowse } from '../src/browse';
import type { CaptureItem } from '../src/reviews';

test('Library state survives utility destinations and remains isolated by full source', () => {
  const memory = new BrowseMemory();
  const library = {
    ...defaultBrowse(),
    query: 'offline',
    collection: { id: '00000000-0000-4000-8000-000000000001', name: 'Collection' },
    page: 2,
    scroll: 540,
  };
  const recent = memory.select('["h","w","g1"]', library, 'recent');
  expect(recent).toEqual({ ...defaultBrowse(), destination: 'recent' });
  expect(memory.select('["h","w","g1"]', recent, 'library')).toEqual(library);
  expect(memory.select('["h","w","g2"]', recent, 'library')).toEqual(
    defaultBrowse(),
  );
  expect(memory.select('["other","w","g1"]', recent, 'library')).toEqual(
    defaultBrowse(),
  );
  expect(library.scroll).toBe(540);
});

test('adaptive navigation responds to available dimensions and font scaling', () => {
  expect(navigationLayout(412, 890, 1)).toEqual({
    rail: false,
    stacked: false,
  });
  expect(navigationLayout(412, 890, 2)).toEqual({ rail: false, stacked: true });
  expect(navigationLayout(320, 640, 1).stacked).toBe(true);
  expect(navigationLayout(900, 412, 1).rail).toBe(false);
  expect(navigationLayout(1000, 800, 1).rail).toBe(true);
  expect(navigationLayout(1000, 800, 1.5).rail).toBe(false);
});

test('Review groups all local records without conflating provenance or rewriting records', () => {
  const item = (hostId: string, generation: string, id: string) =>
    ({
      id,
      source: {
        hostId,
        workspaceId: 'w',
        generation,
        workspaceName: 'Same name',
      },
    } as CaptureItem);
  const a = item('h', 'g1', '1'),
    b = item('h', 'g1', '2'),
    c = item('h', 'g2', '3'),
    d = item('other', 'g1', '4');
  const original = JSON.stringify([a, b, c, d]);
  const groups = reviewGroups([a, b, c, d]);
  expect(groups.map(g => g.data.map(v => v.id))).toEqual([
    ['1', '2'],
    ['3'],
    ['4'],
  ]);
  expect(groups[0].data[0]).toBe(a);
  expect(JSON.stringify([a, b, c, d])).toBe(original);
});
