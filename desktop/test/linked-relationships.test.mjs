import test from 'node:test';
import assert from 'node:assert/strict';
import {linkedRelationships} from '../src/linked/relationships.mjs';
import {markdownDestination,markdownPathMatcher} from '../src/linked/path-resolution.mjs';
import {LinkedSearch} from '../src/linked/search.mjs';

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
 const decomposed='cafe\u0301/Next.md',destination=markdownDestination('cafe\u0301/Guide.md','Next.md');
 assert.equal(markdownPathMatcher([decomposed])(destination.relative),decomposed);
});
test('local graph returns backlinks, occurrences and cycles, removing changed or unavailable snapshots',()=>{
 const f=fixture(),query=(id,direction)=>linkedRelationships(f.registry,f.bodies,f.live,id,direction);
 f.bodies.get('0').links=[{href:'nested/b.md#heading',label:'B',path:'0'},{href:'nested/b.md',label:'B again',path:'40'},{href:'../outside.md',label:'No',path:'60'}];
 f.bodies.get('1').links=[{href:'../a.md',label:'A',path:'0'}];
 assert.equal(query('1','incoming').totalOccurrences,2);assert.equal(query('0','outgoing').items[0].id,'1');assert.equal(query('0','incoming').items[0].id,'1');
 f.registry.entries.get('0').modified='changed';assert.equal(query('1','incoming').totalItems,0);assert.equal(query('0','outgoing').limited,true);
 f.registry.entries.get('1').available=false;assert.equal(query('0','incoming').totalItems,0);f.registry.entries.get('1').available=true;
 f.live.delete('1');assert.equal(query('0','incoming').totalItems,0);
 f.registry.roots.get('root').enabled=false;assert.equal(query('0','outgoing').totalItems,0);
});
test('a replaced identity or duplicate basename cannot repoint an old edge',()=>{
 const f=fixture();f.bodies.get('1').links=[{href:'a.md',label:'missing sibling',path:'0'}];
 assert.equal(linkedRelationships(f.registry,f.bodies,f.live,'1','outgoing').totalItems,0);
 f.bodies.get('1').links[0].href='../a.md';f.registry.entryIndex.delete(f.registry.entryKey('root','a.md','inode0'));
 assert.equal(linkedRelationships(f.registry,f.bodies,f.live,'1','outgoing').totalItems,0);
});
test('queries ignore unrelated grants and stop before enumeration for unavailable targets',()=>{
 const f=fixture(),foreign={id:'foreign',root:'other',relative:'a.md',name:'Other',identity:'foreign',size:20,modified:'now',markdown:true};
 f.registry.roots.set('other',{enabled:true,status:'available'});f.registry.entries.set(foreign.id,foreign);f.live.add(foreign.id);f.registry.entryIndex.set(f.registry.entryKey('other','a.md','foreign'),foreign.id);
 f.bodies.set('foreign',{key:'foreign:20:now',get links(){throw Error('Unrelated source walked');}});
 assert.equal(linkedRelationships(f.registry,f.bodies,f.live,'0','incoming').limited,false);
 f.registry.entries.values=()=>{throw Error('Unavailable query enumerated');};
 assert.equal(linkedRelationships(f.registry,f.bodies,f.live,'missing','outgoing').totalItems,0);
});
test('relationship-parser refusal preserves existing content search with partial graph coverage',async()=>{
 const f=fixture(),entry=f.registry.entries.get('0');
 Object.assign(f.registry,{options:{},check:()=>{},list:async()=>({items:[entry],more:false}),grant:async()=> 'cap',native:{call:async command=>command==='open-linked'?['view','epoch',entry.identity,'hash','metadata',Buffer.from('# Searchable needle').toString('base64'),'20']:[]}});
 const search=new LinkedSearch(f.registry);search.scanner={ready:Promise.resolve(),request:async()=>{throw Error('RELATIONSHIP_SHAPE_LIMIT');},close:async()=>{}};
 await search.tick({});assert.equal(search.search({},{query:'needle',mode:'content'}).items.length,1);assert.equal(search.relationships({},{document:entry.id,direction:'outgoing',page:0}).limited,true);
});
