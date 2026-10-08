import {useEffect,useRef,useState} from 'react';
import type {Resource} from '../types';
import {resourcePresentation} from '../lib/resourceKinds';
import {getConnection} from '../lib/platform';
import {subscribeResourceChanges} from '../lib/resourceEvents';
import {thumbnail} from '../lib/resourceThumbnails';
export default function ResourceThumbnail({resource}:{resource:Resource}) {
 const Icon=resourcePresentation(resource).icon,[loaded,setLoaded]=useState<{key:string;url:string}|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0),root=useRef<HTMLSpanElement>(null);
 const image=resourcePresentation(resource).type==='image';
 const key=JSON.stringify(getConnection())+'|'+resource.id+'|'+resource.revision;
 const url=loaded?.key===key?loaded.url:'';
 useEffect(()=>subscribeResourceChanges(change=>{if(change.kind==='workspace'||(change.kind==='metadata'&&(!change.ids||change.ids.includes(resource.id))))setAttempt(v=>v+1);}),[resource.id]);
 useEffect(()=>{
  const controller=new AbortController();let release:(()=>void)|undefined;
  const load=()=>{void thumbnail(resource.id,resource.revision,controller.signal).then(result=>{if(controller.signal.aborted){result.release();return;}release=result.release;setLoaded({key,url:result.url});setError(false);}).catch(()=>{if(!controller.signal.aborted)setError(true);});};
  const observer=typeof IntersectionObserver==='undefined'?undefined:new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer?.disconnect();load();}},{rootMargin:'80px'});
  if(image&&!resource.trashedAt){if(observer&&root.current)observer.observe(root.current);else load();}
  return()=>{controller.abort();observer?.disconnect();release?.();};
 },[resource.id,resource.revision,resource.trashedAt,attempt,key,image]);
 return <span ref={root} className="resource-thumbnail" aria-hidden={!error}>{url&&!error?<img src={url} alt="" onError={()=>setError(true)}/>:<Icon size={19}/>} {error&&<button type="button" aria-label={'Retry thumbnail for '+resource.title} title="Thumbnail unavailable. Retry; unsupported/oversized originals remain downloadable." onClick={event=>{event.stopPropagation();setAttempt(v=>v+1);}}>↻</button>}</span>;
}
