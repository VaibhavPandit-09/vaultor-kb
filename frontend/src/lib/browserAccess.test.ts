// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const { raw } = vi.hoisted(() => ({ raw: vi.fn() }));
vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: Object.assign(actual.default, { getAdapter: () => raw }) };
});
import { configureConnection, getPlatform, transport } from './platform';
const browser = getPlatform();
afterEach(() => { raw.mockReset(); configureConnection({ profileId: 'browser', kind: 'browser' }, browser); });
it('deduplicates browser session lookup and sends CSRF for ordinary and raw diagnostic mutations', async () => {
  raw.mockImplementation(async config => ({ config, status: 200, headers: {}, data: config.url === '/access/session' ? { csrf: 'session-proof' } : {} }));
  await Promise.all([transport.post('/resources', {}), transport.post('/diagnostics/events', [])]);
  expect(raw.mock.calls.filter(([c]) => c.url === '/access/session')).toHaveLength(1);
  for (const [config] of raw.mock.calls.filter(([c]) => c.method === 'post')) {
    expect(config.headers.get('X-Vaultor-CSRF')).toBe('session-proof');
    expect(config.headers.get('X-Vaultor-Owner')).toBeUndefined();
  }
  await transport.get('/resources');
  expect(raw.mock.calls.at(-1)?.[0].headers.get('X-Vaultor-CSRF')).toBeUndefined();
});
it('failed session lookup does not send the mutation and remains retryable', async () => {
  let failed = true;
  raw.mockImplementation(async config => {
    if (config.url === '/access/session' && failed) throw new Error('Host unavailable');
    return { config, status: 200, headers: {}, data: { csrf: 'reconnected' } };
  });
  await expect(transport.post('/resources', {})).rejects.toThrow('Host unavailable');
  expect(raw.mock.calls.every(([c]) => c.url === '/access/session')).toBe(true);
  failed = false; await transport.post('/resources', {});
  expect(raw.mock.calls.at(-1)?.[0].headers.get('X-Vaultor-CSRF')).toBe('reconnected');
});
