import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

/** D2 renderer→real-host smoke; all mutations stay in the existing disposable harness. */
export async function runDesktopSelectionCheck(window,directory,owned){
 assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
 const wc=window.webContents,evaluate=code=>wc.executeJavaScript(code),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(code)=>{for(let i=0;i<200;i++){if(await evaluate(code).catch(()=>false))return;await delay(100);}throw Error('D2 smoke: '+code+' '+await evaluate('document.body.innerText.slice(-1400)'));};
 const request=async(path,method='GET',body)=>{const response=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,'X-Vaultor-Protocol':'3',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.ok(response.ok,path+' '+response.status);return response.status===204?null:response.json();};
 window.setSize(1320,900);window.showInactive();await delay(300);
 const notes=[];for(let i=0;i<6;i++)notes.push(await request('/resources','POST',{title:'Selection '+i,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Unchanged original '+i}]}]}}));
 const original=await request('/collections','POST',{name:'Original collection'}),target=await request('/collections','POST',{name:'Drop destination'}),tag=await request('/tags','POST',{name:'Drop tag'});
 await request('/organization/memberships','POST',{resourceIds:[notes[0].id],kind:'collection',targetId:original.id,action:'add'});
 const nav=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('.sidebar-primary button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing navigation');b.click();})()`);
 const title=id=>`[data-resource-row="${id}"] .library-resource button`;
 await nav('Library');await wait(`document.querySelector('${title(notes[0].id)}')`);
 const select=async(id,options)=>evaluate(`document.querySelector('${title(id)}').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,...${JSON.stringify(options)}}))`);
 await select(notes[0].id,{ctrlKey:true});await select(notes[2].id,{shiftKey:true});
 await wait("document.querySelectorAll('.library-row[data-selected=true]').length===3");assert.equal(await evaluate("document.querySelectorAll('[data-note-pane]').length"),0);
 await delay(250);await writeFile(join(directory,'desktop-selection-wide.png'),(await wc.capturePage()).toPNG());
 const start=async(id)=>{await evaluate(`(()=>{window.__selectionDrag=new DataTransfer();document.querySelector('${title(id)}').dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:window.__selectionDrag}));})()`);};
 const over=async(selector)=>evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,clientX:600,clientY:350,dataTransfer:window.__selectionDrag}))`);
 const drop=async(selector)=>evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.__selectionDrag}))`);
 const button=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.closest('[hidden],[inert]'));if(!b||b.disabled)throw Error('Missing enabled action '+${JSON.stringify(label)});b.click();})()`);
 // Internal multi-resource pin, then the keyboard-accessible batch inverse.
 await start(notes[0].id);await over('.sidebar-section[aria-label="Pinned"]');await drop('.sidebar-section[aria-label="Pinned"]');
 await wait("document.querySelector('.organization-drop-status')?.textContent.includes('Done.')");for(const note of notes.slice(0,3))assert.equal((await request('/resources/'+note.id+'/summary')).favorite,true);
 await button('Organize selection');await wait("document.querySelector('.library-popover')?.textContent.includes('Unpin selection')");await button('Unpin selection');
 await wait("document.querySelectorAll('.library-row[data-selected=true]').length===0");for(const note of notes.slice(0,3))assert.equal((await request('/resources/'+note.id+'/summary')).favorite,false);
 await select(notes[0].id,{ctrlKey:true});await select(notes[1].id,{ctrlKey:true});await start(notes[0].id);
 await evaluate("[...document.querySelectorAll('.sidebar-primary button')].find(b=>b.textContent.trim()==='Collections').dispatchEvent(new DragEvent('dragenter',{bubbles:true,dataTransfer:window.__selectionDrag}))");
 await wait(`document.querySelector('[aria-label="Collection drop destinations"] button[title=${JSON.stringify(target.name)}]')`);
 const destination=`[aria-label="Collection drop destinations"] button[title=${JSON.stringify(target.name)}]`;
 await over(destination);await delay(250);await writeFile(join(directory,'desktop-drop-destination.png'),(await wc.capturePage()).toPNG());await drop(destination);
 await wait("!document.querySelector('[aria-label=\"Collection drop destinations\"]')");
 for(let i=0;i<100;i++){if((await request('/resources/'+notes[1].id+'/summary')).collections.some(item=>item.id===target.id))break;if(i===99)throw Error('Collection drop not committed');await delay(50);}
 const memberships=(await request('/resources/'+notes[0].id+'/summary')).collections.map(item=>item.id);assert.ok(memberships.includes(original.id)&&memberships.includes(target.id),'Drop must add without removing existing membership');
 // Tag and cancellation never bypass ordinary commands.
 await wait(`document.querySelector('[data-tag-target="${tag.id}"]')`);assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-tag-target="${tag.id}"] button[hidden]')).display`),'none');await start(notes[0].id);await over(`[data-tag-target="${tag.id}"]`);await drop(`[data-tag-target="${tag.id}"]`);
 for(let i=0;i<100;i++){if((await request('/resources/'+notes[1].id+'/summary')).tags.some(item=>item.id===tag.id))break;if(i===99)throw Error('Tag drop not committed');await delay(50);}
 await start(notes[0].id);await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await drop('.sidebar-section[aria-label="Pinned"]');assert.equal((await request('/resources/'+notes[0].id+'/summary')).favorite,false);
 // Trash remains a review, not an immediate mutation. Confirm using existing lifecycle UI, then restore.
 await start(notes[0].id);await evaluate("[...document.querySelectorAll('.sidebar-primary button')].find(b=>b.textContent.trim()==='Trash').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.__selectionDrag}))");
 await wait("[...document.querySelectorAll('[role=dialog] button')].some(b=>b.textContent==='Move to Trash 2 resources'&&!b.disabled)");assert.ok(!(await request('/resources/'+notes[0].id+'/summary')).trashedAt);
 await button('Move to Trash 2 resources');await wait("!document.querySelector('[role=dialog]')");await nav('Trash');await wait("document.querySelectorAll('.trash-transform .library-row').length===2");
 await evaluate("document.querySelector('.trash-transform .library-resource').dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true}))");await button('Restore');await wait("[...document.querySelectorAll('[role=dialog] button')].some(b=>b.textContent==='Restore 2 resources'&&!b.disabled)");await button('Restore 2 resources');await wait("[...document.querySelectorAll('[role=dialog] button')].some(b=>b.textContent==='Done')");await button('Done');
 assert.ok(!(await request('/resources/'+notes[0].id+'/summary')).trashedAt);
 // Collection reparenting uses the same host contract and rejects descendant targets.
 await nav('Collections');await wait(`document.querySelector('[data-collection-row="${original.id}"] [data-collection-open]')`);
 await evaluate(`(()=>{window.__selectionDrag=new DataTransfer();document.querySelector('[data-collection-row="${original.id}"] [data-collection-open]').dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:window.__selectionDrag}));})()`);
 await over(`[data-collection-row="${target.id}"] > .library-row`);await drop(`[data-collection-row="${target.id}"] > .library-row`);
 for(let i=0;i<100;i++){if((await request('/collections/'+original.id)).parentId===target.id)break;if(i===99)throw Error('Collection move not committed');await delay(50);}
 await wait(`document.querySelector('[data-collection-row="${original.id}"] [data-collection-open]')?.title.includes('Drop destination')`);
 await evaluate(`(()=>{window.__selectionDrag=new DataTransfer();document.querySelector('[data-collection-row="${target.id}"] [data-collection-open]').dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:window.__selectionDrag}));})()`);await over(`[data-collection-row="${original.id}"] > .library-row`);
 assert.equal(await evaluate(`document.querySelector('[data-collection-row="${original.id}"] > .library-row').dataset.dropState`),'invalid');await drop(`[data-collection-row="${original.id}"] > .library-row`);assert.equal((await request('/collections/'+target.id)).parentId??null,null);
 // CDP supplies a native filesystem folder selection; main owns all path/ticket validation.
 const folder=join(directory,'external-drop-fixture');await mkdir(folder);await writeFile(join(folder,'example.txt'),'Imported through reviewed acquisition');
 await nav('Library');await wait(`document.querySelector('${title(notes[0].id)}')`);await wait("!document.querySelector('[data-drop-state]')");await delay(300);
 await evaluate("window.__folderEvents=[];document.addEventListener('drop',event=>window.__folderEvents.push({types:[...(event.dataTransfer?.types??[])],files:event.dataTransfer?.files.length,target:event.target?.tagName}),true)");
 await wc.debugger.attach('1.3');const data={items:[],files:[folder],dragOperationsMask:1};
 for(const type of ['dragEnter','dragOver','drop']){await wc.debugger.sendCommand('Input.dispatchDragEvent',{type,x:700,y:110,data});await delay(250);}
 console.log('Native folder drop events',JSON.stringify(await evaluate('window.__folderEvents')));
 await wait("[...document.querySelectorAll('[role=dialog] h3')].some(h=>h.textContent==='Import folder')");assert.ok(await evaluate("document.querySelector('[role=dialog]').textContent.includes('external-drop-fixture')"));await button('Cancel');wc.debugger.detach();
 window.setSize(600,640);await delay(400);await select(notes[0].id,{ctrlKey:true});await delay(250);await writeFile(join(directory,'desktop-selection-narrow.png'),(await wc.capturePage()).toPNG());
 assert.ok(await evaluate("document.querySelector('.library-view:not([hidden])').scrollWidth<=document.querySelector('.library-view:not([hidden])').clientWidth"));
 await writeFile(join(directory,'desktop-selection.json'),JSON.stringify({resources:6,range:3,bulkPinAndUnpin:true,membershipAddedNotMoved:true,tags:true,escapeCancellation:true,trashReviewAndRestore:true,hierarchyCycleRefused:true,nativeFolderReview:true,narrow:true,internalDrag:'DOM-dispatched DataTransfer in real Electron; physical drag feel not certified'},null,2));
 console.log('D2 smoke passed: selection, scoped bulk organization, protected Trash/Restore, hierarchy, native folder review and narrow layout.');
}
