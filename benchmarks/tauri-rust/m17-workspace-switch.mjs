import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,basename,dirname,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
// Supplement the existing runner's explicitly held disposable native window.
const target=(await(await fetch('http://127.0.0.1:9432/json/list')).json()).find(t=>t.type==='page');
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);
let id=0;const pending=new Map();socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(expression,label,attempts=600)=>{for(let i=0;i<attempts;i++){if(await evaluate(`Promise.resolve(${expression}).then(Boolean)`))return;await pause(50);}throw Error('Timed out: '+label);};
const command=request=>evaluate('window.__TAURI_INTERNALS__.invoke("workspace",{request:'+JSON.stringify(request)+'})');
const button=async label=>{await evaluate('(()=>{const b=[...document.querySelectorAll("button")].find(b=>!b.disabled&&!b.closest("[hidden]")&&b.getClientRects().length&&(b.getAttribute("aria-label")==='+JSON.stringify(label)+'||b.textContent.trim()==='+JSON.stringify(label)+'));if(!b)throw Error("Missing '+label+'");b.click();})()');await pause(400);};
const result={sourceCommit:process.env.VAULTOR_BENCH_SOURCE_COMMIT,checks:[],limitations:['CDP scripted input plus Windows SendInput native picker;not physical keyboard qualification.']};
let folder;
try{
 await cdp('Emulation.setDeviceMetricsOverride',{width:1800,height:1000,deviceScaleFactor:1,mobile:false});
 const root=(await command({kind:'snapshot'})).path,plain=root.charCodeAt(2)===63?root.slice(4):root;
 assert(resolve(plain).toLowerCase().startsWith((resolve(tmpdir())+sep).toLowerCase())&&basename(dirname(plain)).startsWith('vaultor-next-bench-')&&basename(plain)==='workspace','Refusing mutation outside an explicitly disposable runner fixture');
 folder=root.slice(0,root.lastIndexOf('\\'));
 result.root=root;const before=await command({kind:'snapshot'});result.before=before.settings.session;
 while(await evaluate('document.querySelectorAll(".tiptap").length<3'))await button('Split active note');await wait('document.querySelectorAll(".tiptap").length===3','three views');
 await evaluate('document.querySelector(\'[role="tab"][aria-label="Linked sources"]\').click();true');await pause(400);if(await evaluate(`Boolean(document.querySelector('[aria-label="Expand linked"]'))`))await button('Expand linked');await wait('document.querySelector('+JSON.stringify('[data-linked-path="reference.md"]')+')','linked file');await evaluate('document.querySelector(\'[data-linked-path="reference.md"]\').click();true');await pause(300);if(await evaluate('document.querySelector("[role=dialog]")?.textContent.includes("Recover linked Markdown draft")'))await button('Restore linked draft');await wait('document.querySelector(".next-linked-pane .tiptap")','third linked editor');assert.equal(await evaluate('document.querySelectorAll(".tiptap").length'),3);
 const sources=await command({kind:'linked',request:{op:'sources'}}),sourcePath=join(sources[0].path,'reference.md');const source=await readFile(sourcePath,'utf8');result.originalSource=source;
 await evaluate('document.querySelector(".next-linked-pane .tiptap").editor.commands.focus("end");true');await wait('document.activeElement===document.querySelector(".next-linked-pane .tiptap")','linked typing focus');await cdp('Input.insertText',{text:' M17 protected linked draft '});
 const managed=await evaluate('document.querySelector(".next-pane:not(.next-linked-pane)").dataset.noteId');await evaluate('document.querySelector(".next-pane:not(.next-linked-pane) .tiptap").editor.commands.focus("end");window.m17MixedOld=[...document.querySelectorAll(".tiptap")].map(e=>e.editor);true');await wait('document.activeElement===document.querySelector(".next-pane:not(.next-linked-pane) .tiptap")','managed typing focus');result.focusBeforeManaged=await evaluate('document.activeElement.getAttribute("aria-label")');await cdp('Input.insertText',{text:' M17 pending managed mixed switch '});await wait('document.querySelector(".next-pane:not(.next-linked-pane) .tiptap").textContent.includes("M17 pending managed mixed switch")','managed edit target');
 const other=join(folder,'workspace-mixed');await mkdir(other,{recursive:true});
 const switchUI=async path=>{const name=path.charCodeAt(2)===63?path.slice(4):path;await button('Open workspace');console.log('M17 mixed native picker: '+name);await wait('(async()=>(await window.__TAURI_INTERNALS__.invoke("workspace",{request:{kind:"snapshot"}})).path.endsWith('+JSON.stringify(name)+'))()','native picker switch',3600);await wait('document.querySelector("[data-session-ready=true]")','root restored');};
 await switchUI(other);assert(await evaluate('m17MixedOld.every(e=>e.isDestroyed)'));assert.equal(await readFile(sourcePath,'utf8'),source);
 const competing='# Reference\n\nCompeting external revision during workspace switch. '+Date.now()+'\n';await writeFile(sourcePath,competing);
 await switchUI(root);assert.equal(await readFile(sourcePath,'utf8'),competing);assert(JSON.stringify((await command({kind:'read',id:managed})).content).includes('M17 pending managed mixed switch'));
 const drafts=await command({kind:'linked',request:{op:'drafts'}});assert.equal(drafts.length,1);result.drafts=drafts;
 const recovered=await command({kind:'linked',request:{op:'recover',id:drafts[0].id}});assert(JSON.stringify(recovered.content).includes('M17 protected linked draft'));result.recovery={draftMarker:true,current:recovered.current};
 assert.equal(await evaluate('document.querySelectorAll(".next-linked-pane").length'),0,'Protected linked draft must await review');
 result.checks.push('Mixed three-pane workspace switch protects pending managed content and linked draft,destroys old views,does not publish source,restores managed peers and defers linked view to Recovery.');
 await button('Recovery (1)');await button('reference.md');await wait('document.querySelector("[role=dialog]")?.textContent.includes("Recover linked Markdown draft")','recovery review');await button('Restore linked draft');await wait('document.querySelector(".next-linked-pane .tiptap")?.textContent.includes("M17 protected linked draft")','restore protected linked editor');await button('Save linked Markdown');await pause(700);assert.equal(await readFile(sourcePath,'utf8'),competing);assert((await command({kind:'linked',request:{op:'drafts'}})).length===1);
 result.saveRefusal=await evaluate('[...document.querySelectorAll("[role=alert]")].map(e=>e.textContent)');result.checks.push('Restored linked draft remains explicit Save;Save refuses an unrepresentable edit before publication and retains the draft plus competing source bytes. This case does not independently qualify the revision-conflict rejection path.');
 result.after=(await command({kind:'snapshot'})).settings.session;result.success=true;
}catch(error){process.exitCode=1;result.success=false;result.error=error.stack;result.ui=await evaluate('({text:document.body.innerText.slice(-1600),alerts:[...document.querySelectorAll("[role=alert]")].map(e=>e.textContent)})').catch(()=>null);}
finally{await writeFile('benchmarks/tauri-rust/raw/m17-mixed-workspace.json',JSON.stringify(result,null,2));console.log(JSON.stringify({success:result.success,error:result.error,checks:result.checks,folder}));socket.close();}
