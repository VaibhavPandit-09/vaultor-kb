// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import FileImportModal from './FileImportModal';
import { prepareImport } from '../../lib/fileImports';
import api from '../../lib/api';
import { folderJournal } from '../../lib/folderImports';
import { dispatchImport } from '../../lib/importActivity';
vi.mock('../../lib/importActivity',()=>({dispatchImport:vi.fn(async()=>{})}));
vi.mock('./AppModal',()=>({default:({children,footer}:{children:ReactNode;footer?:ReactNode})=><div>{children}{footer}</div>}));
vi.mock('../CollectionDestination',()=>({default:()=>null}));
vi.mock('../../lib/api',()=>({default:{put:vi.fn(),get:vi.fn(async()=>({data:{id:'workspace',generation:'generation'}}))}}));
vi.mock('../../lib/folderImports',async importOriginal=>{const actual=await importOriginal<typeof import('../../lib/folderImports')>();return {...actual,folderJournal:vi.fn(async()=>({key:'test',identity:{id:'workspace',generation:'generation'},signature:'test',store:{put:vi.fn()}}))};});
afterEach(()=>{cleanup();vi.clearAllMocks();});
function file(name:string,text:string){const result=new File([text],name);Object.defineProperty(result,'arrayBuffer',{value:async()=>new TextEncoder().encode(text).buffer});return result;}
it('shows a summary and batch defaults, retaining per-file overrides in disclosure',async()=>{
 const session=await prepareImport([file('one.md','# One'),file('two.md','# Two'),file('original.pdf','bytes')]);render(<FileImportModal session={session} onClose={vi.fn()} onResource={vi.fn()}/>);
 expect(screen.getByText(/3 files · 2 as notes/)).toBeTruthy();
 expect(screen.getByText('File options').closest('details')?.open).toBe(false);
 fireEvent.change(screen.getByLabelText('Text conversion'),{target:{value:'originals'}});
 expect((screen.getByLabelText('Import one.md as') as HTMLSelectElement).value).toBe('file');
});
it('dispatches the captured destination and closes review while the controller owns completion',async()=>{
 const session=await prepareImport([file('one.md','# One'),file('two.pdf','bytes')]);session.collection={id:'atlas',name:'Project Atlas'};
 vi.mocked(api.put).mockResolvedValueOnce({data:{id:session.rows[0].id}}).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({data:{id:session.rows[1].id}});
 const close=vi.fn();render(<FileImportModal session={session} onClose={close} onResource={vi.fn()}/>);
 await waitFor(()=>expect((screen.getByRole('button',{name:'Import files'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Import files'}));
 await waitFor(()=>expect(close).toHaveBeenCalledOnce());expect(dispatchImport).toHaveBeenCalledWith(session,session.rows,expect.objectContaining({destination:expect.objectContaining({id:'atlas'}),complete:false}),expect.anything());expect(api.put).not.toHaveBeenCalled();
});
it('groups missing asset warnings without mutating on close',async()=>{
 const session=await prepareImport([file('images.md','![Missing](relative.png)')]);const close=vi.fn();render(<FileImportModal session={session} onClose={close} onResource={vi.fn()}/>);
 expect(screen.getByText('Link issues').closest('details')?.open).toBe(false);fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(close).toHaveBeenCalledOnce();expect(api.put).not.toHaveBeenCalled();
});

it('offers an enabled explicit copy action for a live path match without a one-option radio gate',async()=>{
 const session=await prepareImport([file('one.md','# One')]);vi.mocked(folderJournal).mockResolvedValueOnce({key:'test',identity:{id:'workspace',generation:'generation'},epoch:0,signature:'test',previous:undefined,completed:undefined,exact:false,related:true,history:true,live:{active:1,trash:0,missing:0,collections:0,missingCollections:1,unknown:false},lookupProblem:'',resumeBlocked:false,store:{} as Awaited<ReturnType<typeof folderJournal>>['store']});render(<FileImportModal session={session} onClose={vi.fn()} onResource={vi.fn()}/>);await waitFor(()=>expect((screen.getByRole('button',{name:'Import another copy'}) as HTMLButtonElement).disabled).toBe(false));expect(screen.queryByRole('radio')).toBeNull();expect(screen.queryByText(/new resource IDs/)).toBeNull();expect(screen.getByText(/item remains in Library/)).toBeTruthy();
});
