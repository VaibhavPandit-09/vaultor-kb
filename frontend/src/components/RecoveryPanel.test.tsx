// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import RecoveryPanel from './RecoveryPanel';
import type { RecoveryRecord } from '../lib/sessionStore';
vi.mock('./modals/AppModal',()=>({default:({children}:{children:React.ReactNode})=><div role="dialog">{children}</div>}));
afterEach(cleanup);
const record={key:'draft',noteId:'n',value:{title:'Retained draft',content:{}}} as RecoveryRecord;
it('prevents duplicate recovery requests and retains the draft with local retry feedback',async()=>{
 let fail!:(reason:Error)=>void;const resolve=vi.fn(()=>new Promise<void>((_yes,no)=>{fail=no;}));
 render(<RecoveryPanel records={[record]} onClose={()=>{}} onResolve={resolve} canRetry={()=>true} onRetry={async()=>{throw Error('offline');}}/>);
 const copy=screen.getByRole('button',{name:'Open recovered copy'});fireEvent.click(copy);fireEvent.click(copy);expect(resolve).toHaveBeenCalledOnce();
 fail(new Error('offline'));await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('offline'));expect(screen.getByText('Retained draft')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Retry save'}));await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('draft is retained'));
});
