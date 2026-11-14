// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import WorkspaceBrowser from './WorkspaceBrowser';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import type {Collection} from './client';
beforeEach(()=>vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function fixture(collections:Collection[]){return <EscapeManagerProvider><WorkspaceBrowser kind="collections" collections={collections} sources={[]} revision={0} chooseCollection={()=>{}} collectionMenu={()=>{}} createCollection={()=>{}} chooseTag={()=>{}} tagChanged={()=>{}} sourcesChanged={async()=>{}} openDocument={()=>{}} sourceMenu={()=>{}} remember={()=>{}}/></EscapeManagerProvider>;}
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