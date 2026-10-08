// Focused protected discovery/reference and native interaction check. Always owns disposable data.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {OwnedServer} from '../src/owned-server.mjs';
import {Profiles} from '../src/profiles.mjs';
const root=await mkdtemp(join(tmpdir(),'vaultor-discovery-native-')),profile=join(root,'profile');await mkdir(profile);
const bundle=process.env.VAULTOR_BUILD_BUNDLE??fileURLToPath(new URL('../bundle/',import.meta.url));
const owned=new OwnedServer({bundle,data:join(profile,'local-workspace')});
const report={checks:[],platform:process.platform,version:'0.6.0',fixture:root};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(path,method='GET',body,protocol=3){for(let n=0;n<100;n++){
 const form=body instanceof FormData;
 const response=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,'X-Vaultor-Protocol':String(protocol),'X-Request-ID':randomUUID(),...(!form&&body?{'Content-Type':'application/json'}:{})},body:body?(form?body:JSON.stringify(body)):undefined});
 const text=await response.text(),data=text?JSON.parse(text):null;
 if(response.status===409&&data?.code==='WORKSPACE_BUSY'){await sleep(100);continue;}
 return {status:response.status,data};
}throw new Error('Disposable workspace remained busy');}
async function ok(...args){const r=await request(...args);assert.ok(r.status<300,'Fixture request failed: '+args[0]+' '+r.status);return r.data;}
const item=(r,action)=>({operationId:randomUUID(),resourceId:r.id,action,revision:r.revision});
let child,ws,seq=0;const pending=new Map();
async function command(method,params={}){if(ws?.readyState!==1)throw new Error('Native test window closed');return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout'));},20000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result?.value;}
async function wait(code){for(let n=0;n<300;n++){if(ws?.readyState!==1||child?.exitCode!==null)throw new Error('Native test app exited');if(await evaluate(`(async()=>Boolean(await (${code})))()`).catch(()=>false))return;await sleep(100);}throw new Error('Native lifecycle condition failed: '+code);}
async function capture(name){await sleep(250);await writeFile(join(root,name+'.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));}
async function click(label,selector='button'){await evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw new Error('Missing button');b.click();})()`);}
try{
 await owned.start();assert.equal((await ok('/capabilities')).minimumClientProtocolVersion,3);
 const media=fileURLToPath(new URL('../cache/atlas/media/',import.meta.url));const imagePath=(await readdir(media)).find(p=>p.endsWith('.png'));assert.ok(imagePath,'Generate Atlas media first');const original=await readFile(join(media,imagePath));
 async function upload(title,mime,bytes){const form=new FormData();form.append('title',title);form.append('file',new Blob([bytes],{type:mime}),title);return ok('/resources/imports/'+randomUUID(),'PUT',form);}
 const image=await upload('Discovery image.png','image/png',original),pdf=await upload('Discovery PDF.pdf','application/pdf',Buffer.from('%PDF-1.4\nFixture')),audio=await upload('Discovery audio.wav','audio/wav',Buffer.from('RIFF1234WAVEfixture')),video=await upload('Discovery video.mp4','video/mp4',Buffer.from('0000ftypisomfixture')),text=await upload('Discovery text.txt','text/plain',Buffer.from('Saved fixture text')),other=await upload('Discovery binary.bin','application/octet-stream',Buffer.from([0,1,2,3]));
 const target=await ok('/resources','POST',{type:'note',title:'Discovery destination',content:{type:'doc',content:[]}});
 const source=await ok('/resources','POST',{type:'note',title:'Discovery source — a long title with repeated images and independent saved links',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'References remain saved-only. '},{type:'resourceLink',attrs:{resourceId:image.id,label:'Saved image label',type:'file'}},{type:'resourceLink',attrs:{resourceId:target.id,label:'Linked note',type:'note'}}]},{type:'image',attrs:{resourceId:image.id,caption:'Atlas original · first placement',alt:'Atlas generated image',width:40,alignment:'center'}},{type:'image',attrs:{resourceId:image.id,caption:'Second placement',width:20,alignment:'left'}},{type:'paragraph',content:[]}]}});
 const collection=await ok('/collections','POST',{name:'Discovery collection',favorite:true});await ok('/organization/memberships','POST',{resourceIds:[image.id,source.id],kind:'collection',targetId:collection.id,action:'add'});
 for(const r of [image,pdf,source])await ok('/resources/'+r.id+'/favorite','PUT',{favorite:true});
 for(const category of ['image','pdf','audio','video','text','other']){const p=await ok('/resources?type=file&category='+category+'&size=1');assert.equal(p.totalItems,1);assert.equal(p.appliedCategory,category);}
 assert.equal((await ok('/organization/pins?kind=file&category=image')).totalItems,1);assert.equal((await ok('/resources?category=image&collection='+collection.id)).totalItems,1);
 const refs=await ok('/resources/'+image.id+'/references');assert.equal(refs.totalItems,1);assert.equal(refs.totalOccurrences,3);assert.equal(refs.items[0].images,2);assert.equal((await ok('/resources/'+source.id+'/references?direction=outgoing')).totalItems,2);
 const thumb=await fetch(owned.address+'/api/resources/'+image.id+'/thumbnail',{headers:{'X-Vaultor-Owner':owned.accessKey,'X-Vaultor-Protocol':'3'}});assert.equal(thumb.status,200);assert.equal(thumb.headers.get('content-type'),'image/png');assert.ok((await thumb.arrayBuffer()).byteLength<=384*1024);
 report.checks.push('Protected category counts/filter echoes/pins/collection intersections, paginated saved-reference counts and bounded PNG');
 await owned.stop();const profiles=new Profiles(profile);await profiles.load();await profiles.ensureManaged();
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const env={...process.env,VAULTOR_DESKTOP_TEST_DIRECTORY:profile};delete env.ELECTRON_RUN_AS_NODE;
 child=spawn(fileURLToPath(new URL('../releases/win-unpacked/Vaultor.exe',import.meta.url)),[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env,windowsHide:true,stdio:'ignore'});
 let tab;for(let n=0;n<300;n++){try{tab=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page'&&t.url.startsWith('vaultor:'));if(tab)break;}catch{}await sleep(100);}assert.ok(tab);ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});ws.addEventListener('message',e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(new Error(r.error.message)):p.resolve(r.result);}});
 await wait("Boolean(document.querySelector('.sidebar-nav'))");await click('Library','.sidebar-nav');await wait("document.querySelectorAll('.library-row').length===8");await wait("document.querySelector('.resource-thumbnail img')?.complete");
 await command('Emulation.setDeviceMetricsOverride',{width:1200,height:820,deviceScaleFactor:1,mobile:false});
 for(const theme of (process.argv.includes('--final')?[]:['light','dark','oled','os'])){await evaluate(`(()=>{document.documentElement.dataset.theme='${theme}';document.documentElement.classList.toggle('dark','${theme}'!=='light');})()`);await capture('mixed-'+theme);}
 await evaluate("document.querySelector('[aria-label=\"Filter resource type\"]').click()");await click('Images','.type-filter-option');await wait("document.querySelectorAll('.library-row').length===1&&document.body.innerText.includes('Image · PNG')");await capture('images-filter');
 await evaluate("document.querySelector('.library-view [aria-label=\"Actions for Discovery image.png\"]').click()");await wait("document.querySelector('.library-popover')");await click('Used in / links…','.library-popover button');await wait("document.querySelector('.reference-view')?.innerText.includes('3 occurrences')");await sleep(100);assert.equal(await evaluate("Boolean(document.activeElement?.closest('.reference-view'))"),true,'Reference dialog owns keyboard focus');await capture('used-in');
 await evaluate("document.querySelector('.reference-row details').open=true");await evaluate("document.querySelector('.reference-occurrence').click()");await wait("document.querySelector('.tiptap')&&document.querySelector('.ProseMirror-selectednode')");await capture('source-occurrence');
 const before=await evaluate("document.querySelector('.tiptap').innerText");assert.ok(before.includes('References remain'));
 await click('References');await wait("document.querySelector('.reference-view')");await click('Links out');await wait("document.querySelector('.reference-view')?.innerText.includes('2 destinations')");
 await command('Emulation.setDeviceMetricsOverride',{width:680,height:820,deviceScaleFactor:1,mobile:false});await capture('references-narrow');
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait("!document.querySelector('.reference-view')");
 report.checks.push('Native mixed lists/Images filter/lazy thumbnail, row Used in, exact selected source occurrence, note-header Links out and Escape; four theme frames and 680px layout');
 await evaluate("window.vaultorDesktop.hostAction('stop')");await wait("(async()=>(await window.vaultorDesktop.localStatus()).value.status==='stopped')()");report.success=true;console.log('Focused discovery/native check passed. Fixture: '+root);
}catch(e){report.failure=e.message;if(ws?.readyState===1){report.visible=await evaluate('document.body.innerText.slice(0,1200)').catch(()=>null);await capture('failure').catch(()=>{});}throw e;}
finally{await owned.stop().catch(()=>{});if(ws?.readyState===1){await evaluate("window.vaultorDesktop.hostAction('stop')").catch(()=>{});ws.close();}child?.kill();await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));}
