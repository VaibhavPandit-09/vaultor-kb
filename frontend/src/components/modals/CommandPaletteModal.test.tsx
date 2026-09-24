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
 const {close}=mount();const input=screen.getByRole('combobox');fireEvent.change(input,{target:{value:'nebula'}});await screen.findByText('nebula');expect(screen.getByText('nebula').tagName).toBe('MARK');
 fireEvent.click(screen.getByText('Actions for Meeting'));await screen.findByText('Actions · Meeting');fireEvent.keyDown(screen.getByRole('combobox'),{key:'Escape'});await screen.findByText('Search workspace');expect(close).not.toHaveBeenCalled();expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('nebula');fireEvent.keyDown(screen.getByRole('combobox'),{key:'Escape'});expect(close).toHaveBeenCalledTimes(1);
});
it('does not target a hidden note; exposes all commands in command mode',async()=>{
 const {close}=mount();fireEvent.change(screen.getByRole('combobox'),{target:{value:'>'}});await screen.findByText('Create note');expect(screen.queryByText('Rename active note')).toBeNull();expect(screen.getByText('Target: None — choose a resource explicitly')).toBeTruthy();fireEvent.click(screen.getByText('Create note'));await waitFor(()=>expect(close).toHaveBeenCalledTimes(1));expect(context.createNote).toHaveBeenCalledOnce();
});
