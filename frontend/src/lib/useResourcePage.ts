import { browseResources } from './resourceBrowse';
import type { BrowseQuery } from './resourceBrowse';
import { useRetainedQuery } from './useRetainedQuery';
const fetchPage = (key: string, signal: AbortSignal) => browseResources(JSON.parse(key), signal);
export function useResourcePage(query: BrowseQuery, enabled = true) {
  return useRetainedQuery(JSON.stringify(query), enabled, (query.sort ?? 'recent') === 'recent' ? 'recent' : 'resources', fetchPage);
}
