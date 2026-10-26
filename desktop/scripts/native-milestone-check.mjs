import assert from 'node:assert/strict';
import {dialog} from 'electron';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,basename} from 'node:path';

/** One bounded real renderer check; picker fixtures grant only disposable data. */
export async function runMilestoneCheck(window,directory){
  assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
  const wc=window.webContents, evaluate=code=>wc.executeJavaScript(code);
  const wait=async code=>{for(let i=0;i<300;i++){if(await evaluate(code).catch(()=>false))return;await new Promise(r=>setTimeout(r,100));}throw Error('Milestone check: '+code+' :: '+await evaluate('document.body.innerText'));};
  const click=async label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled);if(!b)throw Error('Missing button');b.click()})()`);
  const capture=async name=>{await new Promise(r=>setTimeout(r,220));await writeFile(join(directory,name),(await wc.capturePage()).toPNG());};
  const marker=await readFile(join(directory,'milestone-restart.json'),'utf8').then(JSON.parse).catch(()=>null);
  window.show();window.focus();
  if(marker){
    await wait("document.querySelector('.tiptap')?.textContent.includes('Edited on a second volume.')");
    assert.equal(await readFile(marker.file,'utf8'),marker.expected);
    console.log('PASS packaged second-volume source/workspace/session restored across full app restart');return;
  }
  await evaluate("document.querySelector('button[title=Settings]').click()");
  await click('Workspace');
  await wait("document.querySelector('[aria-label=\"Opening new notes\"]')");
  for(const [name,width,zoom] of [['normal',1320,1],['narrow',640,1],['zoom',640,1.5]]){
    window.setSize(width,900);wc.setZoomFactor(zoom);await new Promise(r=>setTimeout(r,180));
    await evaluate("document.querySelector('[aria-label=\"Opening new notes\"]').scrollIntoView({block:'center'})");
    const geometry=await evaluate(`(()=>{const g=document.querySelector('[aria-label="Opening new notes"]'),m=document.querySelector('.settings-window');return {fits:g.scrollWidth<=g.clientWidth+1&&m.scrollWidth<=m.clientWidth+1,labels:[...g.querySelectorAll('button')].map(b=>({text:b.textContent,readable:b.scrollWidth<=b.clientWidth+1&&b.scrollHeight<=b.clientHeight+1})),accent:getComputedStyle(g).getPropertyValue('--accent-color')}})()`);
    assert.ok(geometry.fits,JSON.stringify(geometry));assert.ok(geometry.labels.every(b=>b.readable));assert.deepEqual(geometry.labels.map(b=>b.text),['Fill, then replace','Reuse focused pane']);
    await capture('milestone-settings-'+name+'.png');
  }
  wc.setZoomFactor(1);window.setSize(1320,900);
  wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await wait("!document.querySelector('.settings-window')");
  const volume=process.env.VAULTOR_SECONDARY_TEST_ROOT;
  assert.ok(volume&&/^[A-Z]:\\$/i.test(volume),'Explicit secondary volume required');
  const source=await mkdtemp(join(volume,'vaultor-desktop-multivol-'));await mkdir(join(source,'.git'));
  const file=join(source,'guide.md'),original='# External guide\r\n\r\nOriginal paragraph.\r\n',expected='# External guide\r\n\r\nEdited on a second volume.\r\n';
  await writeFile(file,original);await writeFile(join(source,'untouched.md'),'Keep exactly\r\n');
  const previous=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});
  try{
    await evaluate("document.querySelector('button[aria-label=\"Link folder\"]').click()");
    await wait("[...document.querySelectorAll('[aria-label=\"Linked sources\"] button')].some(b=>b.textContent.includes('vaultor-desktop-multivol-'))");
    await evaluate("[...document.querySelectorAll('[aria-label=\"Linked sources\"] button')].find(b=>b.textContent.includes('vaultor-desktop-multivol-')).click()");
    await wait("[...document.querySelectorAll('[aria-label=\"Linked sources\"] button')].some(b=>b.textContent==='guide.md')");await click('guide.md');
    await wait("document.querySelector('.tiptap p')?.textContent==='Original paragraph.'");
    await evaluate("(()=>{const p=document.querySelector('.tiptap p'),r=document.createRange();r.selectNodeContents(p);const s=getSelection();s.removeAllRanges();s.addRange(r);p.closest('.tiptap').focus();})()");
    wc.insertText('Edited on a second volume.');
    await wait("[...document.querySelectorAll('[role=status]')].some(s=>s.textContent==='Unsaved changes')");await click('Save');
    await wait("[...document.querySelectorAll('[role=status]')].some(s=>s.textContent==='Saved')");
    assert.equal(await readFile(file,'utf8'),expected);assert.equal(await readFile(join(source,'untouched.md'),'utf8'),'Keep exactly\r\n');
    await capture('milestone-secondary-save.png');
    await writeFile(join(directory,'milestone-restart.json'),JSON.stringify({file,expected,source}));
    console.log('PASS packaged Settings normal/narrow/150% zoom; real E: link/rich-text paragraph edit/explicit Save/exact source bytes/untouched neighbour');
  }finally{dialog.showOpenDialog=previous;}
}
