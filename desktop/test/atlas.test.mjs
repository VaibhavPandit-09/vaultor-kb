import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {id,note,rootGuard,defaultRoot,atomic} from '../scripts/atlas.mjs';
test('Atlas stable identities and structured graph preserve original placements',()=>{
 const ids=new Set(Array.from({length:5000},(_,n)=>id('note',n)));assert.equal(ids.size,5000);assert.notEqual(id('image',0),id('note',0));
 const first=note(0).content.content;assert.equal(first.find(n=>n.type==='resourceLink')?.type,undefined);
 const link=first.find(n=>n.type==='paragraph'&&n.content?.some(c=>c.type==='resourceLink')).content[0];assert.equal(link.attrs.resourceId,id('note',1));
 assert.equal(first.filter(n=>n.type==='image').length,3);assert.ok(JSON.stringify(first).includes('atlasbeacon0000'));assert.ok(note(22).title.length<=500);
});
test('Atlas refuses foreign roots, unmarked profiles and mismatched profile markers',async()=>{
 await assert.rejects(rootGuard('C:/not-atlas',true),/inside desktop/);
 const root=join(defaultRoot,'guard-'+randomUUID());await mkdir(join(root,'profile'),{recursive:true});await assert.rejects(rootGuard(root,true),/Unmarked profile/);
 const marked=join(defaultRoot,'guard-'+randomUUID());await rootGuard(marked,true,true);await assert.rejects(rootGuard(marked,false,false),/mismatch/);
 const path=join(marked,'state.json');await atomic(path,{checkpoint:1});await atomic(path,{checkpoint:2});assert.equal(JSON.parse(await readFile(path)).checkpoint,2);
 await writeFile(join(marked,'atlas-owner.json'),'{}');await assert.rejects(rootGuard(marked,false,true),/mismatch/);
});
