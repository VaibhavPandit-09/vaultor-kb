// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../lib/api';
vi.mock('../lib/api',()=>({default:{get:vi.fn()}}));
import LibraryView from './LibraryView';
import { useResourcePage } from '../lib/useResourcePage';
import { browseResources, setResourceFavorite, type ResourcePage } from '../lib/resourceBrowse';
vi.mock('../lib/resourceSearch',()=>({searchResourcePage:(...args:Parameters<typeof browseResources>)=>browseResources(...args)}));
vi.mock('../lib/resourceBrowse', () => ({ browseResources: vi.fn(), setResourceFavorite: vi.fn() }));
const page = (prefix = 'Note'): ResourcePage => ({ items: Array.from({length:100}, (_, i) => ({id:`${prefix}-${i}`,type:'note',title:`${prefix} ${i}`,tags:[],createdAt:'2026-09-23',updatedAt:'2026-09-23'})),page:0,size:100,totalItems:205,totalPages:3 });
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.mocked(browseResources).mockResolvedValue(page());
  vi.mocked(api.get).mockResolvedValue({data:{id:'atlas',name:'Atlas',count:100}});
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
it('virtualizes a bounded page and asks the server for the next page', async () => {
  const open=vi.fn();
  render(<LibraryView section="library" visible tags={[]} hasNotes onReturn={() => {}} onOpen={open} />);
  await screen.findByText('Note 0');
  expect(screen.getAllByRole('listitem').length).toBeLessThan(30);
  expect(screen.queryByText('Note 99')).toBeNull();
  fireEvent.click(screen.getByTitle('Note 0')); expect(open).toHaveBeenCalledWith('Note-0');
  fireEvent.click(screen.getByText('Next'));
  await waitFor(() => expect(browseResources).toHaveBeenLastCalledWith(expect.objectContaining({page:1,size:100}),expect.any(AbortSignal)));
  fireEvent.change(screen.getByLabelText('Resource type'),{target:{value:'file'}});
  await waitFor(() => expect(browseResources).toHaveBeenLastCalledWith(expect.objectContaining({page:0,type:'file'}),expect.any(AbortSignal)));
});
it('offers retry on a failed page and keeps pin failures visible', async () => {
  vi.mocked(browseResources).mockRejectedValueOnce(new Error('Unavailable'));
  vi.mocked(setResourceFavorite).mockRejectedValue(new Error('Unavailable'));
  render(<LibraryView section="library" visible tags={[]} hasNotes={false} onReturn={() => {}} onOpen={() => {}} />);
  await screen.findByText('Unavailable'); fireEvent.click(screen.getByText('Retry'));
  await screen.findByText('Note 0'); fireEvent.click(screen.getByLabelText('Pin Note 0'));
  await screen.findByText('Retry pin');
});
it('aborts old queries and ignores responses arriving after a newer search', async () => {
  let finish!: (value:ResourcePage) => void;
  vi.mocked(browseResources).mockImplementationOnce(() => new Promise(resolve => {finish=resolve;}));
  const {result,rerender}=renderHook(({q}) => useResourcePage({q}),{initialProps:{q:'old'}});
  const signal=vi.mocked(browseResources).mock.calls[0][1]!;
  rerender({q:'new'});
  await waitFor(() => expect(result.current.data?.items[0].title).toBe('Note 0'));
  expect(signal.aborted).toBe(true);
  await act(async () => finish(page('Old')));
  expect(result.current.data?.items[0].title).toBe('Note 0');
});
it('combines collection and tag filtering and scopes selection to the current page', async () => {
  render(<LibraryView section="library" visible tags={['topic']} collection={{id:'atlas',name:'Atlas',count:100}} hasNotes={false} onReturn={()=>{}} onOpen={()=>{}}/>);
  await screen.findByText('Note 0');
  expect(browseResources).toHaveBeenCalledWith(expect.objectContaining({collection:'atlas',tags:['topic']}),expect.any(AbortSignal));
  fireEvent.click(screen.getByLabelText('Select Note 0'));expect(screen.getByText('1 selected')).toBeTruthy();
  fireEvent.click(screen.getByText('Select page'));expect(screen.getByText('100 selected')).toBeTruthy();
  fireEvent.click(screen.getByText('Next'));await waitFor(()=>expect(screen.getByText('0 selected')).toBeTruthy());
});
