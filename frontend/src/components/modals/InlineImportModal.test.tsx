// @vitest-environment jsdom
import type {ReactNode} from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import InlineImportModal from './InlineImportModal';
import {importResource,type ImportSession} from '../../lib/fileImports';
import {getConnection} from '../../lib/platform';
vi.mock('./AppModal',()=>({default:({children,footer}:{children:ReactNode;footer:ReactNode})=><div>{children}{footer}</div>}));
vi.mock('../../lib/fileImports',()=>({importResource:vi.fn()}));
const insert=vi.fn(),assertValid=vi.fn(),close=vi.fn(),onResource=vi.fn();
function session(){return {sourceEpoch:getConnection().epoch,sourceGeneration:'generation',mode:'link',target:{insert,assertValid},rows:[{id:'retry-id',file:new File(['data'],'source.pdf'),kind:'binary',warnings:[],status:'ready',asNote:false}]} as unknown as ImportSession;}
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('cancellation never uploads or inserts a link',()=>{render(<InlineImportModal session={session()} onClose={close} onResource={onResource}/>);fireEvent.click(screen.getByText('Cancel'));expect(close).toHaveBeenCalledOnce();expect(importResource).not.toHaveBeenCalled();expect(insert).not.toHaveBeenCalled();});
it('failed upload creates no link and retry uses the same resource identity and captured source',async()=>{
 vi.mocked(importResource).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({id:'retry-id',title:'source.pdf',type:'file'} as Awaited<ReturnType<typeof importResource>>);
 render(<InlineImportModal session={session()} onClose={close} onResource={onResource}/>);fireEvent.click(screen.getByText('Import'));await screen.findByText('offline');expect(insert).not.toHaveBeenCalled();expect(onResource).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Retry failed files'));await waitFor(()=>expect(insert).toHaveBeenCalledOnce());expect(importResource).toHaveBeenCalledTimes(2);for(const call of vi.mocked(importResource).mock.calls){expect(call[0]).toBe('retry-id');expect(call[5]).toMatchObject({generation:'generation',epoch:getConnection().epoch});}expect(insert.mock.calls[0][0][0]).toMatchObject({type:'resourceLink',attrs:{resourceId:'retry-id',type:'file'}});
});
it('stale source and invalid/closed insertion targets fail before uploading',async()=>{
 const stale=session();stale.sourceEpoch=getConnection().epoch-1;const result=render(<InlineImportModal session={stale} onClose={close} onResource={onResource}/>);fireEvent.click(screen.getByText('Import'));await screen.findByText('Workspace changed. Reselect the file.');expect(importResource).not.toHaveBeenCalled();result.unmount();assertValid.mockImplementation(()=>{throw Error('Original note closed');});render(<InlineImportModal session={session()} onClose={close} onResource={onResource}/>);fireEvent.click(screen.getByText('Import'));await screen.findByText('Original note closed');expect(importResource).not.toHaveBeenCalled();expect(insert).not.toHaveBeenCalled();
});
