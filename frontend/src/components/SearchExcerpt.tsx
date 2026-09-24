import type { SearchSnippet } from '../lib/resourceSearch';
export default function SearchExcerpt({snippet}:{snippet:SearchSnippet}) {
 const parts=[];let cursor=0;for(const [i,range] of snippet.highlights.entries()){const start=Math.max(cursor,range.start),end=Math.min(snippet.text.length,range.end);if(end<=start)continue;parts.push(snippet.text.slice(cursor,start),<mark key={i} className="search-excerpt-mark">{snippet.text.slice(start,end)}</mark>);cursor=end;}parts.push(snippet.text.slice(cursor));
 return <span>{parts}</span>;
}
