// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import {PinnedList,CollectionsView} from './OrganizationViews';
import {browseResources} from '../lib/resourceBrowse';
import api from '../lib/api';
vi.mock('../lib/resourceBrowse',()=>({browseResources:vi.fn(),setResourceFavorite:vi.fn()}));
vi.mock('../lib/api',()=>({default:{get:vi.fn()}}));
beforeEach(()=>{vi.stubGlobal('ResizeObserver',class{observe(){} disconnect(){}});});
afterEach(()=>{cleanup();vi.resetAllMocks();vi.unstubAllGlobals();});
it('uses one mixed pin query and filters server paging while preserving title search',async()=>{
 vi.mocked(api.get).mockImplementation(async (_url,options)=>{
  const kind=(options?.params as {kind?:string}|undefined)?.kind;
  return {data:{appliedKind:kind??'all',items:kind==='file'?[{id:'f',kind:'file',name:'File title',count:0}]:[{id:'c',kind:'collection',name:'Atlas',count:2},{id:'f',kind:'file',name:'File title',count:0},{id:'n',kind:'note',name:'Note title',count:0}],totalItems:kind==='file'?1:3,totalPages:1,page:0}};
 });
 render(<EscapeManagerProvider><PinnedList onResource={()=>{}} onCollection={()=>{}}/></EscapeManagerProvider>);
 await screen.findByText('Atlas');await screen.findByText('File title');
 expect(browseResources).not.toHaveBeenCalled();
 expect(api.get).toHaveBeenCalledTimes(1);
 expect(api.get).toHaveBeenCalledWith('/organization/pins',expect.objectContaining({params:{q:'',page:0,size:100}}));
 expect(screen.getAllByRole('listitem').map(row=>row.querySelector('strong')?.textContent)).toEqual(['Atlas','File title','Note title']);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'title'}});
 await waitFor(()=>expect(api.get).toHaveBeenCalledWith('/organization/pins',expect.objectContaining({params:expect.objectContaining({q:'title'})})));
 fireEvent.click(screen.getByRole('button',{name:'Filter pinned type'}));
 fireEvent.click(screen.getByRole('button',{name:'Files'}));
 await waitFor(()=>expect(api.get).toHaveBeenLastCalledWith('/organization/pins',expect.objectContaining({params:{kind:'file',q:'title',page:0,size:100}})));
 expect(screen.queryByText('Atlas')).toBeNull();expect(screen.queryByLabelText('Select Atlas')).toBeNull();
});
it('refuses an unacknowledged filter from an older server instead of broadening it',async()=>{
 vi.mocked(api.get).mockResolvedValue({data:{items:[{id:'n',kind:'note',name:'Other type',count:0}],totalItems:10,totalPages:1}});
 render(<EscapeManagerProvider><PinnedList compact filterType="file" onResource={()=>{}} onCollection={()=>{}}/></EscapeManagerProvider>);
 await screen.findByText('Update the connected server to 0.6.0 or later to filter pinned shortcuts.');
 expect(screen.queryByText('Other type')).toBeNull();
});

it('keeps Collections search, page and scroll when hidden, with one reachable pager',async()=>{
 vi.mocked(api.get).mockImplementation(async (_url,options)=>{const page=(options?.params as {page?:number}|undefined)?.page??0;return {data:{items:[{id:'c'+page,name:'Collection '+page,count:0}],totalItems:205,totalPages:3,page}};});
 const props={onOpen:vi.fn()};
 const view=render(<EscapeManagerProvider><CollectionsView {...props}/></EscapeManagerProvider>);
 await screen.findByText('Collection 0');
 const input=screen.getByRole('textbox',{name:'Search collections'});fireEvent.change(input,{target:{value:'topic'}});
 await waitFor(()=>expect(api.get).toHaveBeenLastCalledWith('/collections',expect.objectContaining({params:expect.objectContaining({q:'topic'})})));
 fireEvent.click(screen.getByRole('button',{name:'Next'}));await screen.findByText('Collection 1');
 const pager=screen.getByRole('navigation',{name:'Result pages'});
 expect(view.container.querySelector('.library-orientation')?.contains(pager)).toBe(true);
 expect(screen.getAllByRole('navigation',{name:'Result pages'})).toHaveLength(1);
 const viewport=view.container.querySelector<HTMLElement>('.library-view')!;viewport.scrollTop=400;fireEvent.scroll(viewport);
 const requests=vi.mocked(api.get).mock.calls.length;
 view.rerender(<EscapeManagerProvider><CollectionsView {...props} visible={false}/></EscapeManagerProvider>);
 expect(screen.queryByRole('textbox')).toBeNull();expect(api.get).toHaveBeenCalledTimes(requests);viewport.scrollTop=0;
 view.rerender(<EscapeManagerProvider><CollectionsView {...props}/></EscapeManagerProvider>);
 await screen.findByText('Collection 1');expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('topic');
 expect(screen.getByText('Page 2 of 3')).toBeTruthy();expect(viewport.scrollTop).toBe(400);
 fireEvent.click(screen.getByText('Collection 1'));expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({id:'c1'}));
});
it('retains the full Pinned query/page through navigation without changing compact sidebar ownership',async()=>{
 vi.mocked(api.get).mockImplementation(async (_url,options)=>{const page=(options?.params as {page?:number}|undefined)?.page??0;return {data:{items:[{id:'c'+page,kind:'collection',name:'Pinned collection '+page,count:2}],totalItems:205,totalPages:3,page}};});
 const props={onResource:vi.fn(),onCollection:vi.fn()};
 const view=render(<EscapeManagerProvider><PinnedList {...props}/></EscapeManagerProvider>);
 await screen.findByText('Pinned collection 0');
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'topic'}});
 await waitFor(()=>expect(api.get).toHaveBeenLastCalledWith('/organization/pins',expect.objectContaining({params:expect.objectContaining({q:'topic',size:100})})));
 fireEvent.click(screen.getByRole('button',{name:'Next'}));await screen.findByText('Pinned collection 1');
 const viewport=view.container.querySelector<HTMLElement>('.library-view')!;viewport.scrollTop=400;fireEvent.scroll(viewport);
 view.rerender(<EscapeManagerProvider><PinnedList {...props} visible={false}/></EscapeManagerProvider>);
 expect(screen.queryByRole('heading',{name:'Pinned'})).toBeNull();viewport.scrollTop=0;
 view.rerender(<EscapeManagerProvider><PinnedList {...props}/></EscapeManagerProvider>);
 await screen.findByText('Pinned collection 1');expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('topic');
 expect(viewport.scrollTop).toBe(400);expect(screen.getAllByRole('navigation',{name:'Result pages'})).toHaveLength(1);
 view.unmount();
 const compact=render(<EscapeManagerProvider><PinnedList compact {...props}/></EscapeManagerProvider>);
 await screen.findByText('Pinned collection 0');expect(compact.container.querySelector('.library-view')).toBeNull();expect(screen.queryByRole('navigation')).toBeNull();
 expect(api.get).toHaveBeenLastCalledWith('/organization/pins',expect.objectContaining({params:{q:'',page:0,size:12}}));
});
