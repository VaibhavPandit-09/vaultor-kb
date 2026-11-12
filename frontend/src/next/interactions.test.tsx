// @vitest-environment jsdom
import { act,fireEvent,render,screen,waitFor,cleanup } from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import NextApp from './NextApp';
import type {SearchOptions} from './client';
const nativeInvoke=vi.hoisted(()=>vi.fn(async()=>''));
vi.mock('@tauri-apps/api/core',()=>({invoke:nativeInvoke}));
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('./client',()=>({command:invoke,org:(request:Record<string,unknown>)=>invoke({kind:'organization',request})}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({onCloseRequested:async()=>()=>{},onDragDropEvent:async()=>()=>{},onResized:async()=>()=>{},isMaximized:async()=>false,show:async()=>{},destroy:vi.fn()})}));
vi.mock('@tauri-apps/plugin-dialog',()=>({open:vi.fn()}));
vi.mock('./NextEditor',()=>({default:({openResource}:{openResource?:(id:string)=>void})=> <div contentEditable suppressContentEditableWarning role="textbox" aria-label="Editor body">Editor text<button contentEditable={false} onClick={()=>openResource?.('2')}>Follow note 2</button></div>}));
vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
const rows=(start:number)=>Array.from({length:3},(_,i)=>({id:String(start+i),title:'Note '+(start+i),revision:1,updatedAt:''}));
function setup(search?:(r:{kind:string;options?:SearchOptions;cursor?:unknown})=>Promise<unknown>,storedSession?:unknown,settings?:{openBeside?:boolean}){
 invoke.mockReset();invoke.mockImplementation(async(r:{kind:string;cursor?:unknown;id?:string;options?:SearchOptions;request?:{op:string;id:string;ids:string[];mode:string}})=>{
  if(r.kind==='preferences')return settings??{};
  if(r.kind==='media'&&r.request?.op==='copy')return {receipt:'test-receipt',text:'vaultor://resource/'+r.request.ids.join('\nvaultor://resource/')};
  if(r.kind==='media'&&r.request?.op==='open')return {draft:r.request.id==='protected',note:{id:r.request.id,title:'Note '+r.request.id,revision:1,content:{type:'doc',content:[{type:'paragraph'}]}}};
  if(r.kind==='linked'||r.kind==='organization')return [];
  if(r.kind==='search'&&r.options?.view==='pinned')return {items:[],next:null,total:0};
  if(r.kind==='search')return search?.(r)??{items:[],next:null,total:0};
  if(r.kind==='snapshot')return {path:'fixture',settings:{theme:'light',session:storedSession},collections:[{id:'destination',name:'Research',parentId:null}]};
  if(r.kind==='drafts')return [];
  if(r.kind==='list')return {items:rows(r.cursor?4:1),total:6,next:r.cursor?null:{before:3,anchor:6,scope:null}};
  if(r.kind==='read')return {id:r.id,title:'Note '+r.id,revision:1,content:{type:'doc',content:[{type:'paragraph'}]}};
  if(r.kind==='bulkMembership')return {requested:2,added:2,removed:0,unchanged:0};
  return {};
 });
 render(<EscapeManagerProvider><NextApp/></EscapeManagerProvider>);
}
afterEach(cleanup);
it('restores the initial Library destination when navigating Back from a browser',async()=>{
 const browse={screen:'collections',collection:null,criteria:{query:'',content:false,order:'created'}};setup(undefined,{version:1,documents:[],activePane:0,ratio:50,browse,sidebar:true,companion:'shortcuts',history:{entries:[{kind:'library'},{kind:'browse',browse}],index:1}});await screen.findByRole('heading',{name:'Collections',level:1});fireEvent.click(screen.getByRole('button',{name:'Back'}));await screen.findByRole('heading',{name:'Library',level:1});expect(document.querySelector('[data-browser=collections]')).toBeNull();
});
it('keeps the current note when a physical modifier key precedes a shortcut',async()=>{
 setup();fireEvent.click(await screen.findByRole('button',{name:'Note 1'}));const editor=await screen.findByRole('textbox',{name:'Editor body'});
 for(const key of ['Control','Alt','Shift','Meta']){await act(async()=>{fireEvent.keyDown(window,{key,ctrlKey:key==='Control',altKey:key==='Alt',shiftKey:key==='Shift',metaKey:key==='Meta'});});expect(screen.getByRole('textbox',{name:'Editor body'})).toBe(editor);expect(document.querySelector('[data-browser=collections]')).toBeNull();}
});
it('opens Settings over the existing note without remounting its editor or changing history',async()=>{
 setup();fireEvent.click(await screen.findByRole('button',{name:'Note 1'}));const editor=await screen.findByRole('textbox',{name:'Editor body'});
 const trigger=screen.getByRole('button',{name:'Settings'});trigger.focus();const back=screen.getByRole('button',{name:'Journey back'}).getAttribute('disabled');fireEvent.click(trigger);
 expect(await screen.findByRole('dialog',{name:'Settings'})).toBeTruthy();expect(screen.getByRole('textbox',{name:'Editor body'})).toBe(editor);expect(screen.getByRole('button',{name:'Journey back'}).getAttribute('disabled')).toBe(back);
 fireEvent.click(screen.getByRole('button',{name:'Close settings'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(screen.getByRole('textbox',{name:'Editor body'})).toBe(editor);await waitFor(()=>expect(document.activeElement).toBe(trigger));
});
it('returns focus through the command palette when Settings closes',async()=>{
 setup();await screen.findByRole('button',{name:'Note 1'});const trigger=screen.getByRole('button',{name:'Commands'});trigger.focus();fireEvent.click(trigger);const input=await screen.findByRole('combobox',{name:'Search commands'});fireEvent.change(input,{target:{value:'Settings'}});fireEvent.keyDown(input,{key:'Enter'});await screen.findByRole('dialog',{name:'Settings'});fireEvent.click(screen.getByRole('button',{name:'Close settings'}));await waitFor(()=>expect(document.activeElement).toBe(trigger));
});
it('uses modifier/checkbox selection, preserves groups for context menus and restores focus before clearing',async()=>{
 setup();const a=await screen.findByRole('button',{name:'Note 1'}),b=screen.getByRole('button',{name:'Note 2'});
 fireEvent.click(a,{ctrlKey:true});fireEvent.click(b,{ctrlKey:true});expect(screen.getByText('2 selected · this page only')).toBeTruthy();
 fireEvent.contextMenu(b,{clientX:1100,clientY:800});await screen.findByRole('menu');expect(screen.getByText('Add 2 notes to collection…')).toBeTruthy();
 fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>expect(screen.queryByRole('menu')).toBeNull());expect(document.activeElement).toBe(b);
 fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>expect(screen.queryByText('2 selected · this page only')).toBeNull());
 fireEvent.click(screen.getByRole('checkbox',{name:'Select Note 1'}));expect(screen.getByText('1 selected · this page only')).toBeTruthy();
});
it('owns list shortcuts only, clears on pagination and opens the keyboard-focused resource',async()=>{
 setup();const a=await screen.findByRole('button',{name:'Note 1'});a.focus();fireEvent.keyDown(a,{key:'ArrowDown'});
 await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('button',{name:'Note 2'})));
 fireEvent.keyDown(document.activeElement!,{key:' ',code:'Space'});expect(screen.getByText('1 selected · this page only')).toBeTruthy();
 fireEvent.keyDown(document.activeElement!,{key:'a',ctrlKey:true});expect(screen.getByText('3 selected · this page only')).toBeTruthy();
 fireEvent.keyDown(document.activeElement!,{key:'Enter'});await screen.findByRole('textbox',{name:'Editor body'});
 const editor=screen.getByRole('textbox',{name:'Editor body'});editor.focus();fireEvent.keyDown(editor,{key:'a',ctrlKey:true});expect(screen.queryByRole('searchbox',{name:'Search items'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Return to Library'}));await screen.findByRole('button',{name:'Clear resource selection'});fireEvent.click(screen.getByRole('button',{name:'Clear resource selection'}));
 fireEvent.click(screen.getByRole('button',{name:'Next'}));await screen.findByRole('button',{name:'Note 4'});expect(screen.queryByText(/selected · this page only/)).toBeNull();
});
it('shares bulk destinations through the context menu and keeps text shortcuts inside its dialog',async()=>{
 setup();const a=await screen.findByRole('button',{name:'Note 1'});fireEvent.click(a,{ctrlKey:true});fireEvent.click(screen.getByRole('button',{name:'Note 2'}),{ctrlKey:true});
 fireEvent.keyDown(a,{key:'F10',shiftKey:true});await screen.findByRole('menu');fireEvent.click(screen.getByRole('menuitem',{name:'Add 2 notes to collection…'}));
 const search=await screen.findByRole('searchbox',{name:'Find destination collection'});fireEvent.keyDown(search,{key:'a',ctrlKey:true});expect(screen.getByText('2 selected · this page only')).toBeTruthy();
 fireEvent.change(search,{target:{value:'Research'}});fireEvent.click(screen.getByRole('option',{name:'Research'}));fireEvent.click(screen.getByRole('button',{name:'Add to collection'}));
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith({kind:'bulkMembership',ids:['1','2'],add:'destination',remove:null}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(screen.queryByText('2 selected · this page only')).toBeNull();
});

it('debounces search, ignores stale replies and keeps text/list shortcut ownership separate',async()=>{
 let release:(r:unknown)=>void=()=>{};
 setup(async r=>r.options?.query==='old'?new Promise(resolve=>{release=resolve;}):{items:[{id:'8',title:'Nebula',revision:1,updatedAt:''}],total:1,next:null});
 const search=await screen.findByRole('searchbox',{name:'Search items'});
 fireEvent.change(search,{target:{value:'old'}});await waitFor(()=>expect(invoke.mock.calls.some(([r])=>r.kind==='search'&&r.options.query==='old')).toBe(true));
 fireEvent.click(screen.getByRole('button',{name:'Note 1'}),{ctrlKey:true});expect(screen.queryByText('1 selected · this page only')).toBeNull();
 fireEvent.change(search,{target:{value:'neb'}});await screen.findByRole('button',{name:'Nebula'});
 release({items:[{id:'9',title:'Stale',revision:1,updatedAt:''}],total:1,next:null});await new Promise(resolve=>setTimeout(resolve,10));expect(screen.queryByRole('button',{name:'Stale'})).toBeNull();
 search.focus();fireEvent.keyDown(search,{key:'a',ctrlKey:true});expect(screen.queryByText('1 selected · this page only')).toBeNull();
 fireEvent.keyDown(search,{key:'ArrowDown'});const result=screen.getByRole('button',{name:'Nebula'});expect(document.activeElement).toBe(result);
 fireEvent.keyDown(result,{key:' '});expect(screen.getByText('1 selected · this page only')).toBeTruthy();fireEvent.keyDown(document,{key:'Escape'});expect((search as HTMLInputElement).value).toBe('neb');
 fireEvent.keyDown(document,{key:'Escape'});await screen.findByRole('button',{name:'Note 1'});expect((search as HTMLInputElement).value).toBe('');
});
it('opens results without losing query context, restores the prior browse page and reports query failures',async()=>{
 setup(async r=>{if(r.options?.query==='failure')throw Error('Search unavailable');return {items:[{id:'8',title:'Nebula',revision:1,updatedAt:''}],total:1,next:null};});
 await screen.findByRole('button',{name:'Note 1'});fireEvent.click(screen.getByRole('button',{name:'Next'}));await screen.findByRole('button',{name:'Note 4'});
 const search=screen.getByRole('searchbox',{name:'Search items'});fireEvent.change(search,{target:{value:'neb'}});fireEvent.click(await screen.findByRole('button',{name:'Nebula'}));await screen.findByRole('textbox',{name:'Editor body'});expect(screen.queryByRole('searchbox')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Return to Library'}));await screen.findByRole('searchbox',{name:'Search items'});expect((screen.getByRole('searchbox',{name:'Search items'}) as HTMLInputElement).value).toBe('neb');
 fireEvent.click(screen.getByRole('button',{name:'Clear search and filters'}));await screen.findByRole('button',{name:'Note 4'});expect(screen.getByText('Page 2 of 2')).toBeTruthy();
 fireEvent.change(screen.getByRole('searchbox',{name:'Search items'}),{target:{value:'failure'}});await screen.findByText('Error: Search unavailable');expect(screen.queryByRole('button',{name:'Note 4'})).toBeNull();expect(screen.queryByRole('textbox',{name:'Editor body'})).toBeNull();
});

it('resets search when changing workspaces without letting query epochs hide new workspace metadata',async()=>{
 setup(async()=>({items:[{id:'8',title:'Nebula',revision:1,updatedAt:''}],total:1,next:null}));
 const search=await screen.findByRole('searchbox',{name:'Search items'});fireEvent.change(search,{target:{value:'neb'}});await screen.findByRole('button',{name:'Nebula'});
 const original=invoke.getMockImplementation()!;let switched=false;
 invoke.mockImplementation(async r=>{if(r.kind==='open'){switched=true;return null;}if(switched&&r.kind==='snapshot')return {path:'new-fixture',settings:{theme:'light'},collections:[]};if(switched&&r.kind==='list')return {items:rows(20),total:3,next:null};return original(r);});
 const dialog=await import('@tauri-apps/plugin-dialog');vi.mocked(dialog.open).mockResolvedValue('new-fixture');
 fireEvent.click(screen.getByRole('button',{name:'Open workspace'}));await screen.findByRole('button',{name:'Note 20'});expect(screen.getAllByText('new-fixture').length).toBeGreaterThan(0);expect((search as HTMLInputElement).value).toBe('');
});

it('returns through history without retaining hidden editors and preserves the Library search',async()=>{
 setup();await screen.findByRole('button',{name:'Note 1'});fireEvent.click(screen.getByRole('button',{name:'Note 1'}));await screen.findByRole('textbox',{name:'Editor body'});expect(screen.queryByRole('searchbox',{name:'Search items'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Application menu'}));fireEvent.click(await screen.findByRole('button',{name:'Workspace Back'}));await screen.findByRole('searchbox',{name:'Search items'});expect(screen.queryByRole('textbox',{name:'Editor body'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Forward'}));await screen.findByRole('textbox',{name:'Editor body'});fireEvent.click(screen.getByRole('button',{name:'Return to Library'}));await screen.findByRole('button',{name:'Note 1'});
});
it('exposes OLED through the real persisted theme command and accessible companion categories',async()=>{
 setup();await screen.findByRole('button',{name:'Note 1'});fireEvent.click(screen.getByRole('button',{name:'Appearance'}));fireEvent.click(await screen.findByRole('button',{name:'OLED black'}));await waitFor(()=>expect(invoke).toHaveBeenCalledWith(expect.objectContaining({kind:'preferences',value:expect.objectContaining({theme:'oled'})})));fireEvent.click(screen.getByRole('tab',{name:'Collections'}));expect(screen.getByRole('button',{name:'Research'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Toggle sidebar'}));expect(screen.getByRole('button',{name:'Toggle sidebar'}).getAttribute('aria-expanded')).toBe('false');
});

it('returns from Help to the active workspace and lets Library search dismiss Help',async()=>{setup();await screen.findByRole('button',{name:'Note 1'});fireEvent.click(screen.getByRole('button',{name:'Note 1'}));await screen.findByRole('textbox',{name:'Editor body'});fireEvent.click(screen.getByRole('button',{name:'Help Center'}));await screen.findByRole('button',{name:'Close modal'});expect(screen.getByRole('textbox',{name:'Editor body'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Close modal'}));await screen.findByRole('textbox',{name:'Editor body'});fireEvent.click(screen.getByRole('button',{name:'Help Center'}));await screen.findByRole('button',{name:'Close modal'});fireEvent.click(screen.getByRole('button',{name:'Search Library'}));await screen.findByRole('searchbox',{name:'Search items'});expect(screen.queryByRole('button',{name:'Close modal'})).toBeNull();});

it('keeps the surviving managed editor mounted when its first sibling closes',async()=>{setup();await screen.findByRole('button',{name:'Note 1'});fireEvent.click(screen.getByRole('button',{name:'Note 1'}));await screen.findByRole('textbox',{name:'Editor body'});fireEvent.click(screen.getByRole('button',{name:'Split active note'}));await waitFor(()=>expect(screen.getAllByRole('textbox',{name:'Editor body'})).toHaveLength(2));const surviving=screen.getAllByRole('textbox',{name:'Editor body'})[1];fireEvent.click(screen.getAllByRole('button',{name:'Close pane'})[0]);await waitFor(()=>expect(screen.getAllByRole('textbox',{name:'Editor body'})).toHaveLength(1));expect(screen.getByRole('textbox',{name:'Editor body'})).toBe(surviving);});

it('uses native resource copying only while the Library owns clipboard shortcuts',async()=>{
 setup();const a=await screen.findByRole('button',{name:'Note 1'});fireEvent.click(a,{ctrlKey:true});fireEvent.click(screen.getByRole('button',{name:'Note 2'}),{ctrlKey:true});a.focus();fireEvent.keyDown(a,{key:'c',ctrlKey:true});await waitFor(()=>expect(invoke).toHaveBeenCalledWith({kind:'media',request:{op:'copy',ids:['1','2'],mode:'copy',collection:null}}));await waitFor(()=>expect(nativeInvoke).toHaveBeenCalledWith('native_resource',expect.objectContaining({action:'clipboardWrite'})));
 fireEvent.click(a);const editor=await screen.findByRole('textbox',{name:'Editor body'});const copies=invoke.mock.calls.filter(([r])=>r.kind==='media'&&r.request.op==='copy').length;fireEvent.keyDown(editor,{key:'c',ctrlKey:true});fireEvent.keyDown(editor,{key:'v',ctrlKey:true});expect(invoke.mock.calls.filter(([r])=>r.kind==='media'&&r.request.op==='copy')).toHaveLength(copies);
});

it('opens full primary browsers independently of chosen companions and exposes settings through shared commands',async()=>{setup();await screen.findByRole('button',{name:'Note 1'});const primary=document.querySelector('.sidebar-primary')!;fireEvent.click([...primary.querySelectorAll('button')].find(b=>b.textContent==='Collections')!);await screen.findByRole('heading',{name:'Collections',level:1});expect(document.querySelector('[data-browser=collections]')).toBeTruthy();fireEvent.click(screen.getByRole('tab',{name:'Open notes'}));expect(screen.getByLabelText('Automatic sidebar companion').getAttribute('aria-pressed')).toBe('false');expect(document.querySelector('[data-browser=collections]')).toBeTruthy();fireEvent.click([...primary.querySelectorAll('button')].find(b=>b.textContent==='Tags')!);await screen.findByRole('heading',{name:'Tags',level:1});fireEvent.click([...primary.querySelectorAll('button')].find(b=>b.textContent==='Linked sources')!);await screen.findByRole('heading',{name:'Linked Sources',level:1});fireEvent.keyDown(window,{key:',',ctrlKey:true});await screen.findByRole('dialog',{name:'Settings'});expect(document.querySelector('[data-browser=sources]')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Close settings'}));fireEvent.keyDown(window,{key:'k',ctrlKey:true});await screen.findByRole('dialog',{name:'Command palette'});fireEvent.change(screen.getByRole('combobox',{name:'Search commands'}),{target:{value:'Library'}});fireEvent.keyDown(screen.getByRole('combobox',{name:'Search commands'}),{key:'Enter'});await screen.findByRole('heading',{name:'Library',level:1});});
it('restores lightweight pane arrangements and persists identity without note bodies',async()=>{setup(undefined,{version:1,documents:[{id:'1'},{id:'1'}],activePane:1,ratio:62,browse:{screen:'resources',collection:null,criteria:{query:'',content:false,order:'created'}},sidebar:true,companion:'sessions'});await waitFor(()=>expect(screen.getAllByRole('textbox',{name:'Editor body'})).toHaveLength(2));expect(document.querySelector('.next-panes')?.getAttribute('data-active-pane')).toBe('1');expect(screen.getByRole('separator',{name:'Resize note panes'}).getAttribute('aria-valuenow')).toBe('62');await waitFor(()=>expect(invoke).toHaveBeenCalledWith(expect.objectContaining({kind:'session',path:'fixture',value:expect.objectContaining({documents:[{id:'1'},{id:'1'}]})})));const receipt=invoke.mock.calls.find(([r])=>r.kind==='session')![0];expect(receipt.value.documents.every((d:Record<string,unknown>)=>!('content' in d))).toBe(true);});

it('keeps protected drafts out of automatic session restoration',async()=>{setup(undefined,{version:1,documents:[{id:'protected'}],activePane:0,ratio:50,browse:{screen:'resources',collection:null,criteria:{query:'',content:false,order:'created'}},sidebar:true,companion:'sessions'});await screen.findAllByText('Protected draft awaits Recovery review');expect(screen.queryByRole('textbox',{name:'Editor body'})).toBeNull();expect(invoke.mock.calls.some(([r])=>r.kind==='save'||r.kind==='discardDraft')).toBe(false);});

it('opening the current workspace preserves its live session instead of leaving restoration disabled',async()=>{setup();await screen.findByRole('button',{name:'Note 1'});fireEvent.click(screen.getByRole('button',{name:'Note 1'}));await screen.findByRole('textbox',{name:'Editor body'});const dialog=await import('@tauri-apps/plugin-dialog');vi.mocked(dialog.open).mockResolvedValueOnce('fixture');const original=invoke.getMockImplementation()!;invoke.mockImplementation(async r=>r.kind==='open'?{path:'fixture',collections:[],settings:{}}:original(r));fireEvent.click(screen.getByRole('button',{name:'Open workspace'}));await waitFor(()=>expect(invoke).toHaveBeenCalledWith({kind:'open',path:'fixture'}));await waitFor(()=>expect(document.querySelector('.next-sidebar-create')).toHaveProperty('disabled',false));expect(screen.getByRole('textbox',{name:'Editor body'})).toBeTruthy();expect(document.querySelector('.next-shell')?.getAttribute('data-session-ready')).toBe('true');});

it('applies the beside-opening preference to remembered sidebar notes',async()=>{setup(undefined,undefined,{openBeside:true});fireEvent.click(await screen.findByRole('button',{name:'Note 1'}));await screen.findByRole('textbox',{name:'Editor body'});fireEvent.click(screen.getByRole('button',{name:'Return to Library'}));fireEvent.click(await screen.findByRole('button',{name:'Note 2'}));await screen.findByRole('textbox',{name:'Editor body'});await waitFor(()=>expect(document.querySelector('[data-open-session="1"] .sidebar-nav')).toBeTruthy());fireEvent.click(document.querySelector('[data-open-session="1"] .sidebar-nav')!);await waitFor(()=>expect(screen.getAllByRole('textbox',{name:'Editor body'})).toHaveLength(2));expect([...document.querySelectorAll('[data-note-id]')].map(e=>e.getAttribute('data-note-id'))).toEqual(['2','1']);});

it('retains one bounded Library page while unmounting editors on return',async()=>{setup();const row=await screen.findByRole('button',{name:'Note 1'});fireEvent.click(row);await screen.findByRole('textbox',{name:'Editor body'});expect(row.isConnected).toBe(true);expect(row.closest('[hidden]')).toBeTruthy();expect(screen.queryByRole('searchbox',{name:'Search items'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Return to Library'}));await waitFor(()=>expect(screen.queryByRole('textbox',{name:'Editor body'})).toBeNull());expect(screen.getByRole('button',{name:'Note 1'})).toBe(row);});

it('keeps per-session journeys while direct opens retain independent inactive sessions',async()=>{setup();fireEvent.click(await screen.findByRole('button',{name:'Note 1'}));await screen.findByRole('textbox',{name:'Editor body'});fireEvent.click(screen.getByRole('button',{name:'Follow note 2'}));await waitFor(()=>expect(screen.getByRole('textbox',{name:'Note title 1'})).toHaveProperty('value','Note 2'));expect(document.querySelectorAll('[data-open-session]')).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'Journey back'}));await waitFor(()=>expect(screen.getByRole('textbox',{name:'Note title 1'})).toHaveProperty('value','Note 1'));fireEvent.click(screen.getByRole('button',{name:'Journey forward'}));await waitFor(()=>expect(screen.getByRole('textbox',{name:'Note title 1'})).toHaveProperty('value','Note 2'));fireEvent.click(screen.getByRole('button',{name:'Return to Library'}));fireEvent.click(await screen.findByRole('button',{name:'Note 3'}));await screen.findByRole('textbox',{name:'Editor body'});expect(document.querySelectorAll('[data-open-session]')).toHaveLength(2);fireEvent.click(screen.getByRole('button',{name:'Manage open notes'}));fireEvent.click(await screen.findByRole('menuitem',{name:'Close all notes'}));await waitFor(()=>expect(screen.queryByRole('textbox',{name:'Editor body'})).toBeNull());expect(document.querySelectorAll('[data-open-session]')).toHaveLength(0);});
it('persists Quick Access group changes without replacing the full workspace browser',async()=>{setup();await screen.findByRole('button',{name:'Note 1'});fireEvent.click(screen.getByRole('button',{name:'Sidebar options'}));const pinned=await screen.findByRole('checkbox',{name:'Pinned'});fireEvent.click(pinned);await waitFor(()=>expect(invoke).toHaveBeenCalledWith(expect.objectContaining({kind:'preferences',value:expect.objectContaining({sidebarSections:expect.objectContaining({pinned:expect.objectContaining({visible:false})})})})));fireEvent.keyDown(document,{key:'Escape'});fireEvent.click(screen.getByRole('tab',{name:'Collections'}));fireEvent.click(screen.getByRole('button',{name:'Note 1'}));await screen.findByRole('textbox',{name:'Editor body'});expect(screen.getByRole('tab',{name:'Collections'}).getAttribute('aria-selected')).toBe('true');expect(screen.getByLabelText('Automatic sidebar companion').getAttribute('aria-pressed')).toBe('false');});

it('activates each explicit shared view by its own Open Notes session identity',async()=>{setup(undefined,{version:1,documents:[{id:'1'},{id:'1'}],activePane:1,ratio:50,browse:{screen:'resources',collection:null,criteria:{query:'',content:false,order:'created'}},sidebar:true,companion:'sessions'});await waitFor(()=>expect(screen.getAllByRole('textbox',{name:'Editor body'})).toHaveLength(2));const rows=[...document.querySelectorAll('[data-open-session] .sidebar-nav')];expect(rows).toHaveLength(2);fireEvent.click(rows[0]);await waitFor(()=>expect(document.querySelector('.next-panes')?.getAttribute('data-active-pane')).toBe('0'));fireEvent.click(rows[1]);await waitFor(()=>expect(document.querySelector('.next-panes')?.getAttribute('data-active-pane')).toBe('1'));});

it('keeps journey boundary shortcuts inside the active session rather than leaving for workspace history',async()=>{setup();fireEvent.click(await screen.findByRole('button',{name:'Note 1'}));const editor=await screen.findByRole('textbox',{name:'Editor body'});await act(async()=>{fireEvent.keyDown(window,{key:'ArrowLeft',ctrlKey:true,altKey:true});});expect(screen.getByRole('textbox',{name:'Editor body'})).toBe(editor);expect(screen.getByRole('button',{name:'Journey back'})).toHaveProperty('disabled',true);fireEvent.click(screen.getByRole('button',{name:'Follow note 2'}));await waitFor(()=>expect(screen.getByRole('textbox',{name:'Note title 1'})).toHaveProperty('value','Note 2'));fireEvent.keyDown(window,{key:'ArrowLeft',ctrlKey:true,altKey:true});await waitFor(()=>expect(screen.getByRole('textbox',{name:'Note title 1'})).toHaveProperty('value','Note 1'));});
