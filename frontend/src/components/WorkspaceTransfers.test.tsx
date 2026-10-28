// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import WorkspaceTransfers from './WorkspaceTransfers';
import {configureConnection,getPlatform} from '../lib/platform';
import {registerConnectionBarrier,SwitchBlockedError,type DesktopBridge} from '../lib/desktop';
const mocks=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),post:vi.fn(),delete:vi.fn(),pick:vi.fn(),dispatch:vi.fn(),preview:vi.fn()}));
vi.mock('../lib/api',()=>({default:mocks}));vi.mock('../lib/filePicker',()=>({pickFiles:mocks.pick}));
vi.mock('../lib/transferActivity',()=>({dispatchTransfer:mocks.dispatch,dispatchWorkspacePreview:mocks.preview}));
const id='11111111-1111-4111-8111-111111111111',base={version:1,id,name:'New copy',state:'PREVIEW',sha256:'a'.repeat(64),detail:'Validated',copiedAt:'today',preview:{notes:2,files:1,tags:0,warnings:[]}};
const browser=getPlatform();
beforeEach(()=>{sessionStorage.clear();Object.values(mocks).forEach(v=>v.mockReset());configureConnection({profileId:'source',kind:'browser',workspaceId:id},browser);mocks.get.mockResolvedValue({data:[]});mocks.pick.mockResolvedValue([new File(['ZIP'],'workspace.zip')]);});
afterEach(()=>{cleanup();delete window.vaultorDesktop;vi.restoreAllMocks();});
const props=()=>({owner:true,supported:true,workspaceName:'New',onBusy:vi.fn(),onReady:vi.fn(async()=>{}),onOpen:vi.fn(),onBackground:vi.fn()});
it('uncertain preview keeps UUID/name/bytes and source epoch; commit retry never creates a second workspace',async()=>{
 mocks.preview.mockRejectedValueOnce(Error('Response lost')).mockResolvedValue(undefined);const p=props(),view=render(<WorkspaceTransfers {...p}/>);fireEvent.change(screen.getByLabelText('Imported workspace name'),{target:{value:'New copy'}});fireEvent.click(screen.getByText('Import ZIP as new workspace'));await screen.findByText('Response lost');fireEvent.click(screen.getByText('Retry'));await waitFor(()=>expect(p.onBackground).toHaveBeenCalledOnce());expect(mocks.preview).toHaveBeenCalledTimes(2);expect(mocks.preview.mock.calls[0][0]).toEqual(mocks.preview.mock.calls[1][0]);expect(mocks.preview.mock.calls[0][1]).toBe(mocks.preview.mock.calls[1][1]);const intent=mocks.preview.mock.calls[0][0];view.unmount();mocks.get.mockResolvedValue({data:base});render(<WorkspaceTransfers {...p}/>);await screen.findByText('Create workspace');mocks.dispatch.mockResolvedValue(undefined);fireEvent.click(screen.getByText('Create workspace'));await waitFor(()=>expect(mocks.dispatch).toHaveBeenCalledWith('workspace-new',intent.id,'New copy'));expect(mocks.post).not.toHaveBeenCalled();
});
it('lost commit response resumes status from the saved identity after reopening',async()=>{
 mocks.preview.mockResolvedValue(undefined);const p=props();let view=render(<WorkspaceTransfers {...p}/>);fireEvent.click(screen.getByText('Import ZIP as new workspace'));await waitFor(()=>expect(p.onBackground).toHaveBeenCalledOnce());view.unmount();mocks.get.mockResolvedValue({data:base});view=render(<WorkspaceTransfers {...p}/>);await screen.findByText('Create workspace');mocks.dispatch.mockRejectedValueOnce(Error('Dispatch storage unavailable'));fireEvent.click(screen.getByText('Create workspace'));await screen.findByText('Dispatch storage unavailable');view.unmount();mocks.get.mockResolvedValue({data:{...base,state:'SUCCEEDED'}});render(<WorkspaceTransfers {...p}/>);await screen.findByText('Open workspace');expect(mocks.post).not.toHaveBeenCalled();await waitFor(()=>expect(p.onReady).toHaveBeenCalledTimes(1));
});
it('copy requires source draft protection before invoking native snapshot preparation',async()=>{
 const copyPreview=vi.fn();window.vaultorDesktop={copyPreview,copiesList:vi.fn(async()=>({ok:true,value:[]})),bootstrap:vi.fn(async()=>({ok:true,value:{token:'source-token'}}))} as unknown as DesktopBridge;
 const remove=registerConnectionBarrier(async()=>{throw new SwitchBlockedError('Recovery unavailable');});try{render(<WorkspaceTransfers {...props()} owner={false}/>);fireEvent.click(screen.getByText('Copy to this computer'));await screen.findByText('Recovery unavailable');expect(copyPreview).not.toHaveBeenCalled();expect(screen.getByLabelText('Imported workspace name')).toBeTruthy();}finally{remove();}
});
