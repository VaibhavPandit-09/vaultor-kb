// Explicit owner-side acceptance actions on the marked disposable fixture only.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const fixture=JSON.parse(await readFile(resolve('desktop/cache/r10/current.json')));
assert.ok(fixture.root.startsWith(resolve('desktop/cache/r10')+sep));
const marker=JSON.parse(await readFile(join(fixture.root,'report.json')));assert.equal(marker.root,fixture.root);
const address=process.env.R10_OWNER_ADDRESS;assert.match(address??'',/^http:\/\/127\.0\.0\.1:\d+$/);
const owner=await readFile(join(fixture.root,'host/host-access/owner.key'),'utf8');assert.match(owner,/^[a-f0-9]{64}$/);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,method='GET',body,workspace=fixture.atlas.id,extra={},binary=false){
  for(let n=0;n<600;n++){
    const form=body instanceof FormData;const r=await fetch(address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owner,'X-Vaultor-Workspace':workspace,...(body&&!form?{'Content-Type':'application/json'}:{}),...extra},body:body?form?body:JSON.stringify(body):undefined});
    if(r.status===409){const p=await r.clone().json();if(p.code==='WORKSPACE_BUSY'||method==='GET'&&path.startsWith('/operations/')&&p.detail==='Workspace maintenance is in progress. Retry shortly.'){await sleep(100);continue}}
    assert.ok(r.ok,`${method} ${path}: ${r.status}`);if(binary)return Buffer.from(await r.arrayBuffer());const text=await r.text();return text?JSON.parse(text):null;
  }throw Error('Maintenance did not settle');
}
const capture=join(fixture.root,'original-note.json');
if(process.argv.includes('--capture-original')){const note=await api('/resources/'+fixture.noteId);await writeFile(capture,JSON.stringify({content:note.content,revision:note.revision}));console.log('Original note content/revision captured privately');}
if(process.argv.includes('--verify-original')){const note=await api('/resources/'+fixture.noteId),before=JSON.parse(await readFile(capture));assert.deepEqual(note.content,before.content);assert.equal(note.revision,before.revision);console.log('Original note content and revision unchanged');}
if(process.argv.includes('--resolve-review')){
  const all=await api('/reviews?status=all&size=100');const rows=all.items.filter(r=>r.comment==='R6 completed offline milestone');assert.equal(rows.length,1,'Exactly one delivered offline Review required');
  const row=rows[0];await api('/reviews/'+row.id+'/status','PATCH',{generation:fixture.atlas.generation,status:'resolved'},fixture.atlas.id,{'If-Match':'"'+row.revision+'"'});
  console.log(JSON.stringify({resolvedReview:row.id,exactlyOnce:true}));
}
if(process.argv.includes('--grant-small')){
  const value=process.argv[process.argv.indexOf('--grant-small')+1];assert.ok(['true','false'].includes(value));
  for(const device of await api('/owner/devices'))if(device.name==='Vaultor Android')await api('/owner/workspaces/'+fixture.small.id+'/grants','PUT',{deviceId:device.id,allowed:value==='true'});
  console.log('Disposable Small workspace grant set to '+value);
}
if(process.argv.includes('--replace-small')){
  const prior=fixture.small.generation,workspace=fixture.small.id;
  const exported=await api('/exports','POST',{scope:'workspace',format:'zip'},workspace);
  for(let n=0;n<1200;n++){const op=await api('/operations/'+exported.id,'GET',null,workspace);if(op.status==='SUCCEEDED')break;assert.notEqual(op.status,'FAILED');await sleep(100)}
  const bytes=await api('/exports/'+exported.id+'/download','GET',null,workspace,{},true),form=new FormData();form.set('file',new Blob([bytes]),'small-replacement.zip');
  const preview=await api('/imports/preview','POST',form,workspace);await api('/imports/'+preview.operation.id+'/commit','POST',{mode:'replace',confirmation:'replace'},workspace);
  let done=false;for(let n=0;n<1200;n++){const op=await api('/operations/'+preview.operation.id,'GET',null,workspace);if(op.status==='SUCCEEDED'){done=true;break}assert.notEqual(op.status,'FAILED');await sleep(100)}assert.ok(done);
  fixture.small=await api('/workspace/identity','GET',null,workspace);assert.notEqual(fixture.small.generation,prior);
  await writeFile(resolve('desktop/cache/r10/current.json'),JSON.stringify(fixture,null,2));await writeFile(join(fixture.root,'fixture.json'),JSON.stringify(fixture,null,2));
  console.log(JSON.stringify({smallReplaced:true,priorGeneration:prior,generation:fixture.small.generation}));
}
if(process.argv.includes('--full')){
  const file=resolve(process.argv[process.argv.indexOf('--full')+1]);assert.ok(file.startsWith(resolve('desktop/cache/r10')+sep));
  const content=JSON.parse(execFileSync('tar.exe',['-xOf',file,'workspace.json'],{maxBuffer:70*1024*1024,windowsHide:true}));
  const id=randomUUID(),form=new FormData();form.set('name','R10 independent Android full copy');form.set('file',new Blob([await readFile(file)]),'android-full.zip');
  await api('/workspace-imports/'+id,'PUT',form);await api('/workspace-imports/'+id+'/commit','POST');let done=false;
  for(let n=0;n<2400;n++){const receipt=await api('/workspace-imports/'+id);if(receipt.state==='SUCCEEDED'){done=true;break}assert.notEqual(receipt.state,'FAILED');await sleep(100)}assert.ok(done);
  assert.equal((await api('/resources?size=1','GET',null,id)).totalItems,content.resources.length);
  const source=await api('/resources/'+fixture.noteId),copy=await api('/resources/'+fixture.noteId,'GET',null,id);assert.deepEqual(copy.content,source.content);
  await api('/resources/'+fixture.noteId+'/title','PATCH',{title:copy.title+' — independent copy'},id,{'If-Match':'"'+copy.revision+'"'});
  const unchanged=await api('/resources/'+fixture.noteId);assert.equal(unchanged.revision,source.revision);assert.equal(unchanged.title,source.title);
  const imported=content.resources.find(r=>r.importOriginal);assert.ok(imported,'Live converted import provenance required');
  const bytes=await api('/resources/'+imported.id+'/import-original','GET',null,id,{},true);assert.equal(createHash('sha256').update(bytes).digest('hex'),imported.importOriginal.sha256);
  console.log(JSON.stringify({fullImported:true,resources:content.resources.length,independentWorkspace:id,copyEditIsolated:true,importOriginalHashMatched:true}));
}
if(process.argv.includes('--partial')){
  const file=resolve(process.argv[process.argv.indexOf('--partial')+1]);assert.ok(file.startsWith(resolve('desktop/cache/r10')+sep));
  const readEntry=name=>execFileSync('tar.exe',['-xOf',file,name],{maxBuffer:70*1024*1024,windowsHide:true});
  const manifest=JSON.parse(readEntry('manifest.json')),content=JSON.parse(readEntry('workspace.json'));assert.equal(manifest.version,6);
  const oldFile=content.resources.find(r=>r.type==='file');assert.ok(oldFile);
  assert.match(oldFile.binary,/^files\/[a-f0-9-]{36}$/);const original=readEntry(oldFile.binary);const sha=createHash('sha256').update(original).digest('hex');assert.equal(sha,manifest.checksums[oldFile.binary]);
  const workspace=randomUUID();await api('/owner/workspaces/'+workspace,'PUT',{name:'R10 native partial roundtrip'});
  const form=new FormData();form.set('file',new Blob([await readFile(file)]),'native-partial.zip');const preview=await api('/imports/preview','POST',form,workspace);assert.ok(preview.partial);
  await api('/imports/'+preview.operation.id+'/commit','POST',{mode:'merge'},workspace);
  let done=false;for(let n=0;n<1200;n++){const op=await api('/operations/'+preview.operation.id,'GET',null,workspace);if(op.status==='SUCCEEDED'){done=true;break}assert.notEqual(op.status,'FAILED');await sleep(100)}assert.ok(done);
  const page=await api('/resources?size=100','GET',null,workspace);assert.equal(page.totalItems,content.resources.length);const imported=page.items.find(r=>r.type==='file');assert.ok(imported);
  const bytes=await api('/resources/'+imported.id+'/raw','GET',null,workspace,{},true);assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);
  console.log(JSON.stringify({partialImported:true,resources:page.totalItems,originalHashMatched:true,independentWorkspace:workspace}));
}
