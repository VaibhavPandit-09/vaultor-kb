// @vitest-environment jsdom
import { fireEvent,render,screen,waitFor,cleanup } from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import NextApp from './NextApp';
import type {SearchOptions} from './client';
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('./client',()=>({command:invoke,org:(request:Record<string,unknown>)=>invoke({kind:'organization',request})}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({onCloseRequested:async()=>()=>{},onDragDropEvent:async()=>()=>{},onResized:async()=>()=>{},isMaximized:async()=>false,show:async()=>{},destroy:vi.fn()})}));
vi.mock('@tauri-apps/plugin-dialog',()=>({open:vi.fn()}));
vi.mock('./NextEditor',()=>({default:()=> <div contentEditable suppressContentEditableWarning role="textbox" aria-label="Editor body">Editor text</div>}));
vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
const rows=(start:number)=>Array.from({length:3},(_,i)=>({id:String(start+i),title:'Note '+(start+i),revision:1,updatedAt:''}));
function setup(search?:(r:{kind:string;options?:SearchOptions;cursor?:unknown})=>Promise<unknown>){
 invoke.mockReset();invoke.mockImplementation(async(r:{kind:string;cursor?:unknown;id?:string;options?:SearchOptions;request?:{op:string;id:string}})=>{
  if(r.kind==='media'&&r.request?.op==='open')return {draft:false,note:{id:r.request.id,title:'Note '+r.request.id,revision:1,content:{type:'doc',content:[{type:'paragraph'}]}}};
  if(r.kind==='linked'||r.kind==='organization')return [];
  if(r.kind==='search')return search?.(r)??{items:[],next:null,total:0};
  if(r.kind==='snapshot')return {path:'fixture',settings:{theme:'light'},collections:[{id:'destination',name:'Research',parentId:null}]};
  if(r.kind==='drafts')return [];
  if(r.kind==='list')return {items:rows(r.cursor?4:1),total:6,next:r.cursor?null:{before:3,anchor:6,scope:null}};
  if(r.kind==='read')return {id:r.id,title:'Note '+r.id,revision:1,content:{type:'doc',content:[{type:'paragraph'}]}};
  if(r.kind==='bulkMembership')return {requested:2,added:2,removed:0,unchanged:0};
  return {};
 });
 render(<EscapeManagerProvider><NextApp/></EscapeManagerProvider>);
}
afterEach(cleanup);
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
 const editor=screen.getByRole('textbox',{name:'Editor body'});editor.focus();fireEvent.keyDown(editor,{key:'a',ctrlKey:true});expect(screen.queryByRole('searchbox',{name:'Search notes'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Return to Library'}));await screen.findByRole('button',{name:'Clear resource selection'});fireEvent.click(screen.getByRole('button',{name:'Clear resource selection'}));
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
 const search=await screen.findByRole('searchbox',{name:'Search notes'});
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
 const search=screen.getByRole('searchbox',{name:'Search notes'});fireEvent.change(search,{target:{value:'neb'}});fireEvent.click(await screen.findByRole('button',{name:'Nebula'}));await screen.findByRole('textbox',{name:'Editor body'});expect(screen.queryByRole('searchbox')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Return to Library'}));await screen.findByRole('searchbox',{name:'Search notes'});expect((screen.getByRole('searchbox',{name:'Search notes'}) as HTMLInputElement).value).toBe('neb');
 fireEvent.click(screen.getByRole('button',{name:'Clear search and filters'}));await screen.findByRole('button',{name:'Note 4'});expect(screen.getByText('Page 2')).toBeTruthy();
 fireEvent.change(screen.getByRole('searchbox',{name:'Search notes'}),{target:{value:'failure'}});await screen.findByText('Error: Search unavailable');expect(screen.queryByRole('button',{name:'Note 4'})).toBeNull();expect(screen.queryByRole('textbox',{name:'Editor body'})).toBeNull();
});

it('resets search when changing workspaces without letting query epochs hide new workspace metadata',async()=>{
 setup(async()=>({items:[{id:'8',title:'Nebula',revision:1,updatedAt:''}],total:1,next:null}));
 const search=await screen.findByRole('searchbox',{name:'Search notes'});fireEvent.change(search,{target:{value:'neb'}});await screen.findByRole('button',{name:'Nebula'});
 const original=invoke.getMockImplementation()!;let switched=false;
 invoke.mockImplementation(async r=>{if(r.kind==='open'){switched=true;return null;}if(switched&&r.kind==='snapshot')return {path:'new-fixture',settings:{theme:'light'},collections:[]};if(switched&&r.kind==='list')return {items:rows(20),total:3,next:null};return original(r);});
 const dialog=await import('@tauri-apps/plugin-dialog');vi.mocked(dialog.open).mockResolvedValue('new-fixture');
 fireEvent.click(screen.getByRole('button',{name:'Open workspace'}));await screen.findByRole('button',{name:'Note 20'});expect(screen.getAllByText('new-fixture').length).toBeGreaterThan(0);expect((search as HTMLInputElement).value).toBe('');
});

it('returns through history without retaining hidden editors and preserves the Library search',async()=>{
 setup();await screen.findByRole('button',{name:'Note 1'});fireEvent.click(screen.getByRole('button',{name:'Note 1'}));await screen.findByRole('textbox',{name:'Editor body'});expect(screen.queryByRole('searchbox',{name:'Search notes'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Back'}));await screen.findByRole('searchbox',{name:'Search notes'});expect(screen.queryByRole('textbox',{name:'Editor body'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Forward'}));await screen.findByRole('textbox',{name:'Editor body'});fireEvent.click(screen.getByRole('button',{name:'Return to Library'}));await screen.findByRole('button',{name:'Note 1'});
});
it('exposes OLED through the real persisted theme command and accessible companion categories',async()=>{
 setup();await screen.findByRole('button',{name:'Note 1'});fireEvent.click(screen.getByRole('button',{name:'Appearance'}));fireEvent.click(await screen.findByRole('button',{name:'OLED black'}));await waitFor(()=>expect(invoke).toHaveBeenCalledWith({kind:'setting',key:'theme',value:'oled'}));fireEvent.click(screen.getByRole('tab',{name:'Collections'}));expect(screen.getByRole('button',{name:'Research'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Toggle sidebar'}));expect(screen.getByRole('button',{name:'Toggle sidebar'}).getAttribute('aria-expanded')).toBe('false');
});

it('returns from Help to the active workspace and lets Library search dismiss Help',async()=>{setup();await screen.findByRole('button',{name:'Note 1'});fireEvent.click(screen.getByRole('button',{name:'Note 1'}));await screen.findByRole('textbox',{name:'Editor body'});fireEvent.click(screen.getByRole('button',{name:'Milestone Help'}));await screen.findByRole('button',{name:'Close Help'});expect(screen.queryByRole('textbox',{name:'Editor body'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Close Help'}));await screen.findByRole('textbox',{name:'Editor body'});fireEvent.click(screen.getByRole('button',{name:'Milestone Help'}));await screen.findByRole('button',{name:'Close Help'});fireEvent.click(screen.getByRole('button',{name:'Search Library'}));await screen.findByRole('searchbox',{name:'Search notes'});expect(screen.queryByRole('button',{name:'Close Help'})).toBeNull();});

it('keeps the surviving managed editor mounted when its first sibling closes',async()=>{setup();await screen.findByRole('button',{name:'Note 1'});fireEvent.click(screen.getByRole('button',{name:'Note 1'}));await screen.findByRole('textbox',{name:'Editor body'});fireEvent.click(screen.getByRole('button',{name:'Split active note'}));await waitFor(()=>expect(screen.getAllByRole('textbox',{name:'Editor body'})).toHaveLength(2));const surviving=screen.getAllByRole('textbox',{name:'Editor body'})[1];fireEvent.click(screen.getAllByRole('button',{name:'Close note'})[0]);await waitFor(()=>expect(screen.getAllByRole('textbox',{name:'Editor body'})).toHaveLength(1));expect(screen.getByRole('textbox',{name:'Editor body'})).toBe(surviving);});
