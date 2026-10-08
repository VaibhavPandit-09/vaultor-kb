import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';

export type ConnectionIdentity = { profileId: string; kind: 'browser' | 'local' | 'remote'; hostId?: string; workspaceId?: string; generation?: string };
export type DownloadOutcome = 'requested' | 'saved' | 'cancelled';
/** A desktop adapter must validate paths in main, propagate cancellation and never retry mutations. */
export interface PlatformServices {
  kind: 'browser' | 'desktop';
  request: AxiosAdapter;
  saveBlob(blob: Blob, filename: string): Promise<DownloadOutcome>;
  openBlob(blob: Blob): Promise<void>;
  writeClipboard(text: string): Promise<void>;
  copyResourceImage?: (resourceId: string) => Promise<void>;
  saveApiFile?: (path: string, filename: string, signal?: AbortSignal) => Promise<DownloadOutcome>;
  openApiFile?: (path: string, filename: string, signal?: AbortSignal) => Promise<void>;
  previewApiFile?: (path: string, filename: string, signal?: AbortSignal) => Promise<{ url: string; release: () => void }>;
  /** Future notifications belong to the connection epoch; close releases all native resources. */
  stream?: (path: string, signal: AbortSignal, receive: (data: unknown) => void) => Promise<{ close(): void }>;
}
const browserRequest = axios.getAdapter(axios.defaults.adapter);
let browserAccess: { epoch: number; promise: Promise<string> } | undefined;
const browserAdapter: AxiosAdapter = async config => {
  if (!['get', 'head', 'options'].includes((config.method || 'get').toLowerCase())) {
    const currentEpoch = getConnection().epoch;
    if (browserAccess?.epoch !== currentEpoch) {
      const promise = browserRequest({ ...config, baseURL: '/api', url: '/access/session', method: 'get', params: undefined, data: undefined, responseType: 'json', headers: new axios.AxiosHeaders(), signal: undefined }).then(response => {
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        if (typeof data.csrf !== 'string' || !data.csrf) throw new Error('Refresh your browser access session before making changes.');
        return data.csrf as string;
      }).catch(error => { if (browserAccess?.promise === promise) browserAccess = undefined; throw error; });
      browserAccess = { epoch: currentEpoch, promise };
    }
    config.headers.set('X-Vaultor-CSRF', await browserAccess!.promise);
    if (currentEpoch !== getConnection().epoch) throw new axios.CanceledError('Connection changed');
  }
  return browserRequest(config);
};
const browser: PlatformServices = {
  kind: 'browser', request: browserAdapter,
  async stream(path, signal, receive) {
    const controller=new AbortController();const combined=AbortSignal.any([signal,controller.signal]);
    const response=await fetch('/api'+path,{signal:combined,credentials:'same-origin',headers:{Accept:'text/event-stream'},redirect:'error'});
    if(!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')){await response.body?.cancel();throw new Error('Change notifications unavailable.');}
    const reader=response.body!.getReader();
    void (async()=>{let buffer='';const decoder=new TextDecoder();try{
      for(;;){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true}).replaceAll('\r','');if(buffer.length>32768)throw new Error('Change event limit exceeded');let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(data)receive(JSON.parse(data));}}
    }catch{/* Reconnect controller owns failures. */}finally{await reader.cancel().catch(()=>{});if(!combined.aborted)receive({kind:'disconnected'});}})();
    return {close:()=>controller.abort()};
  },
  async saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link);
    try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    return 'requested'; // Browser download initiation is not proof the file was saved.
  },
  async openBlob(blob) {
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank');
    if (!opened) { URL.revokeObjectURL(url); throw new Error('Allow popups to open this file.'); }
    opened.opener = null;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  writeClipboard: text => navigator.clipboard.writeText(text),
};
let platform = browser;
let identity: ConnectionIdentity = { profileId: 'browser', kind: 'browser' };
let lifetime = new AbortController();
let epoch = 0;
export const getPlatform = () => platform;
export const getConnection = () => ({ ...identity, epoch });
export async function saveApiFile(path: string, filename: string, signal?: AbortSignal) {
  if (platform.saveApiFile) return platform.saveApiFile(path, filename, signal);
  const { default: api } = await import('./api');
  const { data } = await api.get<Blob>(path, { responseType: 'blob', signal });
  return platform.saveBlob(data, filename);
}
export async function openApiFile(path: string, filename: string) {
  if (platform.openApiFile) return platform.openApiFile(path, filename);
  const { default: api } = await import('./api');
  const { data } = await api.get<Blob>(path, { responseType: 'blob' }); return platform.openBlob(data);
}
/** Shell-only boundary; no renderer UI/server switching is enabled by D1. */
export function configureConnection(next: ConnectionIdentity, services: PlatformServices) {
  lifetime.abort(); lifetime = new AbortController(); identity = { ...next }; platform = services; epoch++;
}
export function validateApiPath(path: string) {
  const decoded = decodeURIComponent(path);
  if (!/^\/[a-zA-Z0-9]/.test(decoded) || /[\\#]/.test(decoded) || /(^|\/)\.\.?($|\/|\?)/.test(decoded)) throw new Error('Invalid API path.');
  return path;
}
export const connectionAdapter: AxiosAdapter = async config => {
  validateApiPath(config.url ?? '');
  const requestEpoch = epoch;
  const signal = new AbortController();
  const cancel = () => signal.abort();
  const owner = lifetime.signal, caller = config.signal;
  if (owner.aborted || caller?.aborted) cancel();
  owner.addEventListener('abort', cancel, { once: true }); caller?.addEventListener?.('abort', cancel);
  try {
    const response = await platform.request({ ...config, baseURL: '/api', signal: signal.signal } as InternalAxiosRequestConfig);
    if (signal.signal.aborted || epoch !== requestEpoch) throw new axios.CanceledError('Connection request cancelled');
    if (config.validateStatus && !config.validateStatus(response.status)) throw new axios.AxiosError(`Request failed with status code ${response.status}`, response.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST', config, response.request, response);
    return response;
  } catch (error) {
    if (signal.signal.aborted || epoch !== requestEpoch) throw new axios.CanceledError('Connection request cancelled');
    if (axios.isAxiosError(error) && error.response?.data instanceof Blob && error.response.data.size <= 65536 && /application\/(problem\+)?json/.test(String(error.response.headers['content-type'] ?? ''))) {
      try { error.response.data = JSON.parse(await error.response.data.text()); } catch { /* Keep the original response if a problem body is malformed. */ }
    }
    if (signal.signal.aborted || epoch !== requestEpoch) throw new axios.CanceledError('Connection request cancelled');
    throw error;
  } finally { owner.removeEventListener('abort', cancel); caller?.removeEventListener?.('abort', cancel); }
};
export async function openConnectionStream(path: string, signal: AbortSignal, receive: (data: unknown) => void) {
  validateApiPath(path);
  if (!platform.stream) throw new Error('Change notifications are not available on this platform yet.');
  const requestEpoch = epoch, combined = AbortSignal.any([signal, lifetime.signal]);
  let stream: { close(): void } | undefined, closed = false;
  const close = () => { if (stream && !closed) { closed = true; stream.close(); } };
  combined.addEventListener('abort', close, { once: true });
  try {
    stream = await platform.stream(path, combined, data => { if (!combined.aborted && epoch === requestEpoch) receive(data); });
    if (combined.aborted) { close(); throw new axios.CanceledError('Connection stream cancelled'); }
    return { close: () => { combined.removeEventListener('abort', close); close(); } };
  } catch (error) { combined.removeEventListener('abort', close); throw error; }
}
/** Raw transport is shared by bootstrap and diagnostics to avoid recursive error reporting. */
export const transport = axios.create({ baseURL: '/api', adapter: connectionAdapter });
transport.interceptors.request.use(config => { config.headers['X-Request-ID'] = crypto.randomUUID(); return config; });
