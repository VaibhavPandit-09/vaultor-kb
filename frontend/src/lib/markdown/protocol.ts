import type { JSONContent } from '@tiptap/core';
import type { EngineResult } from './engine';
export type WorkerRequest = { type: 'open'; bytes: Uint8Array; byteLimit?: number } | { type: 'edit'; version: number; doc: JSONContent } | { type: 'source'; version: number; block: number; text: string } | { type: 'region'; version: number; block: number };
export type WorkerReply = { type: 'ready'; doc: JSONContent; source: string } | { type: 'result'; version: number; result: EngineResult; doc?: JSONContent; historyBytes: number } | { type: 'region'; version: number; text: string } | { type: 'error'; version?: number; reason: string };
export interface MarkdownPort { postMessage: (request: WorkerRequest) => void; onmessage: ((event: { data: WorkerReply }) => void) | null; onerror: ((event: unknown) => void) | null; terminate: () => void }
