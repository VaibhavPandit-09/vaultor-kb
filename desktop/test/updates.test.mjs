import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {Updates,validateRelease,feedAddress,MAX_UPDATE_BYTES} from '../src/updates.mjs';
const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({format:'pem',type:'spki'});
function envelope(bytes=Buffer.from('test installer'),change={}){const manifest={format:1,appVersion:'0.3.0',platform:'win32',arch:'x64',filename:'Vaultor-0.3.0.exe',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),minimumProtocol:1,...change};return {manifest,signature:sign(null,Buffer.from(JSON.stringify(manifest)),keys.privateKey).toString('base64')};}
async function fixture(){const root=await mkdtemp(join(tmpdir(),'vaultor-update-test-')),workspace=join(root,'workspace'),directory=join(root,'updates');await mkdir(workspace);await writeFile(join(workspace,'app.db'),'saved notes');await mkdir(join(workspace,'host-access'));await writeFile(join(workspace,'host-access','trust.json'),'existing approvals');const updates=new Updates({workspace,directory,publicKey,currentVersion:'0.2.0',platform:'win32',arch:'x64'});await updates.load();return {root,workspace,directory,updates};}
async function local(f,release=envelope(),bytes=Buffer.from('test installer')){await writeFile(join(f.root,release.manifest.filename),bytes);const path=join(f.root,'update.vaultor.json');await writeFile(path,JSON.stringify(release));return path;}
test('release validation rejects unsigned, wrong-platform, traversal, oversize and altered manifests',()=>{
 assert.equal(validateRelease(envelope(),publicKey,'win32','x64').appVersion,'0.3.0');
 for(const changed of [{platform:'darwin'},{filename:'../evil.exe'},{size:MAX_UPDATE_BYTES+1},{minimumProtocol:2}])assert.throws(()=>validateRelease(envelope(undefined,changed),publicKey,'win32','x64'));
 const altered=envelope();altered.manifest.sha256='a'.repeat(64);assert.throws(()=>validateRelease(altered,publicKey,'win32','x64'),/signature/);
 assert.throws(()=>validateRelease({...envelope(),signature:''},publicKey,'win32','x64'));assert.throws(()=>feedAddress('http://host/update'));assert.throws(()=>feedAddress('https://user:secret@host/update'));
});
test('local import stages verified bytes, persists ready state and rejects package corruption',async()=>{
 const f=await fixture();await f.updates.importPackage(await local(f));assert.equal(f.updates.snapshot().phase,'ready');
 const reload=new Updates({...f.updates,currentVersion:'0.2.0'});await reload.load();assert.equal(reload.snapshot().phase,'ready');
 await writeFile(join(f.root,'Vaultor-0.3.0.exe'),'corrupt');await assert.rejects(f.updates.importPackage(join(f.root,'update.vaultor.json')),/checksum/);assert.equal(f.updates.snapshot().phase,'ready');
});
test('preparation saves before stopping, takes consistent backup, preserves trust and restores migration failure',async()=>{
 const f=await fixture();await f.updates.importPackage(await local(f));const order=[];
 await f.updates.prepare({barrier:async()=>order.push('save'),stop:async()=>order.push('stop')});assert.deepEqual(order,['save','stop']);
 await writeFile(join(f.workspace,'app.db'),'migration failed data');
 const result=await f.updates.restore({barrier:async()=>{},stop:async()=>{}});
 assert.equal(await readFile(join(f.workspace,'app.db'),'utf8'),'saved notes');assert.equal(await readFile(join(f.workspace,'host-access','trust.json'),'utf8'),'existing approvals');assert.equal(await readFile(join(result.preserved,'app.db'),'utf8'),'migration failed data');
});
test('failed barriers, changed staged package and damaged backup never replace workspace',async()=>{
 const f=await fixture();await f.updates.importPackage(await local(f));let stopped=false;
 await assert.rejects(f.updates.prepare({barrier:async()=>{throw new Error('Unsaved draft');},stop:async()=>{stopped=true;}}),/Unsaved/);assert.equal(stopped,false);
 await f.updates.prepare({barrier:async()=>{},stop:async()=>{}});
 await writeFile(join(f.updates.journal.backup,'workspace','app.db'),'bad backup');await assert.rejects(f.updates.restore({barrier:async()=>{},stop:async()=>{}}),/damaged/);assert.equal(await readFile(join(f.workspace,'app.db'),'utf8'),'saved notes');
 await writeFile(f.updates.candidate.file,'tampered');await assert.rejects(f.updates.prepare({barrier:async()=>{},stop:async()=>{}}),/checksum/);
});
test('optional HTTPS feed verifies manifest/download and does not send workspace credentials',async()=>{
 const f=await fixture(),bytes=Buffer.from('test installer'),release=envelope(bytes),calls=[];
 await assert.rejects(f.updates.check(),/No update feed/);await f.updates.configure('https://releases.test/windows/latest.json');
 f.updates.fetcher=async(url,options)=>{calls.push({url,options});return new Response(url.endsWith('.json')?JSON.stringify(release):bytes);};
 await f.updates.check();assert.equal(f.updates.snapshot().phase,'available');await f.updates.download();assert.equal(f.updates.snapshot().phase,'ready');assert.equal(calls[1].url,'https://releases.test/windows/Vaultor-0.3.0.exe');assert.ok(calls.every(c=>!c.options.headers&&c.options.redirect==='error'));
});
test('two managed packages retained; update confirmation waits for matching local start; remote data untouched',async()=>{
 const f=await fixture(),remote=join(f.root,'remote.db');await writeFile(remote,'remote workspace');
 for(const appVersion of ['0.3.0','0.4.0','0.5.0'])await f.updates.importPackage(await local(f,envelope(undefined,{appVersion})));
 assert.equal(f.updates.records.length,2);await f.updates.prepare({barrier:async()=>{},stop:async()=>{}});await f.updates.confirmStart();assert.equal(f.updates.journal.status,'awaiting-start');f.updates.currentVersion='0.5.0';await f.updates.confirmStart();assert.equal(f.updates.journal.status,'confirmed');assert.equal(await readFile(remote,'utf8'),'remote workspace');assert.ok((await stat(f.updates.journal.backup)).isDirectory());
});
test('recovery revalidates a retained previous installer and never hands off tampered bytes',async()=>{
 const f=await fixture();await f.updates.importPackage(await local(f,envelope(undefined,{appVersion:'0.2.0'})));
 await f.updates.importPackage(await local(f));await f.updates.prepare({barrier:async()=>{},stop:async()=>{}});
 assert.ok(f.updates.journal.previous);await writeFile(f.updates.journal.previous,'tampered installer');
 const restored=await f.updates.restore({barrier:async()=>{},stop:async()=>{}});assert.equal(restored.previous,'');
 assert.equal(await readFile(join(f.workspace,'app.db'),'utf8'),'saved notes');
});
