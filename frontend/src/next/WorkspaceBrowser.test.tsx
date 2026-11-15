// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import WorkspaceBrowser from './WorkspaceBrowser';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import type {Collection} from './client';
beforeEach(()=>vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
vi.mock('./client',()=>({org:vi.fn(async()=>({items:[{id:'tag',name:'Research',color:'#5887ee',count:3}],next:null}))}));
it('owns tag creation in the single browser header and preserves contextual management',async()=>{
 render(<EscapeManagerProvider><WorkspaceBrowser kind="tags" collections={[]} sources={[]} revision={0} chooseCollection={()=>{}} collectionMenu={()=>{}} createCollection={()=>{}} pinCollection={()=>{}} chooseTag={()=>{}} tagChanged={()=>{}} sourcesChanged={async()=>{}} openDocument={()=>{}} sourceMenu={()=>{}} remember={()=>{}}/></EscapeManagerProvider>);
 expect(screen.getAllByRole('button',{name:'New tag'})).toHaveLength(1);expect(screen.getAllByText('Tags')).toHaveLength(1);
 expect(await screen.findByRole('button',{name:'Show resources tagged Research'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'New tag'}));expect(screen.getByRole('dialog',{name:'Create tag'})).toBeTruthy();
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Manage tag Research'}));expect(screen.getByRole('dialog',{name:'Manage tag'})).toBeTruthy();
});
function fixture(collections:Collection[],pinCollection:(c:Collection)=>void=()=>{}){return <EscapeManagerProvider><WorkspaceBrowser kind="collections" collections={collections} sources={[]} revision={0} chooseCollection={()=>{}} collectionMenu={()=>{}} createCollection={()=>{}} pinCollection={pinCollection} chooseTag={()=>{}} tagChanged={()=>{}} sourcesChanged={async()=>{}} openDocument={()=>{}} sourceMenu={()=>{}} remember={()=>{}}/></EscapeManagerProvider>;}
it('exposes collection pin identity and state in All and Hierarchy',()=>{
 const item={id:'collection-id',name:'Research',parentId:null,pinned:true,count:1},pin=vi.fn();render(fixture([item],pin));
 const action=screen.getByRole('button',{name:'Unpin collection Research',pressed:true});fireEvent.click(action);expect(pin).toHaveBeenCalledWith(item);expect(screen.getByText('1 direct resource')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Hierarchy'}));fireEvent.click(screen.getByRole('button',{name:'Unpin collection Research',pressed:true}));expect(pin).toHaveBeenCalledTimes(2);
});
function setup(collections:Collection[]){return render(fixture(collections));}
const roots=(count:number)=>Array.from({length:count},(_,i)=>({id:String(i),name:'Root '+i,parentId:null}));
it('resets the single viewport and page when switching modes, searching and paging',()=>{
 setup(roots(105));const viewport=screen.getByRole('region',{name:'Collections'});
 viewport.scrollTop=450;fireEvent.scroll(viewport);fireEvent.click(screen.getByRole('button',{name:'Hierarchy'}));expect(viewport.scrollTop).toBe(0);expect(screen.getByRole('button',{name:'Hierarchy'}).getAttribute('aria-pressed')).toBe('true');
 viewport.scrollTop=400;fireEvent.scroll(viewport);fireEvent.click(screen.getByRole('button',{name:'Next'}));expect(viewport.scrollTop).toBe(0);expect(screen.getByTitle('Page 2 of 2')).toBeTruthy();
 viewport.scrollTop=300;fireEvent.scroll(viewport);fireEvent.click(screen.getByRole('button',{name:'All'}));expect(viewport.scrollTop).toBe(0);expect(screen.getByTitle('Page 1 of 2')).toBeTruthy();
 viewport.scrollTop=250;fireEvent.scroll(viewport);fireEvent.change(screen.getByRole('searchbox',{name:'Search Collections'}),{target:{value:'Root 104'}});expect(viewport.scrollTop).toBe(0);expect(screen.getByText('1 collections')).toBeTruthy();
});
it('keeps expansion functional and clamps an invalid page after hierarchy content shrinks',()=>{
 const parent={id:'parent',name:'Parent',parentId:null};
 const view=setup([parent,...roots(105).map(c=>({...c,parentId:'parent'}))]);
 fireEvent.click(screen.getByRole('button',{name:'Hierarchy'}));expect(screen.getByText('1 visible collections')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Expand Parent'}));expect(screen.getByText('106 visible collections')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Collapse Parent'}));expect(screen.getByText('1 visible collections')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Expand Parent'}));fireEvent.click(screen.getByRole('button',{name:'Next'}));expect(screen.getByTitle('Page 2 of 2')).toBeTruthy();
 view.rerender(fixture([parent]));expect(screen.queryByLabelText('Result pages')).toBeNull();expect(document.querySelector('[data-collection-open="parent"]')).toBeTruthy();
});
