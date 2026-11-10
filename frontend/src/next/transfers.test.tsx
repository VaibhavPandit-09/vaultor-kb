// @vitest-environment jsdom
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import TransferControls from './TransferControls';
import NextActivity from './NextActivity';
import {showTransfer,type Task} from './transfers';
const mock=vi.hoisted(()=>({invoke:vi.fn(),open:vi.fn(),save:vi.fn(),event:undefined as undefined|((event:{payload:Task[]})=>void)}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mock.invoke}));
vi.mock('@tauri-apps/api/event',()=>({listen:async(_name:string,fn:typeof mock.event)=>{mock.event=fn;return()=>{mock.event=undefined;};}}));
vi.mock('@tauri-apps/plugin-dialog',()=>({open:mock.open,save:mock.save}));
vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('reviews native selections and duplicate policy before starting a managed import',async()=>{
 mock.open.mockResolvedValue(['C:\\fixture\\note.txt']);mock.invoke.mockImplementation(async(_name:string,args:{request:{op:string}})=>args.request.op==='tasks'?[]:args.request.op==='preview'?{token:'review',files:1,directories:0,bytes:12,duplicates:1,issues:[],items:[{name:'note.txt',bytes:12,duplicate:true}]}:{id:'task'});
 const barrier=vi.fn(async(fn:()=>Promise<void>)=>fn());render(<EscapeManagerProvider><TransferControls collection={null} collections={[]} barrier={barrier} switchWorkspace={vi.fn()} committed={vi.fn()}/></EscapeManagerProvider>);
 act(()=>showTransfer({op:'files'}));await screen.findByText(/1 files/);expect(mock.open).toHaveBeenCalledWith(expect.objectContaining({multiple:true,directory:false}));expect(mock.invoke).not.toHaveBeenCalledWith('transfer',{request:expect.objectContaining({op:'import'})});
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Continue'}));await waitFor(()=>expect(mock.invoke).toHaveBeenCalledWith('transfer',{request:{op:'import',token:'review',separate:true}}));expect(barrier).toHaveBeenCalledTimes(1);
});
it('does not permit restore after a rejected archive preview',async()=>{
 mock.open.mockResolvedValue('C:\\fixture\\corrupt.vaultor');mock.invoke.mockImplementation(async(_name:string,args:{request:{op:string}})=>{if(args.request.op==='tasks')return [];throw Error('Archive manifest integrity mismatch');});
 render(<EscapeManagerProvider><TransferControls collection={null} collections={[]} barrier={async f=>f()} switchWorkspace={vi.fn()} committed={vi.fn()}/></EscapeManagerProvider>);act(()=>showTransfer({op:'restore'}));await screen.findByRole('alert');expect((screen.getByRole('button',{name:'Continue'})as HTMLButtonElement).disabled).toBe(true);expect(mock.save).not.toHaveBeenCalled();
});
it('updates Activity from events without rerendering its parent and exposes cancellation and errors',async()=>{
 mock.invoke.mockResolvedValue([]);let renders=0;function Parent(){renders++;return <NextActivity/>;}render(<EscapeManagerProvider><Parent/></EscapeManagerProvider>);await waitFor(()=>expect(mock.event).toBeTypeOf('function'));
 const task:Task={id:'one',title:'Import 100 files',kind:'file-import',workspace:'fixture',state:'running',phase:'Copying originals',done:5,total:100,bytes:2048,totalBytes:10240,started:1,finished:null,result:null,error:null,cancellable:true};act(()=>mock.event?.({payload:[task]}));fireEvent.click(screen.getByRole('button',{name:'Activity'}));await screen.findByText('Copying originals');expect((screen.getByRole('progressbar')as HTMLProgressElement).value).toBe(5);fireEvent.click(screen.getByRole('button',{name:'Cancel task'}));await waitFor(()=>expect(mock.invoke).toHaveBeenCalledWith('transfer',{request:{op:'cancel',id:'one'}}));act(()=>mock.event?.({payload:[{...task,state:'failed',phase:'failed',finished:3,cancellable:false,error:'Destination already exists'}]}));expect(screen.queryByRole('button',{name:'Cancel task'})).toBeNull();expect(screen.getByText('Destination already exists')).toBeTruthy();expect(renders).toBe(1);
});
