import type { MarkdownPort, WorkerReply } from './protocol';
/** Keep native worker event objects outside the portable controller contract. */
export function browserPort(worker: Worker): MarkdownPort {
  const port: MarkdownPort = { onmessage: null, onerror: null, postMessage: request => worker.postMessage(request), terminate: () => worker.terminate() };
  worker.onmessage = (event: MessageEvent<WorkerReply>) => port.onmessage?.({ data: event.data });
  worker.onerror = event => port.onerror?.(event);
  return port;
}
