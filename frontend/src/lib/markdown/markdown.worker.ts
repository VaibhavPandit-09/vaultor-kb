import { MarkdownEngine } from './engine';
import type { WorkerReply, WorkerRequest } from './protocol';
let engine: MarkdownEngine | undefined;
globalThis.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const send = (reply: WorkerReply) => globalThis.postMessage(reply);
  try {
    if (request.type === 'open') { engine = new MarkdownEngine(request.bytes, request.byteLimit); send({ type: 'ready', doc: engine.projection.doc, source: engine.source }); return; }
    if (!engine) throw new Error('SOURCE_NOT_OPEN');
    if (request.type === 'region') {
      const block = engine.projection.blocks[request.block]; if (!block) throw new Error('SOURCE_BLOCK_MISSING');
      send({ type: 'region', version: request.version, text: block.raw }); return;
    }
    if (request.type === 'source') {
      const begin = performance.now(), doc = engine.editSource(request.block, request.text);
      send({ type: 'result', version: request.version, doc, historyBytes: engine.historyBytes, result: { accepted: true, source: engine.source, patches: [], patchMs: 0, validationMs: performance.now() - begin } });
    } else send({ type: 'result', version: request.version, result: engine.apply(request.doc), historyBytes: engine.historyBytes });
  } catch (e) { send({ type: 'error', ...('version' in request ? { version: request.version } : {}), reason: e instanceof Error ? e.message : 'WORKER_FAILED' }); }
};
