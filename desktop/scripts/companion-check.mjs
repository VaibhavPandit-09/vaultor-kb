import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {OwnedServer} from '../src/owned-server.mjs';

// Narrow R3 packaged check. Own generated storage only; no credential output or real workspace.
const data=await mkdtemp(join(tmpdir(),'vaultor-companion-package-'));
const host=new OwnedServer({bundle:resolve(process.argv[2]||'desktop/bundle'),data,timeout:90000});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function response(method,path,body,headers={}) {
  for(let n=0;n<100;n++) {
    const result=await fetch(host.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':host.accessKey,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...headers},body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined});
    if(result.status!==409 || !['GET','PUT'].includes(method))return result;
    const error=await result.clone().json();if(error.code!=='WORKSPACE_BUSY')return result;
    await new Promise(r=>setTimeout(r,50));
  }
  throw Error('Disposable capture did not settle');
}
async function call(method,path,body,headers={}){const r=await response(method,path,body,headers);assert.equal(r.status,200,method+' '+path+' '+await r.clone().text());return r.json();}
async function prepare(selection){const id=randomUUID();await call('PUT','/companions/'+id,selection);for(let n=0;n<200;n++){const s=await call('GET','/companions/'+id);if(s.status==='READY')return s;assert.ok(['QUEUED','RUNNING'].includes(s.status),s.detail);await new Promise(r=>setTimeout(r,50));}throw Error('Checkpoint did not become ready');}
const doc=(text,ids=[])=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text},...ids.map(resourceId=>({type:'resourceLink',attrs:{resourceId,label:'Linked fixture'}}))]}]});
try {
  await host.start();assert.equal((await call('GET','/capabilities')).companionSnapshots,1);
  const identity=await call('GET','/workspace/identity');const a=randomUUID(),b=randomUUID(),file=randomUUID();const original=Buffer.alloc(600000,37);
  const upload=new FormData();upload.set('title','Companion original.txt');upload.set('file',new Blob([original],{type:'text/plain'}),'original.txt');await call('PUT','/resources/imports/'+file,upload);
  for(const [id,title,content] of [[a,'Companion A',doc('Before capture',[b,file])],[b,'Companion B',doc('Linked cycle',[a])]]){const form=new FormData();form.set('title',title);form.set('content',JSON.stringify(content));await call('PUT','/resources/imports/'+id,form);}
  const selection={generation:identity.generation,scope:'resources',ids:[a],dependencies:'linked',files:'originals'};
  assert.equal((await call('POST','/companions/estimate',selection)).resources,3);
  const whole=await prepare({...selection,scope:'workspace',ids:[],dependencies:'none'});assert.equal(whole.resources,3);await call('DELETE','/companions/'+whole.id);
  const first=await prepare(selection),match={'If-Match':'"'+first.manifestSha256+'"'};
  const inventory=await call('GET','/companions/'+first.id+'/inventory?size=1',undefined,match);assert.equal(inventory.totalItems,3);assert.equal(inventory.totalPages,3);assert.equal(inventory.items.length,1);assert.ok(!JSON.stringify(inventory).includes('Before capture'));
  const raw=Buffer.from(await (await response('GET','/companions/'+first.id+'/payloads/manifest.json',undefined,match)).arrayBuffer());assert.equal(hash(raw),first.manifestSha256);
  const manifest=JSON.parse(raw);assert.equal(manifest.workspaceId,identity.id);const descriptor=manifest.resources.find(e=>e.id===file).binary;assert.equal(descriptor.sha256,hash(original));
  for(let n=0;n<5;n++){const chunks=[];for(const range of ['bytes=0-299999','bytes=300000-']){const r=await response('GET','/companions/'+first.id+'/payloads/'+file+'.bin',undefined,{...match,Range:range});assert.equal(r.status,206);chunks.push(Buffer.from(await r.arrayBuffer()));}assert.equal(hash(Buffer.concat(chunks)),descriptor.sha256);}
  const note=await call('GET','/resources/'+a);await call('PUT','/resources/'+a+'/note',{title:'Companion A updated',content:doc('After capture',[b,file])},{'If-Match':'"'+note.revision+'"'});
  const old=await (await response('GET','/companions/'+first.id+'/payloads/'+a+'.json',undefined,match)).text();assert.ok(old.includes('Before capture'));assert.ok(!old.includes('After capture'));
  const second=await prepare(selection);const delta=await call('GET','/companions/'+second.id+'/delta?from='+first.id,undefined,{'If-Match':'"'+second.manifestSha256+'"','X-Vaultor-Base-Manifest':match['If-Match']});assert.equal(delta.totalItems,1);assert.equal(delta.items[0].id,a);
  await call('DELETE','/companions/'+second.id);assert.equal((await call('GET','/companions/'+second.id)).status,'CANCELLED');
  await host.stop();assert.equal(host.status,'stopped');await host.start();assert.deepEqual(await call('GET','/workspace/identity'),identity);assert.equal((await call('GET','/companions/'+first.id)).manifestSha256,first.manifestSha256);
  assert.equal(hash(Buffer.from(await (await response('GET','/companions/'+first.id+'/payloads/'+file+'.bin',undefined,match)).arrayBuffer())),descriptor.sha256);
  await call('DELETE','/companions/'+first.id);await host.stop();assert.equal(host.status,'stopped');
  console.log('R3 packaged capability/cyclic selection/estimate/paging/manifest hash, five range reassemblies, immutable edit/delta/cancel/private-stop/restart passed.');
}finally{if(host.child)await host.stop();}
