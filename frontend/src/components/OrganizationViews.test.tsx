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
it('queries each pinned type independently and drills down without changing title search',async()=>{
 vi.mocked(browseResources).mockImplementation(async (q={})=>({items:[{id:q.type+'1',title:q.type+' title',type:q.type as 'note'|'file',tags:[],createdAt:'2026-10-07',updatedAt:'2026-10-07'}],page:q.page??0,size:q.size??12,totalItems:25,totalPages:3}));
 vi.mocked(api.get).mockResolvedValue({data:{items:[{id:'c1',name:'Topic',count:2,favorite:true}],totalItems:1,totalPages:1,page:0}});
 render(<EscapeManagerProvider><PinnedList onResource={()=>{}} onCollection={()=>{}}/></EscapeManagerProvider>);
 await screen.findByText('Topic');await screen.findByText('file title');
 expect(browseResources).toHaveBeenCalledWith(expect.objectContaining({type:'note',size:12,sort:'title',favorites:true}),expect.any(AbortSignal));
 expect(browseResources).toHaveBeenCalledWith(expect.objectContaining({type:'file',size:12}),expect.any(AbortSignal));
 expect(api.get).toHaveBeenCalledWith('/collections',expect.objectContaining({params:expect.objectContaining({favorites:true,size:12})}));
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'title'}});
 await waitFor(()=>expect(browseResources).toHaveBeenCalledWith(expect.objectContaining({q:'title'}),expect.any(AbortSignal)));
 fireEvent.click(screen.getByRole('button',{name:'View all notes'}));
 await waitFor(()=>expect(browseResources).toHaveBeenLastCalledWith(expect.objectContaining({type:'note',size:100,q:'title',page:0}),expect.any(AbortSignal)));
 expect(screen.queryByText('Topic')).toBeNull();expect(screen.queryByLabelText('Select Topic')).toBeNull();
});
