// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useWorkspaceStartup} from './useWorkspaceStartup';
afterEach(cleanup);

it('finishes saved-browser restoration after its state changes cause rerenders',async()=>{
 let finish=()=>{};let owns=()=>false;const completed=vi.fn(),failed=vi.fn();
 const restore=vi.fn(async(_path:string,current:()=>boolean)=>{owns=current;await new Promise<void>(resolve=>{finish=resolve;});if(current())completed();});
 const view=renderHook(({render})=>useWorkspaceStartup('workspace',true,async(path,current)=>{void render;await restore(path,current);},failed),{initialProps:{render:0}});
 view.rerender({render:1});view.rerender({render:2});
 expect(restore).toHaveBeenCalledOnce();expect(owns()).toBe(true);
 await act(async()=>finish());expect(completed).toHaveBeenCalledOnce();expect(failed).not.toHaveBeenCalled();
});

it('cancels ownership on workspace switch and ignores late failures',async()=>{
 const owners=new Map<string,()=>boolean>(),rejects=new Map<string,(error:Error)=>void>(),failed=vi.fn();
 const restore=vi.fn(async(path:string,current:()=>boolean)=>{owners.set(path,current);await new Promise<void>((_resolve,reject)=>rejects.set(path,reject));});
 const view=renderHook(({path})=>useWorkspaceStartup(path,true,restore,failed),{initialProps:{path:'first'}});
 view.rerender({path:'second'});expect(owners.get('first')!()).toBe(false);expect(owners.get('second')!()).toBe(true);
 await act(async()=>rejects.get('first')!(new Error('Old workspace failure')));expect(failed).not.toHaveBeenCalled();
 await act(async()=>rejects.get('second')!(new Error('Current failure')));expect(failed).toHaveBeenCalledWith(new Error('Current failure'));
});

it('waits for profile preferences before restoring',()=>{
 const restore=vi.fn(async()=>{}),failed=vi.fn();
 const view=renderHook(({ready})=>useWorkspaceStartup('workspace',ready,restore,failed),{initialProps:{ready:false}});
 expect(restore).not.toHaveBeenCalled();view.rerender({ready:true});expect(restore).toHaveBeenCalledOnce();
});
