import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { NativeFiles } from '../src/files.mjs';
import { DesktopTransport } from '../src/transport.mjs';
import { HostingPreferences } from '../src/hosting.mjs';

test('native saves cancel without fetching; failed writes retain destination; retry uses same endpoint', async () => {
  const root=await mkdtemp(join(tmpdir(),'vaultor-files-'));let cancelled=true,calls=0;
  const target=join(root,'note.md');await writeFile(target,'original');
  const files=new NativeFiles({directory:join(root,'cache'),owner:()=>({token:'one',profile:{address:'http://127.0.0.1:1'}}),dialogs:{save:async()=>({canceled:cancelled,filePath:target})},limit:100});
  files.response=async()=>{calls++;return new Response('replacement');};
  try{
    assert.equal((await files.download({token:'one',path:'/exports/export/download',filename:'note.md'})).outcome,'cancelled');assert.equal(calls,0);
    cancelled=false;const chunk=files.chunk.bind(files);files.chunk=async()=>{throw new Error('Disk full');};
    await assert.rejects(files.download({token:'one',path:'/exports/export/download',filename:'note.md'}),/Disk full/);
    assert.equal(await readFile(target,'utf8'),'original');assert.deepEqual(await readdir(root),['note.md']);
    files.chunk=chunk;assert.equal((await files.download({token:'one',path:'/exports/export/download',filename:'note.md'})).outcome,'saved');assert.equal(await readFile(target,'utf8'),'replacement');assert.equal(calls,2);
  }finally{await files.reset();await rm(root,{recursive:true,force:true});}
});

test('selected binaries above IPC limit stream as multipart; previews support ranges and stay bounded', async()=>{
  const root=await mkdtemp(join(tmpdir(),'vaultor-stream-'));const source=join(root,'large.csv');await writeFile(source,Buffer.alloc(33*1024*1024,65));
  let received=0,contentType='';const server=createServer(async(req,res)=>{assert.equal(req.headers['x-vaultor-owner'],'private-owner');contentType=req.headers['content-type'];for await(const data of req)received+=data.length;res.end('{}');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const owner={token:'one',ownerKey:'private-owner',profile:{address:'http://127.0.0.1:'+server.address().port}};
  const files=new NativeFiles({directory:join(root,'cache'),owner:()=>owner,dialogs:{open:async()=>({canceled:false,filePaths:[source]})}});
  try{
    const [selected]=await files.pick({token:'one'});const transport=new DesktopTransport();transport.files=files;transport.activate(owner.profile,'one',owner.ownerKey);
    const binary=await files.response('/resources/id/raw',owner.token,new AbortController().signal);await binary.arrayBuffer();received=0;
    await transport.request({token:'one',id:'upload',path:'/resources/upload',method:'POST',timeout:30000,headers:{'content-type':'multipart/form-data'},body:{kind:'multipart',parts:[{name:'file',fileId:selected.id,filename:'large.csv',type:'text/csv'}]}});
    assert.ok(received>selected.size);assert.match(contentType,/^multipart\/form-data; boundary=vaultor-/);assert.equal(transport.mutations.size,0);
    files.limit=16;files.response=async()=>new Response('abcdef',{headers:{'content-type':'application/pdf'}});
    const preview=await files.download({token:'one',path:'/resources/id/raw',filename:'file.pdf',mode:'preview'});
    const range=await files.serve(new Request(preview.url,{headers:{Range:'bytes=1-3'}}));assert.equal(range.status,206);assert.equal(await range.text(),'bcd');
    owner.token='two';assert.equal((await files.serve(new Request(preview.url))).status,404);owner.token='one';await files.release({token:'one',id:preview.id});assert.equal((await readdir(files.directory)).length,0);
    files.response=async()=>new Response('a'.repeat(17));await assert.rejects(files.download({token:'one',path:'/resources/id/raw',filename:'file.pdf',mode:'preview'}),/limit/);assert.equal((await readdir(files.directory)).length,0);
    await writeFile(source,'changed');await assert.rejects(files.selected(selected.id,'one'),/changed/);
    await assert.rejects(files.download({token:'one',path:'/resources/id/raw',filename:'program.exe',mode:'open'}),/cannot be opened/);
  }finally{await files.reset();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});

test('file dialog locks release on cancellation and reject overlapping dialogs',async()=>{
  const root=await mkdtemp(join(tmpdir(),'vaultor-dialog-'));let release;
  const files=new NativeFiles({directory:root,owner:()=>({token:'one'}),dialogs:{save:()=>new Promise(resolve=>{release=resolve;})}});
  try{const pending=files.begin({token:'one',filename:'note.md'});assert.equal(files.dialogPending,true);await assert.rejects(files.begin({token:'one',filename:'note.md'}),/dialog/);release({canceled:true});assert.equal((await pending).outcome,'cancelled');assert.equal(files.dialogPending,false);}finally{await files.reset();await rm(root,{recursive:true,force:true});}
});

test('login is opt-in, persisted, OS denial visible and failed persistence rolls registration back',async()=>{
  const root=await mkdtemp(join(tmpdir(),'vaultor-login-'));let enabled=false,denied=false,registrations=0;
  const app={getLoginItemSettings:()=>({openAtLogin:enabled,executableWillLaunchAtLogin:enabled&&!denied}),setLoginItemSettings:value=>{registrations++;enabled=value.openAtLogin;}};
  try{
    const preferences=new HostingPreferences({directory:root,app,executable:'test'});await preferences.load();assert.equal(registrations,0);assert.equal(preferences.snapshot().startAtLogin,false);
    await preferences.setLogin(true);const next=new HostingPreferences({directory:root,app,executable:'test'});await next.load();assert.equal(next.snapshot().registered,true);
    denied=true;assert.match(next.snapshot().error,/OS/);await assert.rejects(next.setLogin(true),/OS/);denied=false;
    await mkdir(join(root,'hosting.json.tmp'));await assert.rejects(preferences.setLogin(false),/previous registration/);assert.equal(enabled,true);
  }finally{await rm(root,{recursive:true,force:true});}
});
