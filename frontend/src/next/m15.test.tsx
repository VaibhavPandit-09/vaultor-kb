import PinnedBrowser from './PinnedBrowser';
// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useState} from 'react';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import DesktopSettingsDialog from './DesktopSettingsDialog';
import NoteTitle from '../components/NoteTitle';
import OpenNotes from '../components/OpenNotes';
import QuickAccess from './QuickAccess';
import {defaults,type Preferences} from './desktopState';
const org=vi.hoisted(()=>vi.fn());vi.mock('./client',()=>({org,command:vi.fn()}));
vi.mock('./media',()=>({media:vi.fn(async()=>[])}));
vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('exposes supported workspace controls, accent keyboard traversal and scoped reset',async()=>{
 const saved=vi.fn();function Fixture(){const [value,setValue]=useState<Preferences>({...defaults,autoCompanion:false,opacity:.65});return <DesktopSettingsDialog value={value} save={v=>{saved(v);setValue(v);}} path="fixture" error="" close={()=>{}}/>;}
 render(<EscapeManagerProvider><Fixture/></EscapeManagerProvider>);fireEvent.click(screen.getByRole('button',{name:'Workspace'}));
 fireEvent.click(within(screen.getByRole('radiogroup',{name:'Maximum visible panes'})).getByRole('radio',{name:'1'}));expect(saved.mock.lastCall?.[0].maxVisiblePanes).toBe(1);
 fireEvent.change(screen.getByRole('spinbutton',{name:'Autosave delay value'}),{target:{value:'0'}});fireEvent.blur(screen.getByRole('spinbutton',{name:'Autosave delay value'}));expect(saved.mock.lastCall?.[0].autosaveDelay).toBe(0);
 fireEvent.click(screen.getByRole('button',{name:'Settings actions'}));fireEvent.click(await screen.findByRole('menuitem',{name:'Reset workspace'}));fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog',{name:'Reset workspace?'})).toBeNull();expect(saved.mock.lastCall?.[0].maxVisiblePanes).toBe(1);
 fireEvent.click(screen.getByRole('button',{name:'Appearance'}));const accent=screen.getByRole('radiogroup',{name:'Accent'});fireEvent.keyDown(accent,{key:'End'});expect(saved.mock.lastCall?.[0].accent).toBe('cyan');expect(document.activeElement?.getAttribute('aria-label')).toBe('cyan');
});
it('title editing journals changes and Escape restores the original title and launcher',async()=>{
 const changes=vi.fn();function Fixture(){const [value,setValue]=useState('Original');return <NoteTitle label="Note title" value={value} change={v=>{changes(v);setValue(v);}}/>;}
 render(<EscapeManagerProvider><Fixture/></EscapeManagerProvider>);fireEvent.click(screen.getByRole('button',{name:'Note title'}));fireEvent.change(screen.getByRole('textbox',{name:'Note title'}),{target:{value:'Draft title'}});expect(changes).toHaveBeenCalledWith('Draft title');fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>expect(screen.getByRole('button',{name:'Note title'}).textContent).toBe('Original'));await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('button',{name:'Note title'})));
});
it('mixed pinned collections navigate as collections and never use resource activation',async()=>{
 org.mockResolvedValue({items:[{id:'same',title:'Collection shortcut',kind:'collection'},{id:'same',title:'Resource shortcut',kind:'note'}],total:2,next:null});const open=vi.fn(),collection=vi.fn();
 render(<EscapeManagerProvider><QuickAccess preferences={defaults} save={()=>{}} active revision={0} recent={[]} onCollection={collection} unpinCollection={()=>{}} shortcut={r=><button key={r.id} onClick={()=>open(r.id)}>{r.title}</button>} viewAll={()=>{}} error="" saving={false}/></EscapeManagerProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'Collection shortcut'}));expect(collection).toHaveBeenCalledWith('same');expect(open).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Resource shortcut'}));expect(open).toHaveBeenCalledWith('same');
});
it('pointer session arrangement crosses the drag threshold, cancels and swaps by view identity',()=>{
 vi.stubGlobal('PointerEvent',MouseEvent);const a={paneId:'a',id:'same',cursor:0,history:[{visitId:'a1',resourceId:'same',title:'First'}]},b={...a,paneId:'b',history:[{visitId:'b1',resourceId:'same',title:'Second'}]},reorder=vi.fn(),arrange=vi.fn();
 const {unmount}=render(<EscapeManagerProvider><div data-session-pane="b">Pane target</div><OpenNotes nativeArrange onArrange={arrange} sessions={[a,b]} panes={[a,b]} activeId="a" canSplit={false} onOpen={()=>{}} onSplit={()=>{}} onClose={()=>{}} onCloseOthers={()=>{}} onReorder={reorder}/></EscapeManagerProvider>);const target=document.querySelector<HTMLElement>('[data-session-pane]')!;Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>target});const grip=screen.getByRole('button',{name:'Arrange First'});
 fireEvent.pointerDown(grip,{button:0,clientX:10,clientY:10});fireEvent.pointerMove(document,{clientX:40,clientY:40});expect(target.dataset.nextSessionDrop).toBe('swap');fireEvent.keyDown(document,{key:'Escape'});fireEvent.pointerUp(document,{clientX:40,clientY:40});expect(arrange).not.toHaveBeenCalled();expect(target.dataset.nextSessionDrop).toBeUndefined();
 fireEvent.pointerDown(grip,{button:0,clientX:10,clientY:10});fireEvent.pointerMove(document,{clientX:40,clientY:40});fireEvent.pointerUp(document,{clientX:40,clientY:40});expect(arrange).toHaveBeenCalledWith('a','b');expect(reorder).not.toHaveBeenCalled();unmount();expect(document.querySelector('[data-next-session-drop]')).toBeNull();
});

it('mixed Pinned keyboard menus preserve entity namespace for equal text identities',async()=>{
 org.mockImplementation(request=>Promise.resolve(request.op==='pins'?{items:[{id:'same',title:'Collection shortcut',kind:'collection'},{id:'same',title:'Resource shortcut',kind:'note'}],total:2,next:null}:[]));const resource=vi.fn(),collection=vi.fn();render(<EscapeManagerProvider><PinnedBrowser workspace="fixture" revision={0} collections={[{id:'same',name:'Collection shortcut',parentId:null}]} openResource={()=>{}} openCollection={()=>{}} resourceMenu={resource} collectionMenu={collection} unpin={()=>{}} unpinCollection={()=>{}}/></EscapeManagerProvider>);const row=await screen.findByRole('button',{name:'Resource shortcut'});fireEvent.focus(row);fireEvent.keyDown(row,{key:'ContextMenu'});expect(resource).toHaveBeenCalled();expect(collection).not.toHaveBeenCalled();
});
