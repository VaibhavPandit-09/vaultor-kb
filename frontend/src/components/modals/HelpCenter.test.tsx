// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import HelpCenter from './HelpCenter';
import { EscapeManagerProvider } from '../../lib/escape/EscapeManagerProvider';
import { resolveShortcutBindings } from '../../lib/shortcuts';
const writeClipboard = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/platform', () => ({ getPlatform: () => ({ writeClipboard }) }));
vi.mock('../../lib/settings', () => ({ useOptionalSettings: () => null, useSettings: () => ({ resolvedShortcuts: resolveShortcutBindings({ closeActiveNote: { windows: 'Mod+Shift+J' } }) }) }));
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [{ width: 10, height: 10 }] as unknown as DOMRectList);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function Harness({ topic = '' }: { topic?: string }) {
  const [open, setOpen] = useState(false);
  return <EscapeManagerProvider><textarea aria-label="Dirty note" defaultValue="Unsaved draft" /><button onClick={() => setOpen(true)}>Launch Help</button><HelpCenter open={open} topic={topic} onClose={() => setOpen(false)} /></EscapeManagerProvider>;
}
it('searches offline, navigates back and copies without touching a dirty editor', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'));
  render(<Harness />);
  const editor = screen.getByLabelText('Dirty note');
  const launch = screen.getByText('Launch Help'); launch.focus(); fireEvent.click(launch);
  const search = screen.getByLabelText('Search Help');
  fireEvent.change(search, { target: { value: 'recover deleted note' } });
  fireEvent.keyDown(search, { key: 'ArrowDown' });
  expect(document.activeElement?.textContent).toContain('Trash');
  fireEvent.click(screen.getByRole('button', { name: /Trash, drafts and recovery/ }));
  await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Trash, drafts and recovery' })).toBe(document.activeElement));
  expect(document.querySelector('.help-prose [contenteditable]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Copy article' }));
  await waitFor(() => expect(writeClipboard).toHaveBeenCalledWith(expect.stringContaining('# Trash, drafts and recovery')));
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect((screen.getByLabelText('Search Help') as HTMLInputElement).value).toBe('recover deleted note');
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(launch);
  expect(screen.getByLabelText('Dirty note')).toBe(editor);
  expect((editor as HTMLTextAreaElement).value).toBe('Unsaved draft');
  expect(fetch).not.toHaveBeenCalled();
});
it('renders contextual article, tables, safe links and resolved shortcuts', () => {
  const view = render(<Harness topic="platforms" />);
  fireEvent.click(screen.getByText('Launch Help'));
  expect(screen.getByRole('table')).toBeTruthy();
  view.unmount();
  render(<Harness topic="shortcuts" />); fireEvent.click(screen.getByText('Launch Help'));
  expect(screen.getByLabelText('Current keyboard bindings').textContent).toContain('Ctrl + Shift + J');
});
it('falls back home for unknown contextual topics', () => {
  render(<Harness topic="missing" />); fireEvent.click(screen.getByText('Launch Help'));
  expect(screen.getByRole('heading', { name: 'How can Vaultor help?' })).toBeTruthy();
});
