// @vitest-environment jsdom
import { render, fireEvent, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import NoteExportModal from './NoteExportModal';
import api from '../../lib/api';
vi.mock('./AppModal', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../lib/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('blocks export on save failure, then retries the same note after saving successfully', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: [{ scope: 'notes', format: 'md', extension: 'md' }, { scope: 'workspace', format: 'zip', extension: 'zip' }] });
  vi.mocked(api.post).mockResolvedValue({ data: { id: 'op', status: 'SUCCEEDED', phase: 'complete', progress: 100, filename: 'Saved.md', warnings: ['Missing reference retained'] } });
  const flush = vi.fn().mockRejectedValueOnce(new Error('Save failed; draft retained')).mockResolvedValue(undefined);
  const close = vi.fn();
  render(<NoteExportModal noteId="selected-note" title="Saved" flush={flush} onClose={close} />);
  await screen.findByText('Markdown (.md)');
  fireEvent.click(screen.getByText('Create export'));
  await screen.findByText('Save failed; draft retained');expect(api.post).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Retry export'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/exports', { scope: 'notes', format: 'md', noteId: 'selected-note' }));
  expect(await screen.findByText('Download Saved.md')).toBeTruthy();expect(screen.getByText('Missing reference retained')).toBeTruthy();expect(flush).toHaveBeenCalledTimes(2);
});
