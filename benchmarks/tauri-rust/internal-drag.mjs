// Focused WebView2 mouse-pipeline diagnostic, NOT physical Windows acceptance.
// Launch the optimized app with a disposable VAULTOR_NEXT_WORKSPACE/profile and
// loopback debugging first. No personal/default workspace is admitted.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const expected=process.env.VAULTOR_DRAG_FIXTURE;
if(!expected||!/[\\/]vaultor-next-(?:internal-drag|bench)-[^\\/]+[\\/]workspace$/i.test(expected))throw Error('Explicit disposable workspace required');
const port=Number(process.env.VAULTOR_BENCH_PORT||9452);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid loopback port');
const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const socket=new WebSocket(targets.find(t=>t.type==='page'&&t.url.includes('next.html')).webSocketDebuggerUrl);
await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
let seq=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}};
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const api=request=>evaluate(`window.__TAURI_INTERNALS__.invoke('workspace',{request:${JSON.stringify(request)}})`);
const until=async predicate=>{for(let i=0;i<60;i++){if(await predicate())return;await wait(100);}throw Error('Timed out waiting for UI/commit');};
const point=selector=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing target: '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();if(!r.width||!r.height)throw Error('Hidden target');return{x:r.x+Math.min(50,r.width/2),y:r.y+r.height/2};})()`);
const click=async selector=>{const p=await point(selector);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...p});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...p});await wait(250);};
const report={kind:'WebView2 CDP mouse pipeline; not physical acceptance',timestamp:new Date().toISOString(),workspace:expected,checks:[],limitations:['Human mouse acceptance remains required.','No titlebar, pane policy, native Explorer or performance campaign.']};
const check=(workflow,result)=>{assert.ok(result,workflow);report.checks.push({workflow,pass:true});};
const drag=async(source,target,{cancel=false,selected=false,shift=false}={})=>{
 if(selected)await evaluate(`(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector(${JSON.stringify(source)}));getSelection().removeAllRanges();getSelection().addRange(r);})()`);
 await evaluate(`window.dragTrace=[];window.dragObserver=e=>dragTrace.push(e.type);for(const t of ['pointerdown','mousedown','pointermove','dragstart','pointercancel','pointerup'])document.addEventListener(t,dragObserver,true)`);
 const a=await point(source);await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...a});await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...a});
 for(const d of [1,2,3,4,5,6,10]){await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:a.x+d,y:a.y});await wait(35);}
 const started=await evaluate(`!!document.querySelector('.pointer-drag-preview')`);if(!started){report.failureTrace=await evaluate('dragTrace');await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,...a});throw Error('Drag must start');}
 const b=await point(target);for(let i=1;i<=10;i++){await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,modifiers:shift?8:0,x:a.x+(b.x-a.x)*i/10,y:a.y+(b.y-a.y)*i/10});await wait(40);}
 const feedback=await evaluate(`({state:document.elementFromPoint(${b.x},${b.y})?.closest('[data-drop-state]')?.dataset.dropState,preview:document.querySelector('.pointer-drag-preview')?.textContent})`);
 assert.equal(feedback.state,'valid','destination highlights before release');
 if(cancel){await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});}
 await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,modifiers:shift?8:0,...b});await wait(450);
 const trace=await evaluate(`(()=>{for(const t of ['pointerdown','mousedown','pointermove','dragstart','pointercancel','pointerup'])document.removeEventListener(t,dragObserver,true);return dragTrace;})()`);
 assert.ok(!trace.includes('dragstart')&&!trace.includes('pointercancel'),'native text drag must not take ownership');
 assert.equal(await evaluate(`document.querySelectorAll('.pointer-drag-preview,[data-drop-state]').length`),0,'clean final UI');
 return {starts:started,target:feedback,trace,cancel};
};
try{
 const normalize=p=>resolve(p).replace(/^\\\\\?\\/,'').toLowerCase();
 assert.equal(normalize((await api({kind:'snapshot'})).path),normalize(expected));
 const stamp=Date.now(),a=await api({kind:'createNote',title:'DnD A '+stamp,collection:null}),b=await api({kind:'createNote',title:'DnD B '+stamp,collection:null});
 const dest=await api({kind:'createCollection',name:'DnD destination '+stamp,parentId:null}),parent=await api({kind:'createCollection',name:'DnD parent '+stamp,parentId:null});
 const tag=await api({kind:'organization',request:{op:'tag',id:null,name:'DnD tag '+stamp,color:'#5887ee'}});
 const id=x=>typeof x==='string'?x:x.id;report.fixture={a:a.id,b:b.id,dest:id(dest),parent:id(parent),tag:id(tag)};
 await cdp('Page.reload');await until(()=>evaluate(`!!document.querySelector('[data-row-open="${a.id}"]')`));
 await click('#next-category-collections');
 const source=`[data-row-open="${a.id}"] strong`,destination=`.next-collection-row[data-collection-id="${id(dest)}"]`;
 report.checks.push({workflow:'resource title → collection; selected title slow threshold',...await drag(source,destination,{selected:true})});
 check('collection commit', (await api({kind:'read',id:a.id})).collections.includes(id(dest)));
 await click('#next-category-tags');await until(()=>evaluate(`!!document.querySelector('[data-tag-drop="${id(tag)}"]')`));
 report.checks.push({workflow:'resource → tag',...await drag(source,`[data-tag-drop="${id(tag)}"]`)});
 check('tag commit',JSON.stringify(await api({kind:'organization',request:{op:'assigned',ids:[a.id]}})).includes(id(tag)));
 report.checks.push({workflow:'resource → primary Pinned target',...await drag(source,'[data-pin-drop]')});
 check('pin commit',JSON.stringify(await api({kind:'organization',request:{op:'pins',query:'',kind:'all',offset:0,limit:100}})).includes(a.id));
 await click(`[data-select-resource="${a.id}"]`);
 await click(`[data-select-resource="${b.id}"]`);
 report.checks.push({workflow:'selected group → collection',...await drag(source,destination)});
 check('both selected notes belong to collection',[a,b].length===(await Promise.all([a,b].map(n=>api({kind:'read',id:n.id})))).filter(n=>n.collections.includes(id(dest))).length);
 // Escape must not apply membership; the very next real mouse click must still navigate.
 await click('#next-category-collections');
 report.checks.push({workflow:'cancel resource → other collection',...await drag(source,`.next-collection-row[data-collection-id="${id(parent)}"]`,{cancel:true})});
 check('cancel does not mutate',!(await api({kind:'read',id:a.id})).collections.includes(id(parent)));
 await click(`[data-row-open="${b.id}"]`);await until(()=>evaluate(`!!document.querySelector('.next-note[data-note-id="${b.id}"],.next-editor-pane[data-note-id="${b.id}"],[data-note-id="${b.id}"]')`));check('next click navigates after Escape',true);
 await click('#next-category-sessions');
 // A parked/visible managed Open Notes title is an independent resource source.
 report.checks.push({workflow:'Open Notes resource title → available pane',...await drag(`[data-open-session="${b.id}"] .session-title`,'[data-pane-drop="1"]')});
 check('pane source/target complete',await evaluate(`document.querySelectorAll('[data-note-id="${b.id}"]').length>=2`));
 const sessions=await evaluate(`Array.from(document.querySelectorAll('[data-session-id]')).map(e=>e.dataset.sessionId)`);assert.ok(sessions.length>=2);
 report.checks.push({workflow:'Open Notes Arrange → session order',...await drag(`[data-session-id="${sessions[1]}"] .session-arrange-handle`,`[data-session-id="${sessions[0]}"]`)});
 check('session order changed',await evaluate(`document.querySelector('[data-session-id]')?.dataset.sessionId===${JSON.stringify(sessions[1])}`));
 // Full Collections source and sidebar destination; opening browser closes no session.
 await click('[aria-label="Return to Library"]');
 await click('#next-category-collections');
 const button=await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Browse all collections')?.outerHTML`);assert.ok(button);
 await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Browse all collections').click()`);await wait(350);
 report.checks.push({workflow:'full-browser collection → collection reparent',...await drag(`.next-browser-row[data-collection-id="${id(dest)}"] [data-collection-open]`,`.next-collection-row[data-collection-id="${id(parent)}"]`)});
 check('reparent commit',(await api({kind:'snapshot'})).collections.find(c=>c.id===id(dest)).parentId===id(parent));
 await click('#next-category-shortcuts');
 const shortcut=`#next-category-panel-shortcuts [title="${a.title}"] .sidebar-shortcut-open, #next-category-panel-shortcuts .sidebar-shortcut-open[title^="${a.title} ·"]`;
 await until(()=>evaluate(`!!document.querySelector(${JSON.stringify(shortcut)})`));
 report.checks.push({workflow:'Pinned resource shortcut → full Collections row',...await drag(shortcut,`.next-browser-row[data-collection-id="${id(parent)}"]`)});
 check('shortcut drop committed',(await api({kind:'read',id:a.id})).collections.includes(id(parent)));
 await cdp('Page.reload');await wait(800);
 check('metadata survives renderer restart',(await api({kind:'read',id:a.id})).collections.includes(id(parent))&&JSON.stringify(await api({kind:'organization',request:{op:'assigned',ids:[a.id]}})).includes(id(tag))&&(await api({kind:'snapshot'})).collections.find(c=>c.id===id(dest)).parentId===id(parent)&&JSON.stringify(await api({kind:'organization',request:{op:'pins',query:'',kind:'all',offset:0,limit:100}})).includes(a.id));
 report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{socket.close();await writeFile(process.env.VAULTOR_DRAG_REPORT||'benchmarks/tauri-rust/raw/internal-drag.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
