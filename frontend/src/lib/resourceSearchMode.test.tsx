// @vitest-environment jsdom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useResourcePage} from './useResourcePage';
import {browseResources,type ResourcePage} from './resourceBrowse';
import {searchResourcePage,type SearchMode} from './resourceSearch';
vi.mock('./resourceBrowse',()=>({browseResources:vi.fn()}));
vi.mock('./resourceSearch',()=>({searchResourcePage:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const titlePage:ResourcePage={items:[],page:0,size:50,totalItems:0,totalPages:0};
const bodyPage:ResourcePage={...titlePage,items:[{id:'body',title:'Different title',type:'note',tags:[],createdAt:'',updatedAt:'',searchSnippet:{text:'needle',highlights:[]}}],totalItems:1,totalPages:1};
it('defaults to title metadata and includes bodies only on demand, preserving scope',async()=>{
 vi.mocked(browseResources).mockResolvedValue(titlePage);vi.mocked(searchResourcePage).mockResolvedValue(bodyPage);
 const {result,rerender}=renderHook(({mode}:{mode:SearchMode|undefined})=>useResourcePage({q:'needle',collection:'topic',searchMode:mode}),{initialProps:{mode:undefined as SearchMode|undefined}});
 await waitFor(()=>expect(result.current.data).toEqual(titlePage));expect(searchResourcePage).not.toHaveBeenCalled();expect(browseResources).toHaveBeenCalledWith({q:'needle',collection:'topic'},expect.any(AbortSignal));
 rerender({mode:'content'});await waitFor(()=>expect(result.current.data).toEqual(bodyPage));expect(searchResourcePage).toHaveBeenCalledWith({q:'needle',collection:'topic'},expect.any(AbortSignal));
 rerender({mode:'title'});await waitFor(()=>expect(result.current.data).toEqual(titlePage));
});
it('aborts and discards old content/scope responses without falling back globally',async()=>{
 let finish!:(data:ResourcePage)=>void;vi.mocked(searchResourcePage).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));vi.mocked(browseResources).mockResolvedValue(titlePage);
 const {result,rerender}=renderHook(({mode,collection}:{mode:SearchMode;collection:string})=>useResourcePage({q:'needle',collection,searchMode:mode}),{initialProps:{mode:'content' as SearchMode,collection:'old'}});
 const oldSignal=vi.mocked(searchResourcePage).mock.calls[0][1]!;rerender({mode:'title',collection:'new'});await waitFor(()=>expect(result.current.data).toEqual(titlePage));expect(oldSignal.aborted).toBe(true);await act(async()=>finish(bodyPage));expect(result.current.data).toEqual(titlePage);expect(browseResources).toHaveBeenLastCalledWith({q:'needle',collection:'new'},expect.any(AbortSignal));
});
