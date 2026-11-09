// @vitest-environment jsdom
import { fireEvent,render,screen,waitFor,cleanup } from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import NextApp from './NextApp';
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('./client',()=>({command:invoke}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({onCloseRequested:async()=>()=>{},destroy:vi.fn()})}));
vi.mock('@tauri-apps/plugin-dialog',()=>({open:vi.fn()}));
vi.mock('./NextEditor',()=>({default:()=> <div contentEditable suppressContentEditableWarning role="textbox" aria-label="Editor body">Editor text</div>}));
vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
const rows=(start:number)=>Array.from({length:3},(_,i)=>({id:String(start+i),title:'Note '+(start+i),revision:1,updatedAt:''}));
function setup(){
 invoke.mockReset();invoke.mockImplementation(async(r:{kind:string;cursor?:unknown;id?:string})=>{
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
 fireEvent.click(screen.getByRole('button',{name:'Clear resource selection'}));const editor=screen.getByRole('textbox',{name:'Editor body'});editor.focus();fireEvent.keyDown(editor,{key:'a',ctrlKey:true});expect(screen.queryByText('3 selected · this page only')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Next'}));await screen.findByRole('button',{name:'Note 4'});expect(screen.queryByText(/selected · this page only/)).toBeNull();
});
it('shares bulk destinations through the context menu and keeps text shortcuts inside its dialog',async()=>{
 setup();const a=await screen.findByRole('button',{name:'Note 1'});fireEvent.click(a,{ctrlKey:true});fireEvent.click(screen.getByRole('button',{name:'Note 2'}),{ctrlKey:true});
 fireEvent.keyDown(a,{key:'F10',shiftKey:true});await screen.findByRole('menu');fireEvent.click(screen.getByRole('menuitem',{name:'Add 2 notes to collection…'}));
 const search=await screen.findByRole('searchbox',{name:'Find destination collection'});fireEvent.keyDown(search,{key:'a',ctrlKey:true});expect(screen.getByText('2 selected · this page only')).toBeTruthy();
 fireEvent.change(search,{target:{value:'Research'}});fireEvent.click(screen.getByRole('option',{name:'Research'}));fireEvent.click(screen.getByRole('button',{name:'Add to collection'}));
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith({kind:'bulkMembership',ids:['1','2'],add:'destination',remove:null}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(screen.queryByText('2 selected · this page only')).toBeNull();
});
