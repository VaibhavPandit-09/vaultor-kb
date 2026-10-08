import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

/** Settings-only session, owned disposable host; never mutates the user's workspace. */
export async function runSettingsSmoke(window, directory, owned) {
  assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
  const evaluate = code => window.webContents.executeJavaScript(code);
  const wait = async code => { for (let i=0;i<150;i++) { if(await evaluate(code).catch(()=>false)) return; await new Promise(r=>setTimeout(r,100)); } throw new Error('Settings check did not settle: '+code); };
  const key = (keyCode, modifiers=[]) => { window.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});window.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers}); };
  const capture = async name => { await new Promise(r=>setTimeout(r,250)); await writeFile(join(directory,name),(await window.webContents.capturePage()).toPNG()); };
  const click = async selector => { await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
  const text = async value => evaluate(`(()=>{const i=document.querySelector('input[aria-label="Search settings"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const category = async label => evaluate(`(()=>{const b=[...document.querySelectorAll('.settings-rail button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw new Error('Category missing');b.click();})()`);
  const theme = async name => { await category('Appearance');await evaluate(`document.querySelector('[aria-label="Theme"] [role="radio"]').parentElement.querySelectorAll('button')[${['OS','Light','Dark','OLED'].indexOf(name)}].click()`);await wait(`document.documentElement.dataset.theme===${JSON.stringify(name.toLowerCase())}`);await wait("document.querySelector('.settings-save-status')?.textContent==='Saved'");await new Promise(r=>setTimeout(r,200)); };
  window.setSize(1320,900);window.showInactive();
  await click('button[title="Settings"]');await wait("document.activeElement?.getAttribute('aria-label')==='Search settings'");
  assert.equal(await evaluate("document.querySelector('.settings-rail [aria-current]').textContent.trim()"),'Appearance');
  await theme('OLED');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.settings-window')).backgroundColor"),'rgb(0, 0, 0)');
  await click('[aria-label="Purple"]');await wait("document.querySelector('.settings-save-status')?.textContent==='Saved'");
  await capture('settings-oled.png');
  await category('Workspace');await capture('settings-workspace.png');
  await category('Keyboard');await capture('settings-keyboard.png');
  const headerHeight=await evaluate("document.querySelector('.settings-header').getBoundingClientRect().height");
  await text('side');await wait("document.querySelectorAll('.settings-section').length>=2");assert.equal(await evaluate("document.querySelector('.settings-header').getBoundingClientRect().height"),headerHeight);await capture('settings-search.png');
  await click('[aria-label="Clear settings search"]');assert.equal(await evaluate("document.querySelector('.settings-section h3').textContent"),'Keyboard');
  await click('[aria-label="Settings options"]');await wait("document.activeElement?.getAttribute('role')==='menuitem'");key('Escape');await wait("!document.querySelector('.settings-options')");
  assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"),'Settings options');
  await click('[aria-label="Settings options"]');await evaluate("[...document.querySelectorAll('[role=menuitem]')].find(b=>b.textContent==='Reset device preferences').click()");await wait("document.querySelector('[role=alertdialog]')");await capture('settings-reset.png');key('Escape');await wait("!document.querySelector('[role=alertdialog]')");
  assert.ok(await evaluate("Boolean(document.querySelector('.settings-window'))"));
  await theme('Light');await capture('settings-light.png');await theme('Dark');await capture('settings-dark.png');await theme('OLED');
  window.setSize(640,800);await new Promise(r=>setTimeout(r,250));
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.settings-rail')).display"),'none');
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.settings-mobile-category')).display"),'none');
  assert.ok(await evaluate("(()=>{const w=document.querySelector('.settings-window');return w.scrollWidth<=w.clientWidth+1 && w.getBoundingClientRect().right<=innerWidth;})()"));
  await evaluate(`document.querySelector('input[aria-label="UI transparency value"]').focus()`);key('Tab');await wait("document.activeElement?.getAttribute('aria-label')==='Search settings'");
  await evaluate("document.querySelector('.settings-content').scrollTo(0,0)");
  await capture('settings-narrow.png');key('Escape');await wait("!document.querySelector('.settings-window')");
  const response=await fetch(owned.address+'/api/settings',{headers:{'X-Vaultor-Owner':owned.accessKey}});assert.ok(response.ok);const saved=await response.json();
  assert.ok(Object.values(saved.local).some(value=>value.theme==='oled'&&value.accentColor==='purple'));
  console.log('Disposable settings native check passed; OLED, Light/Dark, global search, reset/Escape/focus and narrow layout.');
}
