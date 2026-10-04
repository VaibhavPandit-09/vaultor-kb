import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BrowserWindow } from 'electron';
export async function runSmoke(window, directory) {
  const wc = window.webContents;
  const evaluate = code => wc.executeJavaScript(code);
  async function wait(code, label) {
    for (let i = 0; i < 150; i++) { if (await evaluate(code).catch(() => false)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(label + ': ' + await evaluate('document.body.innerText'));
  }
  await wait('Boolean(window.vaultorDesktop && document.body)', 'Preload/root');
  assert.equal(await evaluate('typeof require'), 'undefined'); assert.equal(await evaluate('typeof process'), 'undefined');
  if (process.env.VAULTOR_SMOKE_MODE === 'first') {
    await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Disposable fixture'))", 'Connection picker');
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Disposable fixture')).click()");
    await wait("Boolean(document.querySelector('button.library-resource'))", 'Workspace');
    await evaluate("document.querySelector('button.library-resource').click()");
    await wait("Boolean(document.querySelector('.tiptap'))", 'Editor');
    await evaluate("document.querySelector('.tiptap').focus()");
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'END', modifiers: ['control'] }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'END', modifiers: ['control'] });
    wc.insertText(' Desktop check.');
    await wait("document.querySelector('.tiptap')?.textContent.includes('Desktop check.')", 'Native typing');
    await new Promise(resolve => setTimeout(resolve, 800));
    const invalid = await evaluate("window.vaultorDesktop.request({id:'invalid',token:'bad',path:'https://example.com',method:'GET',timeout:1000,headers:{}})");
    assert.equal(invalid.ok, false);
    await evaluate("window.open('file:///C:/Windows/win.ini')"); assert.equal(BrowserWindow.getAllWindows().length, 1); assert.equal(wc.getURL(), 'vaultor://app/');
    window.showInactive(); await new Promise(resolve => setTimeout(resolve, 250));
    const image = await wc.capturePage(); await writeFile(join(directory, 'native.png'), image.toPNG()); window.hide();
  } else {
    await wait("Boolean(document.querySelector('.tiptap'))", 'Restored note without manual connection');
    assert.equal(await evaluate("document.querySelector('.tiptap').textContent.includes('Desktop check.')"), true);
  }
  console.log('Native check: ' + process.env.VAULTOR_SMOKE_MODE + ' passed.');
}
