import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { Menu } from 'electron';

/** One bounded Windows smoke, only the harness's disposable owned workspace. */
export async function runDesktopExperienceCheck(window, directory, owned) {
 assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
 const wc=window.webContents, evaluate=code=>wc.executeJavaScript(code), delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(code)=>{for(let i=0;i<180;i++){if(await evaluate(code).catch(()=>false))return;await delay(100);}throw Error('Desktop experience smoke: '+code);};
 const request=async(path,method='GET',body)=>{const response=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,'X-Vaultor-Protocol':'3',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.ok(response.ok,path+' '+response.status);return response.status===204?null:response.json();};
 window.setSize(1320,900);window.showInactive();await delay(300);
 const notes=[];
 for(let i=7;i>=0;i--){const next=notes.at(-1);notes.push(await request('/resources','POST',{title:'Journey '+i+' — long desktop navigation context',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Disposable desktop experience test. '},...(next?[{type:'resourceLink',attrs:{resourceId:next.id,label:'Next visit',type:'note'}}]:[])]}]}}));}
 const first=notes.at(-1);
 await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Library').click()");
 await wait(`document.querySelector('button[title=${JSON.stringify(first.title)}]')`);
 // Pointer context at the lower-right edge must not open the resource.
 await evaluate(`(()=>{const b=document.querySelector('button[title=${JSON.stringify(first.title)}]');b.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:innerWidth-2,clientY:innerHeight-2}));})()`);
 await wait("document.querySelector('[role=menu] [role=menuitem]')");
 const geometry=await evaluate("(()=>{const r=document.querySelector('[role=menu]').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,panes:document.querySelectorAll('[data-note-pane]').length};})()");
 assert.equal(geometry.panes,0);assert.ok(geometry.left>=0&&geometry.top>=0&&geometry.right<=geometry.width&&geometry.bottom<=geometry.height,JSON.stringify(geometry));
 await delay(300);
 await writeFile(join(directory,'desktop-context-edge.png'),(await wc.capturePage()).toPNG());
 await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await wait("!document.querySelector('[role=menu]')");
 await evaluate(`document.querySelector('button[title=${JSON.stringify(first.title)}]').click()`);
 await wait(`document.querySelector('[data-note-pane="${first.id}"] .tiptap')`);
 for(let i=0;i<7;i++){await evaluate("document.querySelector('[data-focused=true] .resource-link-chip').click()");await wait(`document.querySelector('.journey-current')?.textContent.includes('Journey ${i+1} ')`);}
 assert.equal(await evaluate("document.querySelectorAll('.journey-trail li').length"),3);
 await evaluate("document.querySelector('[aria-label=\"Show full journey\"]').click()");
 await wait("document.querySelectorAll('.journey-popover button').length===8");
 await evaluate("document.querySelector('.journey-popover button').click()");
 await wait("document.querySelector('.journey-current')?.textContent.includes('Journey 0 ')");
 await evaluate("document.querySelector('[aria-label=\"Journey forward\"]').click()");
 await wait("document.querySelector('.journey-current')?.textContent.includes('Journey 1 ')");
 await wait("document.querySelector('[data-focused=true] .tiptap')");await delay(300);
 await writeFile(join(directory,'desktop-history-wide.png'),(await wc.capturePage()).toPNG());
 window.setSize(600,640);await delay(400);
 const narrow=await evaluate("(()=>{const t=document.querySelector('.journey-trail'),c=document.querySelector('.journey-current');return {viewport:innerWidth,bar:document.querySelector('.journey-bar').getBoundingClientRect().width,containerType:getComputedStyle(document.querySelector('.journey-bar')).containerType,containerName:getComputedStyle(document.querySelector('.journey-bar')).containerName,scroll:t.scrollWidth,width:t.clientWidth,current:c.getBoundingClientRect().width,neighbors:[...t.querySelectorAll('.journey-neighbor')].filter(n=>getComputedStyle(n).display!=='none').length};})()");
 await writeFile(join(directory,'desktop-history-narrow.png'),(await wc.capturePage()).toPNG());
 console.log('Narrow history geometry',JSON.stringify(narrow));assert.ok(narrow.scroll<=narrow.width&&narrow.current>0,JSON.stringify(narrow));assert.equal(narrow.neighbors,0);
 // Restore a visible sidebar before the keyboard session-menu check.
 window.setSize(1320,900);await delay(500);
 // Keyboard invocation on Open Notes shares the same menu and restores the row source.
 await evaluate("(()=>{const b=document.querySelector('[data-open-session] > button');b.focus();b.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));})()");
 await wait("document.querySelector('[role=menu]')?.textContent.includes('Close note')");
 await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await wait("!document.querySelector('[role=menu]')");
 assert.ok(await evaluate("document.activeElement.closest('[data-open-session]')!==null"));
 // Exercise real Electron pointer context, intercepting popup only to avoid OS-menu hangs.
 let popup;
 const original=Menu.prototype.popup;
 Menu.prototype.popup=function(){popup=this.items.map(item=>({role:item.role,enabled:item.enabled}));};
 try{
  const point=await evaluate("(()=>{const r=document.querySelector('[data-focused=true] .tiptap p').getBoundingClientRect();return {x:Math.round(r.left+12),y:Math.round(r.top+8)};})()");
  wc.sendInputEvent({type:'mouseDown',button:'right',clickCount:1,...point});wc.sendInputEvent({type:'mouseUp',button:'right',clickCount:1,...point});
  for(let i=0;i<30&&!popup;i++)await delay(100);
  assert.ok(popup?.some(item=>item.role==='paste'),'Editable pointer context must reach the native text menu');
 }finally{Menu.prototype.popup=original;}
 // Shared split command and secondary pointer must not activate another pane.
 await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Library').click()");
 await wait(`document.querySelector('button[title=${JSON.stringify(notes[0].title)}]')`);
 await evaluate(`document.querySelector('button[title=${JSON.stringify(notes[0].title)}]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:400,clientY:200}))`);
 await wait("document.querySelector('[role=menu]')?.textContent.includes('Open in another pane')");
 await evaluate("[...document.querySelectorAll('[role=menu] button')].find(b=>b.textContent==='Open in another pane').click()");
 await wait(`document.querySelector('[data-note-pane="${notes[0].id}"][data-focused=true] .tiptap')`);
 assert.equal(await evaluate("document.querySelectorAll('[data-note-pane]').length"),2);
 const focused=await evaluate("document.querySelector('[data-focused=true]').dataset.notePane");
 await evaluate("document.querySelector('[data-note-pane][data-focused=false]').dispatchEvent(new PointerEvent('pointerdown',{button:2,bubbles:true}))");
 assert.equal(await evaluate("document.querySelector('[data-focused=true]').dataset.notePane"),focused);
 await writeFile(join(directory,'desktop-experience.json'),JSON.stringify({historyVisits:8,edgePlacement:geometry,narrow,nativeTextMenu:true,keyboardSourceRestored:true},null,2));
 console.log('Desktop experience smoke passed: eight visits, bounded history, edge menu, keyboard focus, native text menu.');
}
