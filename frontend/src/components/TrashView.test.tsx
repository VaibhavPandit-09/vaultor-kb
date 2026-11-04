// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import { EscapeManagerProvider } from '../lib/escape/EscapeManagerProvider';
import type { Resource } from '../types';
const items=[{id:'one',title:'One',type:'note',tags:[],createdAt:'',updatedAt:'',trashedAt:'2026-11-05'},{id:'two',title:'Two',type:'file',tags:[],createdAt:'',updatedAt:'',trashedAt:'2026-11-05',cleanupPending:true}] as Resource[];
vi.mock('../lib/api',()=>({default:{get:vi.fn(async()=>({data:{items,totalItems:2,totalPages:1}}))}}));
vi.mock('./ResourceLifecycleDialog',()=>({default:({resources,action}:{resources:Resource[];action:string})=><div role="dialog" data-action={action}>{resources.map(resource=><span key={resource.id}>{resource.id}</span>)}</div>}));
import TrashView from './TrashView';
vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
afterEach(cleanup);
it('mixed selected context restore excludes cleanup-pending resources and preserves their selection',async()=>{
 render(<EscapeManagerProvider><TrashView hasNotes={false} onReturn={()=>{}}/></EscapeManagerProvider>);await screen.findByText('One');fireEvent.click(screen.getByLabelText('Select One'));fireEvent.click(screen.getByLabelText('Select Two'));
 fireEvent.contextMenu(screen.getByText('One'));fireEvent.click(await screen.findByRole('menuitem',{name:'Restore available selection'}));expect(screen.getByRole('dialog').textContent).toBe('one');expect((screen.getByLabelText('Select Two') as HTMLInputElement).checked).toBe(true);
});
it('selected purge context opens the existing review for the whole selected group',async()=>{
 render(<EscapeManagerProvider><TrashView hasNotes={false} onReturn={()=>{}}/></EscapeManagerProvider>);await screen.findByText('One');fireEvent.click(screen.getByLabelText('Select One'));fireEvent.click(screen.getByLabelText('Select Two'));
 fireEvent.contextMenu(screen.getByText('One'));fireEvent.click(await screen.findByRole('menuitem',{name:'Delete selection permanently…'}));expect(screen.getByRole('dialog').dataset.action).toBe('purge');expect(screen.getByRole('dialog').textContent).toBe('onetwo');
});
