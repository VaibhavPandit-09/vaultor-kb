// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import FileImportModal from './FileImportModal';
import { prepareImport } from '../../lib/fileImports';
import api from '../../lib/api';
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
 expect(screen.getByText(/3 files · 0 folders · 2 notes/)).toBeTruthy();
 expect(screen.getByText('Options and individual files').closest('details')?.open).toBe(false);
 fireEvent.change(screen.getByLabelText('Text conversion'),{target:{value:'originals'}});
 expect((screen.getByLabelText('Import one.md as') as HTMLSelectElement).value).toBe('file');
});
it('dispatches the captured destination and closes review while the controller owns completion',async()=>{
 const session=await prepareImport([file('one.md','# One'),file('two.pdf','bytes')]);session.collection={id:'atlas',name:'Project Atlas'};
 vi.mocked(api.put).mockResolvedValueOnce({data:{id:session.rows[0].id}}).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({data:{id:session.rows[1].id}});
 const close=vi.fn();render(<FileImportModal session={session} onClose={close} onResource={vi.fn()}/>);
 await waitFor(()=>expect((screen.getByRole('button',{name:'Import in background'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Import in background'}));
 await waitFor(()=>expect(close).toHaveBeenCalledOnce());expect(dispatchImport).toHaveBeenCalledWith(session,session.rows,expect.objectContaining({destination:expect.objectContaining({id:'atlas'}),complete:false}),expect.anything());expect(api.put).not.toHaveBeenCalled();
});
it('groups missing asset warnings without mutating on close',async()=>{
 const session=await prepareImport([file('images.md','![Missing](relative.png)')]);const close=vi.fn();render(<FileImportModal session={session} onClose={close} onResource={vi.fn()}/>);
 expect(screen.getByText('References needing review').closest('details')?.open).toBe(false);fireEvent.click(screen.getByRole('button',{name:'Close'}));expect(close).toHaveBeenCalledOnce();expect(api.put).not.toHaveBeenCalled();
});
