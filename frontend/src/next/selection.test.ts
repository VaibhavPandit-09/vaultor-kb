import { expect,it } from 'vitest';
import { contextSelection,emptyPageSelection,moveFocus,pickResource,retainSelection } from './selection';
const order=['a','b','c','d','e'];
it('opens ordinarily without selecting and toggles explicit selections by identity',()=>{
 let s=pickResource(emptyPageSelection(),order,'a',{});expect(s.ids).toEqual([]);expect(s.anchor).toBe('a');
 s=pickResource(s,order,'c',{ctrlKey:true});expect(s.ids).toEqual(['c']);s=pickResource(s,order,'c',{},true);expect(s.ids).toEqual([]);
});
it('extends ranges in either direction and adds Ctrl+Shift ranges',()=>{
 let s=pickResource(emptyPageSelection(),order,'c',{ctrlKey:true});s=pickResource(s,order,'a',{shiftKey:true});expect(s.ids).toEqual(['a','b','c']);expect(s.anchor).toBe('c');
 s=pickResource(s,order,'e',{ctrlKey:true,shiftKey:true});expect(new Set(s.ids)).toEqual(new Set(order));
});
it('moves focus without opening or changing selection; Shift+arrows extend a stable anchor',()=>{
 let s=retainSelection(emptyPageSelection(),order);s=moveFocus(s,order,1,{});expect(s.focus).toBe('b');expect(s.ids).toEqual([]);
 s=moveFocus(s,order,1,{shiftKey:true});expect(s.ids).toEqual(['b','c']);s=moveFocus(s,order,1,{shiftKey:true});expect(s.ids).toEqual(['b','c','d']);s=moveFocus(s,order,-1,{shiftKey:true});expect(s.ids).toEqual(['b','c']);
});
it('right-click preserves selected groups and replaces them only for an unselected target',()=>{
 const s={ids:['a','c'],anchor:'a',focus:'a'};expect(contextSelection(s,order,'c').ids).toEqual(['a','c']);expect(contextSelection(s,order,'b').ids).toEqual(['b']);
});
it('prunes vanished identities and never extends selection to unloaded rows',()=>{
 expect(retainSelection({ids:['a','gone'],anchor:'gone',focus:'gone'},order)).toEqual({ids:['a'],anchor:null,focus:'a'});
 expect(pickResource(emptyPageSelection(),order,'unloaded',{ctrlKey:true}).ids).toEqual([]);
});
