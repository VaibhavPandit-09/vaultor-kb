import { presentation, type BrowseRow } from './browse';

export const counted = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Current-scope membership is already explained by collection orientation. */
export function rowMetadata(row: BrowseRow, collectionId?: string) {
  if (row.kind === 'collection')
    return row.count === undefined
      ? 'Collection'
      : counted(row.count, 'resource');
  const resource = row.resource!;
  const others = resource.collections?.filter(c => c.id !== collectionId) ?? [];
  const names = others.map(c => c.name?.trim()).filter(Boolean);
  const association =
    names.length === others.length && names.length
      ? names.slice(0, 2).join(' · ') +
        (names.length > 2 ? ` +${names.length - 2}` : '')
      : others.length
      ? counted(others.length, 'collection')
      : '';
  const kind = presentation(resource).label;
  return resource.type === 'note'
    ? association
    : [kind, association].filter(Boolean).join(' · ');
}
