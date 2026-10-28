// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import type {ImportRow,ImportSession} from './fileImports';
import type {FolderJournal} from './folderImports';
import type {TaskContext} from './activity';
import type {IndexedSessionStore} from './sessionStore';
const mocks=vi.hoisted(()=>({start:vi.fn(),run:vi.fn(),notify:vi.fn(),epoch:7}));
vi.mock('./activity',()=>({startActivity:mocks.start,activityTasks:()=>[]}));
vi.mock('./folderImports',()=>({runFolderImport:mocks.run,folderPaths:()=>['docs']}));
vi.mock('./resourceEvents',()=>({notifyResourceChange:mocks.notify}));
vi.mock('./platform',()=>({getConnection:()=>({epoch:mocks.epoch})}));
import {dispatchImport} from './importActivity';
const identity={id:'workspace',generation:'generation'};
beforeEach(()=>{vi.useFakeTimers();mocks.start.mockReset().mockResolvedValue(undefined);mocks.run.mockReset();mocks.notify.mockReset();mocks.epoch=7;});
afterEach(()=>vi.useRealTimers());
function fixture(){const rows:ImportRow[]=[{id:'note',path:'docs/note.md',file:new File(['source'],'note.md'),kind:'markdown',asNote:true,status:'ready',warnings:['Unresolved source link']}];const session:ImportSession={rows,folder:{name:'docs',directories:[]}},journal:FolderJournal={key:'retained',identity,signature:'verified',rows:[],directories:{},includeRoot:true,merge:false,complete:false};return {rows,session,journal,store:{} as IndexedSessionStore};}
it('coalesces duplicate writes and routes saved content through generation-scoped reconciliation',async()=>{
 const f=fixture();mocks.run.mockImplementation(async(_s,_r,journal,_store,_cancel,update,resource)=>{update('Importing resources');for(let n=0;n<60;n++)resource({id:'note'});await new Promise(resolve=>setTimeout(resolve,900));resource({id:'second'});journal.complete=true;update('Import complete');});await dispatchImport(f.session,f.rows,f.journal,f.store);const context={update:vi.fn(),paused:()=>false,check:async()=>{}};const running=(mocks.start.mock.calls[0][1] as (task:TaskContext)=>Promise<boolean>)(context);
 await vi.advanceTimersByTimeAsync(249);expect(mocks.notify).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(mocks.notify).toHaveBeenCalledWith({kind:'imported',ids:['note'],workspaceId:'workspace',generation:'generation'});await vi.advanceTimersByTimeAsync(650);await running;expect(mocks.notify).toHaveBeenCalledTimes(2);
});
it('uses phase-specific units without counting pending link resolution as warnings or complete progress',async()=>{
 const f=fixture();mocks.run.mockImplementation(async(_s,rows,journal,_store,_cancel,update)=>{update('Creating collections');rows[0].status='done';update('Resolving internal links');rows[0].resolved=true;journal.complete=true;update('Import complete');});await dispatchImport(f.session,f.rows,f.journal,f.store);const context={update:vi.fn(),paused:()=>false,check:async()=>{}};await mocks.start.mock.calls[0][1](context);expect(context.update).toHaveBeenCalledWith(expect.objectContaining({phase:'Resolving internal links',done:0,total:1,unit:'notes linked',warnings:0}));expect(context.update).toHaveBeenCalledWith(expect.objectContaining({phase:'Import complete',done:1,total:1,unit:'files imported',warnings:1}));
});
it('does not invalidate another connection after source departure',async()=>{
 const f=fixture();mocks.run.mockImplementation(async(_s,_r,_j,_store,_cancel,_update,resource)=>{resource({id:'note'});mocks.epoch=8;});await dispatchImport(f.session,f.rows,f.journal,f.store);await mocks.start.mock.calls[0][1]({update:vi.fn(),paused:()=>false,check:async()=>{}});expect(mocks.notify).not.toHaveBeenCalled();
});
