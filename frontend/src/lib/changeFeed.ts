import { openConnectionStream } from './platform';
export type RemoteChange = { cursor: string; kind: string; ids: string[]; requestId: string; at: number; generation?: string };
const writes = new Map<string, number>();
export function rememberMutation(requestId: string) {
  writes.set(requestId, Date.now());
  for (const [id, at] of writes) if (writes.size > 256 || Date.now() - at > 600_000) writes.delete(id);
}
export function validChange(value: unknown): value is RemoteChange {
  const v = value as RemoteChange;
  return !!v && typeof v.cursor === 'string' && /^[a-f0-9-]{36}:\d{1,18}$/.test(v.cursor) && ['reset','resources','tags','settings','organization','workspace','operation','host-restart'].includes(v.kind) && Array.isArray(v.ids) && v.ids.length <= 100 && v.ids.every(id => typeof id === 'string' && id.length <= 80) && typeof v.requestId === 'string';
}
/** A single connection-owned stream; bounded coalescing, backoff and focus reconciliation. */
export function watchChanges(receive: (events: RemoteChange[]) => void, signal: AbortSignal) {
  let cursor='', failures=0, timer:ReturnType<typeof setTimeout> | undefined, batchTimer:ReturnType<typeof setTimeout> | undefined;
  let current:{close():void} | undefined, opening=false;
  const pending=new Map<string,RemoteChange>();
  const enqueue=(event:RemoteChange)=>{
    if(event.kind!=='workspace' && writes.has(event.requestId))return;
    const previous=pending.get(event.kind);
    const ids=[...new Set([...(previous?.ids??[]),...event.ids])];
    pending.set(event.kind,{...event,ids:previous?.ids.length===0 || ids.length>100?[]:ids});
    // Empty IDs mean all resources, never narrow an earlier broad invalidation.
    if(event.ids.length===0)pending.set(event.kind,{...event,ids:[]});
    if(!batchTimer)batchTimer=setTimeout(()=>{batchTimer=undefined;const events=[...pending.values()];pending.clear();if(!signal.aborted)receive(events);},250);
  };
  const reconnect=()=>{current?.close();current=undefined;if(!signal.aborted && !timer)timer=setTimeout(()=>{timer=undefined;void connect();},Math.min(30_000,1000*2**Math.min(failures++,5))+Math.random()*250);};
  const connect=async()=>{
    if(signal.aborted || opening)return;opening=true;
    try {current=await openConnectionStream('/changes'+(cursor?'?cursor='+encodeURIComponent(cursor):''),signal,value=>{
      if((value as {kind?:string})?.kind==='disconnected'){reconnect();return;}
      if(!validChange(value))return;cursor=value.cursor;failures=0;enqueue(value);
    });}catch{reconnect();}finally{opening=false;}
  };
  const focus=()=>{if(signal.aborted)return;receive([{cursor,kind:'reset',ids:[],requestId:'',at:Date.now()}]);if(!current)void connect();};
  const stop=()=>{clearTimeout(timer);clearTimeout(batchTimer);current?.close();window.removeEventListener('focus',focus);};
  signal.addEventListener('abort',stop,{once:true});window.addEventListener('focus',focus);void connect();
  return()=>{stop();signal.removeEventListener('abort',stop);};
}
