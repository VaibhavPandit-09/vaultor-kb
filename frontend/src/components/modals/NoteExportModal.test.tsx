// @vitest-environment jsdom
import { render, fireEvent, screen, cleanup, act } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import NoteExportModal from './NoteExportModal';
import { NoteExportController } from '../../lib/noteExportController';
import api from '../../lib/api';
vi.mock('./AppModal', () => ({ default: ({ children, open, onClose }: { children: React.ReactNode; open: boolean; onClose: () => void }) => open ? <div>{children}<button onClick={onClose}>Close</button></div> : null }));
vi.mock('../../lib/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const format = { scope: 'notes', format: 'md', extension: 'md' };
const complete = { id: 'op', status: 'SUCCEEDED', phase: 'complete', progress: 100, filename: 'Saved.md' };
let click: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.mocked(api.get).mockImplementation(async url => ({ data: url === '/export-formats' ? [format] : new Blob(['note']) }));
  vi.mocked(api.post).mockResolvedValue({ data: complete });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('direct choice saves, retains failure, retries and automatically downloads', async () => {
  const flush = vi.fn().mockRejectedValueOnce(new Error('Save failed; draft retained')).mockResolvedValue(undefined);
  const close = vi.fn();
  render(<NoteExportModal noteId="note" title="Saved" flush={flush} onClose={close} />);
  fireEvent.click(await screen.findByText('Markdown (.md)'));
  await screen.findByText('Save failed; draft retained'); expect(api.post).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Retry export'));
  await screen.findByText('Download requested'); expect(click).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledOnce();
  expect(api.post).toHaveBeenCalledWith('/exports', { scope: 'notes', format: 'md', noteId: 'note' }, expect.anything());
  fireEvent.click(screen.getByText('Download again'));
  await screen.findByText('Download requested'); expect(click).toHaveBeenCalledTimes(2); expect(api.post).toHaveBeenCalledTimes(1);
});
it('continues saving and downloads after picker dismissal; duplicate choices do not start jobs', async () => {
  let saved!: () => void; const flush = vi.fn(() => new Promise<void>(resolve => { saved = resolve; }));
  const props = { noteId: 'note', title: 'Saved', flush, onClose: vi.fn() };
  const view = render(<NoteExportModal {...props} />);
  const choice = await screen.findByText('Markdown (.md)'); fireEvent.click(choice); fireEvent.click(choice);
  view.rerender(<NoteExportModal {...props} noteId={undefined} />);
  await act(async () => saved());
  await screen.findByText('Download requested'); expect(click).toHaveBeenCalledOnce(); expect(flush).toHaveBeenCalledOnce();
});
it('retries a failed download without saving or creating another operation', async () => {
  const manager = new NoteExportController(); const flush = vi.fn().mockResolvedValue(undefined);
  vi.mocked(api.get).mockRejectedValueOnce(new Error('Download unavailable')).mockResolvedValue({ data: new Blob() });
  await manager.start('note', 'Saved', format, flush);
  expect(manager.snapshot()?.retry).toBe('download');
  await manager.retry(); expect(manager.snapshot()?.stage).toBe('downloaded');
  expect(api.post).toHaveBeenCalledOnce(); expect(flush).toHaveBeenCalledOnce();
});
it('bounds status failures and resumes the existing operation', async () => {
  vi.useFakeTimers(); const manager = new NoteExportController();
  vi.mocked(api.post).mockResolvedValue({ data: { ...complete, status: 'QUEUED' } });
  vi.mocked(api.get).mockRejectedValue(new Error('Status offline'));
  const started = manager.start('note', 'Saved', format, async () => {});
  await vi.advanceTimersByTimeAsync(6000); await started;
  expect(api.get).toHaveBeenCalledTimes(3); expect(manager.snapshot()?.retry).toBe('status');
  vi.mocked(api.get).mockResolvedValueOnce({ data: complete }).mockResolvedValueOnce({ data: new Blob() });
  const retried = manager.retry(); await vi.advanceTimersByTimeAsync(1000); await retried;
  expect(manager.snapshot()?.stage).toBe('downloaded'); expect(api.post).toHaveBeenCalledOnce();
});
it('only a confirmed preparation failure permits retrying with a fresh snapshot', async () => {
  const manager = new NoteExportController(); const flush = vi.fn().mockResolvedValue(undefined);
  vi.mocked(api.post).mockResolvedValueOnce({ data: { ...complete, status: 'FAILED', detail: 'Renderer failed' } }).mockResolvedValueOnce({ data: complete });
  await manager.start('note', 'Saved', format, flush); expect(manager.snapshot()?.retry).toBe('prepare');
  await manager.retry(); expect(api.post).toHaveBeenCalledTimes(2); expect(flush).toHaveBeenCalledTimes(2);
});
it('does not repeat an ambiguous creation request', async () => {
  const manager = new NoteExportController(); vi.mocked(api.post).mockRejectedValue(new Error('Connection lost'));
  await manager.start('note', 'Saved', format, async () => {}); await manager.retry();
  expect(api.post).toHaveBeenCalledOnce(); expect(manager.snapshot()?.retry).toBeUndefined();
});
it('unmount aborts tracking without initiating a download', async () => {
  vi.useFakeTimers(); const manager = new NoteExportController();
  vi.mocked(api.post).mockResolvedValue({ data: { ...complete, status: 'RUNNING' } });
  const started = manager.start('note', 'Saved', format, async () => {});
  await vi.advanceTimersByTimeAsync(1); manager.dispose(); await started;
  expect(click).not.toHaveBeenCalled(); expect(api.get).not.toHaveBeenCalled();
});
it('saves only participating notes and sends the final graph fingerprint', async () => {
  const manager = new NoteExportController(); const flush = vi.fn().mockResolvedValue(undefined), flushNote = vi.fn().mockResolvedValue(undefined);
  const preview = { notes: 2, files: 0, noteIds: ['root', 'child'], resourceIds: ['root','child'], warnings: [], fingerprint: 'v1' };
  vi.mocked(api.get).mockResolvedValueOnce({data: preview}).mockResolvedValueOnce({data: {...preview, fingerprint:'v2'}}).mockResolvedValueOnce({data:new Blob()});
  await manager.start('root','Root',format,flush,{linked:true,flushNote,reviewedGraph:preview});
  expect(flushNote).toHaveBeenCalledExactlyOnceWith('child');
  expect(api.post).toHaveBeenCalledWith('/exports',expect.objectContaining({links:'linked',fingerprint:'v2'}),expect.anything());
  await manager.downloadAgain();expect(flushNote).toHaveBeenCalledOnce();expect(api.post).toHaveBeenCalledOnce();
});
it('stops before snapshot when saved links change the reviewed graph', async () => {
  const manager = new NoteExportController();const preview={notes:1,files:0,noteIds:['root'],resourceIds:['root'],warnings:[],fingerprint:'old'};
  vi.mocked(api.get).mockResolvedValue({data:{...preview,notes:2,noteIds:['root','new'],resourceIds:['root','new']}});
  await manager.start('root','Root',format,async()=>{},{linked:true,flushNote:async()=>{},reviewedGraph:preview});
  expect(api.post).not.toHaveBeenCalled();expect(manager.snapshot()?.error).toContain('review the updated counts');
});
it('cancellation during saving prevents preparation without discarding edits', async () => {
  const manager=new NoteExportController();let release!:()=>void;
  const started=manager.start('root','Root',format,()=>new Promise<void>(r=>{release=r;}));
  manager.cancel();release();await started;
  expect(api.post).not.toHaveBeenCalled();expect(manager.snapshot()?.error).toContain('cancelled');
});
it('graph preview counts and package labels precede the format choice', async () => {
  vi.mocked(api.get).mockImplementation(async url=>({data:url==='/export-formats'?[format,{scope:'notes',format:'pdf',extension:'pdf'}]:{notes:2,files:1,noteIds:['root','child'],resourceIds:['root','child','file'],warnings:[],fingerprint:'v'}}));
  render(<NoteExportModal noteId="root" title="Root" flush={async()=>{}} flushNote={async()=>{}} onClose={()=>{}}/>);
  fireEvent.click(screen.getByText('Include linked resources'));
  await screen.findByText(/2 notes/);expect(screen.getByText('PDF package (.zip)')).toBeTruthy();expect(api.post).not.toHaveBeenCalled();
});
it('workspace generation change stops the old export and does not replay it', async () => {
  let release!:()=>void;
  const props={noteId:'same-id',title:'Old workspace',flush:()=>new Promise<void>(r=>{release=r;}),onClose:vi.fn()};
  const view=render(<NoteExportModal key="workspace:g1" {...props}/>);
  fireEvent.click(await screen.findByText('Markdown (.md)'));
  view.rerender(<NoteExportModal key="workspace:g2" {...props} noteId={undefined}/>);
  await act(async()=>release());
  expect(api.post).not.toHaveBeenCalled();expect(click).not.toHaveBeenCalled();expect(screen.queryByLabelText('Note export')).toBeNull();
});
