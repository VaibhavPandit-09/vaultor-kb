import assert from 'node:assert/strict';
import { safeStorage } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Credentials } from '../src/credentials.mjs';
export async function runChromeSmoke(window, directory) {
  const evaluate = code => window.webContents.executeJavaScript(code);
  const wait = async (code, label) => { for (let i = 0; i < 500; i++) { if (await evaluate(code).catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(label + ': ' + await evaluate('document.body.innerText')); };
  await wait("Boolean(document.querySelector('.library-view'))", 'Local workspace');
  window.showInactive(); await new Promise(r => setTimeout(r, 200));
  assert.equal(window.isMenuBarVisible(), false);
  const geometry = await evaluate("({top:document.querySelector('.app-root').getBoundingClientRect().top,controls:document.querySelector('.desktop-window-controls').getBoundingClientRect().height,sidebar:Boolean(document.querySelector('.desktop-connection-button')),noStrip:!document.body.innerText.includes('Local connection')})");
  // Give a hidden Chromium surface time to paint the selected view, not the
  // initial connection frame that preceded workspace activation.
  const capture = async name => { await new Promise(r => setTimeout(r, 350)); await writeFile(join(directory, name), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG()); };
  assert.equal(geometry.top, 0); assert.equal(geometry.controls, 34); assert.equal(geometry.sidebar, true); assert.equal(geometry.noStrip, true);
  const credentials = new Credentials(join(directory, 'native-credential-test'), safeStorage); await credentials.load();
  const secret = randomBytes(32).toString('hex'); await credentials.set('disposable', secret);
  const restored = new Credentials(join(directory, 'native-credential-test'), safeStorage); await restored.load(); assert.equal(restored.get('disposable'), secret);
  await evaluate("document.querySelector('.desktop-connection-button').click()");
  await wait("document.querySelector('[role=dialog]')?.textContent.includes('Nearby')", 'Connection UI');
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Hosting').click()");
  await wait("document.body.innerText.includes('Share this computer on the private network')", 'Hosting controls');
  const check = await evaluate("[...document.querySelectorAll('input[type=checkbox]')].find(i=>i.parentElement.textContent.includes('Share this computer')).checked"); assert.equal(check, false);
  await capture('desktop-hosting.png');
  await evaluate("document.querySelector('button[aria-label=\"Return to workspace\"]').click()");
  window.maximize(); await new Promise(r => setTimeout(r, 250));
  assert.equal((await evaluate('window.vaultorDesktop.windowStatus()')).value.maximized, true);
  window.unmaximize(); window.setSize(1320, 900); await new Promise(r => setTimeout(r, 250));
  await evaluate("document.documentElement.classList.add('dark');document.documentElement.classList.remove('light')");
  await capture('desktop-chrome-dark.png');
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='New Note').click()");
  await wait("Boolean(document.querySelector('.journey-bar') && document.querySelector('.tiptap'))", 'Note journey');
  const noteClear = await evaluate("(()=>{const c=document.querySelector('.desktop-window-controls').getBoundingClientRect();return [...document.querySelectorAll('.journey-bar button')].every(b=>{const r=b.getBoundingClientRect();return r.width===0||r.right<=c.left||r.top>=c.bottom;});})()"); assert.ok(noteClear, 'Window controls must not overlap note navigation.');
  await capture('desktop-chrome-note.png');
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Library').click()");
  await wait("Boolean(document.querySelector('.library-view'))", 'Return to Library');
  await evaluate("document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');document.documentElement.dataset.theme='light'");
  await new Promise(r => setTimeout(r, 150));
  await capture('desktop-chrome-light.png');
  window.setSize(680, 680); await new Promise(r => setTimeout(r, 200));
  await capture('desktop-chrome-narrow.png');
  const clear = await evaluate("(()=>{const c=document.querySelector('.desktop-window-controls').getBoundingClientRect();return [...document.querySelectorAll('.library-heading button')].every(b=>{const r=b.getBoundingClientRect();return r.bottom<=c.top||r.top>=c.bottom||r.right<=c.left;});})()"); assert.ok(clear, 'Window controls must not overlap Library actions.');
  console.log('Native chrome/default-sharing/OS-protected credential check passed.');
}
