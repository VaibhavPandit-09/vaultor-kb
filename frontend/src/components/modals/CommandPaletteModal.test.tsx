// @vitest-environment jsdom
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import CommandPaletteModal from './CommandPaletteModal';
import {EscapeManagerProvider} from '../../lib/escape/EscapeManagerProvider';
import type {CommandContext} from '../../lib/commandPalette';
import type {Resource} from '../../types';
import api from '../../lib/api';
vi.mock('../../lib/api',()=>({default:{get:vi.fn(),put:vi.fn(),post:vi.fn()}}));
vi.mock('../../lib/settings',()=>({useSettings:()=>({settings:{local:{uiTransparency:0,animationMode:'snappy'}}})}));
const note:Resource={id:'one',type:'note',title:'Meeting',tags:[],createdAt:'',updatedAt:''};
let context:CommandContext;
beforeEach(()=>{
 context={resources:[note],activeNote:null,targetResource:null,previewResource:null,openNotes:[note],sidebarCollapsed:false,openResource:vi.fn(),createNote:vi.fn(),uploadFile:vi.fn(),toggleSidebar:vi.fn(),openShortcuts:vi.fn(),openSettings:vi.fn(),closeActiveNote:vi.fn(),closePreview:vi.fn(),openDeleteFlow:vi.fn(),renameResource:vi.fn()};
 vi.mocked(api.get).mockImplementation(async url=>({data:url==='/resources/one/summary'?note:url==='/resources/query'?{items:[{resource:note,snippet:{text:'Visible nebula text',highlights:[{start:8,end:14}]}}],page:0,totalPages:1,totalItems:1}:url==='/resources'?{items:[note],page:0,totalPages:1,totalItems:1}:url==='/organization/pins'?{items:[{id:'one',kind:'note',name:'Meeting'}],totalPages:1,totalItems:1}:{items:[],totalItems:0,totalPages:0}}));
});
afterEach(()=>{cleanup();vi.resetAllMocks();});
function mount(){const close=vi.fn(),preview=context.openResource;const view=render(<EscapeManagerProvider><CommandPaletteModal open onClose={close} context={context}/></EscapeManagerProvider>);return {...view,close,preview};}
it('deduplicates Open/Pinned/Recent, leaves Tab alone and never previews highlights',async()=>{
 const {preview}=mount();await screen.findByText('Meeting');await waitFor(()=>expect(screen.getAllByRole('option')).toHaveLength(1));
 const input=screen.getByRole('combobox');expect(fireEvent.keyDown(input,{key:'Tab'})).toBe(true);expect((input as HTMLInputElement).value).toBe('');fireEvent.keyDown(input,{key:'ArrowDown'});expect(preview).not.toHaveBeenCalled();
});
it('retains failed input and retries once, then closes only on success',async()=>{
 vi.mocked(context.renameResource).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce();const {close}=mount();
 await screen.findByText('Meeting');fireEvent.click(screen.getByText('Actions for Meeting'));await screen.findByText('Rename');fireEvent.click(screen.getByText('Rename'));await screen.findByText('Rename note');
 const input=screen.getByRole('combobox');fireEvent.change(input,{target:{value:'New title'}});fireEvent.keyDown(input,{key:'Enter'});
 await screen.findByRole('alert');expect(close).not.toHaveBeenCalled();expect((input as HTMLInputElement).value).toBe('New title');fireEvent.keyDown(input,{key:'Enter'});
 await waitFor(()=>expect(close).toHaveBeenCalledTimes(1));expect(context.renameResource).toHaveBeenCalledTimes(2);expect(context.renameResource).toHaveBeenLastCalledWith('one','New title');
});
it('shows saved snippets as text and Escape backs out before closing',async()=>{
 const {close}=mount();fireEvent.click(screen.getByRole('button',{name:'Search options'}));fireEvent.click(screen.getByLabelText('Include saved note text'));fireEvent.keyDown(screen.getByLabelText('Include saved note text'),{key:'Escape'});const input=screen.getByRole('combobox');fireEvent.change(input,{target:{value:'nebula'}});await screen.findByText('nebula');expect(screen.getByText('nebula').tagName).toBe('MARK');
 fireEvent.click(screen.getByText('Actions for Meeting'));await screen.findByText('Actions · Meeting');fireEvent.keyDown(screen.getByRole('combobox'),{key:'Escape'});await screen.findByText('Search workspace');expect(close).not.toHaveBeenCalled();expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('nebula');fireEvent.keyDown(screen.getByRole('combobox'),{key:'Escape'});expect(close).toHaveBeenCalledTimes(1);
});
it('does not target a hidden note; exposes all commands in command mode',async()=>{
 const {close}=mount();fireEvent.change(screen.getByRole('combobox'),{target:{value:'>'}});await screen.findByText('Create note');expect(screen.queryByText('Rename active note')).toBeNull();expect(screen.getByText('Target: None — choose a resource explicitly')).toBeTruthy();fireEvent.click(screen.getByText('Create note'));await waitFor(()=>expect(close).toHaveBeenCalledTimes(1));expect(context.createNote).toHaveBeenCalledOnce();
});

it('places Actions next in native tab order and restores the highlighted resource after Escape',async()=>{
 context.openNotes=[note,{...note,id:'two',title:'Second'}];mount();await screen.findByText('Second');
 const input=screen.getByRole('combobox');fireEvent.keyDown(input,{key:'ArrowDown'});
 const actions=screen.getByRole('button',{name:'Actions for Second'});
 const focusable=[...screen.getByRole('dialog').querySelectorAll('input,button:not([disabled])')];expect(focusable[focusable.indexOf(input)+1]).toBe(actions);
 expect(fireEvent.keyDown(input,{key:'Tab'})).toBe(true);actions.focus();expect(fireEvent.keyDown(actions,{key:'Tab',shiftKey:true})).toBe(true);
 vi.mocked(api.get).mockResolvedValueOnce({data:{...note,id:'two',title:'Second'}});fireEvent.click(actions);await screen.findByText('Actions · Second');
 fireEvent.keyDown(screen.getByRole('combobox'),{key:'Escape'});await screen.findByText('Search workspace');expect(screen.getByRole('option',{selected:true}).textContent).toContain('Second');
});
it('ignores Enter used to confirm composition',async()=>{
 mount();await screen.findByText('Meeting');fireEvent.keyDown(screen.getByRole('combobox'),{key:'Enter',isComposing:true});expect(context.openResource).not.toHaveBeenCalled();
});
it('keeps query when choosing content/scope, isolates scoped empty results, and resets on reopening',async()=>{
 const scoped={...note,id:'scoped',title:'Scoped note'};
 vi.mocked(api.get).mockImplementation(async(url,config)=>({data:url==='/collections'?{items:[{id:'topic',name:'Topic',count:1}],totalItems:1,totalPages:1}:url==='/resources/query'?{items:[{resource:scoped,snippet:{text:'needle',highlights:[]}}],totalItems:1,totalPages:1}:url==='/resources'?{items:(config?.params as URLSearchParams)?.get('collection')?[scoped]:[note],totalPages:1,totalItems:1}:{items:[],totalItems:0,totalPages:0}}));
 const {rerender,close}=mount();const input=screen.getByRole('combobox');fireEvent.change(input,{target:{value:'needle'}});await waitFor(()=>expect(api.get).toHaveBeenCalledWith('/resources',expect.objectContaining({params:expect.any(URLSearchParams)})));
 fireEvent.click(screen.getByRole('button',{name:'Search options'}));await screen.findByRole('button',{name:'Topic'});fireEvent.click(screen.getByRole('button',{name:'Topic'}));fireEvent.click(screen.getByLabelText('Include saved note text'));
 await waitFor(()=>expect(vi.mocked(api.get).mock.calls.some(([url,c])=>url==='/resources/query'&&c?.params.get('collection')==='topic'&&c?.params.get('q')==='needle')).toBe(true));expect((input as HTMLInputElement).value).toBe('needle');
 fireEvent.keyDown(screen.getByLabelText('Include saved note text'),{key:'Escape'});expect(close).not.toHaveBeenCalled();expect(screen.getByText('In Topic')).toBeTruthy();fireEvent.change(input,{target:{value:''}});await screen.findByText('Scoped note');expect(screen.queryByText('Meeting')).toBeNull();
 rerender(<EscapeManagerProvider><CommandPaletteModal open={false} onClose={close} context={context}/></EscapeManagerProvider>);rerender(<EscapeManagerProvider><CommandPaletteModal open onClose={close} context={context}/></EscapeManagerProvider>);await screen.findByText('Meeting');expect(screen.getByText('Titles only')).toBeTruthy();expect(screen.getByText('Entire workspace')).toBeTruthy();
});
