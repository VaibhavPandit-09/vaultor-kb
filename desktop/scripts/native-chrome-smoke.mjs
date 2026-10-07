import assert from 'node:assert/strict';
import { app, safeStorage, Menu } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Credentials } from '../src/credentials.mjs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nativeTheme } from 'electron';
export async function runChromeSmoke(window, directory, owned) {
  const evaluate = code => window.webContents.executeJavaScript(code);
  const wait = async (code, label) => { for (let i = 0; i < 500; i++) { if (await evaluate(code).catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(label + ': ' + await evaluate('document.body.innerText')); };
  await wait("Boolean(document.querySelector('.library-view'))", 'Local workspace');
  if (process.env.VAULTOR_LAYOUT_SMOKE === '1') {
    const { runLayoutSmoke } = await import('./native-layout-smoke.mjs');
    await runLayoutSmoke(window, directory, owned); return;
  }
  window.showInactive(); await new Promise(r => setTimeout(r, 200));
  if(process.platform==='darwin'){
    const labels=Menu.getApplicationMenu()?.items.map(item=>item.label)??[];
    assert.ok(['File','View','Window'].every(label=>labels.includes(label)));
  }else assert.equal(window.isMenuBarVisible(), false);
  const geometry = await evaluate("({top:document.querySelector('.app-root').getBoundingClientRect().top,controls:document.querySelector('.desktop-window-controls').getBoundingClientRect().height,sidebar:Boolean(document.querySelector('.desktop-connection-button')),noStrip:!document.body.innerText.includes('Local connection')})");
  // Give a hidden Chromium surface time to paint the selected view, not the
  // initial connection frame that preceded workspace activation.
  const capture = async name => { await new Promise(r => setTimeout(r, 350)); await writeFile(join(directory, name), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG()); };
  assert.equal(geometry.top, 0); assert.equal(geometry.controls, 34); assert.equal(geometry.sidebar, true); assert.equal(geometry.noStrip, true);
  const credentials = new Credentials(join(directory, 'native-credential-test'), safeStorage); await credentials.load();
  const secret = randomBytes(32).toString('hex'); await credentials.set('disposable', secret);
  const restored = new Credentials(join(directory, 'native-credential-test'), safeStorage); await restored.load(); assert.equal(restored.get('disposable'), secret);
  window.webContents.send('desktop:updates-open');
  await wait("document.body.innerText.includes('Vaultor updates')",'Update dialog');
  assert.ok(await evaluate("document.body.innerText.includes('Import update') && document.body.innerText.includes("+JSON.stringify(app.getVersion())+")"));
  await capture('desktop-updates.png');
  await evaluate("document.querySelector('button[aria-label=\"Close modal\"]').click()");
  await evaluate("document.querySelector('.desktop-connection-button').click()");
  await wait("document.querySelector('[role=dialog]')?.textContent.includes('Nearby')", 'Connection UI');
  assert.ok(await evaluate("(()=>{const c=document.querySelector('.desktop-profile-open');return c.querySelector('.desktop-profile-label').getBoundingClientRect().right<=c.querySelector('.desktop-profile-action').getBoundingClientRect().left;})()"));
  nativeTheme.themeSource='dark';await wait("document.documentElement.dataset.theme==='dark'",'Connection dark');await capture('desktop-connections-dark.png');
  nativeTheme.themeSource='light';await wait("document.documentElement.dataset.theme==='light'",'Connection light');await capture('desktop-connections-light.png');
  const originalBounds=window.getBounds();window.setSize(440,760);await new Promise(r=>setTimeout(r,250));
  assert.ok(await evaluate("(()=>{const d=document.querySelector('.desktop-connections-dialog');return d.scrollWidth<=d.clientWidth&&d.getBoundingClientRect().right<=innerWidth;})()"));
  await capture('desktop-connections-narrow.png');window.setBounds(originalBounds);nativeTheme.themeSource='dark';
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Hosting').click()");
  await wait("document.body.innerText.includes('Share this computer on the private network')", 'Hosting controls');
  const check = await evaluate("[...document.querySelectorAll('input[type=checkbox]')].find(i=>i.parentElement.textContent.includes('Share this computer')).checked"); assert.equal(check, false);
  await capture('desktop-hosting.png');
  await evaluate("document.querySelector('button[aria-label=\"Return to workspace\"]').click()");
  const click = async label => {
    const point=await evaluate(`(()=>{const r=document.querySelector('button[aria-label="${label}"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
    if(process.platform==='win32')await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./native-pointer.ps1',import.meta.url)),'-Handle',window.getNativeWindowHandle().readBigUInt64LE().toString(),'-X',String(point.x),'-Y',String(point.y)],{windowsHide:true},error=>error?reject(error):resolve()));
    else window.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1}),window.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});
    await new Promise(r=>setTimeout(r,200));
  };
  nativeTheme.themeSource='dark';await wait("document.documentElement.dataset.theme==='dark'",'OS dark');
  nativeTheme.themeSource='light';await wait("document.documentElement.dataset.theme==='light'",'OS light');
  if(process.platform==='win32') {
    await click('Window menu');
    await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./native-pointer.ps1',import.meta.url)),'-Handle',window.getNativeWindowHandle().readBigUInt64LE().toString(),'-MenuSelect'],{windowsHide:true},error=>error?reject(error):resolve()));
    await wait("Boolean(document.querySelector('[role=dialog]')?.textContent.includes('Nearby'))",'Native menu click');
    await evaluate("document.querySelector('button[aria-label=\"Return to workspace\"]').click()");
  }
  await click('Maximize');
  assert.equal((await evaluate('window.vaultorDesktop.windowStatus()')).value.maximized, true);
  await click('Restore window');assert.equal(window.isMaximized(),false);
  await click('Minimize');assert.equal(window.isMinimized(),true);window.restore();window.show();
  window.setSize(1320, 900); await new Promise(r => setTimeout(r, 250));
  nativeTheme.themeSource='dark';await wait("document.documentElement.dataset.theme==='dark'",'Dark capture');
  await capture('desktop-chrome-dark.png');
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim().toLowerCase()==='new note').click()");
  await wait("Boolean(document.querySelector('.journey-bar') && document.querySelector('.tiptap'))", 'Note journey');
  await click('Maximize');assert.equal(window.isMaximized(),true);await click('Restore window');
  const noteId=await evaluate("document.querySelector('[data-note-pane]').dataset.notePane");
  const get=async()=>{const response=await fetch(owned.address+'/api/resources/'+noteId,{headers:{'X-Vaultor-Owner':owned.accessKey}});assert.equal(response.status,200);return response.json();};
  const initial=await get();await evaluate("document.querySelector('.tiptap').focus()");
  const remote=await fetch(owned.address+'/api/resources/'+noteId+'/note',{method:'PUT',headers:{'X-Vaultor-Owner':owned.accessKey,'Content-Type':'application/json','If-Match':'"'+initial.revision+'"','X-Request-ID':'chrome-remote'},body:JSON.stringify({title:'Remote title',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Saved from another client'}]}]}})});
  assert.equal(remote.status,200);const saved=await remote.json();
  await wait("document.querySelector('.tiptap')?.textContent.includes('Saved from another client') && document.body.innerText.includes('Remote title')",'Native saved-change propagation');
  assert.equal((await get()).revision,saved.revision,'Applying remote content must not create a new save');
  const noteClear = await evaluate("(()=>{const c=document.querySelector('.desktop-window-controls').getBoundingClientRect();return [...document.querySelectorAll('.journey-bar button')].every(b=>{const r=b.getBoundingClientRect();return r.width===0||r.right<=c.left||r.top>=c.bottom;});})()"); assert.ok(noteClear, 'Window controls must not overlap note navigation.');
  await capture('desktop-chrome-note.png');
  const deleted=await fetch(owned.address+'/api/resources/'+noteId,{method:'DELETE',headers:{'X-Vaultor-Owner':owned.accessKey,'X-Request-ID':'chrome-delete'}});assert.equal(deleted.status,204);
  await wait("document.body.innerText.includes('deleted on another device') && document.body.innerText.includes('Review drafts')",'Remote deletion recovery');
  assert.ok(await evaluate("document.querySelector('.tiptap')?.textContent.includes('Saved from another client')"));
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Library').click()");
  await wait("Boolean(document.querySelector('.library-view'))", 'Return to Library');
  nativeTheme.themeSource='light';await wait("document.documentElement.dataset.theme==='light'",'Light capture');
  await new Promise(r => setTimeout(r, 150));
  await capture('desktop-chrome-light.png');
  window.setSize(680, 680); await new Promise(r => setTimeout(r, 200));
  await capture('desktop-chrome-narrow.png');
  const clear = await evaluate("(()=>{const c=document.querySelector('.desktop-window-controls').getBoundingClientRect();return [...document.querySelectorAll('.library-heading button')].every(b=>{const r=b.getBoundingClientRect();return r.bottom<=c.top||r.top>=c.bottom||r.right<=c.left;});})()"); assert.ok(clear, 'Window controls must not overlap Library actions.');
  await click('Close window');assert.equal(window.isVisible(),false);window.showInactive();
  console.log('Native chrome/default-sharing/OS-protected credential check passed.');
}
