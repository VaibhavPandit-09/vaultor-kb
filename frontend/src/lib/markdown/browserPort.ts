import type { MarkdownPort, WorkerReply } from './protocol';
import type { JSONContent } from '@tiptap/core';
/** Keep native worker event objects outside the portable controller contract. */
export function browserPort(worker: Worker): MarkdownPort {
  let previous: JSONContent | undefined;
  const port: MarkdownPort = { onmessage: null, onerror: null, postMessage: request => {
    if (request.type === 'edit') {
      const old = previous?.content, next = request.doc.content;
      if (old && next) {
        let from=0, end=old.length, to=next.length;
        while(from<end && from<to && old[from]===next[from])from++;
        while(end>from && to>from && old[end-1]===next[to-1]){end--;to--;}
        worker.postMessage({type:'splice',version:request.version,from,remove:end-from,blocks:next.slice(from,to)});
      } else worker.postMessage(request);
      previous=request.doc;
    } else worker.postMessage(request);
  }, terminate: () => worker.terminate() };
  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    if (event.data.type === 'ready' || (event.data.type === 'result' && event.data.doc)) previous=event.data.doc;
    port.onmessage?.({ data: event.data });
  };
  worker.onerror = event => port.onerror?.(event);
  return port;
}
