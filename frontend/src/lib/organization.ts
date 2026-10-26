import api from './api';
import { notifyResourceChange } from './resourceEvents';
import { useRetainedQuery } from './useRetainedQuery';
export type OrganizationKind = 'collection' | 'tag';
export type OrganizationItem = { id: string; name: string; count: number; favorite?: boolean; color?: string; parentId?: string | null; ancestors?: {id:string;name:string}[]; childCount?: number };
export type OrganizationPage = { exactMatch?: boolean; items: OrganizationItem[]; page: number; totalPages: number; totalItems: number };
export function collectionDeletionDestination(current:OrganizationItem|null,deletedIds:string[],parentId?:string|null):OrganizationItem|null|undefined {
  if(!current||!deletedIds.includes(current.id))return undefined;
  if(!parentId)return null;
  return {...(current.ancestors?.find(a=>a.id===parentId)??{id:parentId,name:'Collection'}),count:0};
}
export function organizationChanged(entity: OrganizationKind | 'all' = 'all', resourceIds?: string[]) {
  notifyResourceChange({ kind: 'organization', entity, resourceIds });
}
async function fetchPage(key: string, signal: AbortSignal) {
  const [kind,q,page,favorites,size,parent] = JSON.parse(key);
  const {data} = await api.get<OrganizationPage>(kind === 'collection' ? '/collections' : '/tags/browse', { params: {q,page,favorites,size,...(parent!==null?{parent}:{})}, signal, backgroundDiagnostic: true });
  return data;
}
export function useOrganizationPage(kind: OrganizationKind, query = '', page = 0, enabled = true, favorites = false, size = 30, parent: string | null = null) {
  return useRetainedQuery(JSON.stringify([kind,query,page,favorites,size,parent]), enabled, kind === 'collection' ? 'collections' : 'tags', fetchPage);
}

export const collectionPath = (item: {name:string;ancestors?:{id:string;name:string}[]}) => [...(item.ancestors ?? []).map(a=>a.name),item.name].join(" / ");
