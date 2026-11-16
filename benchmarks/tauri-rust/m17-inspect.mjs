import assert from 'node:assert/strict';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

// Existing native CDP runner; real optimized UI/domain, disposable storage.
export async function qualifyM17({evaluate,cdp,wait,report,output,folder,record,processSnapshot,restart,architecture}){
 if(architecture==='electron-java')return referenceM17({evaluate,cdp,wait,report,output});
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const command=request=>evaluate('window.__TAURI_INTERNALS__.invoke("workspace",{request:'+JSON.stringify(request)+'})');
 const click=async expression=>{
  await wait('Boolean('+expression+')','click target ready');
  await evaluate('(()=>{const e='+expression+';if(!e)throw Error("Missing target");e.scrollIntoView({block:"nearest",inline:"nearest"});})()');await pause(400);
  const point=await evaluate('(()=>{const e='+expression+';if(!e)throw Error("Missing target");const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(!hit||!e.contains(hit))throw Error("Click target covered: "+e.outerHTML.slice(0,180));return{x,y};})()');
  (report.m17Clicks??=[]).push({expression,point,before:await evaluate('({focus:document.activeElement?.outerHTML.slice(0,180),hit:document.elementFromPoint('+point.x+','+point.y+')?.outerHTML.slice(0,180)})')});await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});await pause(180);if(!expression.includes('Open workspace'))await wait('document.querySelector(".next-sidebar-create")?.disabled===false','UI operation settled');report.m17Clicks.at(-1).after=await evaluate('({focus:document.activeElement?.outerHTML.slice(0,180),hit:document.elementFromPoint('+point.x+','+point.y+')?.outerHTML.slice(0,180)})');
 };
 const button=label=>click('[...document.querySelectorAll("button")].find(b=>!b.disabled&&b.getClientRects().length&&!b.closest("[hidden]")&&(b.getAttribute("aria-label")==='+JSON.stringify(label)+'||b.title==='+JSON.stringify(label)+'||b.textContent.trim()==='+JSON.stringify(label)+'))');
 const key=async(key,code,modifiers=0,vk=0)=>{await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,windowsVirtualKeyCode:vk});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk});};
 const shot=async name=>{await pause(400);const r=await cdp('Page.captureScreenshot');await writeFile(join(output,'m17-next-'+name+'.png'),Buffer.from(r.data,'base64'));};
 const motion=async(name,action)=>{
  await evaluate('window.m17Frames=[];window.m17Motion=new Promise(resolve=>{const end=performance.now()+650;function frame(t){m17Frames.push({t,slots:[...document.querySelectorAll(".workspace-pane-slot")].filter(e=>!e.hidden).map(e=>({id:e.dataset.slotId,x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width})),editors:document.querySelectorAll(".tiptap").length});if(performance.now()<end)requestAnimationFrame(frame);else resolve(m17Frames);}requestAnimationFrame(frame);});true');await action();(report.m17Motion??={})[name]=await evaluate('m17Motion');
 };
 const measure=process.argv.includes('--measure-m17');
 const memory=async name=>{
  if(!measure)return;await pause(5000);const first=await processSnapshot();await pause(10000);const last=await processSnapshot();const heap=await cdp('Runtime.getHeapUsage');(report.m17Performance??={})[name]={first,last,heap};
  const sum=(rows,key)=>rows.reduce((n,p)=>n+p[key],0),seconds=(Date.parse(last.timestamp)-Date.parse(first.timestamp))/1000;
  record('m17-'+name,1,'cpu_one_core_percent',100*(sum(last.processes,'cpuSeconds')-sum(first.processes,'cpuSeconds'))/seconds,'%','10s untouched interval after5s settling;CIM sampling overhead;no renderer polling or forced GC.');
  for(const role of [...new Set(last.processes.map(p=>p.role))])for(const field of ['workingSet','privateBytes','privateWorkingSet'])record('m17-'+name,1,role+'_'+field,sum(last.processes.filter(p=>p.role===role),field)/1048576,'MiB','Owned process tree only;working sets can share pages.');
  record('m17-'+name,1,'js_heap_used',heap.usedSize/1048576,'MiB','CDP heap;no forced collection.');
 };
 await cdp('Emulation.setDeviceMetricsOverride',{width:1800,height:1000,deviceScaleFactor:1,mobile:false});
 await memory('fresh-startup');
 const root=(await command({kind:'snapshot'})).path;
 const ids=[];for(const title of ['M17 A','M17 B','M17 C']){const n=await command({kind:'createNote',title,collection:null});await command({kind:'save',id:n.id,title,revision:n.revision,content:{type:'doc',content:Array.from({length:50},(_,i)=>({type:'paragraph',content:[{type:'text',text:title+' paragraph '+i+'. '+'Reading, editing and organizing knowledge. '.repeat(5)}]}))}});ids.push(n.id);}
 report.dataset=createHash('sha256').update('m17-3-managed-notes-50-paragraphs-each-1800x1000-dpr1-v1').digest('hex');report.m17Fixture={ids,root,paragraphs:50,width:1800,height:1000,dpr:1};
 await command({kind:'behavior',path:root,value:{maxVisiblePanes:3}});await cdp('Page.reload');await pause(800);await wait('document.querySelector("[data-session-ready=true]")','fixture ready');
 const open=async i=>{if(process.argv.includes('--m17-surfaces-only')){await wait('document.querySelector(".next-sidebar-create")?.disabled===false','open barrier ready');await evaluate('document.querySelector('+JSON.stringify('[data-row-open="'+ids[i]+'"]')+').click();true');await wait('Boolean(document.querySelector('+JSON.stringify('[data-note-id="'+ids[i]+'"] .tiptap')+'))','surface note mounted');return;}await evaluate('document.querySelector('+JSON.stringify('[data-row-open="'+ids[i]+'"]')+').focus();true');await key('Enter','Enter',0,13);await pause(180);};
 if(!process.argv.includes('--m17-surfaces-only')){
 await open(0);await wait('document.querySelectorAll(".tiptap").length===1','one pane');await memory('one-pane');
 await motion('one-to-two',()=>button('Split active note'));await wait('document.querySelectorAll(".tiptap").length===2','two panes');await memory('two-same');
 await motion('two-to-three',()=>button('Split active note'));await wait('document.querySelectorAll(".tiptap").length===3','three panes');await memory('three-same');
 report.m17Redo=[];
 for(let iteration=0;iteration<6;iteration++){
  const target=iteration%3,undo=(target+1)%3,redo=(target+2)%3,marker=' M17 redo '+iteration+' ';
  await evaluate('document.querySelectorAll(".tiptap")['+target+'].editor.commands.focus("end");true');await wait('document.activeElement===document.querySelectorAll(".tiptap")['+target+']','typing owner');await cdp('Input.insertText',{text:marker});await wait('[...document.querySelectorAll(".tiptap")].every(e=>e.textContent.includes('+JSON.stringify(marker)+'))','shared insert');
  // Stop history grouping without changing content or persistence ownership.
  await pause(600);await click('document.querySelectorAll(".tiptap")['+undo+'].querySelector("p")');
  const before=await evaluate('({focus:[...document.querySelectorAll(".tiptap")].indexOf(document.activeElement),editors:[...document.querySelectorAll(".tiptap")].map(e=>({undo:e.editor.can().undo(),redo:e.editor.can().redo(),selection:e.editor.state.selection.from,destroyed:e.editor.isDestroyed}))})');assert.equal(before.focus,undo,'Undo focus');
  await key('z','KeyZ',2,90);await wait('[...document.querySelectorAll(".tiptap")].every(e=>!e.textContent.includes('+JSON.stringify(marker)+'))','shared Undo');
  await click('document.querySelectorAll(".tiptap")['+redo+'].querySelector("p")');const afterUndo=await evaluate('({focus:[...document.querySelectorAll(".tiptap")].indexOf(document.activeElement),redo:[...document.querySelectorAll(".tiptap")].map(e=>e.editor.can().redo())})');report.m17RedoPending={iteration,target,undo,redo,before,afterUndo};assert.equal(afterUndo.focus,redo);assert(afterUndo.redo.every(Boolean));
  await key('y','KeyY',2,89);await wait('[...document.querySelectorAll(".tiptap")].every(e=>e.textContent.includes('+JSON.stringify(marker)+'))','shared Redo');report.m17Redo.push({iteration,target,undo,redo,before,afterUndo});
 }
 report.checks.push('Six native three-view shared editing/Undo/Redo cycles,rotating editing/Undo/Redo owners;hit-tested clicks and focused-editor/canRedo diagnostics. M16 unfocused timeout is retained,not proven fixed.');
 await wait('[...document.querySelectorAll("[data-save-status]")].every(e=>e.dataset.saveStatus==="saved")','shared autosave');
 await shot('three-shared');
 for(const i of [1,2]){
  await evaluate('document.querySelectorAll(".tiptap")['+i+'].editor.chain().focus("start").insertContent({type:"resourceLink",attrs:{resourceId:'+JSON.stringify(ids[i])+',label:'+JSON.stringify('M17 '+String.fromCharCode(65+i))+',type:"note"}}).run();true');await pause(350);
  await click('[...document.querySelectorAll(".tiptap")['+i+'].querySelectorAll(".resource-link-chip")].find(e=>e.textContent.includes('+JSON.stringify('M17 '+String.fromCharCode(65+i))+'))');await wait('document.querySelectorAll(".tiptap")['+i+']?.textContent.includes('+JSON.stringify('M17 '+String.fromCharCode(65+i)+' paragraph')+')','independent journey');
 }
 await memory('three-distinct');await shot('three-distinct');
 await evaluate('window.m17OldEditors=[...document.querySelectorAll(".tiptap")].map(e=>e.editor);document.querySelectorAll(".tiptap")[2].editor.commands.focus("end");true');await cdp('Input.insertText',{text:' M17 pending workspace switch '});
 if(!process.argv.includes('--m17-performance-only')&&!process.argv.includes('--m17-skip-switch')){
 const other=join(folder,'workspace-b');await mkdir(other);
 const switchUI=async path=>{const target=path.charCodeAt(2)===63?path.slice(4):path;await button('Open workspace');console.log('M17 native workspace picker: '+target);let switched=false;for(let i=0;i<180;i++){const snap=await command({kind:'snapshot'});if(snap.path.endsWith(target)){(report.m17SwitchSnapshots??=[]).push(snap);switched=true;break;}await pause(1000);}assert(switched,'Native workspace picker did not switch root');await wait('document.querySelector("[data-session-ready=true]")','switched root ready');};
 await switchUI(other);assert(await evaluate('m17OldEditors.every(e=>e.isDestroyed)'));assert.equal(await evaluate('document.querySelectorAll(".tiptap").length'),0);const b=await command({kind:'createNote',title:'Workspace B only',collection:null});await switchUI(root);
 const saved=await command({kind:'read',id:ids[2]});assert(JSON.stringify(saved.content).includes('M17 pending workspace switch'));await wait('document.querySelectorAll(".tiptap").length===3','three restored after switch');assert(!(await command({kind:'list',collection:null,limit:100})).items.some(n=>n.id===b.id));
 report.checks.push('Three pending managed views switch through actual Open workspace handler/protection barrier,save old content,destroy old editors,keep new root isolated,and restore three views on return. Directory selection uses Windows native picker with injected keyboard input,not physical keyboard acceptance.');
 await wait('[...document.querySelectorAll("[data-save-status]")].every(e=>e.dataset.saveStatus==="saved")','before restart');await pause(500);await restart();await wait('document.querySelectorAll(".tiptap").length===3','three restored on restart');
 await cdp('Emulation.setDeviceMetricsOverride',{width:1800,height:1000,deviceScaleFactor:1,mobile:false});
 report.checks.push('Restart restores three populated views after workspace round trip.');
 }
 // Controlled return endpoint: same viewport,one editor,no previews,settings or forced GC.
 for(let cycle=0;cycle<2;cycle++){
  for(let i=0;i<6;i++){await button('Return to Library');await open(i%3);await wait('document.querySelector(".tiptap")','navigation churn');await button('Split active note');await wait('document.querySelectorAll(".tiptap").length===2','churn split');await click('document.querySelectorAll('+JSON.stringify('[aria-label="Close pane"]')+')[1]');await wait('document.querySelectorAll(".tiptap").length===1','churn close');}
  for(let i=0;i<4;i++){await button('Settings');await wait('document.querySelector(".settings-window")','settings open');await key('Escape','Escape',0,27);}
  await button('Return to Library');await open(0);await wait('document.querySelectorAll(".tiptap").length===1','known endpoint');await memory('returned-one-cycle-'+cycle);
 }
 report.m17Endpoint=await evaluate('({editors:document.querySelectorAll(".tiptap").length,portals:document.querySelectorAll(".library-popover,[role=dialog],[role=menu]").length,ghosts:document.querySelectorAll("[data-motion-ghost]").length,nodes:document.querySelectorAll("*").length})');assert.equal(report.m17Endpoint.portals,0);
 if(process.argv.includes('--m17-performance-only'))return;
 }else{for(const i of [1,2,0]){await open(i);await wait('document.querySelector(".tiptap")','surface fixture note');if(i!==0)await button('Return to Library');}}

 await evaluate('document.querySelector(".tiptap").editor.commands.setContent('+JSON.stringify({type:'doc',content:Array.from({length:50},(_,i)=>({type:'paragraph',content:[{type:'text',text:'M17 A paragraph '+i+'. '+'Reading, editing and organizing knowledge. '.repeat(5)}]}))})+');true');
 await wait('[...document.querySelectorAll("[data-save-status]")].every(e=>e.dataset.saveStatus==="saved")','comparison document restored');
 // Populated browser fixtures,kept outside the controlled memory workload.
 const parent=await command({kind:'createCollection',name:'Research',parentId:null});const child=await command({kind:'createCollection',name:'Projects',parentId:parent.id});await command({kind:'membership',id:ids[0],add:parent.id,remove:null});await command({kind:'membership',id:ids[1],add:child.id,remove:null});
 for(const [name,color,id]of [['Ideas','#5887ee',ids[0]],['Reading','#bd5289',ids[1]]]){const tag=await command({kind:'organization',request:{op:'tag',id:null,name,color}});await command({kind:'organization',request:{op:'tagging',ids:[id],tag:tag.id,add:true}});}
 await command({kind:'organization',request:{op:'pin',ids:[ids[0]],value:true}});await command({kind:'organization',request:{op:'pinCollection',id:child.id,value:true}});
 const trashed=await command({kind:'createNote',title:'Discarded draft',collection:null});await command({kind:'organization',request:{op:'trash',ids:[trashed.id],restore:false}});
 const source=join(folder,'linked');await mkdir(source);await writeFile(join(source,'reference.md'),'# Reference\n\nOriginal linked source.\n');await command({kind:'linked',request:{op:'register',path:source}});
 await cdp('Page.reload');await pause(800);await wait('document.querySelector("[data-session-ready=true]")','populated fixture');if(await evaluate('Boolean(document.querySelector(".tiptap"))'))await button('Return to Library');
 await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 report.m17Surfaces=[];for(const label of ['Library','Collections','Tags','Linked sources','Recent','Pinned','Trash']){await motion('browser-'+label,()=>button(label));await shot(label.toLowerCase().replaceAll(' ','-'));const state=await evaluate('({bodyOverflow:document.body.scrollWidth>innerWidth,mainOverflow:document.querySelector(".next-main").scrollWidth>document.querySelector(".next-main").clientWidth,text:document.querySelector(".next-main").innerText.slice(0,1800)})');assert(!state.bodyOverflow&&!state.mainOverflow);report.m17Surfaces.push({label,...state});}
 await button('Collections');await button('Hierarchy');await button('Expand Research');await shot('collections-hierarchy');await button('Projects');await shot('collection-detail');await button('Tags');await button('Show resources tagged Ideas');await shot('tag-resources');
 await button('Collections');await button('Pin collection Research');await wait('(async()=>(await window.__TAURI_INTERNALS__.invoke("workspace",{request:{kind:"snapshot"}})).collections.some(c=>c.name==="Research"&&c.pinned))()','collection pinned');await button('Unpin collection Research');
 await button('Tags');await button('New tag');await shot('tag-create');await key('Escape','Escape',0,27);await button('Manage tag Ideas');await shot('tag-manage');await key('Escape','Escape',0,27);
 report.checks.push('Populated Collections All/Hierarchy/detail,Tags/catalogue/resource/create/manage,Sources,Recent,mixed Pins and Trash captured at1200x800/DPR1;horizontal main/body bounds checked. These captures require visual comparison before acceptance.');
 await button('Library');await open(0);await pause(450);await evaluate('document.querySelector(".tiptap").editor.commands.setTextSelection(1);document.querySelector(".journey-viewport").scrollTop=0;true');await pause(500);if(await evaluate('document.querySelector(".note-organization-toggle").getAttribute("aria-expanded")!=="true"'))await click('document.querySelector(".note-organization-toggle")');await shot('note-header');
 await button('Remove tag Ideas from note');await wait(`document.activeElement?.getAttribute('aria-label')==='Assign note tags'&&!document.querySelector('[aria-label="Remove tag Ideas from note"]')`,'tag removal focus');
 await button('Assign note tags');await wait('document.querySelector("[data-tag-option]")','tag choices');await click('[...document.querySelectorAll("[data-tag-option]")].find(b=>b.textContent.includes("Ideas"))');await button('Done');await wait(`Boolean(document.querySelector('[aria-label="Remove tag Ideas from note"]'))`,'tag restored');
 report.checks.push('Inline collection pin/unpin persists stable collection identity;note tag assignment removal returns focus to Add Tag,and the existing picker reassigns it.');
 report.m17Responsive=[];
 for(const [width,height,dpr]of [[900,650,1],[1200,800,1.25],[1800,1000,1.5]]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:false});await pause(450);
  const state=await evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,body:document.body.scrollWidth>innerWidth,main:document.querySelector(".next-main").scrollWidth>document.querySelector(".next-main").clientWidth,activeTitle:document.querySelector(".next-note-title [data-active=true]")?.getAttribute("data-active")})');assert(!state.body&&!state.main);report.m17Responsive.push(state);await shot('note-'+width+'-'+dpr);
 }
 await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 for(const label of ['Dark','OLED','Light']){await button('Settings');await button('Appearance');await button(label);await key('Escape','Escape',0,27);await shot('note-'+label.toLowerCase());}
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'reduce'}]});await button('Settings');await key('Escape','Escape',0,27);await pause(350);assert.equal(await evaluate('document.querySelectorAll("[data-motion-ghost]").length'),0);
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'no-preference'}]});
 report.checks.push('Three viewport/DPR layouts remain horizontally contained;note tag chips captured in Light/Dark/OLED;reduced-motion Settings dismissal leaves no ghost. DPR emulation does not certify physical Windows scaling.');
 if(process.argv.includes('--native-m17')){await cdp('Emulation.clearDeviceMetricsOverride');report.nativeControl=join(folder,'m17-native.done');console.log('M17 native inspection ready: '+report.nativeControl);for(let i=0;i<600;i++){try{await readFile(report.nativeControl);return;}catch{}await pause(1000);}throw Error('Native inspection not released');}
}

async function referenceM17({evaluate,cdp,wait,report,output}){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const button=async label=>{await evaluate('[...document.querySelectorAll("button")].find(b=>!b.disabled&&!b.closest("[hidden]")&&b.getClientRects().length&&(b.getAttribute("aria-label")==='+JSON.stringify(label)+'||b.title==='+JSON.stringify(label)+'||b.textContent.trim()==='+JSON.stringify(label)+')).click();true');await pause(400);};
 const shot=async name=>{await pause(500);const r=await cdp('Page.captureScreenshot');await writeFile(join(output,'m17-original-'+name+'.png'),Buffer.from(r.data,'base64'));};
 await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 report.m17ReferenceFixture=await evaluate('(async()=>{const notes=[];for(const title of ["M17 A","M17 B","M17 C"])notes.push(await benchRequest("/resources","POST",{title,content:{type:"doc",content:Array.from({length:50},(_,i)=>({type:"paragraph",content:[{type:"text",text:title+" paragraph "+i+". "+"Reading, editing and organizing knowledge. ".repeat(5)}]}))}}));const parent=await benchRequest("/collections/creations/"+crypto.randomUUID(),"PUT",{name:"Research",resourceIds:[notes[0].id]});const child=await benchRequest("/collections/creations/"+crypto.randomUUID(),"PUT",{name:"Projects",parentId:parent.id,resourceIds:[notes[1].id]});for(const [name,color,note]of [["Ideas","#5887ee",notes[0]],["Reading","#bd5289",notes[1]]]){const tag=await benchRequest("/tags","POST",{name});await benchRequest("/tags/"+tag.id+"/color","PUT",{color});await benchRequest("/resources/"+note.id+"/tags/"+name.toLowerCase(),"POST");}await benchRequest("/resources/"+notes[0].id+"/favorite","PUT",{favorite:true});await benchRequest("/collections/"+child.id+"/favorite","PUT",{favorite:true});return {notes:notes.map(n=>n.id),parent:parent.id,child:child.id};})()');
 await cdp('Page.reload');await pause(800);await wait('document.body.innerText.includes("M17 A")','original populated fixture');
 for(const label of ['Library','Collections','Tags','Recent','Pinned','Trash']){await button(label);await shot(label.toLowerCase());}
 await button('Collections');await button('Hierarchy');
 await evaluate(`document.querySelector('.collections-transform [aria-label="Expand Research"]').click();true`);await shot('collections-hierarchy');
 await evaluate(`document.querySelector('.collections-transform [data-collection-open][title="Research / Projects"]').click();true`);await shot('collection-detail');
 await button('Tags');await button('Show resources tagged ideas');await shot('tag-resources');await button('Tags');await button('New tag');await shot('tag-create');
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await button('Library');await button('M17 A');await wait('document.querySelector(".tiptap")','original populated note');await shot('note-header');
 report.checks.push('Original Electron populated3 notes/2 nested collections/2 assigned colored tags/mixed pins at1200x800/DPR1. Tags normalized lowercase by original backend. Sources,Trash and Recent states are not matched populated fixtures.');
 report.limitations.push('Reference uses existing desktop/ui0.27.0 assets;Electron executable hash alone does not identify the frontend. No full application-wide parity claim.');
}
