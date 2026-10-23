// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import api from './api';
import { importResource, type ImportSession } from './fileImports';
import { runFolderImport, type FolderJournal } from './folderImports';
import type { IndexedSessionStore } from './sessionStore';
vi.mock('./api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
vi.mock('./platform',()=>({getConnection:()=>({epoch:1})}));
vi.mock('./organization',()=>({organizationChanged:vi.fn()}));
vi.mock('./fileImports',async original=>({...await original<typeof import('./fileImports')>(),importResource:vi.fn()}));
const identity={id:'workspace',generation:'generation'};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(api.get).mockResolvedValue({data:identity});vi.mocked(api.put).mockResolvedValue({data:{id:'saved'}});vi.mocked(importResource).mockImplementation(async id=>({id,type:'note',title:'Saved',tags:[],createdAt:'',updatedAt:''}));});
function fixture(){
 const session:ImportSession={folder:{name:'docs',directories:[]},rows:['a','b'].map(name=>({id:name,path:`docs/${name}.md`,file:new File(['text'],name+'.md'),kind:'markdown',asNote:true,sourceText:'[Link](b.md)',doc:{type:'doc',content:[]},warnings:[],status:'ready'}))};
 const journal:FolderJournal={key:'journal',signature:'signature',identity,rows:[],directories:{},includeRoot:false,merge:false,complete:false};
 const put=vi.fn().mockResolvedValue(undefined);const store={put} as unknown as IndexedSessionStore;
 return {session,journal,store,put};
}
it('persists IDs before writes and resumes paused imports without recreating completed resources',async()=>{
 const {session,journal,store,put}=fixture();let cancel=false;
 await runFolderImport(session,session.rows,journal,store,()=>cancel,()=>{},()=>{cancel=true;});
 expect(importResource).toHaveBeenCalledTimes(1);expect(journal.complete).toBe(false);
 expect(put.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(importResource).mock.invocationCallOrder[0]);
 cancel=false;await runFolderImport(session,session.rows,journal,store,()=>cancel,()=>{},()=>{});
 expect(vi.mocked(importResource).mock.calls.map(call=>call[0])).toEqual(['a','b']);expect(journal.complete).toBe(true);
 expect(api.put).toHaveBeenCalledWith('/resources/imports/a/relationships',expect.anything(),expect.objectContaining({headers:{'X-Vaultor-Generation':'generation'},connectionEpoch:1}));
});
it('retries failed finalization without uploading resources again',async()=>{
 const {session,journal,store}=fixture();vi.mocked(api.put).mockRejectedValueOnce(new Error('Lost response'));
 await runFolderImport(session,session.rows,journal,store,()=>false,()=>{},()=>{});
 expect(journal.complete).toBe(false);expect(session.rows[0].error).toBe('Lost response');
 await runFolderImport(session,session.rows,journal,store,()=>false,()=>{},()=>{});
 expect(importResource).toHaveBeenCalledTimes(2);expect(api.put).toHaveBeenCalledTimes(3);expect(journal.complete).toBe(true);
});
it('refuses to write into a replaced workspace',async()=>{
 const {session,journal,store}=fixture();vi.mocked(api.get).mockResolvedValue({data:{...identity,generation:'replacement'}});
 await expect(runFolderImport(session,session.rows,journal,store,()=>false,()=>{},()=>{})).rejects.toThrow('Workspace changed');
 expect(importResource).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});
