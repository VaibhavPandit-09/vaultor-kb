import assert from 'node:assert/strict';
import {basename,join} from 'node:path';
import {writeFile} from 'node:fs/promises';
/** Bounded D2 extension routing/identity check, no user data or screenshot campaign. */
export async function runDesktopD2ExtensionCheck(window,directory,owned){
 assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
 const wc=window.webContents,evaluate=code=>wc.executeJavaScript(code),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(code)=>{for(let i=0;i<150;i++){if(await evaluate(code).catch(()=>false))return;await delay(100);}throw Error('D2 extension: '+code+' '+await evaluate('document.body.innerText.slice(-1200)'));};
 const request=async(path,method='GET',body)=>{const response=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,'X-Vaultor-Protocol':'3',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.ok(response.ok,path+' '+response.status);return response.json();};
 window.setSize(1500,900);window.showInactive();
 const notes=[];for(let i=0;i<3;i++)notes.push(await request('/resources','POST',{title:'D2 Extension '+i,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Original text '+i}]}]}}));
 const nav=()=>evaluate("[...document.querySelectorAll('.sidebar-primary button')].find(b=>b.textContent.trim()==='Library').click()");
 const row=id=>`[data-resource-row="${id}"] .library-resource button`;
 await nav();await wait(`document.querySelector('${row(notes[0].id)}')`);await evaluate(`document.querySelector('${row(notes[0].id)}').click()`);
 await wait(`document.querySelector('[data-note-pane="${notes[0].id}"] .tiptap')`);
 await nav();await wait(`document.querySelector('${row(notes[1].id)}')`);await evaluate(`document.querySelector('${row(notes[1].id)}').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:400,clientY:200}))`);
 await wait("document.querySelector('[role=menu]')?.textContent.includes('Open in another pane')");await evaluate("[...document.querySelectorAll('[role=menu] button')].find(b=>b.textContent==='Open in another pane').click()");
 await wait("document.querySelectorAll('[data-note-pane]').length===2");
 await evaluate(`(()=>{window.__d2a=document.querySelector('[data-note-pane="${notes[0].id}"] .tiptap');window.__d2b=document.querySelector('[data-note-pane="${notes[1].id}"] .tiptap');window.__d2a.focus();})()`);await wait('window.__d2a.editor?.view.dom===window.__d2a');
 await evaluate("window.__d2editor=window.__d2a.editor;window.__d2editor.commands.insertContentAt(1,'Unsaved movement ')");
 const drag=async(selector)=>evaluate(`(()=>{window.__d2transfer=new DataTransfer();document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:window.__d2transfer}));})()`);
 const drop=async(selector)=>evaluate(`(()=>{const target=document.querySelector(${JSON.stringify(selector)}),r=target.getBoundingClientRect();target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+10,dataTransfer:window.__d2transfer}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+10,dataTransfer:window.__d2transfer}));})()`);
 await drag(`[data-note-pane="${notes[0].id}"] .pane-arrange-handle`);await delay(100);await drop(`[data-note-pane="${notes[1].id}"] .tiptap`);
 await wait("document.querySelector('.organization-drop-status')?.textContent.includes('Done.')");
 assert.ok(await evaluate(`window.__d2a===document.querySelector('[data-note-pane="${notes[0].id}"] .tiptap')&&window.__d2b===document.querySelector('[data-note-pane="${notes[1].id}"] .tiptap')&&window.__d2editor.getText().includes('Unsaved movement')`));
 const order=await evaluate("[...document.querySelectorAll('.workspace-pane-slot')].map(el=>({id:el.querySelector('[data-note-pane]')?.dataset.notePane,order:Number(el.style.order)})).sort((a,b)=>a.order-b.order).map(el=>el.id)");assert.deepEqual(order,[notes[1].id,notes[0].id]);
 await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Search workspace')).click()");await wait("document.querySelector('.palette-result[draggable=true]')");
 await wait(`[...document.querySelectorAll('.palette-result')].some(el=>el.textContent.includes(${JSON.stringify(notes[2].title)}))`);
 const paletteResult=await evaluate(`(()=>{const result=[...document.querySelectorAll('.palette-result')].find(el=>el.textContent.includes(${JSON.stringify(notes[2].title)}));if(!result)throw Error('Missing palette resource');result.dataset.extensionSource='true';return result.draggable;})()`);assert.equal(paletteResult,true);
 await drag('[data-extension-source=true]');await wait("document.querySelector('.palette-overlay')?.dataset.dragging==='true'&&!document.querySelector('.app-root').classList.contains('pointer-events-none')");assert.ok(await evaluate(`(()=>{const node=document.querySelector('[data-note-pane="${notes[0].id}"] .tiptap'),r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.left+r.width/2,r.top+10));})()`),'Palette drag must expose a physically hit-testable editor');await drop(`[data-note-pane="${notes[0].id}"] .tiptap`);
 await wait(`window.__d2editor.getJSON().content.some(block=>block.content?.some(node=>node.type==='resourceLink'&&node.attrs.resourceId==='${notes[2].id}'))`);await wait("!document.querySelector('.palette-overlay')");
 await evaluate('window.__d2editor.commands.undo()');assert.ok(await evaluate("!window.__d2editor.getJSON().content.some(block=>block.content?.some(node=>node.type==='resourceLink'))&&window.__d2editor.getText().includes('Unsaved movement')"));await evaluate('window.__d2editor.commands.redo()');
 // Browse-source hover reveal keeps source mounted until the actual editor drop.
 await nav();await wait(`document.querySelector('${row(notes[2].id)}')`);await drag(row(notes[2].id));await evaluate(`document.querySelector('[data-open-session="${notes[0].id}"]').dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:window.__d2transfer}))`);await wait("document.querySelector('.workspace-view[data-drag-shelf=true]')");assert.ok(await evaluate(`document.querySelector('${row(notes[2].id)}')?.isConnected`));await drop(`[data-note-pane="${notes[0].id}"] .tiptap`);await wait("document.querySelector('.organization-drop-status')?.textContent.includes('Done.')");
 assert.equal(await evaluate('window.__d2editor.getJSON().content.flatMap(block=>block.content??[]).filter(node=>node.type===\'resourceLink\').length'),2);
 // Real Chromium filesystem acquisition onto a collection, cancelled in review.
 const collection=await request('/collections','POST',{name:'D2 native import target'}),beforeImport=await request('/resources');const file=join(directory,'d2-drop.pdf');await writeFile(file,'Disposable file for cancelled review');
 await evaluate("[...document.querySelectorAll('.sidebar-primary button')].find(b=>b.textContent.trim()==='Collections').click()");await wait(`document.querySelector('[data-collection-row="${collection.id}"] > .library-row')`);await delay(200);
 const point=await evaluate(`(()=>{const r=document.querySelector('[data-collection-row="${collection.id}"] > .library-row').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
 wc.debugger.attach('1.3');try{for(const type of ['dragEnter','dragOver','drop']){await wc.debugger.sendCommand('Input.dispatchDragEvent',{type,...point,data:{items:[],files:[file],dragOperationsMask:1}});await delay(150);}await wait("document.querySelector('[role=dialog]')?.textContent.includes('D2 native import target')");await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Cancel').click()");await wait("!document.querySelector('[role=dialog]')");}finally{wc.debugger.detach();}assert.equal((await request('/resources')).totalItems,beforeImport.totalItems);
 console.log('D2 extension passed: real editor identity/draft, pane swap, palette link/undo/redo, browse hover link; physical gesture feel remains user-owned.');
}
