// @vitest-environment jsdom
import type {ReactNode} from 'react';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../lib/api';
vi.mock('../lib/api',()=>({default:{get:vi.fn()}}));
import LibraryView from './LibraryView';
import { useResourcePage } from '../lib/useResourcePage';
import { browseResources, setResourceFavorite, type ResourcePage } from '../lib/resourceBrowse';
vi.mock('../lib/resourceSearch',()=>({searchResourcePage:(...args:Parameters<typeof browseResources>)=>browseResources(...args)}));
vi.mock('../lib/resourceBrowse', () => ({ browseResources: vi.fn(), setResourceFavorite: vi.fn() }));
const render=(ui:ReactNode)=>rtlRender(<EscapeManagerProvider>{ui}</EscapeManagerProvider>);
const page = (prefix = 'Note'): ResourcePage => ({ items: Array.from({length:100}, (_, i) => ({id:`${prefix}-${i}`,type:'note',title:`${prefix} ${i}`,tags:[],createdAt:'2026-09-23',updatedAt:'2026-09-23'})),page:0,size:100,totalItems:205,totalPages:3 });
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.mocked(browseResources).mockImplementation(async (query = {}) => {
    const type = query.type === 'file' ? 'file' : 'note';
    const totalItems = type === 'file' ? 2 : 205;
    const size = query.size ?? 100, index = query.page ?? 0;
    const prefix = type === 'file' ? 'File' : 'Note';
    return {items:Array.from({length:Math.min(size,Math.max(0,totalItems-index*size))},(_,i)=>({id:`${prefix}-${index*size+i}`,type,title:`${prefix} ${index*size+i}`,tags:[],createdAt:'2026-09-23',updatedAt:'2026-09-23'})),size,page:index,totalItems,totalPages:Math.ceil(totalItems/size)};
  });
  vi.mocked(api.get).mockImplementation(async url=>({data:url==='/collections'?{items:[{id:'atlas',name:'Atlas',count:100}],totalPages:1,totalItems:1}:{id:'atlas',name:'Atlas',count:100}}));
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
it('uses one mixed bounded page and filters without per-type query fanout', async () => {
  const open=vi.fn();
  render(<LibraryView section="library" visible tags={[]} hasNotes onReturn={() => {}} onOpen={open} />);
  await screen.findByText('Note 99');
  expect(screen.getAllByRole('listitem').length).toBe(100);
  expect(browseResources).toHaveBeenCalledTimes(1);
  expect(browseResources).toHaveBeenCalledWith(expect.objectContaining({type:'all',size:100}),expect.any(AbortSignal));
  fireEvent.click(screen.getByTitle('Note 0')); expect(open).toHaveBeenCalledWith('Note-0');
  fireEvent.click(screen.getByText('Next'));
  await waitFor(() => expect(browseResources).toHaveBeenLastCalledWith(expect.objectContaining({page:1,size:100}),expect.any(AbortSignal)));
  fireEvent.click(screen.getByRole('button',{name:'Filter resource type'}));
  fireEvent.change(screen.getByLabelText('Find a type'),{target:{value:'fil'}});
  fireEvent.click(screen.getByRole('button',{name:'Files'}));
  await waitFor(() => expect(browseResources).toHaveBeenLastCalledWith(expect.objectContaining({page:0,type:'file'}),expect.any(AbortSignal)));
  expect(screen.queryByRole('dialog')).toBeNull();
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
  fireEvent.click(screen.getByText('Select visible resources'));expect(screen.getByText('100 selected')).toBeTruthy();
  fireEvent.click(screen.getByText('Next'));await waitFor(()=>expect(screen.queryByText('100 selected')).toBeNull());
});
it('retains query while opting into content and changing collection destination',async()=>{
 const changeScope=vi.fn();render(<LibraryView section="library" visible tags={[]} collection={{id:'atlas',name:'Atlas',count:100}} onCollection={changeScope} hasNotes={false} onReturn={()=>{}} onOpen={()=>{}}/>);
 const input=screen.getByLabelText('Search resources');fireEvent.change(input,{target:{value:'needle'}});await screen.findByText('Note 0');fireEvent.click(screen.getByRole('button',{name:'Search options'}));
 const toggle=screen.getByLabelText('Include saved note text');expect((toggle as HTMLInputElement).checked).toBe(false);fireEvent.click(toggle);expect((input as HTMLInputElement).value).toBe('needle');await waitFor(()=>expect((screen.getByLabelText('Sort resources') as HTMLSelectElement).disabled).toBe(true));fireEvent.click(screen.getByRole('button',{name:'Entire workspace'}));expect(changeScope).toHaveBeenCalledWith(null);expect((input as HTMLInputElement).value).toBe('needle');
});
it('starts from restored title/content mode and query without restoring bulk selection',()=>{
 const context={query:'saved query',searchMode:'content' as const,type:'note',sort:'title' as const};
 const view=render(<LibraryView section="library" visible tags={[]} hasNotes={false} onOpen={()=>{}} onReturn={()=>{}} initialContext={context}/>);
 expect((view.getByRole('textbox',{name:'Search resources'}) as HTMLInputElement).value).toBe('saved query');
 expect(view.queryByText('selected')).toBeNull();
});
