// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, renderHook, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ResourceSelectionContext, selectResource, emptySelection, useResourceSelection } from './resourceSelection';
import { EscapeManagerProvider } from './escape/EscapeManagerProvider';
import type { Resource } from '../types';
vi.mock('../components/PinButton',()=>({default:()=>null}));
vi.mock('../components/ResourceActions',()=>({default:()=>null}));
vi.mock('../components/ResourceThumbnail',()=>({default:()=>null}));
import { BrowseResourceRow } from '../components/BrowseLayout';
const items=['a','b','c','d'].map(id=>({id,title:id,type:'note',tags:[],createdAt:'',updatedAt:''})) as Resource[];
afterEach(cleanup);
it('toggle, replace range and additive range follow displayed order with a stable anchor',()=>{
 let state=selectResource(emptySelection(),['a','b','c','d'],'b',true);
 state=selectResource(state,['a','b','c','d'],'d',false,true);expect(state.ids).toEqual(['b','c','d']);expect(state.anchor).toBe('b');
 state=selectResource(state,['a','b','c','d'],'a',true,true);expect(state.ids).toEqual(['b','c','d','a']);
 state=selectResource(state,['a','b','c','d'],'b',true);expect(state.ids).not.toContain('b');
 expect(selectResource(state,['a','c','d'],'missing')).toBe(state);
});
function List({view='page1',rows=items,enabled=true,onOpen=()=>{}}:{view?:string;rows?:Resource[];enabled?:boolean;onOpen?:(id:string)=>void}){
 const selection=useResourceSelection(rows,view,enabled);
 return <ResourceSelectionContext.Provider value={selection}><section aria-label="Resource list" onKeyDown={selection.onKeyDown}><input aria-label="Search"/><output>{selection.ids.join(',')}</output>{rows.map(resource=><BrowseResourceRow key={resource.id} resource={resource} onOpen={onOpen}/>)}</section></ResourceSelectionContext.Provider>;
}
it('plain click opens, modifiers/checkbox ranges select, Select All excludes text inputs, Escape clears',()=>{
 const open=vi.fn();render(<EscapeManagerProvider><List onOpen={open}/></EscapeManagerProvider>);
 fireEvent.click(screen.getByTitle('a'));expect(open).toHaveBeenCalledWith('a');
 fireEvent.click(screen.getByTitle('a'),{ctrlKey:true});fireEvent.click(screen.getByTitle('c'),{shiftKey:true});expect(screen.getByRole('status').textContent).toBe('a,b,c');expect(open).toHaveBeenCalledTimes(1);
 expect((screen.getByLabelText('Select b') as HTMLInputElement).checked).toBe(true);
 fireEvent.keyDown(screen.getByLabelText('Search'),{key:'a',ctrlKey:true});expect(screen.getByRole('status').textContent).toBe('a,b,c');
 fireEvent.keyDown(screen.getByTitle('a'),{key:'a',metaKey:true});expect(screen.getByRole('status').textContent).toBe('a,b,c,d');
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.getByRole('status').textContent).toBe('');
});
it('page/filter changes clear; same-page deletion prunes and hidden lists release selection',()=>{
 const view=render(<EscapeManagerProvider><List/></EscapeManagerProvider>);fireEvent.click(screen.getByTitle('b'),{ctrlKey:true});
 view.rerender(<EscapeManagerProvider><List rows={items.filter(item=>item.id!=='b')}/></EscapeManagerProvider>);expect(screen.getByRole('status').textContent).toBe('');
 fireEvent.click(screen.getByTitle('a'),{ctrlKey:true});view.rerender(<EscapeManagerProvider><List view="page2"/></EscapeManagerProvider>);expect(screen.getByRole('status').textContent).toBe('');
 fireEvent.click(screen.getByTitle('a'),{ctrlKey:true});view.rerender(<EscapeManagerProvider><List view="page2" enabled={false}/></EscapeManagerProvider>);expect(screen.getByRole('status').textContent).toBe('');
});
it('completion removes only completed IDs without overwriting a newer selection',()=>{
 const {result}=renderHook(()=>useResourceSelection(items,'p'),{wrapper:EscapeManagerProvider});
 act(()=>result.current.pick('a',{ctrlKey:true,metaKey:false,shiftKey:false}));const previous=result.current.remove;
 act(()=>result.current.pick('b',{ctrlKey:true,metaKey:false,shiftKey:false}));act(()=>previous(['a']));expect(result.current.ids).toEqual(['b']);
});

it('resource clipboard belongs to selected list rows and leaves text fields native',async()=>{
 const {getPlatform,configureConnection}=await import('./platform');const previous=getPlatform(),copy=vi.fn(async()=>1),read=vi.fn(async()=>null);configureConnection({profileId:'clipboard-test',kind:'local',generation:'g'},{...previous,resourceClipboard:{copy,read,consume:async()=>{}}});
 try{render(<EscapeManagerProvider><List/></EscapeManagerProvider>);fireEvent.click(screen.getByLabelText('Select a'));fireEvent.keyDown(screen.getByLabelText('Search'),{key:'c',ctrlKey:true});expect(copy).not.toHaveBeenCalled();fireEvent.keyDown(screen.getByLabelText('Select a'),{key:'c',ctrlKey:true});expect(copy).toHaveBeenCalledWith(['a'],'copy',undefined);configureConnection({profileId:'changed',kind:'local'},previous);fireEvent.keyDown(screen.getByLabelText('Select a'),{key:'c',ctrlKey:true});expect(copy).toHaveBeenCalledTimes(1);}finally{configureConnection({profileId:'browser',kind:'browser'},previous);}
});
