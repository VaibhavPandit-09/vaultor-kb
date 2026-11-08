import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

/** Production UI, existing native smoke profile and disposable owned workspace only. */
export async function runHelpCheck(window, directory) {
  assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
  const wc = window.webContents, evaluate = code => wc.executeJavaScript(code);
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async code => { for (let i = 0; i < 150; i++) { if (await evaluate(code).catch(() => false)) return; await delay(100); } throw Error('Help smoke timed out: ' + code); };
  const clickText = text => evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button');b.click();})()`);
  window.setSize(1180, 820); window.showInactive();
  await clickText('New note');
  await wait("Boolean(document.querySelector('.tiptap[contenteditable=true]'))");
  await evaluate("window.__helpTestEditor=document.querySelector('.tiptap[contenteditable=true]');window.__helpTestEditor.focus()");
  wc.insertText('Help smoke retained draft');
  await wait("window.__helpTestEditor.textContent.includes('Help smoke retained draft')");
  // The app command is the same preload-admitted message used by the application menu.
  wc.send('desktop:app-command', 'help');
  await wait("Boolean(document.querySelector('[aria-label=\"Search Help\"]'))");
  wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('Network.enable');
  await wc.debugger.sendCommand('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  const searches = [['select multiple notes', 'Selection'], ['drag and drop', 'Selection'], ['linked markdown', 'Linked sources'], ['recover deleted note', 'Trash'], ['keyboard shortcuts', 'Keyboard'], ['import folder', 'Importing'], ['copy resource', 'Selection'], ['open in another pane', 'Panes']];
  for (const [query, expected] of searches) {
    await evaluate(`(()=>{const e=document.querySelector('[aria-label="Search Help"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(query)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await wait(`document.querySelector('[aria-label="Help search results"]')?.textContent.includes(${JSON.stringify(expected)})`);
  }
  await clickText('Help home');
  await clickText('Keyboard shortcuts');
  await wait("Boolean(document.querySelector('[aria-label=\"Current keyboard bindings\"]'))");
  assert.equal(await evaluate("document.querySelectorAll('.help-prose [contenteditable], .help-prose textarea, .help-prose script, .help-prose iframe').length"), 0);
  await clickText('Copy article');
  await wait("document.querySelector('.help-article-tools').textContent.includes('Article copied')");
  await delay(250);
  await writeFile(join(directory, 'help-wide.png'), (await wc.capturePage()).toPNG());
  window.setSize(480, 720); await delay(250);
  await clickText('Help home'); await clickText('Platform support and Android companion');
  await wait("Boolean(document.querySelector('.help-prose table'))");
  assert.ok(await evaluate("(()=>{const e=document.querySelector('.app-modal-window');return e.scrollWidth<=e.clientWidth+1;})()"));
  await delay(250);
  await writeFile(join(directory, 'help-narrow.png'), (await wc.capturePage()).toPNG());
  await evaluate("document.querySelector('[aria-label=\"Close modal\"]').click()");
  await wait("!document.querySelector('.help-center')");
  assert.equal(await evaluate("window.__helpTestEditor===document.querySelector('.tiptap[contenteditable=true]')&&window.__helpTestEditor.textContent.includes('Help smoke retained draft')"), true);
  await wc.debugger.sendCommand('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  wc.debugger.detach();
  window.setSize(1180, 820); await delay(200);
  await evaluate("document.querySelector('[aria-label=\"Help for this screen\"]').click()");
  await wait("document.querySelector('.help-title')?.textContent==='Notes, editing and links'");
  await evaluate("document.querySelector('[aria-label=\"Close modal\"]').click()");
  await evaluate("document.querySelector('button[title=Settings]').click()");
  await wait("Boolean(document.querySelector('[aria-label=\"Help with settings\"]'))");
  await evaluate("document.querySelector('[aria-label=\"Help with settings\"]').click()");
  await wait("document.querySelector('.help-title')?.textContent==='Settings and appearance'");
  assert.equal(await evaluate("document.activeElement===document.querySelector('[aria-label=\"Search Help\"]')"), true);
  await evaluate("document.querySelector('[aria-label=\"Close modal\"]').click()");
  assert.equal(await evaluate("Boolean(document.querySelector('[aria-label=\"Search settings\"]'))"), true);
  console.log('Help production-equivalent Windows smoke passed: menu IPC, contextual editor/Settings, eight offline searches, live shortcuts, copy, narrow table, read-only rendering and retained mounted draft. Screenshots: ' + directory);
}
