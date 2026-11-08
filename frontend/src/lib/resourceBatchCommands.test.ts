// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./api',()=>({default:{post:vi.fn(),put:vi.fn()}}));
vi.mock('./resourceBrowse',()=>({setResourceFavorite:vi.fn()}));
vi.mock('./platform',()=>({getConnection:vi.fn(()=>({epoch:7,generation:'g'}))}));
import api from './api';
import { getConnection } from './platform';
import { setResourceFavorite } from './resourceBrowse';
import { changeMembership, pinResources, reparentCollection } from './resourceBatchCommands';
import type { Resource } from '../types';
const resources=['a','b','c'].map(id=>({id,title:id,type:'note',tags:[],createdAt:'',updatedAt:''})) as Resource[];
afterEach(()=>{vi.resetAllMocks();vi.mocked(getConnection).mockReturnValue({epoch:7,generation:'g'} as ReturnType<typeof getConnection>);});
it('membership uses add/remove only, scopes the atomic host request and never removes other memberships',async()=>{
 await changeMembership(['a','b'],'collection','destination','add',{epoch:7,generation:'g'});
 expect(api.post).toHaveBeenCalledWith('/organization/memberships',{resourceIds:['a','b'],kind:'collection',targetId:'destination',action:'add'},expect.objectContaining({connectionEpoch:7,headers:{'X-Vaultor-Generation':'g'}}));
 await expect(changeMembership(['a'],'tag','tag','remove',{epoch:6})).rejects.toThrow('Workspace changed');expect(api.post).toHaveBeenCalledTimes(1);
});
it('pin retains per-resource failures and refuses later writes after source departure',async()=>{
 vi.mocked(setResourceFavorite).mockImplementationOnce(async()=>{}).mockRejectedValueOnce(new Error('Unavailable')).mockImplementationOnce(async()=>{});
 const result=await pinResources(resources,true,{epoch:7,generation:'g'});expect(result.completed).toEqual(['a','c']);expect(result.failed.map(item=>item.id)).toEqual(['b']);
 vi.mocked(setResourceFavorite).mockClear();vi.mocked(setResourceFavorite).mockImplementationOnce(async()=>{vi.mocked(getConnection).mockReturnValue({epoch:8} as ReturnType<typeof getConnection>);});
 const departed=await pinResources(resources,true,{epoch:7});expect(setResourceFavorite).toHaveBeenCalledTimes(1);expect(departed.failed).toHaveLength(3);
});
it('cycles are refused locally and the host remains authoritative for racing hierarchy changes',async()=>{
 await expect(reparentCollection({id:'a',name:'A',count:0},{id:'b',name:'B',count:0,ancestors:[{id:'a',name:'A'}]})).rejects.toThrow('itself');expect(api.put).not.toHaveBeenCalled();
 vi.mocked(api.put).mockRejectedValueOnce(new Error('Hierarchy changed'));
 await expect(reparentCollection({id:'a',name:'A',count:0},{id:'b',name:'B',count:0})).rejects.toThrow('Hierarchy changed');
});
