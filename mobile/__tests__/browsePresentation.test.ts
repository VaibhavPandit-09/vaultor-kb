import { counted, rowMetadata } from '../src/browsePresentation';
import type { BrowseRow } from '../src/browse';

test('metadata names useful memberships and removes current-scope repetition without mutation', () => {
  const row: BrowseRow = {
    id: 'r',
    title: 'Resource',
    kind: 'resource',
    resource: {
      id: 'r',
      title: 'Resource',
      type: 'note',
      collections: [
        { id: 'a', name: 'Research' },
        { id: 'b', name: 'Reading' },
      ],
    },
  };
  const original = JSON.stringify(row);
  expect(rowMetadata(row)).toBe('Research · Reading');
  expect(rowMetadata(row, 'a')).toBe('Reading');
  expect(JSON.stringify(row)).toBe(original);
  row.resource!.collections = [{ id: 'a', name: 'Research' }];
  expect(rowMetadata(row, 'a')).toBe('');
});

test('counts are grammatical, unknown names are safe, and file format remains useful', () => {
  expect(counted(0, 'resource')).toBe('0 resources');
  expect(
    rowMetadata({ id: 'c', title: 'Collection', kind: 'collection', count: 1 }),
  ).toBe('1 resource');
  const row: BrowseRow = {
    id: 'r',
    title: 'File',
    kind: 'resource',
    resource: {
      id: 'r',
      title: 'File',
      type: 'file',
      mimeType: 'application/pdf',
      collections: [{ id: 'a', name: '' }],
    },
  };
  expect(rowMetadata(row)).toBe('PDF · 1 collection');
  expect(rowMetadata(row, 'a')).toBe('PDF');
});
