import test from 'node:test';
import assert from 'node:assert/strict';
import {linkedRelationships} from '../src/linked/relationships.mjs';
import {markdownDestination,markdownPathMatcher} from '../src/linked/path-resolution.mjs';

function fixture(){
 const entries=new Map(['a.md','nested/b.md','Space name.md','same/a.md'].map((relative,i)=>[String(i),{id:String(i),root:'root',relative,name:relative,identity:'inode'+i,size:20,modified:'now',markdown:true}]));
 const registry={entries,roots:new Map([['root',{enabled:true,status:'available'}]]),entryKey:(...parts)=>parts.join(':'),entryIndex:new Map()};
 for(const entry of entries.values())registry.entryIndex.set(registry.entryKey(entry.root,entry.relative,entry.identity),entry.id);
 const bodies=new Map([...entries.values()].map(entry=>[entry.id,{key:[entry.identity,entry.size,entry.modified].join(':'),links:[]}]));
 return {registry,bodies,live:new Set(entries.keys())};
}
test('shared path matching preserves root bounds, encoded names, fragments and unambiguous conventions',()=>{
 const match=markdownPathMatcher(['a.md','nested/b.md','Space name.md','same/a.md','guide/README.md']);
 for(const [from,href,expected] of [['nested/b.md','../a.md#heading','a.md'],['a.md','Space%20name','Space name.md'],['a.md','guide','guide/README.md'],['same/a.md','../nested/b','nested/b.md']]){
  const destination=markdownDestination(from,href);assert.equal(match(destination.relative),expected);
 }
 for(const href of ['../outside.md','%2e%2e/outside.md','https://host/a.md','//host/a.md','C:/a.md','x%5c..%5ca.md','.git/a.md','%00.md','%zz'])assert.equal(markdownDestination('a.md',href),undefined);
 assert.equal(markdownPathMatcher(['a.md','a.markdown'])('a'),undefined);
});
test('local graph returns backlinks, occurrences and cycles, removing changed or unavailable snapshots',()=>{
 const f=fixture(),query=(id,direction)=>linkedRelationships(f.registry,f.bodies,f.live,id,direction);
 f.bodies.get('0').links=[{href:'nested/b.md#heading',label:'B',path:'0'},{href:'nested/b.md',label:'B again',path:'40'},{href:'../outside.md',label:'No',path:'60'}];
 f.bodies.get('1').links=[{href:'../a.md',label:'A',path:'0'}];
 assert.equal(query('1','incoming').totalOccurrences,2);assert.equal(query('0','outgoing').items[0].id,'1');assert.equal(query('0','incoming').items[0].id,'1');
 f.registry.entries.get('0').modified='changed';assert.equal(query('1','incoming').totalItems,0);assert.equal(query('0','outgoing').limited,true);
 f.live.delete('1');assert.equal(query('0','incoming').totalItems,0);
 f.registry.roots.get('root').enabled=false;assert.equal(query('0','outgoing').totalItems,0);
});
test('a replaced identity or duplicate basename cannot repoint an old edge',()=>{
 const f=fixture();f.bodies.get('1').links=[{href:'a.md',label:'missing sibling',path:'0'}];
 assert.equal(linkedRelationships(f.registry,f.bodies,f.live,'1','outgoing').totalItems,0);
 f.bodies.get('1').links[0].href='../a.md';f.registry.entryIndex.delete(f.registry.entryKey('root','a.md','inode0'));
 assert.equal(linkedRelationships(f.registry,f.bodies,f.live,'1','outgoing').totalItems,0);
});
