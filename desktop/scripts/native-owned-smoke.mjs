import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DesktopTransport } from '../src/transport.mjs';
export async function runOwnedSmoke(window, owned, directory, activity) {
  const wc = window.webContents;
  const evaluate = code => wc.executeJavaScript(code);
  async function wait(code, label) {
    for (let i = 0; i < 800; i++) { if (await evaluate(code).catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); }
    throw new Error(label + ': ' + await evaluate('document.body.innerText'));
  }
  await wait("Boolean(document.querySelector('button.library-button')) && document.body.innerText.includes('Library')", 'Bundled workspace auto-start');
  assert.equal(owned.status, 'ready');
  const local = await evaluate('window.vaultorDesktop.localStatus()'); assert.equal(local.value.status, 'ready');
  const token=randomUUID(),transport=new DesktopTransport();
  transport.activate({kind:'local',address:owned.address},token,owned.accessKey);
  const request=async(path,method='GET',body)=>{
    const id=randomUUID(),result=await transport.request({id,token,path,method,timeout:10000,headers:{'X-Request-ID':randomUUID(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:{kind:'text',value:JSON.stringify(body)}}:{})});
    const text=new TextDecoder().decode(result.data);assert.equal(result.status,200,text);return JSON.parse(text);
  };
  window.close();
  assert.equal(window.isDestroyed(),false);assert.equal(window.isVisible(),false);
  assert.equal(owned.accessKey === (await readFile(join(owned.data,'host-access','owner.key'),'utf8')).trim(),true,'Disposable owner credentials must match.');
  await request('/health');
  window.show();window.focus();
  const hosting=await evaluate('window.vaultorDesktop.hosting()');assert.equal(hosting.value.startAtLogin,false);
  if (process.env.VAULTOR_SMOKE_MODE === 'first') {
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim().toLowerCase()==='new note').click()");
    await wait("Boolean(document.querySelector('.tiptap'))", 'New note');
    await evaluate("document.querySelector('.tiptap').focus()"); wc.insertText('Bundled runtime native check.');
    await wait("document.querySelector('.tiptap')?.textContent.includes('Bundled runtime native check.')", 'Typing');
    await wait("Boolean(document.querySelector('[aria-label=\"All changes saved\"]'))", 'Save completion');
    await new Promise(r => setTimeout(r, 700));
    window.showInactive(); await new Promise(r => setTimeout(r, 250));
    await writeFile(join(directory, 'native-owned.png'), (await wc.capturePage()).toPNG()); window.hide();
    const noteId=await evaluate("document.querySelector('[data-note-pane]').dataset.notePane");
    let operation=await request('/exports','POST',{scope:'notes',noteId,format:'pdf'});
    for(let i=0;i<100 && operation.status!=='SUCCEEDED';i++){if(operation.status==='FAILED')throw new Error(operation.detail);await new Promise(r=>setTimeout(r,100));operation=await request('/operations/'+operation.id);}
    assert.equal(operation.status,'SUCCEEDED');
    const preview=await evaluate(`(async()=>{const state=(await window.vaultorDesktop.bootstrap()).value;return window.vaultorDesktop.fileAction({token:state.token,path:'/exports/${operation.id}/download',filename:'preview.pdf',mode:'preview',requestId:'native-preview'});})()`);
    assert.equal(preview.ok,true);
    await evaluate(`(()=>{const frame=document.createElement('iframe');frame.id='native-preview-check';frame.src=${JSON.stringify(preview.value.url)}+'#toolbar=0';frame.style='position:fixed;inset:80px 20px;width:800px;height:600px;z-index:9999;background:white';document.body.append(frame);})()`);
    window.showInactive();let rendered=false,capture;
    // The disposable workspace uses the dark theme. A rendered PDF page is white;
    // an uninitialized Chromium PDF frame remains dark gray. Avoid private viewer DOM APIs.
    for(let i=0;i<24&&!rendered;i++){await new Promise(r=>setTimeout(r,250));capture=await wc.capturePage();const bitmap=capture.toBitmap();let white=0;for(let j=0;j<bitmap.length;j+=4)if(bitmap[j]>240&&bitmap[j+1]>240&&bitmap[j+2]>240)white++;rendered=white>50000;}
    assert.equal(rendered,true,'Native PDF viewer must display a page rather than an empty frame');
    await writeFile(join(directory,'native-preview.png'),capture.toPNG());
    await evaluate(`(async()=>{document.getElementById('native-preview-check').remove();const state=(await window.vaultorDesktop.bootstrap()).value;return window.vaultorDesktop.releaseFile({token:state.token,id:${JSON.stringify(preview.value.id)}});})()`);window.hide();
  } else {
    await wait("document.querySelector('.tiptap')?.textContent.includes('Bundled runtime native check.')", 'Relaunch restored saved note/session');
  }
  let pending;
  for(let i=0;i<100;i++){
    pending=activity();
    if(!pending.activeFiles&&!pending.pendingSaves&&!pending.dialogPending&&!pending.mutations)break;
    await new Promise(r=>setTimeout(r,100));
  }
  assert.deepEqual(pending,{activeFiles:0,pendingSaves:0,dialogPending:false,mutations:0},'Disposable workspace operations must settle before quit.');
  console.log('Native bundled check: ' + process.env.VAULTOR_SMOKE_MODE + ' passed.');
}
