import { searchResourcePage, type SearchMode } from './resourceSearch';
import { browseResources } from './resourceBrowse';
import type { BrowseQuery } from './resourceBrowse';
import { useRetainedQuery } from './useRetainedQuery';
const fetchPage = (key: string, signal: AbortSignal) => {const {searchMode='title',...query}=JSON.parse(key);return searchMode==='content'&&query.q?.trim()?searchResourcePage(query,signal):browseResources(query,signal);};
export function useResourcePage(query: BrowseQuery & {searchMode?:SearchMode}, enabled = true) {
  return useRetainedQuery(JSON.stringify(query), enabled, (query.sort ?? 'recent') === 'recent' ? 'recent' : 'resources', fetchPage);
}
