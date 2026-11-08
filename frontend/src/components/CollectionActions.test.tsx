// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import CollectionActions from './CollectionActions';
import {CollectionCommandsContext} from '../lib/collectionCommands';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import {configureConnection,getPlatform} from '../lib/platform';
import api from '../lib/api';
vi.mock('../lib/api',()=>({default:{get:vi.fn(async()=>({data:{items:[],totalPages:0}})),put:vi.fn(async()=>({data:{id:'docs',name:'Renamed'}}))}}));
vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
const item={id:'docs',name:'docs',count:3,parentId:null},platform=getPlatform();
afterEach(()=>{cleanup();vi.clearAllMocks();configureConnection({profileId:'browser',kind:'browser'},platform);});
function setup(){const commands={newNote:vi.fn(async()=>{}),importFiles:vi.fn()},open=vi.fn();const result=render(<EscapeManagerProvider><CollectionCommandsContext.Provider value={commands}><div className="library-row"><button>docs row</button><CollectionActions item={item} onOpen={open}/></div></CollectionCommandsContext.Provider></EscapeManagerProvider>);return {...result,commands,open};}
async function menu(){fireEvent.contextMenu(screen.getByText('docs row'));await screen.findByRole('menuitem',{name:'Open collection'});}
it('collection commands retain the exact destination and open focused rename without unrelated management controls',async()=>{
 const {commands}=setup();await menu();fireEvent.click(screen.getByRole('menuitem',{name:'New note here'}));await waitFor(()=>expect(commands.newNote).toHaveBeenCalledWith(item));await menu();fireEvent.click(screen.getByRole('menuitem',{name:'Import here…'}));await waitFor(()=>expect(commands.importFiles).toHaveBeenCalledWith(item));await menu();fireEvent.click(screen.getByRole('menuitem',{name:'Rename collection…'}));const input=await screen.findByRole('textbox',{name:'Collection name'});expect(screen.queryByText('Move collection and children')).toBeNull();fireEvent.change(input,{target:{value:'Renamed'}});fireEvent.submit(input.closest('form')!);await waitFor(()=>expect(api.put).toHaveBeenCalledWith('/collections/docs',{name:'Renamed'},expect.anything()));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(document.activeElement).toBe(screen.getByText('docs row'));
});
it('stale collection menus cannot pin, navigate or create against a new workspace',async()=>{
 configureConnection({profileId:'old',kind:'local',generation:'old'},platform);const {commands,open}=setup();await menu();configureConnection({profileId:'new',kind:'local',generation:'new'},platform);fireEvent.click(screen.getByRole('menuitem',{name:'Pin collection'}));await screen.findByRole('alert');expect(api.put).not.toHaveBeenCalled();expect(commands.newNote).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();
});
