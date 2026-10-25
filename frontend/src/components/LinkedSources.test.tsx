// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import LinkedSources from './LinkedSources';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import type {LinkedWorkspace} from '../lib/linked/workspace';
import type {Entry} from '../lib/linked/types';
afterEach(cleanup);
it('large folders use bounded pages and continue reconciling the visible page',async()=>{
  const rows=Array.from({length:205},(_,i)=>({id:String(i),root:'root',name:'File '+i+'.md',relative:'File '+i+'.md',identity:String(i),directory:false,markdown:true,unsupported:false,size:5,parent:null} satisfies Entry));let observer:(()=>Promise<void>)|undefined;
  const request=vi.fn(async(operation:string,p:{offset?:number;limit?:number}={})=>{expect(operation).toBe('list');return {items:rows.slice(p.offset??0,(p.offset??0)+(p.limit??200)),more:(p.offset??0)+200<rows.length};});
  const workspace={supported:()=>true,subscribe:()=>()=>{},getContextVersion:()=>0,getSourcesVersion:()=>0,sources:async()=>({sources:[{id:'root',name:'Docs',enabled:true,status:'available'}]}),request,observeDirectory:(_id:string,refresh:()=>Promise<void>)=>{observer=refresh;return()=>{observer=undefined;};},remember:vi.fn()} as unknown as LinkedWorkspace;
  const view=render(<EscapeManagerProvider><LinkedSources workspace={workspace} onOpen={()=>{}}/></EscapeManagerProvider>);fireEvent.click(await view.findByRole('button',{name:'Docs'}));await view.findByRole('button',{name:'File 0.md'});expect(view.queryByRole('button',{name:'File 200.md'})).toBeNull();fireEvent.click(view.getByRole('button',{name:'Next'}));await view.findByRole('button',{name:'File 200.md'});expect(view.queryByRole('button',{name:'File 0.md'})).toBeNull();
  rows[200]={...rows[200],name:'Updated.md'};await act(async()=>{await observer?.();});await waitFor(()=>expect(view.getByRole('button',{name:'Updated.md'})).toBeTruthy());expect(request.mock.calls.at(-1)?.[1]).toMatchObject({offset:200,limit:200});fireEvent.click(view.getByRole('button',{name:'Previous'}));await view.findByRole('button',{name:'File 0.md'});
});
