// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EscapeManagerProvider } from '../lib/escape/EscapeManagerProvider';
import { RESOURCE_ACTION_EVENT, type ActionRequest } from '../lib/resourceActions';
import ResourceActions from './ResourceActions';
import type { Resource } from '../types';
vi.mock('./ResourceCollections',()=>({CollectionPicker:()=>null}));
vi.mock('./OrganizationManager',()=>({default:()=>null}));
vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
afterEach(cleanup);
const resource={id:'n',title:'Original',type:'note',tags:[],createdAt:'',updatedAt:''} as Resource;
it('rename handoff retains failed input, retries the same command, and restores row focus',async()=>{
 let fail=true;const calls:ActionRequest[]=[];
 const receive=(event:Event)=>{event.preventDefault();const request=(event as CustomEvent<ActionRequest>).detail;calls.push(request);if(fail)request.reject(new Error('Revision changed'));else request.resolve();};
 window.addEventListener(RESOURCE_ACTION_EVENT,receive);
 try{
 render(<EscapeManagerProvider><div className="library-row"><button>Original row</button><ResourceActions resource={resource}/></div></EscapeManagerProvider>);
 const row=screen.getByText('Original row');fireEvent.contextMenu(row);await screen.findByRole('menuitem',{name:'Rename…'});
 fireEvent.click(screen.getByRole('menuitem',{name:'Rename…'}));const input=await screen.findByRole('textbox',{name:'Resource name'});
 fireEvent.change(input,{target:{value:'Changed'}});fireEvent.click(screen.getByRole('button',{name:'Save name'}));
 await screen.findByText('Revision changed');expect((input as HTMLInputElement).value).toBe('Changed');expect(calls[0].action).toBe('rename');expect(calls[0].value).toBe('Changed');
 fail=false;fireEvent.click(screen.getByRole('button',{name:'Save name'}));await waitFor(()=>expect(screen.queryByRole('textbox')).toBeNull());await waitFor(()=>expect(document.activeElement).toBe(row));expect(calls).toHaveLength(2);
 }finally{window.removeEventListener(RESOURCE_ACTION_EVENT,receive);}
});
it('linked resources expose reference organization without managed rename/export commands',async()=>{
 render(<EscapeManagerProvider><div className="library-row"><button>Linked row</button><ResourceActions resource={{...resource,type:'linked'}}/></div></EscapeManagerProvider>);
 fireEvent.contextMenu(screen.getByText('Linked row'));await screen.findByRole('menuitem',{name:'Open in another pane'});
 expect(screen.queryByRole('menuitem',{name:'Rename…'})).toBeNull();expect(screen.queryByRole('menuitem',{name:'Export note…'})).toBeNull();expect(screen.getByRole('menuitem',{name:'Move to Trash…'})).toBeTruthy();
});
