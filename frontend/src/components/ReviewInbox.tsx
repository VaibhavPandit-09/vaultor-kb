import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {MessageSquare} from 'lucide-react';
import AppModal from './modals/AppModal';
import {BrowsePagination} from './BrowseLayout';
import {useRetainedQuery} from '../lib/useRetainedQuery';
import {useRestoreFocusOnClose} from '../lib/useRestoreFocusOnClose';
import {getConnection} from '../lib/platform';
import {getAcceptedCapabilities} from '../lib/connection';
import {changeReview,fetchReviewPage,reviewError,subscribeReviews,type ReviewItem,type ReviewStatus} from '../lib/reviews';
import type {Resource} from '../types';

type Target=Pick<Resource,'id'|'title'|'revision'>;
export function ReviewButton({resource,onOpen}:{resource:Target;onOpen:(resource:Target)=>void}) {
  const enabled=getAcceptedCapabilities()?.reviews===1;
  const query=useRetainedQuery(JSON.stringify([getConnection().epoch,resource.id,'open',0,1]),enabled,'resources',fetchReviewPage);
  const retry=query.retry;
  useEffect(()=>subscribeReviews(retry),[retry]);
  if(!enabled)return null;
  return <button type="button" className="library-button" aria-label={`Reviews for ${resource.title}${query.data?': '+query.data.counts.open+' open':''}`} onClick={()=>onOpen(resource)}><MessageSquare size={15}/>{query.data?.counts.open ? query.data.counts.open : 'Reviews'}</button>;
}
export default function ReviewInbox({resource,onClose,onOpen}:{resource:Target|null;onClose:()=>void;onOpen:(id:string)=>Promise<void>}) {
  const [filter,setFilter]=useState<ReviewStatus|'all'>('open'),[page,setPage]=useState(0),[pending,setPending]=useState(''),[errors,setErrors]=useState<Record<string,string>>({});
  const lock=useRef(false),alive=useRef(true),navigated=useRef(false),root=useRef<HTMLDivElement>(null),initial=useRef<HTMLSelectElement>(null);
  const epoch=useRef(getConnection().epoch).current;
  const {captureFocus,restoreFocus}=useRestoreFocusOnClose();
  const supported=getAcceptedCapabilities()?.reviews===1;
  const query=useRetainedQuery(JSON.stringify([epoch,resource?.id??null,filter,page]),supported,'resources',fetchReviewPage);
  const retry=query.retry;
  useEffect(()=>subscribeReviews(retry),[retry]);
  useLayoutEffect(()=>{alive.current=true;captureFocus();(initial.current??root.current?.closest('[role="dialog"]')?.querySelector<HTMLButtonElement>('button'))?.focus();return()=>{alive.current=false;if(!navigated.current)restoreFocus();};},[captureFocus,restoreFocus]);
  // AppModal owns the only scroll region; trap keyboard focus in its complete surface.
  useEffect(()=>{const boundary=root.current?.closest<HTMLElement>('[role="dialog"]');const contain=(e:FocusEvent)=>{if(boundary && e.target instanceof Node && !boundary.contains(e.target))(initial.current??boundary.querySelector<HTMLButtonElement>('button'))?.focus({preventScroll:true});};document.addEventListener('focusin',contain);return()=>document.removeEventListener('focusin',contain);},[]);
  const run=async(key:string,action:()=>Promise<unknown>)=>{
    if(lock.current)return;lock.current=true;setPending(key);setErrors(v=>({...v,[key]:''}));
    try{await action();}catch(e){if(alive.current && epoch===getConnection().epoch)setErrors(v=>({...v,[key]:reviewError(e)}));}
    finally{lock.current=false;if(alive.current)setPending('');}
  };
  const status=(item:ReviewItem,value:ReviewStatus)=>void run(item.id,async()=>{
    if(!query.data)return;
    try{await changeReview(item,value,query.data.generation,epoch);retry();}catch(e){retry();throw e;}
  });
  return <AppModal open title={resource?'Reviews · '+resource.title:'Review inbox'} onClose={onClose} widthClassName="max-w-3xl [&_h3]:[overflow-wrap:anywhere]" restoreFocusOnEscape={false}><div ref={root}>
    {!supported?<p role="status">Update this host to0.12.0 or later to use reviews.</p>:<>
      <div className="flex flex-wrap items-center gap-3 mb-3"><label>Status <select ref={initial} className="library-button" value={filter} onChange={e=>{setFilter(e.target.value as ReviewStatus|'all');setPage(0);}}>{(['open','resolved','dismissed','all'] as const).map(s=><option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}{s!=='all'&&query.data?' ('+query.data.counts[s]+')':''}</option>)}</select></label><button className="browse-text-action" onClick={retry}>Refresh</button>{query.refreshing&&<span role="status">Refreshing…</span>}</div>
      {query.error&&<p role="alert">{query.error} <button className="browse-text-action" onClick={retry}>Retry</button></p>}
      {query.loading?<p role="status">Loading reviews…</p>:!query.data?.items.length?<p className="py-3 text-[var(--text-secondary)]">No {filter==='all'?'':filter+' '}reviews here.</p>:<ul className="divide-y divide-[var(--border-subtle)]">{query.data.items.map(item=><li key={item.id} className="py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><button className="browse-text-action text-left min-w-0 max-w-full [overflow-wrap:anywhere]" disabled={item.availability!=='available'||Boolean(pending)} onClick={()=>void run(item.id,async()=>{await onOpen(item.resourceId);if(alive.current){navigated.current=true;onClose();}})}>{item.targetTitle}</button><small className="text-[var(--text-secondary)] min-w-0 max-w-full [overflow-wrap:anywhere]">{item.author} · {new Date(item.createdAt).toLocaleDateString()} · {item.status}</small></div>
        <p className="whitespace-pre-wrap break-words my-2">{item.comment}</p>
        {item.availability!=='available'&&<p role="status">Target {item.availability}. Evidence is retained.</p>}
        {(item.quote||item.context||item.locator)&&<details><summary className="cursor-pointer text-sm text-[var(--text-secondary)]">Original evidence · {item.attachment}{item.locator?.page?' · page '+item.locator.page:''}</summary>{item.quote&&<blockquote className="border-l-2 border-primary pl-3 my-2 whitespace-pre-wrap break-words">{item.quote}</blockquote>}{item.context&&<p className="whitespace-pre-wrap break-words">{item.context}</p>}{item.attachment==='changed'&&<p>Saved content changed since capture. This quote is evidence, not a verified current selection.</p>}</details>}
        <div className="flex flex-wrap gap-2 mt-2">{(['open','resolved','dismissed'] as const).filter(s=>s!==item.status).map(value=><button key={value} className="browse-text-action" disabled={Boolean(pending)} onClick={()=>status(item,value)}>{value==='open'?'Reopen':value==='resolved'?'Resolve':'Dismiss'}</button>)}{pending===item.id&&<span role="status">Working…</span>}</div>{errors[item.id]&&<p role="alert">{errors[item.id]} <button className="browse-text-action" onClick={retry}>Refresh review</button></p>}
      </li>)}</ul>}
      {query.data&&<BrowsePagination page={page} totalPages={query.data.totalPages} loading={query.loading||query.refreshing} onPage={setPage}/>}
    </>}
  </div></AppModal>;
}
