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
const root=await mkdtemp(join(tmpdir(),'vaultor-file-search-native-')),profile=join(root,'profile');await mkdir(profile);
const bundle=process.env.VAULTOR_BUILD_BUNDLE??fileURLToPath(new URL('../bundle/',import.meta.url));
const owned=new OwnedServer({bundle,data:join(profile,'local-workspace')});
const report={checks:[],platform:process.platform,version:'0.7.0',fixture:root};
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
 await owned.start();
 const media=fileURLToPath(new URL('../cache/atlas/media/',import.meta.url));
 const pdf=await readFile(join(media,'paper-001.pdf'));
 async function upload(name,mime,bytes){const form=new FormData();form.set('title',name);form.set('file',new Blob([bytes],{type:mime}),name);return ok('/resources/imports/'+randomUUID(),'PUT',form);}
 const begin=performance.now();
 const text=await upload('Neutral text.txt','text/plain',Buffer.from('Chronosignal café 東京 <script>literal only</script>'));
 const paper=await upload('Neutral research.pdf','application/pdf',pdf);
 await upload('Unsupported binary.bin','application/octet-stream',Buffer.from([0,1,2]));
 await upload('Invalid PDF.pdf','application/pdf',Buffer.from('%PDF-invalid'));
 await upload('Oversized text.txt','text/plain',Buffer.alloc(4*1024*1024+1,65));
 let status;for(let n=0;n<600;n++){status=await ok('/diagnostics/search');if(status.files.queued+status.files.indexing===0)break;await sleep(100);}
 assert.equal(status.files.indexed,2);assert.equal(status.files.unsupported,1);assert.equal(status.files.invalid,1);assert.equal(status.files.limitExceeded,1);assert.equal(status.files.failed,0);
 report.indexMilliseconds=performance.now()-begin;report.coverage=status.files;
 assert.equal((await ok('/resources?q=Chronosignal&type=file')).totalItems,0);
 const hits=await ok('/resources/query?q=Chronosignal&type=file');assert.equal(hits.totalItems,1);assert.equal(hits.items[0].resource.id,text.id);assert.ok(hits.items[0].snippet.highlights.length);
 assert.equal((await ok('/resources/query?q=orbitledger001&category=pdf')).items[0].resource.id,paper.id);
 const collection=await ok('/collections','POST',{name:'Scope only',favorite:false});await ok('/organization/memberships','POST',{resourceIds:[paper.id],kind:'collection',targetId:collection.id,action:'add'});
 assert.equal((await ok('/resources/query?q=Chronosignal&collection='+collection.id)).totalItems,0);
 assert.equal((await ok('/resources/query?q=orbitledger001&collection='+collection.id)).totalItems,1);
 assert.equal((await ok('/diagnostics/search/files?size=2')).totalPages,3);
 report.checks.push('Packaged JVM extractor, scoped body search, true coverage, invalid/unsupported/byte limits and paginated status');
 await owned.stop();await owned.start();
 for(let n=0;n<200;n++){try{const hit=await request('/resources/query?q=Chronosignal');if(hit.status===200&&hit.data.totalItems===1)break;}catch{}await sleep(100);}
 assert.equal((await ok('/resources/query?q=Chronosignal')).totalItems,1);await owned.stop();
 const profiles=new Profiles(profile);await profiles.load();await profiles.ensureManaged();
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const env={...process.env,VAULTOR_DESKTOP_TEST_DIRECTORY:profile};delete env.ELECTRON_RUN_AS_NODE;
 child=spawn(fileURLToPath(new URL('../releases/win-unpacked/Vaultor.exe',import.meta.url)),[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env,windowsHide:true,stdio:'ignore'});
 let tab;for(let n=0;n<300;n++){try{tab=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page'&&t.url.startsWith('vaultor:'));if(tab)break;}catch{}await sleep(100);}assert.ok(tab);
 ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});ws.addEventListener('message',e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(new Error(r.error.message)):p.resolve(r.result);}});
 await wait("Boolean(document.querySelector('.sidebar-nav'))");await click('Library','.sidebar-nav');await wait("document.querySelectorAll('.library-row').length===5");
 await command('Emulation.setDeviceMetricsOverride',{width:1200,height:820,deviceScaleFactor:1,mobile:false});
 await click('Search options');await evaluate("document.querySelector('.library-popover input[type=checkbox]').click()");
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await evaluate("(()=>{const i=document.querySelector('[aria-label=\"Search resources\"]');i.focus();})()");await command('Input.insertText',{text:'Chronosignal'});
 await wait("document.querySelectorAll('.library-row').length===1&&document.body.innerText.includes('2 searchable')");await capture('library-file-body');
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'k',code:'KeyK',modifiers:2,windowsVirtualKeyCode:75});await wait("document.querySelector('[role=combobox]')");
 await click('Search options','[aria-label=\"Search and commands\"] button');await wait("[...document.querySelectorAll('.library-popover input[type=checkbox]')].length>0");await evaluate("[...document.querySelectorAll('input[type=checkbox]')].filter(i=>i.closest('label')?.textContent.includes('Include saved content')).at(-1).click()");
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await evaluate("document.querySelector('[role=combobox]').focus()");await command('Input.insertText',{text:'orbitledger001'});
 await wait("document.body.innerText.includes('Neutral research.pdf')&&document.querySelector('#palette-results mark')");await capture('palette-pdf-body');
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 report.checks.push('Restart reuses valid derived file text; native Library/Ctrl+K content opt-in, safe excerpts and coverage labels');
 await evaluate("window.vaultorDesktop.hostAction('stop')");await wait("(async()=>(await window.vaultorDesktop.localStatus()).value.status==='stopped')()");
 report.success=true;console.log('Focused file-search native check passed. Fixture: '+root);
}catch(e){report.failure=e.message;if(ws?.readyState===1){report.visible=await evaluate('document.body.innerText.slice(0,1200)').catch(()=>null);await capture('failure').catch(()=>{});}throw e;}
finally{await owned.stop().catch(()=>{});if(ws?.readyState===1){await evaluate("window.vaultorDesktop.hostAction('stop')").catch(()=>{});ws.close();}child?.kill();await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));}
