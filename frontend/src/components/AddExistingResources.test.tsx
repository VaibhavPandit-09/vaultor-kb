// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
import AddExistingResources from './AddExistingResources';
import {browseResources} from '../lib/resourceBrowse';
import api from '../lib/api';
vi.mock('../lib/resourceBrowse',()=>({browseResources:vi.fn(),resourcesChanged:vi.fn()}));
vi.mock('../lib/api',()=>({default:{post:vi.fn(),put:vi.fn()}}));
vi.mock('./modals/AppModal',()=>({default:({children}:{children:ReactNode})=><div role="dialog">{children}</div>}));
const note={id:'note',type:'note' as const,title:'Existing',tags:[],createdAt:'',updatedAt:''};
const page={items:[note],page:0,size:30,totalPages:1,totalItems:1};
beforeEach(()=>{vi.mocked(browseResources).mockResolvedValue(page);vi.mocked(api.post).mockResolvedValue({});});
afterEach(()=>{cleanup();vi.resetAllMocks();});
function mount(){const close=vi.fn(),open=vi.fn(),upload=vi.fn();render(<AddExistingResources collection={{id:'topic',name:'Topic',count:0}} onClose={close} onOpen={open} onImport={upload}/>);return {close,open,upload};}
it('adds with Enter immediately, keeps picker open, and retries only the failed item',async()=>{
 vi.mocked(api.post).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});const {close}=mount();await screen.findByText('Existing');fireEvent.keyDown(screen.getByRole('combobox'),{key:'Enter'});await screen.findByRole('alert');expect(close).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Retry'));await screen.findByText('Added');fireEvent.keyDown(screen.getByRole('combobox'),{key:'Enter'});expect(api.post).toHaveBeenCalledTimes(2);expect(api.post).toHaveBeenLastCalledWith('/organization/memberships',{resourceIds:['note'],kind:'collection',targetId:'topic',action:'add'},{backgroundDiagnostic:true});
});
it('creates in the captured collection and reuses its UUID after failure',async()=>{
 vi.mocked(browseResources).mockResolvedValue({...page,items:[],totalItems:0});vi.mocked(api.put).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({data:{...note,id:'created'}});const {open,close}=mount();fireEvent.change(screen.getByRole('combobox'),{target:{value:'New topic'}});fireEvent.click(await screen.findByText('Create note “New topic”'));await screen.findByRole('alert');fireEvent.click(screen.getByText('Retry create/open'));await waitFor(()=>expect(open).toHaveBeenCalledWith('created'));const calls=vi.mocked(api.put).mock.calls;expect(calls[0][0]).toBe(calls[1][0]);expect((calls[0][1] as FormData).get('collectionId')).toBe('topic');expect((calls[0][1] as FormData).get('title')).toBe('New topic');expect(close).toHaveBeenCalledWith(false);
});
it('checks exact note matches beyond the visible page and retains explicit duplicate creation',async()=>{
 vi.mocked(browseResources).mockImplementation(async q=>q?.type==='note'?(q.page===0?{...page,items:[{...note,title:'A matching suffix'}],totalPages:2}:{...page,items:[{...note,title:'Exact'}],page:1,totalPages:2}):page);
 mount();fireEvent.change(screen.getByRole('combobox'),{target:{value:'Exact'}});await waitFor(()=>expect(browseResources).toHaveBeenCalledWith(expect.objectContaining({type:'note',page:1}),expect.any(AbortSignal)));expect(screen.queryByText('Create note “Exact”')).toBeNull();expect(screen.getByText('Create new note with this title')).toBeTruthy();
});
it('hands import off after closing and does not add on composition confirmation',async()=>{
 const {close,upload}=mount();await screen.findByText('Existing');fireEvent.keyDown(screen.getByRole('combobox'),{key:'Enter',isComposing:true});expect(api.post).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Import files'));expect(close).toHaveBeenCalledWith(false);expect(upload).toHaveBeenCalledOnce();expect(close.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0]);
});
