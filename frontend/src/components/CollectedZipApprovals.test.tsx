// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import CollectedZipApprovals from './CollectedZipApprovals';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../lib/api',()=>({default:mock}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('requires archive inspection before a separate explicit owner authorization',async()=>{
 const row={id:'immutable-id',deviceId:'phone',input:{filename:'captured.zip',sha256:'a'.repeat(64),name:'Independent',bytes:100,workspaceId:'source'},state:'AWAITING_OWNER'};
 mock.get.mockResolvedValueOnce({data:[row]}).mockResolvedValue({data:[{...row,state:'PREVIEWED',preview:{notes:2,files:1,warnings:['Missing reference retained']}}]});mock.post.mockResolvedValue({data:{}});
 render(<CollectedZipApprovals/>);await screen.findByText('Inspect archive');expect(screen.queryByText('Authorize new workspace')).toBeNull();expect(mock.post).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Inspect archive'));await screen.findByText('Authorize new workspace');expect(mock.post).toHaveBeenCalledWith('/owner/collected-zips/immutable-id/preview',undefined,expect.anything());expect(mock.post).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByText('Authorize new workspace'));await vi.waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/owner/collected-zips/immutable-id/approve',undefined,expect.anything()));
});
