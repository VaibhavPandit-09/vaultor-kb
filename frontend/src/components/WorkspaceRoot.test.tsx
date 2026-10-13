// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {useContext} from 'react';
import WorkspaceRoot from './WorkspaceRoot';
import {WorkspaceSelectionContext} from '../lib/workspaceSelection';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import {configureConnection,getConnection,getPlatform} from '../lib/platform';
import {registerConnectionBarrier,SwitchBlockedError} from '../lib/desktop';
const mocks=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),patch:vi.fn()}));
vi.mock('../lib/api',()=>({default:mocks}));
vi.mock('../lib/connection',()=>({ensureCompatible:async()=>({multiWorkspace:true})}));
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',generation='33333333-3333-4333-8333-333333333333';
const services={...getPlatform(),request:vi.fn(async()=>({data:{id:a,generation},status:200,statusText:'OK',headers:{},config:{} as never}))};
function Child(){const context=useContext(WorkspaceSelectionContext);return <><p>Mounted editor</p><button onClick={context?.open}>Choose workspace</button></>;}
async function opened(){render(<EscapeManagerProvider><WorkspaceRoot><Child/></WorkspaceRoot></EscapeManagerProvider>);await screen.findByText('Mounted editor');fireEvent.click(screen.getByText('Choose workspace'));await screen.findByRole('dialog');}
beforeEach(()=>{sessionStorage.clear();mocks.get.mockReset();mocks.put.mockReset();mocks.patch.mockReset();configureConnection({kind:'browser',profileId:'browser',workspaceId:a,generation},services);mocks.get.mockImplementation(async(path:string)=>({data:path==='/access/session'?{role:'OWNER'}:path.endsWith('/grants')?[{deviceId:'device',name:'Phone',allowed:false}]:[{id:a,name:'First'},{id:b,name:'Second'}]}));vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({id:b,generation}),{status:200})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('failed save retains mounted source; protected-draft retry commits only the chosen workspace',async()=>{
 const barrier=registerConnectionBarrier(async keep=>{if(!keep)throw new SwitchBlockedError('Save failed',true);});
 try{await opened();fireEvent.click(screen.getByText('Second'));await screen.findByText('Save failed');expect(getConnection().workspaceId).toBe(a);expect(screen.getByText('Mounted editor')).toBeTruthy();fireEvent.click(screen.getByText('Keep drafts and switch'));await waitFor(()=>expect(getConnection().workspaceId).toBe(b));expect(sessionStorage.getItem('vaultor-selected-workspace')).toBe(b);}finally{barrier();}
});
it('create form retains input and UUID after uncertain failure; repeated submit cannot duplicate',async()=>{
 let reject!:(e:Error)=>void;mocks.put.mockImplementationOnce(()=>new Promise((_r,j)=>{reject=j;})).mockResolvedValue({data:{}});await opened();fireEvent.change(screen.getByLabelText('New workspace name'),{target:{value:'Research'}});const form=screen.getByLabelText('New workspace name').closest('form')!;fireEvent.submit(form);fireEvent.submit(form);await waitFor(()=>expect(mocks.put).toHaveBeenCalledTimes(1));reject(Error('Connection lost'));await screen.findByText('Connection lost');expect((screen.getByLabelText('New workspace name') as HTMLInputElement).value).toBe('Research');fireEvent.click(screen.getByText('Retry'));await waitFor(()=>expect(mocks.put).toHaveBeenCalledTimes(2));expect(mocks.put.mock.calls[0]).toEqual(mocks.put.mock.calls[1]);
});
it('owner grants are explicit, management is serialized and Escape first returns to the selector',async()=>{
 await opened();fireEvent.click(screen.getByLabelText('Manage Second'));await screen.findByLabelText('Allow Phone');fireEvent.click(screen.getByLabelText('Allow Phone'));await waitFor(()=>expect(mocks.put).toHaveBeenCalledWith('/owner/workspaces/'+b+'/grants',{deviceId:'device',allowed:true}));await waitFor(()=>expect((screen.getByLabelText('Allow Phone') as HTMLInputElement).checked).toBe(true));fireEvent.keyDown(window,{key:'Escape'});await screen.findByLabelText('Find workspace');expect(screen.getByRole('dialog')).toBeTruthy();
});
it('revoked destination failure never switches or broadens into the fixed default',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:404})));await opened();fireEvent.click(screen.getByText('Second'));await screen.findByRole('alert');expect(getConnection().workspaceId).toBe(a);expect(screen.getByText('Mounted editor')).toBeTruthy();
});
