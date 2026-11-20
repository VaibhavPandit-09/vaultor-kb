import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {MessageSquare} from 'lucide-react';
import AppModal from './modals/AppModal';
import {BrowsePagination} from './BrowseLayout';
import {useRetainedQuery} from '../lib/useRetainedQuery';
import {flushSync} from 'react-dom';
import {getConnection} from '../lib/platform';
import {getAcceptedCapabilities} from '../lib/connection';
import {changeReview,fetchReviewPage,reviewError,subscribeReviews,type ReviewItem,type ReviewPage,type ReviewStatus} from '../lib/reviews';
import type {Resource} from '../types';

export type ReviewTarget=Pick<Resource,'id'|'title'>;
export type ReviewSource={
  fetch:(key:string,signal:AbortSignal)=>Promise<ReviewPage>;
  change:(item:ReviewItem,status:ReviewStatus,generation:string,scope:number|string)=>Promise<unknown>;
};
const hostSource:ReviewSource={fetch:fetchReviewPage,change:(item,status,generation,scope)=>changeReview(item,status,generation,Number(scope))};
type SourceProps={source?:ReviewSource;workspace?:string};
export function ReviewButton({resource,onOpen,source=hostSource,workspace,sidebar=false}:{resource:ReviewTarget|null;onOpen:()=>void;sidebar?:boolean}&SourceProps) {
  const enabled=workspace?true:getAcceptedCapabilities()?.reviews===1;
  const query=useRetainedQuery(JSON.stringify([workspace??getConnection().epoch,resource?.id??null,'open',0,workspace?0:1]),enabled,'resources',source.fetch);
  const retry=query.retry;
  useEffect(()=>subscribeReviews(retry),[retry]);
  if(!enabled)return null;
  const label=resource?`Reviews for ${resource.title}`:'Review inbox';
  return <button type="button" className={sidebar?'sidebar-nav':'library-button'} title={label} aria-label={`${label}${query.data?': '+query.data.counts.open+' open':''}`} onClick={onOpen}><MessageSquare size={15}/>{sidebar&&<span>{label}</span>}{query.data?.counts.open||null}</button>;
}
export default function ReviewInbox({resource,onClose,onOpen,source=hostSource,workspace}:{resource:ReviewTarget|null;onClose:()=>void;onOpen:(id:string)=>Promise<void|(()=>void)>}&SourceProps) {
  const [filter,setFilter]=useState<ReviewStatus|'all'>('open'),[page,setPage]=useState(0),[pending,setPending]=useState(''),[errors,setErrors]=useState<Record<string,string>>({});
  const lock=useRef(false),alive=useRef(true),initial=useRef<HTMLSelectElement>(null);
  const scope=useRef(workspace??getConnection().epoch).current;
  const supported=workspace?true:getAcceptedCapabilities()?.reviews===1;
  const query=useRetainedQuery(JSON.stringify([scope,resource?.id??null,filter,page]),supported,'resources',source.fetch);
  const retry=query.retry;
  useEffect(()=>subscribeReviews(retry),[retry]);
  useLayoutEffect(()=>{alive.current=true;initial.current?.focus();return()=>{alive.current=false;};},[]);
  const run=async(key:string,action:()=>Promise<unknown>)=>{
    if(lock.current)return;lock.current=true;setPending(key);setErrors(v=>({...v,[key]:''}));
    try{await action();}catch(e){if(alive.current && (workspace||scope===getConnection().epoch))setErrors(v=>({...v,[key]:reviewError(e)}));}
    finally{lock.current=false;if(alive.current)setPending('');}
  };
  const status=(item:ReviewItem,value:ReviewStatus)=>void run(item.id,async()=>{
    if(!query.data)return;
    try{await source.change(item,value,query.data.generation,scope);retry();}catch(e){retry();throw e;}
  });
  return <AppModal open title={resource?'Reviews · '+resource.title:'Review inbox'} onClose={onClose} widthClassName="max-w-3xl [&_h3]:[overflow-wrap:anywhere]"><div>
    {!supported?<p role="status">Update this host to0.12.0 or later to use reviews.</p>:<>
      {workspace&&<p className="mb-3 text-sm text-[var(--text-secondary)]">Resolve after handling the feedback, or dismiss it. Both actions keep the evidence and leave the document unchanged.</p>}
      <div className="flex flex-wrap items-center gap-3 mb-3"><label>Status <select ref={initial} className="library-button" value={filter} onChange={e=>{setFilter(e.target.value as ReviewStatus|'all');setPage(0);}}>{(['open','resolved','dismissed','all'] as const).map(s=><option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}{s!=='all'&&query.data?' ('+query.data.counts[s]+')':''}</option>)}</select></label><button className="browse-text-action" onClick={retry}>Refresh</button>{query.refreshing&&<span role="status">Refreshing…</span>}</div>
      {query.error&&<p role="alert">{query.error} <button className="browse-text-action" onClick={retry}>Retry</button></p>}
      {query.loading?<p role="status">Loading reviews…</p>:!query.data?.items.length?<p className="py-3 text-[var(--text-secondary)]">No {filter==='all'?'':filter+' '}reviews here.</p>:<ul className="divide-y divide-[var(--border-subtle)]">{query.data.items.map(item=><li key={item.id} className="py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><button className="browse-text-action text-left min-w-0 max-w-full [overflow-wrap:anywhere]" disabled={item.availability!=='available'||Boolean(pending)} onClick={()=>void run(item.id,async()=>{const focusDestination=await onOpen(item.resourceId);if(alive.current){flushSync(onClose);if(focusDestination)queueMicrotask(focusDestination);}})}><span className="line-clamp-2" title={item.targetTitle}>{item.targetTitle}</span></button><small className="text-[var(--text-secondary)] min-w-0 max-w-full [overflow-wrap:anywhere]">{item.author} · {new Date(item.createdAt).toLocaleDateString()} · {item.status}</small></div>
        {item.currentTitle&&item.currentTitle!==item.targetTitle&&<p className="break-words text-sm text-[var(--text-secondary)]">Current title · {item.currentTitle}</p>}
        {item.imported&&<p className="text-sm text-[var(--text-secondary)]">Imported evidence · author label retained</p>}
        <p className="whitespace-pre-wrap break-words my-2">{item.comment}</p>
        {item.availability!=='available'&&<p role="status">Target {item.availability}. Evidence is retained.</p>}
        {item.attachment==='changed'&&workspace&&<p role="status">The saved revision changed since capture. Original evidence is retained.</p>}
        {(item.quote||item.context||item.locator||item.baseRevision!==undefined)&&<details><summary className="cursor-pointer text-sm text-[var(--text-secondary)]">Original evidence · {item.attachment}{item.locator?.page?' · page '+item.locator.page:''}</summary>{item.baseRevision!==undefined&&<p>Captured revision {item.baseRevision}{item.currentRevision!=null?' · current revision '+item.currentRevision:''}</p>}{item.quote&&<blockquote className="border-l-2 border-primary pl-3 my-2 whitespace-pre-wrap break-words">{item.quote}</blockquote>}{item.context&&<p className="whitespace-pre-wrap break-words">{item.context}</p>}{item.attachment==='changed'&&!workspace&&<p>Saved content changed since capture. This quote is evidence, not a verified current selection.</p>}</details>}
        <div className="flex flex-wrap gap-2 mt-2">{(['open','resolved','dismissed'] as const).filter(s=>s!==item.status).map(value=><button key={value} className="browse-text-action" disabled={Boolean(pending)} onClick={()=>status(item,value)}>{value==='open'?'Reopen':value==='resolved'?'Resolve':'Dismiss'}</button>)}{pending===item.id&&<span role="status">Working…</span>}</div>{errors[item.id]&&<p role="alert">{errors[item.id]} <button className="browse-text-action" onClick={retry}>Refresh review</button></p>}
      </li>)}</ul>}
      {query.data&&<BrowsePagination page={page} totalPages={query.data.totalPages} loading={query.loading||query.refreshing} onPage={setPage}/>}
    </>}
  </div></AppModal>;
}
