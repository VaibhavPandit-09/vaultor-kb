// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import WorkspaceTransfers from './WorkspaceTransfers';
import {configureConnection,getConnection,getPlatform} from '../lib/platform';
import {registerConnectionBarrier,SwitchBlockedError,type DesktopBridge} from '../lib/desktop';
const mocks=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),post:vi.fn(),delete:vi.fn(),pick:vi.fn()}));
vi.mock('../lib/api',()=>({default:mocks}));vi.mock('../lib/filePicker',()=>({pickFiles:mocks.pick}));
const id='11111111-1111-4111-8111-111111111111',base={version:1,id,name:'New copy',state:'PREVIEW',sha256:'a'.repeat(64),detail:'Validated',copiedAt:'today',preview:{notes:2,files:1,tags:0,warnings:[]}};
const browser=getPlatform();
beforeEach(()=>{sessionStorage.clear();Object.values(mocks).forEach(v=>v.mockReset());configureConnection({profileId:'source',kind:'browser',workspaceId:id},browser);mocks.get.mockResolvedValue({data:[]});mocks.pick.mockResolvedValue([new File(['ZIP'],'workspace.zip')]);});
afterEach(()=>{cleanup();delete window.vaultorDesktop;vi.restoreAllMocks();});
const props=()=>({owner:true,supported:true,workspaceName:'New',onBusy:vi.fn(),onReady:vi.fn(async()=>{}),onOpen:vi.fn()});
it('uncertain preview keeps UUID/name/bytes and source epoch; commit retry never creates a second workspace',async()=>{
 mocks.put.mockRejectedValueOnce(Error('Response lost')).mockResolvedValue({data:base});const p=props();render(<WorkspaceTransfers {...p}/>);fireEvent.change(screen.getByLabelText('Imported workspace name'),{target:{value:'New copy'}});fireEvent.click(screen.getByText('Import ZIP as new workspace'));await screen.findByText('Response lost');fireEvent.click(screen.getByText('Retry same transfer'));await screen.findByText('Create separate workspace');expect(mocks.put).toHaveBeenCalledTimes(2);expect(mocks.put.mock.calls[0][0]).toBe(mocks.put.mock.calls[1][0]);expect(mocks.put.mock.calls[1][1].get('file')).toBe(mocks.put.mock.calls[0][1].get('file'));expect(mocks.put.mock.calls[1][2].connectionEpoch).toBe(getConnection().epoch);
 mocks.post.mockResolvedValue({data:{...base,state:'COMMITTING'}});mocks.get.mockResolvedValue({data:{...base,state:'SUCCEEDED'}});fireEvent.click(screen.getByText('Create separate workspace'));await screen.findByText('Open workspace',{}, {timeout:2500});expect(mocks.post).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByText('Open workspace'));expect(p.onOpen).toHaveBeenCalledWith(mocks.put.mock.calls[0][0].split('/').at(-1),'New copy',false);
});
it('lost commit response resumes status from the saved identity after reopening',async()=>{
 mocks.put.mockResolvedValue({data:base});mocks.post.mockRejectedValue(Error('Commit response lost'));const p=props();const view=render(<WorkspaceTransfers {...p}/>);fireEvent.click(screen.getByText('Import ZIP as new workspace'));await screen.findByText('Create separate workspace');fireEvent.click(screen.getByText('Create separate workspace'));await screen.findByText('Commit response lost');view.unmount();mocks.get.mockResolvedValue({data:{...base,state:'SUCCEEDED'}});render(<WorkspaceTransfers {...p}/>);await screen.findByText('Open workspace');expect(mocks.post).toHaveBeenCalledTimes(1);await waitFor(()=>expect(p.onReady).toHaveBeenCalledTimes(1));
});
it('copy requires source draft protection before invoking native snapshot preparation',async()=>{
 const copyPreview=vi.fn();window.vaultorDesktop={copyPreview,copiesList:vi.fn(async()=>({ok:true,value:[]})),bootstrap:vi.fn(async()=>({ok:true,value:{token:'source-token'}}))} as unknown as DesktopBridge;
 const remove=registerConnectionBarrier(async()=>{throw new SwitchBlockedError('Recovery unavailable');});try{render(<WorkspaceTransfers {...props()} owner={false}/>);fireEvent.click(screen.getByText('Make local copy'));await screen.findByText('Recovery unavailable');expect(copyPreview).not.toHaveBeenCalled();expect(screen.getByLabelText('Imported workspace name')).toBeTruthy();}finally{remove();}
});
