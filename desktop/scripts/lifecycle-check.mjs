// Focused protected lifecycle/restart and native interaction check. Always owns disposable data.
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
const root=await mkdtemp(join(tmpdir(),'vaultor-lifecycle-native-')),profile=join(root,'profile');await mkdir(profile);
const bundle=process.env.VAULTOR_BUILD_BUNDLE??fileURLToPath(new URL('../bundle/',import.meta.url));
const owned=new OwnedServer({bundle,data:join(profile,'local-workspace')});
const report={checks:[],platform:process.platform,version:'0.5.0',fixture:root};
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
 const target=await ok('/resources','POST',{type:'note',title:'Lifecycle target',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Retained body'}]}]}});
 const source=await ok('/resources','POST',{type:'note',title:'Lifecycle source',content:{type:'doc',content:[{type:'paragraph',content:[{type:'resourceLink',attrs:{resourceId:target.id,label:target.title,type:'note'}}]}]}});
 assert.equal((await request('/resources/'+target.id,'DELETE')).status,405);
 assert.equal((await request('/resources/lifecycle','PUT',[item(target,'trash')],2)).status,426);
 const form=new FormData();form.append('title','cleanup.txt');form.append('file',new Blob(['Original lifecycle bytes'],{type:'text/plain'}),'cleanup.txt');
 const file=await ok('/resources/imports/'+randomUUID(),'PUT',form);
 const trash=item(file,'trash');assert.equal((await ok('/resources/lifecycle','PUT',[trash]))[0].status,'trashed');
 assert.equal((await ok('/resources/lifecycle','PUT',[trash]))[0].status,'trashed');
 const before=(await ok('/resources/trash')).items.find(r=>r.id===file.id);
 const storage=join(profile,'local-workspace','files'),binary=(await readdir(storage)).find(name=>!name.startsWith('.'));
 assert.ok(binary);const path=resolve(storage,binary);assert.ok(path.startsWith(resolve(root)+sep));
 await rename(path,path+'.held');await mkdir(path);await writeFile(join(path,'block-cleanup'),'Disposable failure');
 const purge=item(before,'purge');assert.equal((await ok('/resources/lifecycle','PUT',[purge]))[0].status,'cleanup-pending');
 await owned.stop();await owned.start();
 assert.deepEqual(await ok('/resources/'+file.id+'/lifecycle-pending'),purge);
 const pendingFile=(await ok('/resources/trash')).items.find(r=>r.id===file.id);assert.equal(pendingFile.cleanupPending,true);
 assert.equal((await ok('/resources/lifecycle','PUT',[item(pendingFile,'restore')]))[0].status,'failed');
 await rm(path,{recursive:true});await rename(path+'.held',path);
 assert.equal((await ok('/resources/lifecycle','PUT',[purge]))[0].status,'purged');assert.equal((await ok('/resources/lifecycle','PUT',[purge]))[0].status,'purged');
 assert.equal((await request('/resources/'+file.id+'/raw')).status,404);
 report.checks.push('Protocol/retired DELETE; idempotent Trash; failed binary cleanup survives real host restart; same-identity cleanup retry and purge replay');
 console.log('Lifecycle protected restart checks passed.');
 await owned.stop();const profiles=new Profiles(profile);await profiles.load();await profiles.ensureManaged();
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const env={...process.env,VAULTOR_DESKTOP_TEST_DIRECTORY:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=fileURLToPath(new URL('../releases/win-unpacked/Vaultor.exe',import.meta.url));
 child=spawn(app,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env,windowsHide:true,stdio:'ignore'});
 let tab;for(let n=0;n<300;n++){try{tab=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page'&&t.url.startsWith('vaultor:'));if(tab)break;}catch{}await sleep(100);}assert.ok(tab);
 ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});ws.addEventListener('message',e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(new Error(r.error.message)):p.resolve(r.result);}});
 await wait("Boolean(document.querySelector('.sidebar-nav'))");console.log('Lifecycle native app ready.');await click('Library','.sidebar-nav');
 await wait("document.querySelector('[aria-label=\"Actions for Lifecycle target\"]')");
 await evaluate("document.querySelector('[aria-label=\"Actions for Lifecycle target\"]').click()");await wait("document.querySelector('.library-popover')");
 await click('Rename…','.library-popover button');await wait("document.activeElement?.getAttribute('aria-label')==='Resource name'");
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait("!document.querySelector('[aria-label=\"Resource name\"]')");
 assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"),'Actions for Lifecycle target');
 await evaluate("document.querySelector('[aria-label=\"Actions for Lifecycle target\"]').click()");await wait("document.querySelector('.library-popover')");await click('Move to Trash…','.library-popover button');
 await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Move to Trash'&&!b.disabled)");await capture('trash-confirm');await click('Move to Trash');
 await wait("!document.querySelector('[role=\"dialog\"]')");await click('Trash','.sidebar-nav');await wait("document.querySelector('.library-resource')?.textContent.includes('Lifecycle target')");await capture('trash-list');
 await evaluate("document.querySelector('[aria-label=\"Actions for Lifecycle target\"]').click()");await wait("document.querySelector('.library-popover')");await click('Restore','.library-popover button');await wait("[...document.querySelectorAll('[role=\"dialog\"] button')].some(b=>b.textContent==='Restore'&&!b.disabled)");await click('Restore','[role="dialog"] button');await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Done')");await click('Done');
 await click('Library','.sidebar-nav');await wait("document.querySelectorAll('.library-resource').length===2");
 await evaluate("[...document.querySelectorAll('.library-resource')].find(b=>b.textContent.includes('Lifecycle source')).click()");await wait("document.querySelector('.tiptap .resource-link-chip')");
 await evaluate("document.querySelector('.resource-link-chip').dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}))");await wait("document.querySelectorAll('.tiptap').length===2");
 await evaluate("document.querySelector('.tiptap .resource-link-chip').click()");await wait("document.querySelectorAll('.tiptap').length===2&&[...document.querySelectorAll('.tiptap')].every(e=>e.innerText.includes('Retained body'))");
 // Use the authenticated native transport; no credentials enter renderer state or output.
 await evaluate(`(async()=>{const state=(await window.vaultorDesktop.bootstrap()).value;const call=async(path,method='GET',body)=>{const r=await window.vaultorDesktop.request({token:state.token,id:crypto.randomUUID(),path,method,timeout:10000,headers:{'Content-Type':'application/json','X-Vaultor-Protocol':'3'},body:body?{kind:'text',value:JSON.stringify(body)}:undefined});if(!r.ok)throw new Error(r.error?.message);return JSON.parse(new TextDecoder().decode(r.value.data));};const r=await call('/resources/${target.id}');return call('/resources/lifecycle','PUT',[{operationId:crypto.randomUUID(),resourceId:r.id,revision:r.revision,action:'trash'}]);})()`);
 await wait("[...document.querySelectorAll('.tiptap')].length===2&&[...document.querySelectorAll('.tiptap')].every(e=>e.getAttribute('contenteditable')==='false')");await capture('trash-shared-readonly');
 await command('Emulation.setDeviceMetricsOverride',{width:680,height:820,deviceScaleFactor:1,mobile:false});await capture('trash-narrow');
 report.checks.push('Native row actions; Rename focus/Escape restoration; Trash and Restore preserve identity; duplicate note views pause after foreign Trash; narrow layout');
 await evaluate("window.vaultorDesktop.hostAction('stop')");await wait("(async()=>(await window.vaultorDesktop.localStatus()).value.status==='stopped')()");
 report.success=true;console.log('Focused lifecycle restart/native checks passed. Fixtures: '+root);
}catch(e){report.failure=e.message;if(ws?.readyState===1){report.visible=await evaluate('document.body.innerText.slice(0,1000)').catch(()=>null);await capture('failure').catch(()=>{});}throw e;}
finally{await owned.stop().catch(()=>{});if(ws?.readyState===1){await evaluate("window.vaultorDesktop.hostAction('stop')").catch(()=>{});ws.close();}child?.kill();await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));}
