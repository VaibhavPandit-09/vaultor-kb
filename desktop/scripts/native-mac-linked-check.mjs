import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {join,dirname,basename} from 'node:path';
/** Packaged acceptance with a REAL native picker; an operator selects only the
 * generated disposable source. No picker substitution or renderer file grant. */
export async function runMacLinkedCheck(window,directory){
  assert.equal(process.platform,'darwin');assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
  const wc=window.webContents,evaluate=code=>wc.executeJavaScript(code);
  const wait=async(code,label)=>{for(let i=0;i<600;i++){if(await evaluate(code).catch(()=>false))return;await new Promise(r=>setTimeout(r,100));}throw Error(label+': '+await evaluate('document.body.innerText'));};
  const click=async label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled);if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click()})()`);
  const capture=async name=>writeFile(join(directory,name),(await wc.capturePage()).toPNG());
  const edit=async text=>{await evaluate("(()=>{const p=document.querySelector('.tiptap p'),r=document.createRange();r.selectNodeContents(p);const s=getSelection();s.removeAllRanges();s.addRange(r);p.closest('.tiptap').focus();})()");wc.insertText(text);await wait("[...document.querySelectorAll('[role=status]')].some(s=>s.textContent==='Unsaved changes')",'Validated edit');};
  window.show();window.focus();
  const marker=await readFile(join(directory,'mac-linked-fixture.json'),'utf8').then(JSON.parse).catch(()=>null);
  if(marker){
    await wait("document.querySelector('.tiptap p')?.textContent==='Protected Mac draft.'",'Restored protected draft');
    assert.equal(await readFile(marker.file,'utf8'),marker.expected);
    await click('Recovery');await wait("[...document.querySelectorAll('[role=dialog] button')].some(b=>b.textContent.includes('guide.md')&&b.textContent.includes('Protected draft'))",'Recovery after restart');
    await capture('mac-restarted-recovery.png');await click('Keep drafts and close');
    await click('Save');await wait("[...document.querySelectorAll('[role=status]')].some(s=>s.textContent==='Saved')",'Save recovered draft');
    assert.equal(await readFile(marker.file,'utf8'),marker.expected.replace('Edited on Mac.','Protected Mac draft.'));
    console.log('PASS packaged relaunch restored source identity/session/protected draft; Recovery UI; explicit recovered Save');return;
  }
  const source=await mkdtemp(join(dirname(directory),'vaultor-mac-source-'));
  const file=join(source,'guide.md'),original='\ufeff# Mac guide\r\n\r\nOriginal paragraph.\r\n\r\n<!-- untouched -->\r\n',expected=original.replace('Original paragraph.','Edited on Mac.');
  await writeFile(file,original);await writeFile(join(source,'untouched.md'),'Keep exactly\r\n');
  await writeFile(join(directory,'mac-linked-fixture.json'),JSON.stringify({source,file,expected}));
  console.log('SELECT DISPOSABLE NATIVE FOLDER: '+source);
  await evaluate("document.querySelector('button[aria-label=\"Link folder\"]').click()");
  await wait("[...document.querySelectorAll('[aria-label=\"Linked sources\"] button')].some(b=>b.textContent.includes('vaultor-mac-source-'))",'Native folder selection');
  await evaluate("[...document.querySelectorAll('[aria-label=\"Linked sources\"] button')].find(b=>b.textContent.includes('vaultor-mac-source-')).click()");
  await wait("[...document.querySelectorAll('[aria-label=\"Linked sources\"] button')].some(b=>b.textContent==='guide.md')",'Filesystem hierarchy');await click('guide.md');
  await wait("document.querySelector('.tiptap p')?.textContent==='Original paragraph.'",'Rich Markdown editor');
  await edit('Edited on Mac.');wc.sendInputEvent({type:'keyDown',keyCode:'S',modifiers:['meta']});wc.sendInputEvent({type:'keyUp',keyCode:'S',modifiers:['meta']});
  await wait("[...document.querySelectorAll('[role=status]')].some(s=>s.textContent==='Saved')",'Command-S');
  assert.equal(await readFile(file,'utf8'),expected);assert.equal(await readFile(join(source,'untouched.md'),'utf8'),'Keep exactly\r\n');await capture('mac-linked-saved.png');
  await edit('Protected Mac draft.');await new Promise(r=>setTimeout(r,1000));
  await click('Recovery');await wait("[...document.querySelectorAll('[role=dialog] button')].some(b=>b.textContent.includes('guide.md')&&b.textContent.includes('Protected draft'))",'Protected Recovery record');
  await capture('mac-linked-recovery.png');await click('Keep drafts and close');assert.equal(await readFile(file,'utf8'),expected);
  console.log('PASS packaged actual native folder picker, hierarchy, rich edit, Command-S, exact BOM/CRLF bytes, neighbour preservation and protected Recovery record');
}
