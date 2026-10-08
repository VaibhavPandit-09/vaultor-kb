// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import {PinnedList} from './OrganizationViews';
import {browseResources} from '../lib/resourceBrowse';
import api from '../lib/api';
vi.mock('../lib/resourceBrowse',()=>({browseResources:vi.fn(),setResourceFavorite:vi.fn()}));
vi.mock('../lib/api',()=>({default:{get:vi.fn()}}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('uses one mixed pin query and filters server paging while preserving title search',async()=>{
 vi.mocked(api.get).mockImplementation(async (_url,options)=>{
  const kind=options?.params?.kind;
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
