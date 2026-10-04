// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/dom';
const html = readFileSync(resolve(process.cwd(), '../backend/src/main/resources/static/access.html'), 'utf8');
const source = readFileSync(resolve(process.cwd(), '../backend/src/main/resources/static/access.js'), 'utf8');
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });
it('browser owner requires code comparison before approving', async () => {
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1];
  const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/session') ? { role: 'OWNER', csrf: 'csrf' } : url.endsWith('/pairings') ? [{ id: 'p', name: 'Client', kind: 'browser', code: '123456' }] : { hostId: 'host', fingerprint: 'f'.repeat(64) }), { status: 200 }));
  vi.stubGlobal('fetch', fetch); new Function(source)();
  await waitFor(() => expect(document.querySelector('.match')).not.toBeNull());
  const approve = [...document.querySelectorAll('button')].find(b => b.textContent === 'Approve')!; expect(approve.disabled).toBe(true);
  fireEvent.click(document.querySelector('.match input')!); expect(approve.disabled).toBe(false); fireEvent.click(approve);
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/owner/pairings/p/approve', expect.objectContaining({ body: '{"code":"123456"}', headers: expect.objectContaining({ 'X-Vaultor-CSRF': 'csrf' }) })));
});
it('browser enrollment retries its existing request after a network failure', async () => {
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1];
  const replace = vi.fn(); vi.stubGlobal('location', { hash: '', pathname: '/', protocol: 'https:', replace });
  let polls = 0;
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith('/session')) return new Response('{}', { status: 401 });
    if (url === '/api/pairings/p' && ++polls === 1) throw new Error('Connection interrupted');
    return new Response(JSON.stringify(url === '/api/pairings' ? { id: 'p', secret: 's'.repeat(64), code: '123456' } : url === '/api/pairings/p' ? { state: 'APPROVED' } : { hostId: 'host', fingerprint: 'f'.repeat(64) }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch); new Function(source)();
  const form = document.getElementById('enroll') as HTMLFormElement;
  await waitFor(() => expect(form.hidden).toBe(false)); (form.elements.namedItem('name') as HTMLInputElement).value = 'Browser';
  fireEvent.submit(form); await waitFor(() => expect(document.getElementById('status')!.textContent).toBe('Connection interrupted'));
  fireEvent.click(document.getElementById('retry')!); await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  expect(fetch.mock.calls.filter(([url]) => url === '/api/pairings')).toHaveLength(1);
});
