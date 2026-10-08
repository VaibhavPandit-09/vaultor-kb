import assert from 'node:assert/strict';
import { nativeTheme } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';

// Only the chrome smoke's owned disposable workspace is mutated.
export async function runOledSmoke(window, directory, owned) {
  assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
  const evaluate = code => window.webContents.executeJavaScript(code);
  const wait = async code => {
    for (let i=0;i<150;i++) { if(await evaluate(code).catch(()=>false)) return; await new Promise(r=>setTimeout(r,100)); }
    throw new Error('OLED check did not settle: '+code);
  };
  const capture = async name => { await new Promise(r=>setTimeout(r,250)); await writeFile(join(directory,name),(await window.webContents.capturePage()).toPNG()); };
  const request = async (path,method='GET',body) => {
    const multipart=body instanceof FormData;
    const response=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,'X-Request-ID':randomUUID(),...(body&&!multipart?{'Content-Type':'application/json'}:{})},...(body?{body:multipart?body:JSON.stringify(body)}:{})});
    assert.ok(response.ok,'Disposable fixture failed: '+path+' '+response.status);
    const text=await response.text();return text?JSON.parse(text):undefined;
  };
  const key = keyCode => { window.webContents.sendInputEvent({type:'keyDown',keyCode});window.webContents.sendInputEvent({type:'keyUp',keyCode}); };
  const click = async (selector,label) => evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw new Error('Missing '+${JSON.stringify(label)});b.click();})()`);
  const cycle = async theme => {await evaluate("document.querySelector('button[aria-label^=\"Switch theme\"]').click()");await wait('document.documentElement.dataset.theme==='+JSON.stringify(theme==='os'?'dark':theme));};
  window.setSize(1320,900);window.showInactive();nativeTheme.themeSource='dark';
  await wait("document.documentElement.dataset.theme==='dark'");
  await cycle('light');await capture('oled-light-regression.png');await cycle('dark');await capture('oled-dark-regression.png');await cycle('oled');
  // Wait for scoped device settings to be persisted before patching fixtures.
  let device;
  for(let i=0;i<60;i++){const settings=await request('/settings');device=Object.entries(settings.local).find(([,local])=>local.theme==='oled')?.[0];if(device)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(device);
  await request('/settings','PATCH',{local:{[device]:{uiTransparency:0.6,accentColor:'purple',animationMode:'smooth'}}});
  const linked=await request('/resources','POST',{title:'Linked note',type:'note',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'A linked destination.'}]}]}});
  const paragraph = text => ({type:'paragraph',content:[{type:'text',text}]});
  const cell = text => ({type:'tableCell',content:[paragraph(text)]});
  const note=await request('/resources','POST',{title:'OLED — a long descriptive note title for narrow windows',type:'note',content:{type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:'True black, quiet depth'}]},paragraph('Readable text and restrained purple accents.'),{type:'paragraph',content:[{type:'text',text:'Inline code',marks:[{type:'code'}]}]},{type:'codeBlock',attrs:{language:'javascript'},content:[{type:'text',text:'const theme = "oled";\nconsole.log(theme);'}]},{type:'table',content:[{type:'tableRow',content:[cell('Surface'),cell('Black')]},{type:'tableRow',content:[cell('Canvas'),cell('#000000')]}]},{type:'paragraph',content:[{type:'resourceLink',attrs:{resourceId:linked.id,label:'Linked note',type:'note'}}]}]}});
  const file=new FormData();file.append('file',new Blob(['OLED preview fixture.'],{type:'text/plain'}),'Reference.txt');
  const uploaded=await request('/resources/file','POST',file);
  await request('/resources/'+note.id+'/open','POST');await request('/resources/'+note.id+'/favorite','PUT',{favorite:true});
  await request('/resources/'+uploaded.id+'/favorite','PUT',{favorite:true});
  await window.webContents.reload();await wait("document.documentElement.dataset.theme==='oled' && document.querySelectorAll('.library-row').length===3");
  const black = async selectors => {
    for(const selector of selectors) { const color=`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).backgroundColor`;await wait(color+"==='rgb(0, 0, 0)'");assert.equal(await evaluate(color),'rgb(0, 0, 0)',selector+' must be true black'); }
  };
  await black(['body','aside','.browse-rows','.desktop-window-controls']);
  assert.equal(await evaluate("document.documentElement.style.colorScheme"),'dark');
  assert.ok(await evaluate("document.documentElement.classList.contains('dark')"));
  const luminance = hex => { const channels=hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722; };
  const colors=await evaluate("(()=>{const s=getComputedStyle(document.documentElement);return ['--text-primary','--text-secondary','--text-tertiary'].map(n=>s.getPropertyValue(n).trim());})()");
  for(const text of colors)for(const surface of ['#000000','#0a0a0a','#141414','#1e1e1e'])assert.ok((luminance(text)+0.05)/(luminance(surface)+0.05)>=4.5,'OLED text contrast '+text+' on '+surface);
  await capture('oled-library.png');
  await evaluate("document.querySelector('button[aria-label=\"Filter resource type\"]').click()");await wait("Boolean(document.querySelector('.library-popover'))");
  await capture('oled-filter.png');key('Escape');await wait("!document.querySelector('.library-popover')");
  assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"),'Filter resource type');
  await evaluate("document.querySelector('#sidebar-recent .sidebar-shortcut-open').click()");await wait("Boolean(document.querySelector('.tiptap pre'))");
  await black(['.journey-bar','[data-note-pane]']);
  await capture('oled-note.png');
  await click('.tiptap button','JavaScript');await wait("Boolean(document.querySelector('input[placeholder=\"Search...\"]'))");await capture('oled-code-menu.png');key('Escape');
  await click('.tiptap button','JavaScript');
  // Normal focus allows palette actions without a mouse.
  await evaluate("document.querySelector('.sidebar-nav').click()");await wait("Boolean(document.querySelector('[aria-label=\"Search and commands\"]'))");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[aria-label=\"Search and commands\"]')).backgroundColor"),'rgb(10, 10, 10)');
  await capture('oled-palette.png');key('Escape');await wait("!document.querySelector('[aria-label=\"Search and commands\"]')");
  await evaluate("document.querySelector('button[title=\"Settings\"]').click()");await wait("Boolean(document.querySelector('[role=dialog]'))");
  await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Appearance').click()");await capture('oled-settings.png');
  assert.ok(await evaluate("document.body.innerText.includes('OLED keeps surfaces opaque')"));key('Escape');await wait("!document.querySelector('[role=dialog]')");
  await evaluate("document.querySelector('button[aria-label^=\"Export OLED\"]').click()");await wait("Boolean(document.querySelector('[role=dialog]'))");await capture('oled-export.png');key('Escape');
  await click('#sidebar-pinned .sidebar-shortcut-open','Reference.txt');await wait("Boolean(document.querySelector('[data-preview-resource]'))");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-preview-resource] > .pointer-events-auto')).backgroundColor"),'rgb(10, 10, 10)');
  assert.ok(await evaluate("(()=>{const c=document.querySelector('.desktop-window-controls').getBoundingClientRect();return [...document.querySelectorAll('[data-preview-resource] button')].every(b=>{const r=b.getBoundingClientRect();return r.top>=c.bottom||r.right<=c.left;});})()"),'Preview buttons clear native controls');
  await capture('oled-preview.png');await click('[data-preview-resource] button','Floating');await wait("Boolean(document.querySelector('button[title=\"Switch to side preview\"]'))");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-preview-resource]')).backgroundColor"),'rgb(10, 10, 10)');await capture('oled-preview-floating.png');key('Escape');await wait("!document.querySelector('[data-preview-resource]')");
  await evaluate("document.querySelector('.desktop-connection-button').click()");await wait("Boolean(document.querySelector('.desktop-connections-dialog'))");await capture('oled-connections.png');
  await click('.desktop-connections-dialog button','Hosting');await capture('oled-hosting.png');await evaluate("document.querySelector('button[aria-label=\"Return to workspace\"]').click()");
  // Reduced-motion and long title at a narrow window remain bounded.
  window.setSize(700,820);await window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.journey-trail')).animationName"),'none');
  await capture('oled-narrow.png');assert.ok(await evaluate("document.querySelector('.app-root').scrollWidth<=innerWidth"));
  await window.webContents.debugger.detach();window.setSize(1320,900);
  const saved=await request('/settings');assert.equal(saved.local[device].uiTransparency,0.6);assert.equal(saved.local[device].theme,'oled');
  await cycle('os');await wait("document.documentElement.dataset.theme==='dark'");
  assert.equal(await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--glass-opacity').trim()"),'');
  for(let i=0;i<60;i++){if((await request('/settings')).local[device].theme==='os')break;if(i===59)throw new Error('Final theme save did not settle');await new Promise(r=>setTimeout(r,100));}
  console.log('Disposable OLED native check passed; physical OLED hardware is not certified.');
}
