// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest';
const fixtures=vi.hoisted(()=>({saved:new Map<string,unknown>(),epoch:1,generation:'generation',release:vi.fn(),failStorage:false}));
vi.mock('./api',()=>({default:{get:vi.fn(async()=>({data:{id:'workspace',generation:fixtures.generation}}))}}));
vi.mock('./platform',()=>({getConnection:()=>({epoch:fixtures.epoch,profileId:'profile'})}));
vi.mock('./desktop',()=>({blockConnectionSwitch:()=>fixtures.release}));
vi.mock('./diagnostics',()=>({reportError:vi.fn()}));
vi.mock('./sessionStore',()=>({IndexedSessionStore:class{async put(key:string,value:unknown){if(fixtures.failStorage)throw Error('Storage blocked');fixtures.saved.set(key,structuredClone(value));}async delete(key:string){fixtures.saved.delete(key);}async values(prefix:string){return [...fixtures.saved].filter(([key])=>key.startsWith(prefix)).map(([,value])=>value);}}}));
const input=()=>({id:crypto.randomUUID(),kind:'file-import',title:'Import docs',workspace:{id:'workspace',generation:'generation'},phase:'Importing'});
beforeEach(()=>{vi.resetModules();fixtures.saved.clear();fixtures.epoch=1;fixtures.generation='generation';fixtures.failStorage=false;fixtures.release.mockClear();});
it('owns execution after dispatch returns, pauses between steps and resumes the same task',async()=>{
 const service=await import('./activity');let finish!:()=>void;const gate=new Promise<void>(resolve=>finish=resolve);let calls=0;
 const task=input();await service.startActivity(task,async context=>{calls++;await gate;return !context.paused();});expect(service.activityTasks()[0].state).toBe('running');service.pauseActivity(task.id);finish();await vi.waitFor(()=>expect(service.activityTasks()[0].state).toBe('paused'));await service.resumeActivity(task.id);expect(calls).toBe(2);expect(service.activityTasks()[0].state).toBe('complete');expect(fixtures.release).toHaveBeenCalledTimes(2);
});
it('restores interrupted metadata as paused without replaying a write',async()=>{
 const service=await import('./activity'),task=input();await service.startActivity(task,async()=>new Promise(()=>{}));await vi.waitFor(()=>expect((fixtures.saved.values().next().value as {state:string}).state).toBe('running'));
 vi.resetModules();const restarted=await import('./activity');await restarted.restoreActivity(task.workspace);expect(restarted.activityTasks()[0].state).toBe('paused');await restarted.resumeActivity(task.id);expect(restarted.activityTasks()[0].phase).toContain('Reselect');
});
it('refuses dispatch without durable storage, and refuses stale generation before a runner writes',async()=>{
 const service=await import('./activity'),run=vi.fn(async()=>true);fixtures.failStorage=true;await expect(service.startActivity(input(),run)).rejects.toThrow('Storage blocked');expect(run).not.toHaveBeenCalled();fixtures.failStorage=false;fixtures.generation='replacement';await service.startActivity(input(),run);await vi.waitFor(()=>expect(service.activityTasks()[0].state).toBe('attention'));expect(run).not.toHaveBeenCalled();
});
