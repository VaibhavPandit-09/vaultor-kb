import assert from 'node:assert/strict';
import { nativeTheme } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Read-only, disposable layout check; no resources or user preferences are written.
export async function runLayoutSmoke(window, directory) {
  const evaluate = code => window.webContents.executeJavaScript(code);
  const wait = async code => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(code)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Layout view did not settle: ' + code);
  };
  const capture = async name => {
    await new Promise(resolve => setTimeout(resolve, 350));
    await writeFile(join(directory, name), (await window.webContents.capturePage()).toPNG());
  };
  const geometry = async () => {
    const result = await evaluate(`(() => {
      const view = document.querySelector('.library-view');
      const heading = view.querySelector('.library-heading').getBoundingClientRect();
      const actions = view.querySelector('.library-heading-actions').getBoundingClientRect();
      const controls = document.querySelector('.desktop-window-controls').getBoundingClientRect();
      return {aligned: Math.abs(actions.right-heading.right)<1,
        contained: view.scrollWidth<=view.clientWidth && heading.right<=innerWidth,
        clear: [...view.querySelectorAll('.library-heading button')].every(b => {
          const r=b.getBoundingClientRect(); return r.top>=controls.bottom || r.right<=controls.left;
        })};
    })()`);
    assert.ok(result.aligned, 'Actions align with the content right edge');
    assert.ok(result.contained, 'Heading must fit within the view');
    assert.ok(result.clear, 'Native controls must not cover page actions');
  };
  window.setSize(1320, 900); window.showInactive();
  nativeTheme.themeSource = 'dark';
  await wait("document.documentElement.dataset.theme==='dark'");
  await geometry(); await capture('library-layout-dark.png');
  await evaluate("[...document.querySelectorAll('.library-heading button')].find(b=>b.textContent==='More').click()");
  await wait("Boolean(document.querySelector('.library-popover'))");
  assert.ok(await evaluate("(()=>{const r=document.querySelector('.library-popover').getBoundingClientRect();return r.right<=innerWidth && r.bottom<=innerHeight;})()"));
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await wait("!document.querySelector('.library-popover')");
  await evaluate("[...document.querySelectorAll('.sidebar-nav')].find(b=>b.textContent.trim()==='Collections').click()");
  await wait("document.querySelector('.library-heading h1')?.textContent==='Collections'");
  await geometry(); await capture('collections-layout-dark.png');
  nativeTheme.themeSource = 'light';
  await wait("document.documentElement.dataset.theme==='light'");
  await geometry(); await capture('collections-layout-light.png');
  window.setSize(600, 760);
  // A DOM-only fixture exercises long headings without creating workspace data.
  await evaluate("document.querySelector('.library-heading h1').textContent='Collections for a very long project topic'");
  await new Promise(resolve => setTimeout(resolve, 250));
  await geometry(); await capture('collections-layout-narrow.png');
  console.log('Focused Library/Collections layout and More dismissal passed.');
}
