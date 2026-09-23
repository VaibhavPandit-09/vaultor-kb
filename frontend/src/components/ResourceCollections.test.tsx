// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import api from '../lib/api';
import { CollectionPicker } from './ResourceCollections';
import PinButton from './PinButton';
vi.mock('../lib/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
vi.mock('./modals/AppModal',()=>({default:({children,title}:{children:ReactNode;title:string})=><div role="dialog"><h1>{title}</h1>{children}</div>}));
beforeEach(()=>{
 vi.mocked(api.get).mockResolvedValue({data:{items:[{id:'a',name:'Atlas',count:0},{id:'b',name:'Books',count:0}],totalPages:1,totalItems:2}});
 vi.mocked(api.post).mockImplementation(async path=>({data:path==='/organization/selection'?[]:undefined}));
});
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('rolls back only the failed membership and retains the other toggle for retry',async()=>{
 vi.mocked(api.post).mockImplementation(async(path,body)=>{if(path==='/organization/selection')return {data:[]};if((body as {targetId:string}).targetId==='a')throw new Error('offline');return {data:undefined};});
 render(<CollectionPicker resourceIds={['note']} onClose={()=>{}}/>);
 const atlas=await screen.findByRole('checkbox',{name:'Atlas'}),books=screen.getByRole('checkbox',{name:'Books'});
 fireEvent.click(atlas);fireEvent.click(books);
 await screen.findByText('Could not save this change. Please retry.');expect((atlas as HTMLInputElement).checked).toBe(false);expect((books as HTMLInputElement).checked).toBe(true);
 vi.mocked(api.post).mockResolvedValue({data:[]});fireEvent.click(screen.getByText('Retry'));
 await waitFor(()=>expect((atlas as HTMLInputElement).checked).toBe(true));
});
it('reuses the creation ID after a lost response and includes initial members',async()=>{
 vi.mocked(api.put).mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce({data:{id:'created',name:'New topic',count:1}});
 render(<CollectionPicker resourceIds={['note']} onClose={()=>{}}/>);
 fireEvent.change(screen.getByLabelText('Search or create collection'),{target:{value:'New topic'}});
 const create=await screen.findByText('Create “New topic” and add');await waitFor(()=>expect((create as HTMLButtonElement).disabled).toBe(false));fireEvent.click(create);
 await screen.findByText('Could not save this change. Please retry.');fireEvent.click(screen.getByText('Retry'));
 await waitFor(()=>expect(api.put).toHaveBeenCalledTimes(2));const calls=vi.mocked(api.put).mock.calls;expect(calls[0][0]).toBe(calls[1][0]);expect(calls[0][1]).toEqual({name:'New topic',resourceIds:['note']});
});
it('synchronizes resource pin controls without duplicate mutations',async()=>{
 vi.mocked(api.put).mockResolvedValue({});render(<><PinButton id="note" name="One"/><PinButton id="note" name="Two"/></>);
 fireEvent.click(screen.getByLabelText('Pin One'));await screen.findByLabelText('Unpin Two');expect(api.put).toHaveBeenCalledTimes(1);
});
