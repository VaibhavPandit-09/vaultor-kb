// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),post:vi.fn(),start:vi.fn(),approve:vi.fn()}));
vi.mock('./connection',()=>({requireBackgroundOperations:vi.fn(async()=>{})}));
vi.mock('./api',()=>({default:mocks}));
vi.mock('./activity',()=>({activityTasks:()=>[],registerActivityAdapter:vi.fn(),startActivity:mocks.start,approveActivityPreview:mocks.approve}));
vi.mock('./platform',()=>({getConnection:()=>({epoch:7}),saveApiFile:vi.fn()}));
import {dispatchTransfer,dispatchWorkspacePreview} from './transferActivity';
import type {TaskContext} from './activity';
const context=()=>({check:vi.fn(async()=>{}),paused:()=>false,update:vi.fn()});
const run=()=>mocks.start.mock.calls.at(-1)![1] as (context:TaskContext)=>Promise<boolean>;
beforeEach(()=>{for(const mock of Object.values(mocks))mock.mockReset();mocks.get.mockResolvedValue({data:{id:'workspace',generation:'generation'}});mocks.start.mockResolvedValue(undefined);});
it('lost export preparation retries the identical durable request and requires an artifact receipt before success',async()=>{
 await dispatchTransfer('workspace-export');const input=mocks.start.mock.calls[0][0];mocks.put.mockRejectedValueOnce(Error('Response lost'));await expect(run()(context())).rejects.toThrow('Response lost');
 mocks.put.mockResolvedValueOnce({data:{operation:{id:input.receipt,status:'SUCCEEDED',phase:'complete'}}}).mockResolvedValueOnce({data:{bytes:120,sha256:'a'.repeat(64)}});const status=context();expect(await run()(status)).toBe(true);expect(new Set(mocks.put.mock.calls.map(call=>call[0])).size).toBe(1);expect(status.update).toHaveBeenCalledWith(expect.objectContaining({output:{path:'/exports/'+input.receipt+'/download',filename:'workspace.zip'}}));
});
it('partial exports retain exact selected IDs and never claim a ZIP without a hash receipt',async()=>{
 await dispatchTransfer('workspace-export',undefined,'Selection',['first','second']);mocks.put.mockResolvedValueOnce({data:{operation:{status:'SUCCEEDED',phase:'complete'}}}).mockResolvedValueOnce({data:{bytes:0,sha256:''}});await expect(run()(context())).rejects.toThrow('does not prove');expect(mocks.put.mock.calls[0][1]).toMatchObject({scope:'resources',ids:['first','second'],format:'partial',generation:'generation'});
});
it('refuses a review from another source epoch or replaced generation before task admission',async()=>{
 await expect(dispatchTransfer('workspace-merge','retained',undefined,undefined,{workspace:{id:'workspace',generation:'generation'},epoch:8})).rejects.toThrow('Connection changed');expect(mocks.get).not.toHaveBeenCalled();
 await expect(dispatchTransfer('workspace-merge','retained',undefined,undefined,{workspace:{id:'workspace',generation:'earlier'},epoch:7})).rejects.toThrow('Workspace changed');expect(mocks.start).not.toHaveBeenCalled();
});
it('uncertain ZIP preview consults its retained receipt without uploading a second payload',async()=>{
 const file=new File(['fixture ZIP'],'workspace.zip'),intent={id:crypto.randomUUID(),name:'Separate copy',kind:'import' as const};await dispatchWorkspacePreview(intent,file);
 mocks.put.mockRejectedValueOnce(Error('Response lost'));await expect(run()(context())).rejects.toThrow('Response lost');mocks.get.mockResolvedValueOnce({data:{id:intent.id,state:'PREVIEW',detail:'Validated',preview:{notes:1,files:0,tags:0,warnings:[]}}});const status=context();expect(await run()(status)).toBe(false);expect(mocks.put).toHaveBeenCalledOnce();expect(mocks.get).toHaveBeenLastCalledWith('/workspace-imports/'+intent.id,expect.objectContaining({connectionEpoch:7}));expect(status.update).toHaveBeenCalledWith(expect.objectContaining({phase:'Needs approval — review validated workspace'}));expect(JSON.stringify(mocks.start.mock.calls[0][0])).not.toContain('fixture ZIP');
});
