import axios, { type AxiosAdapter } from 'axios';
import { configureConnection, getPlatform, getConnection } from './platform';
let pendingArchiveEpoch:number|undefined;
export function requestLocalArchiveImport(){const connection=getConnection();if(connection.profileId!=='this-computer')return;pendingArchiveEpoch=connection.epoch;window.dispatchEvent(new Event('vaultor:local-archive-import'));}
export function consumeLocalArchiveImport(){const connection=getConnection(),requested=pendingArchiveEpoch===connection.epoch&&connection.profileId==='this-computer';pendingArchiveEpoch=undefined;return requested;}
export type DesktopProfile = { id: string; name: string; address: string; kind: 'local' | 'remote'; source?: 'bundled'; workspaceId?: string; hostId?: string; fingerprint?: string };
export type LocalServerStatus = { status: string; address: string | null; error: string; restartAttempts: number; dataDirectory: string; logError: string; logs: { timestamp: string; message: string }[] };
export type DesktopState = { version: number; clientId: string; sessionId: string; profiles: DesktopProfile[]; active: string | null; token: string; desktopBuild?: string; localServer?: LocalServerStatus; error?: string; access?: { mode: 'loopback' | 'paired' | 'unselected'; pairingAvailable: boolean; trustConfigured: boolean; credentialsStored: boolean } };
export type PairInspection = { id: string; name: string; address: string; hostId: string; fingerprint: string };
export type NearbyHosts = { items: { name: string; hostId: string; address: string }[]; error: string };
export type SharingStatus = { enabled: boolean; listening: boolean; port: number; addresses: string[]; hostId: string; fingerprint: string; stopped?: boolean };
export type HostDevices = { devices: { id: string; name: string; kind: string; approvedAt: string }[]; requests: { id: string; name: string; kind: string; code: string; expiresAt: string }[]; stopped?: boolean };
export type DesktopCandidate = { ticket: string; profile: DesktopProfile; identity: { id: string; generation: string }; differentWorkspace: boolean; serverBuild: string };
type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; detail: string } };
export type UpdateStatus={automaticInstall?:boolean;source?:'github'|'custom';availableVersion?:string;candidateVersion?:string;phase:string;feed:string;currentVersion:string;version?:string;progress:number;error:string;backupDirectory:string;recoveryAvailable:boolean;previousPackageAvailable:boolean};
type Part = { name: string; value: string | Uint8Array; filename?: string; type?: string };
type NativePart = { name: string; fileId: string; filename: string; type: string };
type NativeSelection = { id: string; name: string; size: number; lastModified: number };
export type WireRequest = { id: string; token: string; path: string; method: string; timeout: number; headers: Record<string, string>; body?: { kind: 'text'; value: string } | { kind: 'multipart'; parts: (Part | NativePart)[] } };
export interface DesktopBridge {
  updatesStatus?():Promise<Result<UpdateStatus>>;
  updatesConfigure?(feed:string):Promise<Result<UpdateStatus>>;
  updatesCheck?():Promise<Result<UpdateStatus>>;
  updatesDownload?():Promise<Result<UpdateStatus>>;
  updatesCancel?():Promise<Result<void>>;
  updatesImport?():Promise<Result<UpdateStatus>>;
  updatesApply?():Promise<Result<void|UpdateStatus>>;
  updatesInstall?():Promise<Result<void|UpdateStatus>>;
  updatesRestore?():Promise<Result<void|UpdateStatus>>;
  onUpdates?(callback:(value:UpdateStatus)=>void):()=>void;
  onUpdatesOpen?(callback:()=>void):()=>void;
  stream?(value:{token:string;id:string;path:string}):Promise<Result<void>>;
  onStream?(callback:(event:{id:string;data?:unknown;closed?:boolean})=>void):()=>void;
  bootstrap(): Promise<Result<DesktopState>>;
  authorizeLocal?(id:string):Promise<Result<DesktopState>>;
  nearby?(enabled: boolean): Promise<Result<NearbyHosts>>;
  pairInspect?(value: { name: string; address: string }): Promise<Result<PairInspection>>;
  pairEnroll?(id: string): Promise<Result<{ id: string; code: string; expiresAt: string }>>;
  pairStatus?(id: string): Promise<Result<{ state: string; profileId?: string }>>;
  pairCancel?(): Promise<Result<void>>;
  forget?(id: string): Promise<Result<DesktopState>>;
  sharing?(enabled?: boolean): Promise<Result<SharingStatus>>;
  devices?(): Promise<Result<HostDevices>>;
  decision?(value: { id: string; code: string; approve: boolean }): Promise<Result<void>>;
  revoke?(id: string): Promise<Result<void>>;
  certificate?(): Promise<Result<'saved' | 'cancelled'>>;
  renewTrust?(): Promise<Result<void>>;
  openSharedBrowser?(address: string): Promise<Result<void>>;
  windowStatus?(): Promise<Result<{ maximized: boolean }>>;
  windowAction?(action: 'minimize' | 'maximize' | 'close' | 'menu'): Promise<Result<{ maximized: boolean }>>;
  onWindowStatus?(callback: (value: { maximized: boolean }) => void): () => void;
  onConnections?(callback: () => void): () => void;
  hosting?(): Promise<Result<{ startAtLogin: boolean; registered: boolean; enabledByOS: boolean; supported: boolean; error: string }>>;
  login?(enabled: boolean): Promise<Result<{ startAtLogin: boolean; registered: boolean; enabledByOS: boolean; supported: boolean; error: string }>>;
  hostAction?(action: 'browser' | 'start' | 'stop'): Promise<Result<void>>;
  localStatus?(): Promise<Result<LocalServerStatus>>;
  onLocalStatus?(callback: (value: LocalServerStatus) => void): () => void;
  addProfile(profile: { name: string; address: string }): Promise<Result<DesktopProfile>>;
  probe(id: string): Promise<Result<DesktopCandidate>>;
  activate(ticket: string): Promise<Result<DesktopState>>;
  request(value: WireRequest): Promise<Result<{ status: number; headers: Record<string, string>; data: Uint8Array }>>;
  cancel(id: string): Promise<Result<void>>;
  copyResourceImage?(value: { token: string; resourceId: string }): Promise<Result<void>>;
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
  configureConnection({ profileId: profile.id, kind: profile.kind, hostId: profile.hostId, workspaceId: profile.workspaceId }, { ...previous, kind: 'desktop', request: nativeAdapter(bridge, state.token), writeClipboard: async text => { unwrap(await bridge.writeClipboard(text)); },
    ...(bridge.stream && bridge.onStream ? {stream:async (path:string,signal:AbortSignal,receive:(data:unknown)=>void)=>{
      const id=crypto.randomUUID();const remove=bridge.onStream!(event=>{if(event.id===id && !signal.aborted)receive(event.closed?{kind:'disconnected'}:event.data);});
      const close=()=>{remove();void bridge.cancel(id).catch(()=>{});signal.removeEventListener('abort',close);};signal.addEventListener('abort',close,{once:true});
      try{unwrap(await bridge.stream!({token:state.token,id,path}));if(signal.aborted){close();throw new axios.CanceledError();}return {close};}catch(e){close();throw e;}
    }} : {stream:undefined}),
 ...(bridge.copyResourceImage ? {copyResourceImage: async (resourceId: string) => { unwrap(await bridge.copyResourceImage!({ token: state.token, resourceId })); }} : {}),
 ...(bridge.fileAction ? {
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
