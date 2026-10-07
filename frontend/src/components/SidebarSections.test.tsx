// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,renderHook,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {SidebarSection} from './SidebarSections';
import {normalizeSidebarSections} from '../lib/sidebarPreferences';
import {useResourcePage} from '../lib/useResourcePage';
import {browseResources} from '../lib/resourceBrowse';
import {notifyResourceChange} from '../lib/resourceEvents';
vi.mock('../lib/resourceBrowse',()=>({browseResources:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('keeps cached children mounted while collapsed or hidden and separates View all',()=>{
 const prefs=normalizeSidebarSections(undefined),change=vi.fn(),all=vi.fn();
 const view=render(<SidebarSection name="recent" preferences={prefs} onChange={change} onViewAll={all}><button>Cached note</button></SidebarSection>);
 fireEvent.click(screen.getByRole('button',{name:'Recent'}));expect(change).toHaveBeenCalledWith({...prefs,recent:{visible:true,collapsed:true}});
 fireEvent.click(screen.getByRole('button',{name:'View all'}));expect(all).toHaveBeenCalledOnce();
 view.rerender(<SidebarSection name="recent" preferences={{...prefs,recent:{visible:false,collapsed:true}}} onChange={change}><button>Cached note</button></SidebarSection>);
 expect(screen.queryByRole('button',{name:'Cached note'})).toBeNull();expect(screen.getByText('Cached note')).toBeTruthy();
});
it('suspends browsing while disabled and keeps rows on reopen and failed refresh',async()=>{
 const data={items:[{id:'n',title:'Cached',type:'note' as const,tags:[],createdAt:'2026-10-07',updatedAt:'2026-10-07'}],page:0,size:6,totalItems:1,totalPages:1};
 vi.mocked(browseResources).mockResolvedValue(data);
 const {result,rerender}=renderHook(({enabled})=>useResourcePage({type:'note',size:6,sort:'recent'},enabled),{initialProps:{enabled:true}});
 await waitFor(()=>expect(result.current.data).toEqual(data));
 rerender({enabled:false});const calls=vi.mocked(browseResources).mock.calls.length;
 act(()=>notifyResourceChange({kind:'metadata'}));expect(browseResources).toHaveBeenCalledTimes(calls);
 vi.mocked(browseResources).mockRejectedValue(new Error('Offline'));
 rerender({enabled:true});expect(result.current.data).toEqual(data);expect(result.current.loading).toBe(false);
 await waitFor(()=>expect(result.current.error).toBe('Offline'));expect(result.current.data).toEqual(data);
 vi.mocked(browseResources).mockResolvedValue(data);act(()=>result.current.retry());await waitFor(()=>expect(result.current.error).toBe(''));
});
