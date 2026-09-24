import { searchResourcePage } from './resourceSearch';
import { browseResources } from './resourceBrowse';
import type { BrowseQuery } from './resourceBrowse';
import { useRetainedQuery } from './useRetainedQuery';
const fetchPage = (key: string, signal: AbortSignal) => {const query=JSON.parse(key);return query.q?.trim()?searchResourcePage(query,signal):browseResources(query,signal);};
export function useResourcePage(query: BrowseQuery, enabled = true) {
  return useRetainedQuery(JSON.stringify(query), enabled, (query.sort ?? 'recent') === 'recent' ? 'recent' : 'resources', fetchPage);
}
