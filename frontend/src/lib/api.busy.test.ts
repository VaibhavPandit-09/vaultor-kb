// @vitest-environment jsdom
import axios,{AxiosError,AxiosHeaders,type InternalAxiosRequestConfig} from 'axios';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({request:vi.fn(),report:vi.fn(),epoch:1}));
vi.mock('./platform',()=>({getConnection:()=>({epoch:mocks.epoch}),connectionAdapter:(config:unknown)=>mocks.request(config)}));
vi.mock('./connection',()=>({ensureCompatible:async()=>{}}));
vi.mock('./changeFeed',()=>({rememberMutation:vi.fn()}));
vi.mock('./diagnostics',()=>({reportError:mocks.report}));
import api,{isWorkspaceBusy} from './api';
function failure(config:InternalAxiosRequestConfig,code='WORKSPACE_BUSY',status=409){return new AxiosError('Busy','ERR_BAD_REQUEST',config,undefined,{data:{code,detail:'Maintenance',requestId:'server-request',busy:{owner:'index',phase:'batch',durationMs:8}},status,statusText:'Conflict',headers:new AxiosHeaders(),config});}
beforeEach(()=>{vi.useFakeTimers();mocks.request.mockReset();mocks.report.mockClear();mocks.epoch=1;});
afterEach(()=>vi.useRealTimers());
it('only retries exact admission busy, retains inspectable request detail and avoids a global warning',async()=>{
 mocks.request.mockImplementationOnce(config=>Promise.reject(failure(config))).mockImplementationOnce(config=>Promise.resolve({config,status:200,headers:{},data:'saved'}));
 const update=vi.fn(),result=api.put('/resources/imports/id',new FormData(),{onWorkspaceBusy:update});await vi.advanceTimersByTimeAsync(550);
 expect((await result).data).toBe('saved');expect(mocks.request).toHaveBeenCalledTimes(2);expect(update).toHaveBeenCalledOnce();expect(mocks.report).toHaveBeenCalledWith(expect.stringContaining('workspace.wait'),expect.any(Error),'server-request',false,{category:'ui',severity:'info'});
});
it('escalates a stuck lock after the bounded interval',async()=>{
 mocks.request.mockImplementation(config=>Promise.reject(failure(config)));const result=api.get('/resources');const caught=result.catch(error=>error);
 await vi.advanceTimersByTimeAsync(31000);expect(isWorkspaceBusy(await caught)).toBe(true);expect(mocks.report).toHaveBeenCalledWith('workspace.busy.timeout',expect.any(Error),'server-request',true);
});
it('never retries authentication, generation mismatches or untyped conflicts',async()=>{
 for(const [code,status] of [['WORKSPACE_GENERATION_CHANGED',409],['NOT_AUTHORIZED',403],['OTHER_BUSY',503]] as const){mocks.request.mockImplementationOnce(config=>Promise.reject(failure(config,code,status)));await expect(api.get('/resources')).rejects.toBeInstanceOf(AxiosError);}
 expect(mocks.request).toHaveBeenCalledTimes(3);expect(mocks.report.mock.calls.every(call=>call[3]===true)).toBe(true);
});
it('cancels a wait on source change and on caller cancellation',async()=>{
 mocks.request.mockImplementation(config=>Promise.reject(failure(config)));const first=api.get('/resources').catch(error=>error);await vi.advanceTimersByTimeAsync(10);mocks.epoch=2;await vi.advanceTimersByTimeAsync(500);expect(axios.isCancel(await first)).toBe(true);
 const controller=new AbortController(),second=api.get('/resources',{signal:controller.signal}).catch(error=>error);await vi.advanceTimersByTimeAsync(10);controller.abort();expect(axios.isCancel(await second)).toBe(true);
});
