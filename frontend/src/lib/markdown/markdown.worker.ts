import { MarkdownEngine } from './engine';
import type { WorkerReply, WorkerRequest } from './protocol';
import type { JSONContent } from '@tiptap/core';
let engine: MarkdownEngine | undefined;
let draft: JSONContent | undefined;
globalThis.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const send = (reply: WorkerReply) => globalThis.postMessage(reply);
  try {
    if (request.type === 'open') { engine = new MarkdownEngine(request.bytes, request.byteLimit); draft = engine.projection.doc; send({ type: 'ready', doc: draft, source: engine.source }); return; }
    if (!engine) throw new Error('SOURCE_NOT_OPEN');
    if (request.type === 'region') {
      send({ type: 'region', version: request.version, ...engine.sourceRegion(request.block, request.expected) }); return;
    }
    if (request.type === 'source') {
      const begin = performance.now(), doc = engine.editRegion(request.token, request.text);
      draft = doc;
      send({ type: 'result', version: request.version, doc, historyBytes: engine.historyBytes, result: { accepted: true, source: engine.source, patches: [], patchMs: 0, validationMs: performance.now() - begin } });
    } else {
      if(request.type==='splice'){
        const blocks=draft?.content;
        if(!blocks || !Number.isSafeInteger(request.from) || !Number.isSafeInteger(request.remove) || request.from<0 || request.remove<0 || request.from+request.remove>blocks.length)throw Error('INVALID_DOCUMENT_SPLICE');
        draft={type:'doc',content:[...blocks.slice(0,request.from),...request.blocks,...blocks.slice(request.from+request.remove)]};
      } else draft=request.doc;
      send({ type: 'result', version: request.version, result: engine.apply(draft, true), historyBytes: engine.historyBytes });
    }
  } catch (e) { send({ type: 'error', ...('version' in request ? { version: request.version } : {}), reason: e instanceof Error ? e.message : 'WORKER_FAILED' }); }
};
