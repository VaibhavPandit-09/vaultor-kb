import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { clipboard, ClipboardItem, nativeImage } from 'electron';
import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
export async function runImagesSmoke(window, directory, owned) {
 assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
 const evaluate = async code => { try {return await window.webContents.executeJavaScript(code);} catch(error) {throw new Error('Native image step failed: '+code, {cause:error});} };
 const wait = async code => { for(let i=0;i<200;i++){if(await evaluate(code).catch(()=>false))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Image check did not settle: '+code+' '+await evaluate('document.body.innerText')); };
 const capture = async name => {await new Promise(r=>setTimeout(r,250));await writeFile(join(directory,name),(await window.webContents.capturePage()).toPNG());};
 const previous=await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))));
 window.setSize(1320,900);window.show();window.focus();window.webContents.focus();
 try {
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='New note').click()");await wait("document.querySelector('.tiptap')");await evaluate("document.querySelector('.tiptap').focus()");await wait("document.querySelector('.tiptap').editor?.isInitialized");
  const dataUrl=await evaluate("(()=>{const c=document.createElement('canvas');c.width=480;c.height=240;const g=c.getContext('2d');g.fillStyle='#1959ca';g.fillRect(0,0,480,240);g.fillStyle='#fff';g.font='24px sans-serif';g.fillText('Clipboard screenshot',28,72);g.fillText('Original pixels · 480 × 240',28,128);return c.toDataURL('image/png');})()");
  const original=nativeImage.createFromDataURL(dataUrl);await clipboard.write([new ClipboardItem({'image/png':new Blob([original.toPNG()],{type:'image/png'})})]);
  await evaluate("document.querySelector('.tiptap').editor.commands.focus('end')");
  await evaluate("document.querySelector('.tiptap').addEventListener('paste',async event=>{const file=event.clipboardData.files[0];if(file)window.__imagePasteDigest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');},{once:true,capture:true})");
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'V',modifiers:[process.platform==='darwin'?'meta':'control']});window.webContents.sendInputEvent({type:'keyUp',keyCode:'V',modifiers:[process.platform==='darwin'?'meta':'control']});
  await wait("document.querySelector('.managed-image img')?.naturalWidth===480");
  assert.equal(await evaluate("document.querySelector('.tiptap').editor.getJSON().content.filter(n=>n.type==='image').length"),1);
  await evaluate("(()=>{const e=document.querySelector('.tiptap').editor;let pos;e.state.doc.descendants((n,p)=>{if(n.type.name==='image')pos=p;});e.commands.setNodeSelection(pos);})()");
  await evaluate("document.querySelector('[aria-label=\"Image width percent\"]').focus()");
  await evaluate("(()=>{const input=document.querySelector('[aria-label=\"Image width percent\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'60');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await evaluate("document.querySelector('[aria-label=\"Image width percent\"]').blur()");
  await evaluate("document.querySelector('[aria-label=\"Align image right\"]').click();[...document.querySelectorAll('.image-toolbar button')].find(b=>b.textContent.trim()==='Caption & alt').click()");
  await evaluate("(()=>{for(const [label,value] of [['Alternative text','Screenshot alt'],['Caption','Caption from native check']]){const i=[...document.querySelectorAll('.image-details label')].find(l=>l.textContent===label).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,value);i.dispatchEvent(new Event('input',{bubbles:true}));}})()");
  await wait("document.querySelector('.tiptap').editor.getJSON().content.find(n=>n.type==='image').attrs.caption==='Caption from native check'");
  await capture('images-note.png');
  const resourceId=await evaluate("document.querySelector('.tiptap').editor.getJSON().content.find(n=>n.type==='image').attrs.resourceId");
  const info=await (await fetch(owned.address+'/api/resources/'+resourceId+'/image-info',{headers:{'X-Vaultor-Owner':owned.accessKey}})).json();assert.equal(info.width,480);assert.equal(info.height,240);
  const raw=Buffer.from(await (await fetch(owned.address+'/api/resources/'+resourceId+'/raw',{headers:{'X-Vaultor-Owner':owned.accessKey}})).arrayBuffer());await wait('Boolean(window.__imagePasteDigest)');assert.equal(createHash('sha256').update(raw).digest('hex'),await evaluate('window.__imagePasteDigest'),'Uploaded bytes must match the actual clipboard File');
  const copy=await evaluate(`(async()=>{const s=await window.vaultorDesktop.bootstrap();return window.vaultorDesktop.copyResourceImage({token:s.value.token,resourceId:${JSON.stringify(resourceId)}});})()`);assert.equal(copy.ok,true);const copied=(await clipboard.read())[0];assert.equal(nativeImage.createFromBuffer(Buffer.from(await (await copied.getType('image/png')).arrayBuffer())).getSize().width,480);
  await evaluate("document.querySelector('[aria-label=\"More image actions\"]').click()");await wait("document.querySelector('.image-more')");await evaluate("[...document.querySelectorAll('.image-more button')].find(b=>b.textContent.trim()==='Preview').click()");await wait("document.querySelector('.image-preview-tools')");await capture('images-preview.png');
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait("!document.querySelector('.image-preview-tools')");
  await evaluate("[...document.querySelectorAll('.image-toolbar button')].find(b=>b.textContent.trim()==='Replace').click()");await wait("document.querySelector('.image-picker')");await capture('images-picker.png');window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait("!document.querySelector('.image-picker')");
  assert.equal(await evaluate("document.querySelector('.tiptap').editor.getJSON().content.find(n=>n.type==='image').attrs.width"),60);
  const headers={'X-Vaultor-Owner':owned.accessKey};const page=await (await fetch(owned.address+'/api/resources?type=note',{headers})).json();const noteId=page.items[0].id;
  let saved=false;for(let i=0;i<100;i++){const note=await (await fetch(owned.address+'/api/resources/'+noteId,{headers})).json();const content=typeof note.content==='string'?JSON.parse(note.content):note.content;const image=content?.content?.find(n=>n.type==='image');if(image?.attrs.width===60&&image.attrs.caption==='Caption from native check'){saved=true;break;}await new Promise(r=>setTimeout(r,100));}assert.equal(saved,true,'Image attributes must be acknowledged by the host');
  window.webContents.reload();await wait("document.querySelector('.managed-image img')?.naturalWidth===480");assert.equal(await evaluate("document.querySelector('.tiptap').editor.getJSON().content.find(n=>n.type==='image').attrs.width"),60);
  console.log('Disposable real clipboard image check passed: paste/original bytes, dimensions, resize/alignment/caption/alt, native copy, preview/replace picker, Escape and saved session reload.');
 } catch(error) {console.error('Image check failed:',error.message);throw error;} finally {if(previous.length)await clipboard.write(previous);else clipboard.clear();}
}
