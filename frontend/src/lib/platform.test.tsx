// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import axios, { type AxiosAdapter } from 'axios';
import { configureConnection, getPlatform, transport, validateApiPath, openConnectionStream, type PlatformServices } from './platform';
import { ensureCompatible, validateCapabilities } from './connection';
import { flushDiagnostics, getLocalDiagnostics, reportError } from './diagnostics';
import ConnectionGate from '../components/ConnectionGate';
import api from './api';

const browser = getPlatform();
const caps = { serverBuild: 'test-server', apiProtocolVersion: 2, minimumClientProtocolVersion: 2, authentication: false };
function services(request: AxiosAdapter): PlatformServices { return { ...browser, kind: 'desktop', request }; }
function respond(data: unknown, status = 200): AxiosAdapter { return async config => ({ config, data, status, statusText: '', headers: { 'x-request-id': 'server-id' } }); }
afterEach(() => { cleanup(); configureConnection({ profileId: 'browser', kind: 'browser' }, browser); vi.restoreAllMocks(); });

it('rejects missing/unsupported contracts and tells which side needs updating', () => {
  expect(() => validateCapabilities({} as typeof caps)).toThrow('Update the server');
  expect(() => validateCapabilities({ ...caps, apiProtocolVersion: 0 })).toThrow();
  expect(() => validateCapabilities({ ...caps, apiProtocolVersion: 3, minimumClientProtocolVersion: 3 })).toThrow('Update this app');
  expect(validateCapabilities({ ...caps, apiProtocolVersion: 2 })).toMatchObject({ apiProtocolVersion: 2 });
});
it('does not mount workspace children or send mutations to an incompatible server; retry works', async () => {
  let compatible = false;
  const request = vi.fn<AxiosAdapter>(async config => ({ config, status: 200, statusText: '', headers: {}, data: compatible ? caps : { ...caps, apiProtocolVersion: 3, minimumClientProtocolVersion: 3 } }));
  configureConnection({ profileId: 'test', kind: 'local' }, services(request));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<ConnectionGate><p>Workspace loaded</p></ConnectionGate>);
  await screen.findByText('Update this app to open this workspace.');
  expect(screen.queryByText('Workspace loaded')).toBeNull();
  await expect(api.post('/resources', { title: 'never sent' })).rejects.toThrow('Update this app');
  expect(request.mock.calls.every(([config]) => config.url === '/capabilities')).toBe(true);
  compatible = true; fireEvent.click(screen.getByText('Retry'));
  await screen.findByText('Workspace loaded');
});
it('shares one handshake, preserves blobs/multipart/request IDs, and returns structured failures without retry', async () => {
  const blob = new Blob(['binary']), body = new FormData(); body.append('file', blob);
  const request = vi.fn<AxiosAdapter>(async config => ({ config, status: config.url === '/failure' ? 409 : 200, statusText: '', headers: { 'x-request-id': 'server-id' }, data: config.url === '/capabilities' ? caps : config.url === '/failure' ? { detail: 'Conflict', code: 'CONFLICT' } : blob }));
  configureConnection({ profileId: 'test', kind: 'local' }, services(request));
  await Promise.all([ensureCompatible(), ensureCompatible()]);
  expect(request).toHaveBeenCalledTimes(1);
  const response = await api.post('/uploads', body, { responseType: 'blob' });
  expect(response.data).toBe(blob); expect(response.headers['x-request-id']).toBe('server-id');
  expect(request.mock.calls[1][0].data).toBe(body); expect(request.mock.calls[1][0].headers['X-Request-ID']).toBeTruthy();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(api.post('/failure', {})).rejects.toMatchObject({ response: { status: 409, data: { code: 'CONFLICT' } } });
  expect(request.mock.calls.filter(([c]) => c.url === '/failure')).toHaveLength(1);
});
it('cancels in-flight requests on connection change and ignores responses from a non-cooperating adapter', async () => {
  let finish!: () => void;
  const request: AxiosAdapter = config => new Promise(resolve => { finish = () => resolve({ config, status: 200, statusText: '', headers: {}, data: 'stale' }); });
  configureConnection({ profileId: 'old', kind: 'remote' }, services(request));
  const pending = transport.get('/resources');
  await waitFor(() => expect(finish).toBeDefined());
  configureConnection({ profileId: 'new', kind: 'remote' }, services(respond(caps))); finish();
  await expect(pending).rejects.toSatisfy(axios.isCancel);
});
it('propagates caller cancellation and preserves problem details on failed binary requests', async () => {
  let finish!: () => void, aborted = false;
  const request: AxiosAdapter = config => new Promise(resolve => {
    config.signal?.addEventListener?.('abort', () => { aborted = true; });
    finish = () => resolve({ config, status: 200, statusText: '', headers: {}, data: 'late' });
  });
  configureConnection({ profileId: 'test', kind: 'local' }, services(request));
  const controller = new AbortController(), pending = transport.get('/resources/file/raw', { signal: controller.signal });
  await waitFor(() => expect(finish).toBeDefined()); controller.abort(); finish();
  await expect(pending).rejects.toSatisfy(axios.isCancel); expect(aborted).toBe(true);
  const body = new Blob(['{"detail":"Missing file","code":"NOT_FOUND"}']);
  Object.defineProperty(body, 'text', { value: async () => '{"detail":"Missing file","code":"NOT_FOUND"}' });
  configureConnection({ profileId: 'test', kind: 'local' }, services(async config => ({ config, status: 404, statusText: '', headers: { 'content-type': 'application/problem+json', 'x-request-id': 'problem-id' }, data: body })));
  await expect(transport.get('/resources/file/raw', { responseType: 'blob' })).rejects.toMatchObject({ response: { data: { detail: 'Missing file', code: 'NOT_FOUND' }, headers: { 'x-request-id': 'problem-id' } } });
});
it('keeps diagnostic delivery bounded and nonrecursive, scoped to the active connection', async () => {
  const request = vi.fn<AxiosAdapter>(async config => { if (config.url === '/diagnostics/events') throw new Error('offline'); return respond(caps)(config); });
  configureConnection({ profileId: 'test', kind: 'local' }, services(request)); await ensureCompatible();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  reportError('test', new Error('failure')); const before = getLocalDiagnostics().length;
  for (let i = 0; i < 5; i++) await flushDiagnostics();
  expect(request.mock.calls.filter(([c]) => c.url === '/diagnostics/events')).toHaveLength(3);
  expect(getLocalDiagnostics()).toHaveLength(before);
  reportError('old host', new Error('failure'));
  configureConnection({ profileId: 'new', kind: 'remote' }, services(request)); await ensureCompatible(); await flushDiagnostics();
  expect(request.mock.calls.filter(([c]) => c.url === '/diagnostics/events')).toHaveLength(3);
});
it('owns stream cancellation and rejects external/traversing API paths', async () => {
  for (const path of ['https://host/api', '//host/path', '/resources/../settings', '/resources/%2e%2e/settings', '/%2fhost', '/resources\\settings']) expect(() => validateApiPath(path)).toThrow();
  const close = vi.fn(), receive = vi.fn(); let deliver!: (data: unknown) => void;
  configureConnection({ profileId: 'test', kind: 'local' }, { ...services(respond(caps)), stream: async (_path, _signal, callback) => { deliver = callback; return { close }; } });
  await openConnectionStream('/changes', new AbortController().signal, receive);
  deliver('fresh'); configureConnection({ profileId: 'new', kind: 'remote' }, browser); deliver('stale');
  expect(close).toHaveBeenCalledOnce(); expect(receive).toHaveBeenCalledExactlyOnceWith('fresh');
});
it('browser downloads request a file, detach their anchor, and release the URL', async () => {
  vi.useFakeTimers();
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test'), revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try { expect(await browser.saveBlob(new Blob(['hello']), 'note.md')).toBe('requested'); expect(click).toHaveBeenCalledOnce(); expect(document.querySelector('a[download]')).toBeNull(); vi.advanceTimersByTime(1000); expect(create).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledWith('blob:test'); }
  finally { vi.useRealTimers(); }
});
