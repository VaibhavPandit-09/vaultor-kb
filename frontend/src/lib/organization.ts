import api from './api';
import { notifyResourceChange } from './resourceEvents';
import { useRetainedQuery } from './useRetainedQuery';
export type OrganizationKind = 'collection' | 'tag';
export type OrganizationItem = { id: string; name: string; count: number; favorite?: boolean; color?: string };
export type OrganizationPage = { items: OrganizationItem[]; page: number; totalPages: number; totalItems: number };
export function organizationChanged(entity: OrganizationKind | 'all' = 'all', resourceIds?: string[]) {
  notifyResourceChange({ kind: 'organization', entity, resourceIds });
}
async function fetchPage(key: string, signal: AbortSignal) {
  const [kind,q,page,favorites,size] = JSON.parse(key);
  const {data} = await api.get<OrganizationPage>(kind === 'collection' ? '/collections' : '/tags/browse', { params: {q,page,favorites,size}, signal, backgroundDiagnostic: true });
  return data;
}
export function useOrganizationPage(kind: OrganizationKind, query = '', page = 0, enabled = true, favorites = false, size = 30) {
  return useRetainedQuery(JSON.stringify([kind,query,page,favorites,size]), enabled, kind === 'collection' ? 'collections' : 'tags', fetchPage);
}
