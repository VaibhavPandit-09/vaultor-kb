// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import FileImportModal from './FileImportModal';
import { prepareImport } from '../../lib/fileImports';
import api from '../../lib/api';
vi.mock('./AppModal', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../../lib/api', () => ({ default: { put: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function file(name: string, text: string) {
  const result = new File([text], name);
  Object.defineProperty(result, 'arrayBuffer', { value: async () => new TextEncoder().encode(text).buffer });
  return result;
}

it('defaults Markdown/text to notes, binaries to files, and allows applying choices to similar files', async () => {
  const session = await prepareImport([file('one.md','# One'),file('two.md','# Two'),file('text.txt','Hello'),file('original.pdf','bytes')]);
  render(<FileImportModal session={session} onClose={vi.fn()} onResource={vi.fn()} />);
  expect((screen.getByLabelText('Import one.md as') as HTMLSelectElement).value).toBe('note');
  expect((screen.getByLabelText('Import text.txt as') as HTMLSelectElement).value).toBe('note');
  expect((screen.getByLabelText('Import original.pdf as') as HTMLSelectElement).options).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Import one.md as'), { target: { value: 'file' } });
  fireEvent.click(screen.getAllByText('Apply to similar files')[0]);
  expect((screen.getByLabelText('Import two.md as') as HTMLSelectElement).value).toBe('file');
  expect((screen.getByLabelText('Import text.txt as') as HTMLSelectElement).value).toBe('note');
});

it('retries only failed rows with the same identity and leaves successful imports alone', async () => {
  const session = await prepareImport([file('one.md','# One'),file('two.pdf','bytes')]);
  vi.mocked(api.put).mockResolvedValueOnce({ data: { id: 'one', type: 'note', title: 'one' } }).mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({ data: { id: 'two', type: 'file', title: 'two.pdf' } });
  const created = vi.fn();
  render(<FileImportModal session={session} onClose={vi.fn()} onResource={created} />);
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  await waitFor(() => expect(screen.getByText('Connection lost')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Retry failed files' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy());
  expect(api.put).toHaveBeenCalledTimes(3);
  expect(vi.mocked(api.put).mock.calls[1][0]).toBe(vi.mocked(api.put).mock.calls[2][0]);
  expect(created).toHaveBeenCalledTimes(2);
  const body = vi.mocked(api.put).mock.calls[0][1] as FormData;
  expect(body.get('title')).toBe('one');
  expect(JSON.parse(body.get('content') as string).content[0].type).toBe('heading');
});

it('shows missing-asset warnings before mutation and Cancel creates nothing', async () => {
  const session = await prepareImport([file('images.md', '![Missing](relative.png)')]);
  const close = vi.fn();
  render(<FileImportModal session={session} onClose={close} onResource={vi.fn()} />);
  expect(screen.getByText(/asset not imported/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalledOnce(); expect(api.put).not.toHaveBeenCalled();
});
