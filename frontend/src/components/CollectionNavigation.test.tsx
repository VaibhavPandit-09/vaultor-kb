// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import {CollectionsView,CollectionChildren} from './OrganizationViews';
import api from '../lib/api';
vi.mock('../lib/api',()=>({default:{get:vi.fn()}}));
const root={id:'docs',name:'Docs',count:0,childCount:1,ancestors:[]};
const child={id:'child',name:'Releases',count:3,childCount:0,parentId:'docs',ancestors:[{id:'docs',name:'Docs'}]};
const other={...child,id:'other',parentId:'android',ancestors:[{id:'android',name:'Android'}]};
beforeEach(()=>{
 vi.stubGlobal('ResizeObserver',class{observe(){} disconnect(){}});
 vi.mocked(api.get).mockImplementation(async(_url,config)=>{const p=config?.params as {parent?:string;q?:string};let items=p?.parent===''?[root]:p?.parent==='docs'?[child]:[root,child,other];if(p?.q)items=items.filter(i=>i.name.toLowerCase().includes(p.q!.toLowerCase()));return {data:{items,totalItems:items.length,totalPages:1,page:0}};});
});
afterEach(()=>{cleanup();vi.resetAllMocks();vi.unstubAllGlobals();});
it('defaults to all branches, distinguishes same names by path and searches metadata only',async()=>{
 const open=vi.fn();render(<EscapeManagerProvider><CollectionsView onOpen={open}/></EscapeManagerProvider>);
 await screen.findByRole('button',{name:'Open Docs / Releases'});expect(screen.getByRole('button',{name:'Open Android / Releases'})).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Expand Docs'})).toBeNull();expect(screen.getByRole('button',{name:'All'}).getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(screen.getByRole('button',{name:'Open Docs / Releases'}));expect(open).toHaveBeenCalledWith(child);
 fireEvent.change(screen.getByRole('textbox',{name:'Search collections'}),{target:{value:'Releases'}});
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Open Docs'})).toBeNull());
 expect(vi.mocked(api.get).mock.calls.every(([url])=>url==='/collections')).toBe(true);
});
it('switches the same directory to lazy hierarchy, supports arrows and retains switch focus',async()=>{
 const changed=vi.fn();render(<EscapeManagerProvider><CollectionsView onOpen={()=>{}} onModeChange={changed}/></EscapeManagerProvider>);
 await screen.findByRole('button',{name:'Open Docs / Releases'});const toggle=screen.getByRole('button',{name:'Hierarchy'});toggle.focus();fireEvent.click(toggle);
 await screen.findByRole('button',{name:'Expand Docs'});expect(changed).toHaveBeenCalledWith('hierarchy');expect(document.activeElement).toBe(toggle);
 const parent=screen.getByRole('button',{name:'Open Docs'});parent.focus();fireEvent.keyDown(parent,{key:'ArrowRight'});
 const leaf=await screen.findByRole('button',{name:'Open Docs / Releases'});fireEvent.keyDown(parent,{key:'ArrowDown'});expect(document.activeElement).toBe(leaf);
 fireEvent.keyDown(leaf,{key:'ArrowRight'});expect(screen.queryByRole('dialog')).toBeNull();
 fireEvent.keyDown(leaf,{key:'ArrowLeft'});expect(document.activeElement).toBe(parent);fireEvent.keyDown(parent,{key:'ArrowLeft'});
 expect(screen.queryByRole('button',{name:'Open Docs / Releases'})).toBeNull();expect(document.activeElement).toBe(parent);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Releases'}});await screen.findByRole('button',{name:'Open Android / Releases'});expect(screen.getByText(/Matches across all paths/)).toBeTruthy();
});
it('gives immediate children a labeled group and the same management actions',async()=>{
 render(<EscapeManagerProvider><CollectionChildren parent="docs" count={1} onOpen={()=>{}}/></EscapeManagerProvider>);
 const region=screen.getByRole('region',{name:'Child collections'});expect(within(region).getByRole('heading',{name:'Child collections 1'})).toBeTruthy();
 const manage=await screen.findByRole('button',{name:'Manage Docs / Releases'});manage.focus();fireEvent.click(manage);
 await screen.findByRole('button',{name:'Rename / move / delete…'});fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>expect(document.activeElement).toBe(manage));
 expect(screen.getByRole('button',{name:'Pin Releases'})).toBeTruthy();
});
