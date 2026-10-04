// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { activateDesktop, getDesktopSessionId, nativeAdapter, prepareConnectionSwitch, registerConnectionBarrier, blockConnectionSwitch, SwitchBlockedError, pickDesktopFiles, type DesktopBridge, type DesktopState } from './desktop';
import { getPlatform, configureConnection, transport } from './platform';
import { IndexedSessionStore, claimTab, SessionPersistence, type SessionSnapshot, defaultLibrary } from './sessionStore';
import DesktopRoot from '../components/DesktopRoot';
import { EscapeManagerProvider } from './escape/EscapeManagerProvider';
import axios from 'axios';
const browser = getPlatform();
const state: DesktopState = { version: 1, clientId: 'client', sessionId: 'client', profiles: [{ id: 'profile-a', name: 'Local A', kind: 'local', address: 'http://127.0.0.1:8080' }], active: 'profile-a', token: 'token' };
it('native selections upload opaque tickets instead of reading a large file into renderer memory',async()=>{
  const native=bridge();window.vaultorDesktop=native;
  native.pickFiles=vi.fn(async()=>({ok:true as const,value:[{id:'approved',name:'large.csv',size:40*1024*1024,lastModified:1}]}));
  native.readFile=vi.fn();activateDesktop(state);
  const [file]=await pickDesktopFiles('.csv',false);const data=new FormData();data.append('file',file);
  await transport.post('/resources/upload',data);
  expect(native.request).toHaveBeenCalledWith(expect.objectContaining({body:{kind:'multipart',parts:[{name:'file',fileId:'approved',filename:'large.csv',type:'text/csv'}]}}));
  expect(native.readFile).not.toHaveBeenCalled();
});
it('quit uses the save/recovery barrier and failed recovery is reported without permission to discard',async()=>{
  const native=bridge();window.vaultorDesktop=native;let callback!:(value:{id:string;keepDrafts:boolean})=>void;
  native.onQuitRequest=vi.fn(value=>{callback=value;return()=>{};});native.quitReply=vi.fn(async()=>({ok:true as const,value:undefined}));
  const unregister=registerConnectionBarrier(async()=>{throw new SwitchBlockedError('Recovery unavailable');});
  try{render(<EscapeManagerProvider><DesktopRoot><p>Workspace</p></DesktopRoot></EscapeManagerProvider>);await waitFor(()=>expect(callback).toBeDefined());callback({id:'quit',keepDrafts:true});await waitFor(()=>expect(native.quitReply).toHaveBeenCalledWith({id:'quit',success:false,error:'Recovery unavailable',canKeepDrafts:false}));}finally{unregister();}
});
function bridge(): DesktopBridge {
  return {
    bootstrap: vi.fn(async () => ({ ok: true as const, value: { ...state, active: null, token: '' } })),
    addProfile: vi.fn(), probe: vi.fn(async () => ({ ok: true as const, value: { ticket: 'ticket', profile: state.profiles[0], identity: { id: 'workspace', generation: 'g1' }, differentWorkspace: false, serverBuild: 'test' } })),
    activate: vi.fn(async () => ({ ok: true as const, value: state })), cancel: vi.fn(async () => ({ ok: true as const, value: undefined })), writeClipboard: vi.fn(async () => ({ ok: true as const, value: undefined })),
    request: vi.fn(async () => ({ ok: true as const, value: { status: 200, headers: { 'x-request-id': 'reply' }, data: new TextEncoder().encode('{"ok":true}') } })),
  };
}
afterEach(() => { cleanup(); delete window.vaultorDesktop; configureConnection({ profileId: 'browser', kind: 'browser' }, browser); vi.restoreAllMocks(); });
it('managed startup failure retains other connections and exposes bounded local diagnostics', async () => {
  const native = bridge(); window.vaultorDesktop = native;
  native.localStatus = vi.fn(async () => ({ ok: true as const, value: { status: 'failed', address: null, error: 'Workspace is already in use', restartAttempts: 0, dataDirectory: 'disposable-data', logError: '', logs: [{ timestamp: 'now', message: 'Lock denied' }] } }));
  native.probe = vi.fn(async () => ({ ok: false as const, error: { code: 'DESKTOP_ERROR', detail: 'Check startup logs and retry' } }));
  render(<EscapeManagerProvider><DesktopRoot><p>Workspace</p></DesktopRoot></EscapeManagerProvider>);
  fireEvent.click(await screen.findByText('Local A')); await screen.findByText('Check startup logs and retry');
  expect(await screen.findByText('Workspace is already in use')).toBeDefined(); expect(screen.getByText('Local A')).toBeDefined();
  expect(screen.queryByText('Workspace')).toBeNull(); expect(native.activate).not.toHaveBeenCalled();
});
it('native transport serializes query/text, propagates IDs and parses response bytes through Axios', async () => {
  const native = bridge(); window.vaultorDesktop = native; activateDesktop(state);
  const response = await transport.post('/resources', { title: 'Hello' }, { params: { q: 'a b' } });
  expect(response.data).toEqual({ ok: true }); expect(response.headers['x-request-id']).toBe('reply');
  expect(native.request).toHaveBeenCalledWith(expect.objectContaining({ token: 'token', path: '/resources?q=a+b', method: 'POST', body: { kind: 'text', value: '{"title":"Hello"}' }, headers: expect.objectContaining({ 'X-Request-ID': expect.any(String) }) }));
});
it('native cancellation reaches main and is never reported as a response', async () => {
  const native = bridge(); let finish!: () => void;
  native.request = vi.fn<DesktopBridge['request']>(() => new Promise(resolve => { finish = () => resolve({ ok: true, value: { status: 200, headers: {}, data: new Uint8Array() } }); }));
  const controller = new AbortController();
  const api = axios.create({ adapter: nativeAdapter(native, 'token') });
  const pending = api.get('/resources', { signal: controller.signal }); await waitFor(() => expect(finish).toBeDefined()); controller.abort(); finish();
  await expect(pending).rejects.toSatisfy(axios.isCancel); expect(native.cancel).toHaveBeenCalledOnce();
});
it('desktop sessions have stable ownership across renderer restarts and profile/browser storage is isolated', async () => {
  window.vaultorDesktop = bridge(); activateDesktop(state);
  const first = new IndexedSessionStore(); await first.put('same-workspace-draft', { title: 'A', baseRevision: 'r1' });
  expect(await claimTab()).toEqual({ id: 'desktop-client' });
  activateDesktop(state); expect(getDesktopSessionId()).toBe('desktop-client'); expect(await new IndexedSessionStore().get('same-workspace-draft')).toMatchObject({ title: 'A' });
  activateDesktop({ ...state, profiles: [{ ...state.profiles[0], id: 'profile-b' }], active: 'profile-b' });
  expect(await new IndexedSessionStore().get('same-workspace-draft')).toBeUndefined();
  configureConnection({ profileId: 'browser', kind: 'browser' }, browser); expect(await new IndexedSessionStore().get('same-workspace-draft')).toBeUndefined();
});
it('switch barriers retain failed save state, require explicit keep-drafts, and block active exports', async () => {
  const save = vi.fn(async keep => { if (!keep) throw new SwitchBlockedError('save failed', true); });
  const remove = registerConnectionBarrier(save), release = blockConnectionSwitch('export');
  try {
    await expect(prepareConnectionSwitch()).rejects.toThrow('Wait for export'); expect(save).not.toHaveBeenCalled(); release();
    await expect(prepareConnectionSwitch()).rejects.toMatchObject({ canKeepDrafts: true }); await prepareConnectionSwitch(true); expect(save).toHaveBeenLastCalledWith(true);
  } finally { release(); remove(); }
});
it('strict session writes reject storage failure and allow a later retry', async () => {
  let fails = true; const error = vi.fn();
  const persistence = new SessionPersistence({ get: async () => undefined, put: async () => { if (fails) throw new Error('quota'); }, delete: async () => {}, values: async () => [] }, 'desktop', error);
  const snapshot: SessionSnapshot = { version: 1, identity: { id: 'workspace', generation: 'g1' }, panes: [], activePaneId: null, positions: {}, library: { visible: true, section: 'library', collection: null, tags: [], context: defaultLibrary } };
  await expect(persistence.save(snapshot, true)).rejects.toThrow('quota'); expect(error).toHaveBeenCalledOnce(); expect(persistence.pending).toBe(0);
  fails = false; await persistence.save(snapshot, true); expect(persistence.pending).toBe(0);
});
it('connection screen retains errors and uses keyboard submission without starting the workspace early', async () => {
  const native = bridge(); window.vaultorDesktop = native;
  native.probe = vi.fn(async () => ({ ok: false as const, error: { code: 'DESKTOP_ERROR', detail: 'Server unavailable' } }));
  native.addProfile = vi.fn(async () => ({ ok: false as const, error: { code: 'DESKTOP_ERROR', detail: 'Address is not local' } }));
  render(<EscapeManagerProvider><DesktopRoot><p>Workspace</p></DesktopRoot></EscapeManagerProvider>);
  fireEvent.click(await screen.findByText('Local A')); await screen.findByText('Server unavailable'); expect(screen.queryByText('Workspace')).toBeNull();
  fireEvent.change(screen.getByLabelText('Connection name'), { target: { value: 'Other' } }); fireEvent.submit(screen.getByLabelText('Connection name').closest('form')!);
  await screen.findByText('Address is not local'); expect(screen.getByLabelText('Connection name')).toHaveProperty('value', 'Other'); expect(native.activate).not.toHaveBeenCalled();
});
it('keep-drafts retry refreshes its ticket, prevents duplicate connect and preserves the current view on failure', async () => {
  const native = bridge(); window.vaultorDesktop = native;
  const remove = registerConnectionBarrier(async keep => { if (!keep) throw new SwitchBlockedError('Save failed', true); });
  try {
    render(<EscapeManagerProvider><DesktopRoot><p>Workspace</p></DesktopRoot></EscapeManagerProvider>);
    const connect = await screen.findByText('Local A'); fireEvent.click(connect); fireEvent.click(connect);
    await screen.findByText('Save failed'); expect(native.probe).toHaveBeenCalledOnce(); expect(native.activate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Keep drafts and switch')); await screen.findByText('Workspace');
    expect(native.probe).toHaveBeenCalledTimes(2); expect(native.activate).toHaveBeenCalledOnce();
  } finally { remove(); }
});
