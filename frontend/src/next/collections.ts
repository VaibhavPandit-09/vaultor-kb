import type { Collection } from './client';
export function collectionPaths(collections: Collection[]) {
  const byId = new Map(collections.map(c => [c.id,c]));
  const paths = new Map<string,string>();
  for (const c of collections) {
    const names = [c.name], seen = new Set([c.id]); let p = c.parentId;
    while (p && !seen.has(p)) { seen.add(p); const parent=byId.get(p); if(!parent)break; names.unshift(parent.name); p=parent.parentId; }
    paths.set(c.id,names.join(' / '));
  }
  return paths;
}
