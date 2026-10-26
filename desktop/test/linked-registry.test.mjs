import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LinkedRegistry} from '../src/linked/registry.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const java=resolve(repository,process.platform==='darwin'?'desktop/bundle/runtime/bin/java':'desktop/bundle/runtime/bin/java.exe'),classes=resolve(repository,process.platform==='darwin'?'native/linked-markdown/build-mac':'native/linked-markdown/build');
const skip=!['win32','darwin'].includes(process.platform)||!existsSync(java)||!existsSync(join(classes,'vaultor/linked/LinkedHost.class'));
async function fixture(){
  const directory=await mkdtemp(join(repository,'native/linked-markdown/.scratch/registry-')),source=join(directory,'source'),privateDirectory=join(directory,'private');await mkdir(source);await mkdir(privateDirectory);await writeFile(join(source,'guide.md'),'# Original\n');
  let current={token:'local-token',workspace:'workspace',generation:'generation',epoch:'epoch-one',kind:'owned-local',mainFrame:true};
  const registry=new LinkedRegistry({directory:join(privateDirectory,'registry'),java,classes,protectedRoot:privateDirectory,applicationRoot:resolve(repository,'desktop'),current:()=>current,picker:async()=>({canceled:false,filePaths:[source]})});
  await registry.load(current);return {directory,source,registry,current,change:value=>{current=value;},close:()=>registry.close()};
}
test('native linked registry authorizes, pages and persists opaque source/document identity',{skip},async()=>{const f=await fixture();try{const result=await f.registry.add(f.current);assert.equal(result.outcome,'authorized');assert.equal('path' in result,false);const roots=f.registry.snapshot();assert.equal('path' in roots[0],false);const page=await f.registry.list(f.current,{source:result.root});assert.equal(page.items.length,1);assert.equal(page.items[0].name,'guide.md');const identity=page.items[0].id;await f.registry.close();await f.registry.load(f.current);assert.equal(f.registry.snapshot()[0].id,result.root);const reopened=await f.registry.list(f.current,{source:result.root});assert.equal(reopened.items[0].id,identity);}finally{await f.close();}});
test('same pathname replacement never reuses the old document identity',{skip},async()=>{const f=await fixture();try{const {root}=await f.registry.add(f.current);const before=await f.registry.list(f.current,{source:root});await writeFile(join(f.source,'replacement.md'),'New occupant');const {rename}=await import('node:fs/promises');await rename(join(f.source,'replacement.md'),join(f.source,'guide.md'));const after=await f.registry.list(f.current,{source:root});assert.notEqual(after.items[0].id,before.items[0].id);assert.equal(await readFile(join(f.source,'guide.md'),'utf8'),'New occupant');}finally{await f.close();}});
test('workspace epoch change while picker is open creates no registration',{skip},async()=>{const f=await fixture();try{f.registry.options.picker=async()=>{f.change({...f.current,epoch:'different-epoch',workspace:'different-workspace'});return {canceled:false,filePaths:[f.source]};};await assert.rejects(f.registry.add(f.current),/context|owner|epoch/i);assert.equal(f.registry.snapshot().length,0);}finally{await f.close();}});
test('disconnect revokes browse authority but keeps source content',{skip},async()=>{const f=await fixture();try{const {root}=await f.registry.add(f.current);await f.registry.disconnect(f.current,root);assert.equal(f.registry.snapshot()[0].status,'disconnected');await assert.rejects(f.registry.list(f.current,{source:root}),/DISCONNECTED/);assert.equal(await readFile(join(f.source,'guide.md'),'utf8'),'# Original\n');}finally{await f.close();}});

test('explicit selection of the same verified moved root retains logical source identity',{skip},async()=>{
 const f=await fixture();try{
  const first=await f.registry.add(f.current);const {rename}=await import('node:fs/promises');
  const moved=join(f.directory,'remounted-source');await rename(f.source,moved);
  f.registry.options.picker=async()=>({canceled:false,filePaths:[moved]});
  const selected=await f.registry.add(f.current);assert.equal(selected.root,first.root);
  assert.equal(f.registry.roots.get(first.root).path,moved);
  assert.equal(f.registry.snapshot().length,1);
  assert.equal((await f.registry.list(f.current,{source:first.root})).items[0].name,'guide.md');
 }finally{await f.close();}
});
test('host identity change during picker refuses root registration even when renderer connection token did not change',{skip},async()=>{const f=await fixture();try{f.registry.options.owner=async()=>{throw Error('LINKED_WORKSPACE_CHANGED');};await assert.rejects(f.registry.add(f.current),/WORKSPACE_CHANGED/);assert.equal(f.registry.snapshot().length,0);const metrics=await f.registry.native.call('metrics');assert.equal(Number(metrics[5]),0);}finally{await f.close();}});
test('source removal retains reference identities and private evidence without filesystem deletion',{skip},async()=>{const f=await fixture();try{const {root}=await f.registry.add(f.current),page=await f.registry.list(f.current,{source:root}),id=page.items[0].id;await f.registry.remove(f.current,root);assert.equal(f.registry.snapshot().length,0);await f.registry.close();await f.registry.load(f.current);assert.equal(f.registry.entries.get(id).name,'guide.md');assert.equal(f.registry.snapshot().length,0);assert.equal(await readFile(join(f.source,'guide.md'),'utf8'),'# Original\n');}finally{await f.close();}});


test('nested source registration refuses duplicate hierarchy while leaving original root authorized',{skip},async()=>{const f=await fixture();try{const {root}=await f.registry.add(f.current);const nested=join(f.source,'nested');await mkdir(nested);await writeFile(join(nested,'Nested.md'),'Nested');f.registry.options.picker=async()=>({canceled:false,filePaths:[nested]});await assert.rejects(f.registry.add(f.current),/OVERLAP/);assert.equal(f.registry.snapshot().length,1);assert.equal((await f.registry.list(f.current,{source:root})).items.length,2);assert.equal(Number((await f.registry.native.call('metrics'))[5]),1);}finally{await f.close();}});
