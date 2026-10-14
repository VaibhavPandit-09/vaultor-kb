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
  fireEvent.click(screen.getByRole('button',{name:'Next'}));
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
  fireEvent.click(screen.getByRole('button',{name:'Next'}));await waitFor(()=>expect(screen.queryByText('100 selected')).toBeNull());
});
it('retains query while opting into content and changing collection destination',async()=>{
 const changeScope=vi.fn();render(<LibraryView section="library" visible tags={[]} collection={{id:'atlas',name:'Atlas',count:100}} onCollection={changeScope} hasNotes={false} onReturn={()=>{}} onOpen={()=>{}}/>);
 const input=screen.getByLabelText('Search resources');fireEvent.change(input,{target:{value:'needle'}});await screen.findByText('Note 0');fireEvent.click(screen.getByRole('button',{name:'Search options'}));
 const toggle=screen.getByLabelText('Include saved content');expect((toggle as HTMLInputElement).checked).toBe(false);fireEvent.click(toggle);expect((input as HTMLInputElement).value).toBe('needle');await waitFor(()=>expect((screen.getByLabelText('Sort resources') as HTMLSelectElement).disabled).toBe(true));fireEvent.click(screen.getByRole('button',{name:'Entire workspace'}));expect(changeScope).toHaveBeenCalledWith(null);expect((input as HTMLInputElement).value).toBe('needle');
});
it('starts from restored title/content mode and query without restoring bulk selection',()=>{
 const context={query:'saved query',searchMode:'content' as const,type:'note',sort:'title' as const};
 const view=render(<LibraryView section="library" visible tags={[]} hasNotes={false} onOpen={()=>{}} onReturn={()=>{}} initialContext={context}/>);
 expect((view.getByRole('textbox',{name:'Search resources'}) as HTMLInputElement).value).toBe('saved query');
 expect(view.queryByText('selected')).toBeNull();
});

it('attaches compression to the mounted Library scroll owner without replacing search or results', async () => {
 const view=render(<LibraryView section="library" visible tags={[]} hasNotes onReturn={()=>{}} onOpen={()=>{}}/>);
 await screen.findByText('Note 0');
 const viewport=view.container.querySelector<HTMLElement>('.library-transform')!;
 const input=screen.getByRole('textbox',{name:'Search resources'}) as HTMLInputElement;
 fireEvent.change(input,{target:{value:'research'}});
 await waitFor(()=>expect(browseResources).toHaveBeenLastCalledWith(expect.objectContaining({q:'research'}),expect.any(AbortSignal)));
 await screen.findByText('Note 0');
 const row=screen.getAllByRole('listitem')[0];
 const queries=vi.mocked(browseResources).mock.calls.length;
 input.focus(); input.setSelectionRange(1,3);
 viewport.scrollTop=160; fireEvent.scroll(viewport);
 await waitFor(()=>expect(Number(viewport.style.getPropertyValue('--library-progress'))).toBeGreaterThan(.9));
 expect(screen.getByRole('textbox',{name:'Search resources'})).toBe(input);
 expect(document.activeElement).toBe(input); expect(input.selectionStart).toBe(1);
 expect(screen.getAllByRole('listitem')[0]).toBe(row); expect(browseResources).toHaveBeenCalledTimes(queries);
});

it('keeps one pager in the working context and starts a new page at its first result', async () => {
 const view=render(<LibraryView section="library" visible tags={[]} hasNotes={false} onReturn={()=>{}} onOpen={()=>{}}/>);
 await screen.findByText('Note 99');
 const viewport=view.container.querySelector<HTMLElement>('.library-transform')!;
 const pager=screen.getByRole('navigation',{name:'Result pages'});
 expect(view.container.querySelector('.library-summary')?.contains(pager)).toBe(true);
 expect(screen.getAllByRole('navigation',{name:'Result pages'})).toHaveLength(1);
 fireEvent.click(screen.getByLabelText('Select Note 0'));
 viewport.scrollTop=2500; fireEvent.scroll(viewport);
 fireEvent.click(screen.getByRole('button',{name:'Next'}));
 await screen.findByText('Note 100'); expect(viewport.scrollTop).toBe(0);
 expect(screen.queryByText('1 selected')).toBeNull();
 expect(screen.getByRole('navigation',{name:'Result pages'})).toBe(pager);
 expect(screen.getByRole('button',{name:'Previous'}).hasAttribute('disabled')).toBe(false);
});
it('transforms collection identity and actions without duplicating the long title', async () => {
 const name='Atlas — a long collection name 日本語';
 vi.mocked(api.get).mockResolvedValue({data:{id:'atlas',name,count:205}});
 const changeScope=vi.fn();
 const view=render(<LibraryView section="library" visible tags={[]} collection={{id:'atlas',name,count:205}} onCollection={changeScope} hasNotes={false} onReturn={()=>{}} onOpen={()=>{}}/>);
 await screen.findByText('Note 0');
 const heading=screen.getByRole('heading',{name,level:1});
 expect(heading.getAttribute('title')).toBe(name);
 expect(screen.getAllByText(name)).toHaveLength(1);
 expect(view.container.querySelector('.collection-transform .library-orientation')?.contains(heading)).toBe(true);
 expect(screen.getByRole('button',{name:'+ Add resource'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Library'})); expect(changeScope).toHaveBeenCalledWith(null);
});

it('keeps a collection metadata failure and retry below the transforming controls', async () => {
 vi.mocked(api.get).mockRejectedValueOnce(new Error('Collection unavailable'));
 const view=render(<LibraryView section="library" visible tags={[]} collection={{id:'atlas',name:'Atlas',count:100}} hasNotes={false} onReturn={()=>{}} onOpen={()=>{}}/>);
 const alert=await screen.findByRole('alert');
 expect(view.container.querySelector('.library-working-context')?.contains(alert)).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Retry collection'}));
 await waitFor(()=>expect(screen.queryByText('Collection unavailable')).toBeNull());
});
