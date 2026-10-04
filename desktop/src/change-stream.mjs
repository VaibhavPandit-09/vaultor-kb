import { connectionFetch } from './network.mjs';
/** Only the selected connection's read-only change feed can stream into the renderer. */
export async function startChangeStream(transport, value, receive) {
  const active=transport.active;
  if(!active || value?.token!==active.token || !/^[\w-]{1,80}$/.test(value.id) || typeof value.path!=='string' || !/^\/changes(?:\?cursor=[a-fA-F0-9%-]{1,120})?$/.test(value.path))throw new Error('Invalid change stream.');
  if(transport.requests.has(value.id) || transport.requests.size>=16)throw new Error('Too many requests.');
  const controller=new AbortController();transport.requests.set(value.id,controller);
  const startTimeout=setTimeout(()=>controller.abort(),10000);
  try {
    const response=await connectionFetch(active,value.path,{signal:controller.signal,headers:{Accept:'text/event-stream'}});
    clearTimeout(startTimeout);
    if(!response.ok || !response.headers.get('content-type')?.includes('text/event-stream'))throw new Error('Change stream unavailable ('+response.status+').');
    const reader=response.body.getReader();
    void (async()=>{
      let buffer='';const decoder=new TextDecoder();
      try {
        for(;;){const {done,value:chunk}=await reader.read();if(done)break;buffer+=decoder.decode(chunk,{stream:true}).replaceAll('\r','');
          if(buffer.length>32768)throw new Error('Change event limit exceeded.');
          let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(data){const event=JSON.parse(data);if(transport.active===active && !controller.signal.aborted)receive({id:value.id,data:event});}}
        }
      }catch{/* Disconnection is retried by the epoch-owned frontend controller. */}
      finally {await reader.cancel().catch(()=>{});transport.requests.delete(value.id);if(transport.active===active && !controller.signal.aborted)receive({id:value.id,closed:true});}
    })();
  }catch(e){clearTimeout(startTimeout);controller.abort();transport.requests.delete(value.id);throw e;}
}
