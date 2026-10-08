// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import type { ReactNode } from 'react';
import api from '../lib/api';
import { RESOURCE_ACTION_EVENT,type ActionRequest,supportedResourceActions } from '../lib/resourceActions';
import type { Resource } from '../types';
import ResourceLifecycleDialog from './ResourceLifecycleDialog';
vi.mock('../lib/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
vi.mock('./modals/AppModal',()=>({default:({children,title}:{children:ReactNode;title:string})=><div role="dialog"><h1>{title}</h1>{children}</div>}));
const first={id:'one',title:'One',type:'note',revision:'revision-one'} as Resource;
const second={id:'two',title:'Two',type:'file',revision:'revision-two'} as Resource;
let failSave=false;
const actions:string[]=[];
function receive(event:Event){event.preventDefault();const r=(event as CustomEvent<ActionRequest>).detail;actions.push(r.action);if(failSave&&r.action==='prepare-trash')r.reject(new Error('Save failed; draft retained'));else r.resolve();}
beforeEach(()=>{failSave=false;actions.length=0;window.addEventListener(RESOURCE_ACTION_EVENT,receive);vi.mocked(api.get).mockImplementation(async url=>({data:url.endsWith('/usage')?{sources:2}:url.includes('one')?first:second}));});
afterEach(()=>{cleanup();window.removeEventListener(RESOURCE_ACTION_EVENT,receive);vi.resetAllMocks();});
it('retries an uncertain mutation with the same identity and revision without claiming success',async()=>{
 const close=vi.fn();vi.mocked(api.put).mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({data:[{resourceId:'one',status:'trashed',warnings:[]}]});
 render(<ResourceLifecycleDialog resources={[first]} action="trash" onClose={close}/>);
 await screen.findByText('Used in 2 saved notes');fireEvent.click(screen.getByRole('button',{name:'Move to Trash'}));
 await screen.findByText('Lost response');expect(close).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Retry move to trash'}));
 await waitFor(()=>expect(close).toHaveBeenCalledOnce());expect(vi.mocked(api.put).mock.calls[0][1]).toEqual(vi.mocked(api.put).mock.calls[1][1]);
});
it('requires an explicit retained-draft choice after saving fails',async()=>{
 failSave=true;vi.mocked(api.put).mockResolvedValue({data:[{resourceId:'one',status:'trashed',warnings:[]}]});
 render(<ResourceLifecycleDialog resources={[first]} action="trash" onClose={()=>{}}/>);
 await screen.findByText('Used in 2 saved notes');fireEvent.click(screen.getByRole('button',{name:'Move to Trash'}));
 const keep=await screen.findByRole('button',{name:'Keep recoverable drafts and trash saved versions'});expect(api.put).not.toHaveBeenCalled();fireEvent.click(keep);
 await waitFor(()=>expect(api.put).toHaveBeenCalledOnce());expect(actions).toContain('retain-draft');
});
it('retains only failed items and does not repeat successful bulk items',async()=>{
 const complete=vi.fn();vi.mocked(api.put).mockImplementation(async(_url,body)=>({data:[{resourceId:(body as {resourceId:string}[])[0].resourceId,status:(body as {resourceId:string}[])[0].resourceId==='one'?'trashed':'failed',detail:'Conflict: reload before retry',warnings:[]}]}));
 render(<ResourceLifecycleDialog resources={[first,second]} action="trash" onCompleted={complete} onClose={()=>{}}/>);
 await waitFor(()=>expect(screen.getAllByText('Used in 2 saved notes')).toHaveLength(2));fireEvent.click(screen.getByRole('button',{name:'Move to Trash 2 resources'}));
 await screen.findByText('Conflict: reload before retry');expect(screen.queryByText('One')).toBeNull();expect(screen.getByText('Two')).toBeTruthy();expect(complete).toHaveBeenCalledWith(['one']);
 fireEvent.click(screen.getByRole('button',{name:'Retry move to trash'}));await waitFor(()=>expect(api.put).toHaveBeenCalledTimes(3));expect((vi.mocked(api.put).mock.calls[2][1] as {resourceId:string}[])[0].resourceId).toBe('two');
});
it('blocks unverified usage and exposes only safe capabilities for unknown kinds',async()=>{
 vi.mocked(api.get).mockRejectedValue(new Error('Offline'));render(<ResourceLifecycleDialog resources={[first]} action="purge" onClose={()=>{}}/>);
 await screen.findByRole('alert');expect((screen.getByRole('button',{name:'Delete permanently'}) as HTMLButtonElement).disabled).toBe(true);expect(api.put).not.toHaveBeenCalled();
 expect(supportedResourceActions({...first,type:'future'})).toMatchObject({open:false,download:false,export:false,rename:false,trash:true});
});
