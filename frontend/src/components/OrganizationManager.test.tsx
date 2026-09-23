// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import OrganizationManager from './OrganizationManager';
import api from '../lib/api';
vi.mock('../lib/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn(),delete:vi.fn()}}));
vi.mock('./modals/AppModal',()=>({default:({children,title,onClose}:{children:ReactNode;title:string;onClose:()=>void})=><div role="dialog" aria-label={title}><button onClick={onClose}>Close</button>{children}</div>}));
const atlas={id:'atlas',name:'Atlas',count:2,favorite:false};
beforeEach(()=>{vi.mocked(api.get).mockResolvedValue({data:{items:[atlas],totalItems:1,totalPages:1,page:0}});});
afterEach(()=>{cleanup();vi.resetAllMocks();});
function mount(ids:string[]=[]) {const applied=vi.fn(),close=vi.fn();render(<OrganizationManager tags={[]} resourceIds={ids} onApplied={applied} onClose={close} onCollection={()=>{}} onTag={()=>{}} onTagRenamed={()=>{}}/>);return {applied,close};}
it('requires confirmation for collection deletion and names the resource-preserving result',async()=>{
  mount();await screen.findByText('Atlas');fireEvent.click(screen.getByLabelText('Delete Atlas'));expect(api.delete).not.toHaveBeenCalled();
  expect(screen.getByText(/Its resources will be kept/)).toBeTruthy();fireEvent.click(screen.getByText('Confirm delete'));
  await waitFor(()=>expect(api.delete).toHaveBeenCalledWith('/collections/atlas'));await screen.findByText('Deleted. Resources were kept.');
});
it('retains bulk selection after failure and retries only the explicit membership change',async()=>{
  vi.mocked(api.post).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({});const {applied}=mount(['one','two']);
  await screen.findByText('Atlas');fireEvent.click(screen.getByText('Add'));
  await screen.findByText('Change failed. Your selection is retained; try again.');expect(applied).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Add'));await waitFor(()=>expect(applied).toHaveBeenCalledOnce());
  expect(api.post).toHaveBeenLastCalledWith('/organization/memberships',{resourceIds:['one','two'],kind:'collection',targetId:'atlas',action:'add'});
});
it('keeps a rejected collection name available for correction',async()=>{
  vi.mocked(api.post).mockRejectedValueOnce({response:{data:{detail:'A collection with this name already exists'}}});mount();
  fireEvent.change(screen.getByLabelText('New collection'),{target:{value:'Atlas'}});fireEvent.click(screen.getByText('Create'));
  await screen.findByText('A collection with this name already exists');expect((screen.getByLabelText('New collection') as HTMLInputElement).value).toBe('Atlas');
});
