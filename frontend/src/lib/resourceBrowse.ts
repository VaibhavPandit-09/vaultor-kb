import api from './api';
import {resourceFilter} from './resourceKinds';
import { notifyResourceChange } from './resourceEvents';
import type { ResourceSummary } from '../types';
export type ResourcePage = { items: ResourceSummary[]; page: number; size: number; totalItems: number; totalPages: number;appliedCategory?:string;fileCoverage?:import("./resourceSearch").FileCoverage };
export type BrowseQuery = { collection?: string; page?: number; size?: number; q?: string; type?: string; category?:string; tags?: string[]; favorites?: boolean; sort?: 'title' | 'updated' | 'recent' };
export function browseResources(query: BrowseQuery = {}, signal?: AbortSignal): Promise<ResourcePage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({...query,...(query.type?resourceFilter(query.type):{})})) {
    if (key === 'tags') (value as string[]).forEach(tag => params.append('tag', tag));
    else if (value !== undefined) params.set(key, String(value));
  }
  return api.get<ResourcePage>('/resources', { params, signal, backgroundDiagnostic: true }).then(response => {const category=query.category??resourceFilter(query.type??'all').category;if(category&&response.data.appliedCategory!==category)throw new Error('Update the connected host to 0.6.0 to filter file categories.');return response.data;});
}
export function resourcesChanged(ids?: string[], membershipChanged = false) { notifyResourceChange({kind:'metadata',ids,membershipChanged}); }
export async function setResourceFavorite(id: string, favorite: boolean) {
  await api.put(`/resources/${id}/favorite`, { favorite }, {backgroundDiagnostic:true}); notifyResourceChange({kind:'pins',entity:'resource',id,favorite});
}
