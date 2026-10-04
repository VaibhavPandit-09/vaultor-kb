import axios, { type AxiosAdapter } from 'axios';
import { configureConnection, getPlatform } from './platform';
export type DesktopProfile = { id: string; name: string; address: string; kind: 'local'; source?: 'bundled'; workspaceId?: string };
export type LocalServerStatus = { status: string; address: string | null; error: string; restartAttempts: number; dataDirectory: string; logError: string; logs: { timestamp: string; message: string }[] };
export type DesktopState = { version: number; clientId: string; sessionId: string; profiles: DesktopProfile[]; active: string | null; token: string; desktopBuild?: string; localServer?: LocalServerStatus; error?: string; access?: { mode: 'loopback' | 'unselected'; pairingAvailable: false; trustConfigured: false; credentialsStored: false } };
export type DesktopCandidate = { ticket: string; profile: DesktopProfile; identity: { id: string; generation: string }; differentWorkspace: boolean; serverBuild: string };
type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; detail: string } };
type Part = { name: string; value: string | Uint8Array; filename?: string; type?: string };
type NativePart = { name: string; fileId: string; filename: string; type: string };
type NativeSelection = { id: string; name: string; size: number; lastModified: number };
export type WireRequest = { id: string; token: string; path: string; method: string; timeout: number; headers: Record<string, string>; body?: { kind: 'text'; value: string } | { kind: 'multipart'; parts: (Part | NativePart)[] } };
export interface DesktopBridge {
  bootstrap(): Promise<Result<DesktopState>>;
  hosting?(): Promise<Result<{ startAtLogin: boolean; registered: boolean; enabledByOS: boolean; supported: boolean; error: string }>>;
  login?(enabled: boolean): Promise<Result<{ startAtLogin: boolean; registered: boolean; enabledByOS: boolean; supported: boolean; error: string }>>;
  hostAction?(action: 'browser' | 'start' | 'stop'): Promise<Result<void>>;
  localStatus?(): Promise<Result<LocalServerStatus>>;
  addProfile(profile: { name: string; address: string }): Promise<Result<DesktopProfile>>;
  probe(id: string): Promise<Result<DesktopCandidate>>;
  activate(ticket: string): Promise<Result<DesktopState>>;
  request(value: WireRequest): Promise<Result<{ status: number; headers: Record<string, string>; data: Uint8Array }>>;
  cancel(id: string): Promise<Result<void>>;
  writeClipboard(text: string): Promise<Result<void>>;
  pickFiles?(value: { token: string; accept: string; multiple: boolean }): Promise<Result<NativeSelection[]>>;
  readFile?(value: { token: string; id: string; offset: number; length: number }): Promise<Result<Uint8Array>>;
  beginSave?(value: { token: string; filename: string }): Promise<Result<{ id?: string; outcome?: 'cancelled' }>>;
  saveChunk?(value: { token: string; id: string; data: Uint8Array }): Promise<Result<void>>;
  finishSave?(value: { token: string; id: string }): Promise<Result<'saved'>>;
  cancelSave?(value: { token: string; id: string }): Promise<Result<void>>;
  fileAction?(value: { token: string; path: string; filename: string; mode: 'save' | 'open' | 'preview'; requestId?: string }): Promise<Result<{ outcome?: 'saved' | 'cancelled' | 'opened'; url?: string; id?: string }>>;
  cancelFile?(value: {token:string;requestId:string}): Promise<Result<void>>;
  releaseFile?(value: { token: string; id: string }): Promise<Result<void>>;
  onQuitRequest?(callback: (request: { id: string; keepDrafts: boolean }) => void): () => void;
  quitReply?(value: { id: string; success: boolean; error?: string; canKeepDrafts?: boolean }): Promise<Result<void>>;
  onResume?(callback: () => void): () => void;
}
declare global { interface Window { vaultorDesktop?: DesktopBridge } }
let desktopSessionId: string | undefined;
let desktopBuild: string | undefined;
let desktopToken = '';
const selectedFiles = new WeakMap<File, string>();
export async function pickDesktopFiles(accept: string, multiple: boolean): Promise<File[]> {
  const bridge = window.vaultorDesktop!;
  const selectionToken=desktopToken;
  const items = unwrap(await bridge.pickFiles!({ token: selectionToken, accept, multiple }));
  return items.map(item => {
    const extension = item.name.split('.').at(-1)?.toLowerCase() || '';
    const types: Record<string, string> = { pdf: 'application/pdf', md: 'text/markdown', txt: 'text/plain', csv: 'text/csv', tsv: 'text/tab-separated-values', zip: 'application/zip', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', json: 'application/json' };
    const file = new File([], item.name, { type: types[extension] || '', lastModified: item.lastModified });
    Object.defineProperty(file, 'size', { value: item.size });
    const read = async () => { if (item.size > 32 * 1024 * 1024) throw new Error('This file is too large for text conversion. Keep the original file.'); const data = new Uint8Array(item.size); for (let offset = 0; offset < item.size; offset += 1024 * 1024) data.set(unwrap(await bridge.readFile!({ token: selectionToken, id: item.id, offset, length: Math.min(1024 * 1024, item.size - offset) })), offset); return data; };
    file.arrayBuffer = async () => (await read()).buffer; file.text = async () => new TextDecoder().decode(await read()); selectedFiles.set(file, item.id); return file;
  });
}
export const getDesktopSessionId = () => desktopSessionId;
export const getDesktopBuild = () => desktopBuild;
export function unwrap<T>(result: Result<T>): T { if (!result.ok) throw new Error(result.error.detail); return result.value; }
export function nativeAdapter(bridge: DesktopBridge, token: string): AxiosAdapter {
  return async config => {
    const id = crypto.randomUUID();
    const cancel = () => { void bridge.cancel(id).catch(() => {}); };
    const signal = config.signal;
    signal?.addEventListener?.('abort', cancel);
    try {
      let body: WireRequest['body'];
      if (config.data instanceof FormData) {
        let size = 0;
        for (const value of config.data.values()) size += typeof value === 'string' ? new TextEncoder().encode(value).byteLength : selectedFiles.has(value) ? 0 : value.size;
        if (size > 32 * 1024 * 1024) throw new Error('This desktop version supports transfers up to 32 MiB. Use browser access for larger files.');
        const parts: (Part | NativePart)[] = [];
        for (const [name, value] of config.data.entries()) parts.push(typeof value === 'string' ? { name, value } : selectedFiles.has(value) ? { name, fileId: selectedFiles.get(value)!, filename: value.name, type: value.type } : { name, value: new Uint8Array(await value.arrayBuffer()), filename: value.name, type: value.type });
        body = { kind: 'multipart', parts };
      } else if (config.data !== undefined && config.data !== null) {
        if (typeof config.data !== 'string') throw new Error('Unsupported desktop request body.');
        if (new TextEncoder().encode(config.data).byteLength > 32 * 1024 * 1024) throw new Error('This desktop version supports transfers up to 32 MiB. Use browser access for larger files.');
        body = { kind: 'text', value: config.data };
      }
      if (signal?.aborted) throw new axios.CanceledError();
      const path = axios.getUri({ ...config, baseURL: '' });
      const headers = Object.fromEntries(Object.entries(config.headers.toJSON()).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)]));
      const result = unwrap(await bridge.request({ id, token, path, method: (config.method ?? 'GET').toUpperCase(), timeout: config.timeout || 30000, headers, body }));
      if (signal?.aborted) throw new axios.CanceledError();
      const buffer = new Uint8Array(result.data).buffer;
      const text = config.responseType === 'blob' || config.responseType === 'arraybuffer' ? '' : new TextDecoder().decode(buffer);
      const data = config.responseType === 'blob' ? new Blob([buffer], { type: result.headers['content-type'] }) : config.responseType === 'arraybuffer' ? buffer : text;
      window.dispatchEvent(new CustomEvent('vaultor:connection-health', { detail: true }));
      return { data, status: result.status, statusText: '', headers: result.headers, config };
    } catch (error) {
      if (signal?.aborted) throw new axios.CanceledError();
      if (!axios.isCancel(error)) window.dispatchEvent(new CustomEvent('vaultor:connection-health', { detail: false }));
      throw axios.isAxiosError(error) ? error : new axios.AxiosError(error instanceof Error ? error.message : 'Desktop request failed.', 'ERR_NETWORK', config);
    } finally { signal?.removeEventListener?.('abort', cancel); }
  };
}
export function activateDesktop(state: DesktopState) {
  const bridge = window.vaultorDesktop;
  const profile = state.profiles.find(p => p.id === state.active);
  if (!bridge || !profile || !state.token) throw new Error('Desktop connection is unavailable.');
  const previous = getPlatform(); desktopSessionId = 'desktop-' + state.sessionId; desktopBuild = state.desktopBuild; desktopToken = state.token;
  const action = async (path: string, filename: string, mode: 'save' | 'open' | 'preview', signal?: AbortSignal) => {
    const requestId=crypto.randomUUID();signal?.throwIfAborted();
    const cancel=()=>{void bridge.cancelFile?.({token:state.token,requestId}).catch(()=>{});};signal?.addEventListener('abort',cancel);
    try {const result=unwrap(await bridge.fileAction!({token:state.token,path,filename,mode,requestId}));if(signal?.aborted){if(result.id)void bridge.releaseFile?.({token:state.token,id:result.id});signal.throwIfAborted();}return result;}
    finally{signal?.removeEventListener('abort',cancel);}
  };
  configureConnection({ profileId: profile.id, kind: profile.kind, workspaceId: profile.workspaceId }, { ...previous, kind: 'desktop', request: nativeAdapter(bridge, state.token), writeClipboard: async text => { unwrap(await bridge.writeClipboard(text)); }, ...(bridge.fileAction ? {
    saveApiFile: async (path, filename, signal) => (await action(path, filename, 'save',signal)).outcome as 'saved' | 'cancelled',
    openApiFile: async (path, filename, signal) => { await action(path, filename, 'open',signal); },
    previewApiFile: async (path, filename, signal) => { const file = await action(path, filename, 'preview',signal); return { url: file.url!, release: () => { void bridge.releaseFile!({ token: state.token, id: file.id! }).catch(()=>{}); } }; },
    saveBlob: async (blob: Blob, filename: string) => {
      const save = unwrap(await bridge.beginSave!({ token: state.token, filename })); if (!save.id) return 'cancelled' as const;
      try { const reader = blob.stream().getReader(); try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; for (let offset = 0; offset < chunk.value.length; offset += 1024 * 1024) unwrap(await bridge.saveChunk!({ token: state.token, id: save.id, data: chunk.value.subarray(offset, offset + 1024 * 1024) })); } } finally { await reader.cancel(); } return unwrap(await bridge.finishSave!({ token: state.token, id: save.id })); }
      catch (e) { await bridge.cancelSave!({ token: state.token, id: save.id }).catch(() => {}); throw e; }
    },
  } : {}) });
}
export class SwitchBlockedError extends Error { readonly canKeepDrafts: boolean; constructor(message: string, canKeepDrafts = false) { super(message); this.canKeepDrafts = canKeepDrafts; } }
let barrier: ((keepDrafts: boolean) => Promise<void>) | undefined;
const connectionWork = new Set<string>();
export function blockConnectionSwitch(label: string) { connectionWork.add(label); return () => { connectionWork.delete(label); }; }
export function registerConnectionBarrier(value: (keepDrafts: boolean) => Promise<void>) { barrier = value; return () => { if (barrier === value) barrier = undefined; }; }
export async function prepareConnectionSwitch(keepDrafts = false) { if (connectionWork.size) throw new SwitchBlockedError('Wait for ' + [...connectionWork].join(', ') + ' before switching.'); await barrier?.(keepDrafts); }
