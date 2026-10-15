import assert from 'node:assert/strict';
import {BrowserWindow,nativeTheme} from 'electron';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// Invoked only by the existing explicitly isolated native fixture launcher.
export async function runReviewCheck(window,directory,owned) {
  const evaluate=(code,target=window)=>target.webContents.executeJavaScript(code);
  const wait=async(code,target=window)=>{for(let n=0;n<200;n++){if(await evaluate(code,target).catch(()=>false))return;await new Promise(r=>setTimeout(r,100));}throw Error('Review UI did not settle: '+code);};
  const owner=async(path,method='GET',body)=>{const r=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.equal(r.status,200,path+' '+await r.clone().text());return r.json();};
  const capture=async(name,target=window)=>{await new Promise(r=>setTimeout(r,250));await writeFile(join(directory,name),(await target.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
  assert.equal((await owner('/capabilities')).reviews,1);
  const identity=await owner('/workspace/identity');
  const note=await owner('/resources','POST',{title:'Review reading target · '+('x'.repeat(180)),content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Saved original evidence'}]}]}});
  const original=note.revision;let first;
  const form=new FormData();form.set('file',new Blob(['Read-only file review fixture'],{type:'text/plain'}),'Review original.txt');const upload=await fetch(owned.address+'/api/resources/file',{method:'POST',headers:{'X-Vaultor-Owner':owned.accessKey},body:form});assert.equal(upload.status,200);const file=await upload.json();await owner('/reviews/'+randomUUID(),'PUT',{generation:identity.generation,resourceId:file.id,comment:'Check the file context',locator:{kind:'resource'}});
  for(let n=0;n<53;n++){const id=randomUUID();const item=await owner('/reviews/'+id,'PUT',{generation:identity.generation,resourceId:note.id,comment:n===52?'<script>neverExecute()</script>':'Concern '+n,quote:'Saved original evidence',context:'Saved original',baseRevision:original,locator:{kind:'block',path:'0'}});if(n===52)first=item;}
  window.showInactive();
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Review inbox').click()");
  await wait("document.querySelector('[role=dialog]')?.textContent.includes('Page 1 of 2')");
  assert.ok(await evaluate("document.querySelector('[role=dialog]').textContent.includes('<script>neverExecute()</script>')&&!document.querySelector('[role=dialog] script')"));
  nativeTheme.themeSource='dark';await wait("document.documentElement.dataset.theme==='dark'");await capture('reviews-dark.png');
  await evaluate("[...document.querySelectorAll('[role=dialog] li')][0].querySelectorAll('button')[1].click()");
  await wait("document.querySelector('[role=dialog] select').textContent.includes('Open (53)')");assert.equal((await owner('/reviews/'+first.id)).status,'resolved');assert.equal((await owner('/resources/'+note.id)).revision,original);
  await evaluate("[...document.querySelectorAll('[role=dialog] li')][0].querySelector('button').click()");await wait("!document.querySelector('[role=dialog]')&&Boolean(document.querySelector('.ProseMirror'))");
  await wait("Boolean(document.activeElement?.closest('.ProseMirror'))");
  await evaluate("window.__integrationEditor=document.querySelector('.ProseMirror')");await capture('reviews-note-entry.png');
  await wait("Boolean(document.querySelector('button[aria-label^=\"Reviews for Review reading target\"]'))");await evaluate("document.querySelector('button[aria-label^=\"Reviews for Review reading target\"]').click()");await wait("document.querySelector('[role=dialog]')?.textContent.includes('Reviews · Review reading target')");
  assert.ok(await evaluate("(()=>{const d=document.querySelector('[role=dialog]');return d.scrollWidth<=d.clientWidth+1;})()"));
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait("!document.querySelector('[role=dialog]')");
  assert.ok(await evaluate("window.__integrationEditor===document.querySelector('.ProseMirror')"));
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Review inbox').click()");await wait("document.querySelector('[role=dialog]')?.textContent.includes('Page 1 of 2')");await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Next').click()");await wait("document.querySelector('[role=dialog]')?.textContent.includes('Page 2 of 2')");await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Review original.txt').click()");await wait("Boolean(document.querySelector('button[aria-label^=\"Reviews for Review original.txt\"]'))");await evaluate("document.querySelector('button[aria-label^=\"Reviews for Review original.txt\"]').click()");await wait("document.querySelector('[role=dialog]')?.textContent.includes('Reviews · Review original.txt')");window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait("!document.querySelector('[role=dialog]')");assert.ok(await evaluate("Boolean(document.querySelector('button[aria-label^=\"Reviews for Review original.txt\"]'))"));
  const ticket=await owner('/owner/browser-ticket','POST');const browser=new BrowserWindow({show:false,width:960,height:760,webPreferences:{partition:'r5-browser-check',contextIsolation:true,sandbox:true}});
  try {
    await browser.loadURL(owned.address+'/access#ticket='+ticket.ticket);await wait("document.body.innerText.includes('Owner browser connected.')",browser);await browser.loadURL(owned.address+'/');await wait("Boolean(document.querySelector('.library-view'))&&!document.body.innerText.includes('Restoring workspace')",browser);
    browser.showInactive();await new Promise(r=>setTimeout(r,250));
    browser.webContents.session.webRequest.onBeforeRequest({urls:[owned.address+'/api/reviews*']},(_details,done)=>setTimeout(()=>done({}),1200));
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Review inbox').click()",browser);await wait("document.body.textContent.includes('Loading reviews…')",browser);await capture('reviews-browser-loading.png',browser);
    browser.webContents.session.webRequest.onBeforeRequest(null);await wait("document.querySelector('.app-modal-window')?.textContent.includes('Page 1 of 2')",browser);await evaluate("document.querySelector('button[aria-label=\"Close modal\"]').click()",browser);
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Review inbox').click()",browser);await wait("document.querySelector('[role=dialog]')?.textContent.includes('Page 1 of 2')",browser);nativeTheme.themeSource='light';await wait("document.documentElement.dataset.theme==='light'",browser);await capture('reviews-browser-light.png',browser);
    browser.setSize(440,760);await new Promise(r=>setTimeout(r,200));assert.ok(await evaluate("(()=>{const d=document.querySelector('[role=dialog]');return d.scrollWidth<=d.clientWidth+1&&d.getBoundingClientRect().right<=innerWidth;})()",browser));await capture('reviews-narrow.png',browser);
    await evaluate("(()=>{const s=document.querySelector('[role=dialog] select');s.value='dismissed';s.dispatchEvent(new Event('change',{bubbles:true}));})()",browser);await wait("document.body.textContent.includes('No dismissed reviews here.')",browser);
  } finally {browser.destroy();}
  // Verify the native renderer, including the redesigned header/preview owners.
  const key=keyCode=>{window.webContents.sendInputEvent({type:'keyDown',keyCode});window.webContents.sendInputEvent({type:'keyUp',keyCode});};
  const reviewDialog="document.querySelector('.app-modal-window')";
  await evaluate("document.querySelector('button[aria-label^=\"Reviews for Review original.txt\"]').focus();document.activeElement.click()");
  await wait(reviewDialog+"?.textContent.includes('Check the file context')");
  for(const theme of ['light','dark','oled']) {
    if(theme==='oled') {await evaluate("document.querySelector('button[aria-label^=\"Switch theme\"]').click()");await wait("document.documentElement.dataset.theme==='light'");await evaluate("document.querySelector('button[aria-label^=\"Switch theme\"]').click()");await wait("document.documentElement.dataset.theme==='dark'");await evaluate("document.querySelector('button[aria-label^=\"Switch theme\"]').click()");}
    else nativeTheme.themeSource=theme;
    await wait("document.documentElement.dataset.theme==="+JSON.stringify(theme));await capture('reviews-native-'+theme+'.png');
  }
  const fileReview=(await owner('/reviews?resourceId='+file.id)).items[0];
  const remoteStatus=async(item,status)=>{const response=await fetch(owned.address+'/api/reviews/'+item.id+'/status',{method:'PATCH',headers:{'X-Vaultor-Owner':owned.accessKey,'Content-Type':'application/json','If-Match':'"'+item.revision+'"'},body:JSON.stringify({generation:identity.generation,status})});assert.equal(response.status,200);return response.json();};
  await remoteStatus(await remoteStatus(fileReview,'resolved'),'open');
  await evaluate("[...document.querySelectorAll('.app-modal-window button')].find(b=>b.textContent==='Dismiss').click()");
  await wait(reviewDialog+"?.textContent.includes('changed on another device')");await capture('reviews-native-conflict.png');
  await evaluate("[...document.querySelectorAll('.app-modal-window button')].find(b=>b.textContent==='Dismiss').click()");
  await wait(reviewDialog+"?.textContent.includes('No open reviews here.')");await capture('reviews-native-empty.png');
  await evaluate("(()=>{const s=document.querySelector('.app-modal-window select');s.value='dismissed';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await wait(reviewDialog+"?.textContent.includes('Check the file context')");
  await evaluate("[...document.querySelectorAll('.app-modal-window button')].find(b=>b.textContent==='Reopen').click()");await wait(reviewDialog+"?.textContent.includes('No dismissed reviews here.')");
  window.setSize(560,760);await new Promise(r=>setTimeout(r,300));
  assert.ok(await evaluate("(()=>{const d=document.querySelector('.app-modal-window');return d.scrollWidth<=d.clientWidth+1&&d.getBoundingClientRect().right<=innerWidth;})()"));await capture('reviews-native-narrow.png');
  await window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  key('Escape');await wait("!document.querySelector('.app-modal-window')");
  assert.ok(await evaluate("document.activeElement?.getAttribute('aria-label')?.startsWith('Reviews for Review original.txt')"));
  assert.ok(await evaluate("Boolean(document.querySelector('[data-preview-resource]'))"));
  await window.webContents.debugger.detach();window.setSize(1320,900);await new Promise(r=>setTimeout(r,350));
  await evaluate("window.__integrationPreview=document.querySelector('[data-preview-resource]');document.querySelector('[data-preview-resource] button[title=\"Switch to floating preview\"]').click()");
  const geometry=[];
  for(const pause of [0,40,100,200]) {
    await new Promise(r=>setTimeout(r,pause));geometry.push(await evaluate("(()=>{const r=window.__integrationPreview.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};})()"));
    await writeFile(join(directory,'reviews-preview-motion-'+geometry.length+'.png'),(await window.webContents.capturePage()).toPNG());
  }
  assert.ok(await evaluate("window.__integrationPreview===document.querySelector('[data-preview-resource]')"));
  await writeFile(join(directory,'reviews-preview-motion.json'),JSON.stringify(geometry,null,2));
  await evaluate("document.querySelector('[data-preview-resource] button[title=\"Switch to side preview\"]').click()");await new Promise(r=>setTimeout(r,350));
  assert.ok(await evaluate("window.__integrationPreview===document.querySelector('[data-preview-resource]')"));
  // Real connection failure exercises retained rows/error UI without fake credentials.
  await evaluate("document.querySelector('button[aria-label^=\"Reviews for Review original.txt\"]').click()");await wait(reviewDialog+"?.textContent.includes('Check the file context')");
  await owned.stop({force:true});await evaluate("[...document.querySelectorAll('.app-modal-window button')].find(b=>b.textContent==='Refresh').click()");
  await wait("Boolean(document.querySelector('.app-modal-window [role=alert]'))");assert.ok(await evaluate(reviewDialog+".textContent.includes('Check the file context')"));await capture('reviews-native-error.png');
  console.log('R5 packaged native/browser triage, counts/paging, original revision preservation, scoped entry, Escape and narrow themes passed.');
}
