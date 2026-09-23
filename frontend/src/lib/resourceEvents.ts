export type ResourceChange =
  | { kind: 'opened'; id: string; phase: 'pending' | 'settled' }
  | { kind: 'metadata'; ids?: string[]; membershipChanged?: boolean }
  | { kind: 'organization'; entity: 'tag' | 'collection' | 'all'; resourceIds?: string[] }
  | { kind: 'pins'; entity: 'resource' | 'collection'; id: string; favorite?: boolean }
  | { kind: 'workspace' };
const eventName = 'vaultor:resource-change';
export function notifyResourceChange(change: ResourceChange) {
  window.dispatchEvent(new CustomEvent<ResourceChange>(eventName, { detail: change }));
}
export function subscribeResourceChanges(listener: (change: ResourceChange) => void) {
  const receive = (event: Event) => listener((event as CustomEvent<ResourceChange>).detail);
  window.addEventListener(eventName, receive);
  return () => window.removeEventListener(eventName, receive);
}
export type RefreshScope = 'resources' | 'recent' | 'tags' | 'collections' | 'pins';
export function affectsScope(change: ResourceChange, scope: RefreshScope) {
  if (change.kind === 'workspace') return true;
  if (change.kind === 'opened') return scope === 'recent';
  if (scope === 'pins') return change.kind === 'pins' || change.kind === 'metadata' || (change.kind === 'organization' && change.entity !== 'tag');
  if (change.kind === 'metadata') return scope === 'resources' || scope === 'recent' || Boolean(change.membershipChanged);
  if (change.kind === 'pins') return change.entity === 'resource' ? scope === 'resources' || scope === 'recent' : scope === 'collections';
  if (scope === 'resources' || scope === 'recent') return true;
  return change.entity === 'all' || (scope === 'tags' ? change.entity === 'tag' : change.entity === 'collection');
}
