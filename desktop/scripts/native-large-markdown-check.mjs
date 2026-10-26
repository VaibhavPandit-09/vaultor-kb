import assert from 'node:assert/strict';
import {dialog} from 'electron';
import {mkdtemp,writeFile,readFile,appendFile} from 'node:fs/promises';
import {join,basename,dirname} from 'node:path';

/** Real packaged renderer/main/independent worker/bundled native filesystem.
 * Only picker selection is supplied by the disposable fixture, as in the
 * collection acquisition harness. No source grant or save check is bypassed. */
export async function runLargeMarkdownCheck(window,directory){
  assert.equal(process.platform,'win32');assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
  const wc=window.webContents, evaluate=code=>wc.executeJavaScript(code),delay=ms=>new Promise(r=>setTimeout(r,ms));
  window.show();window.focus();
  const wait=async(code,label)=>{for(let i=0;i<600;i++){if(await evaluate(code).catch(()=>false))return;await delay(100);}throw Error(label+': '+await evaluate('document.body.innerText.slice(0,1800)'));};
  const click=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled&&b.getBoundingClientRect().width);if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click()})()`);
  const restart=await readFile(join(directory,'large-markdown-restart.json'),'utf8').then(JSON.parse).catch(()=>null);
  if(restart){
    await wait(`document.querySelector('.tiptap')?.textContent.includes('DRAFT')`,'Restored large protected draft');
    assert.equal(await readFile(restart.file,'utf8'),restart.external);
    await click('Recovery');await wait(`document.querySelector('[role="dialog"]')?.textContent.includes('large.md')`,'Restart recovery record');await click('Keep drafts and close');
    console.log('PASS packaged large Markdown restart: dirty draft restored, concurrent disk bytes retained, Recovery available');return;
  }
  const source=await mkdtemp(join(dirname(directory),'vaultor-large-source-'));
  const chunk='## Technical section\r\n\r\nOrdinary documentation paragraph with **bold**, _italic_, and retained spelling. '+ 'Technical words for testing. '.repeat(process.env.VAULTOR_LARGE_MARKDOWN_DENSE==='1'?24:60)+'\r\n\r\n- first list item\r\n- second list item\r\n\r\n```ts\r\nconst revision = 1;\r\n```\r\n\r\n| Action | Result |\r\n| :--- | ---: |\r\n| Save | explicit |\r\n\r\n';
  const preamble='\ufeff---\r\ntitle: preserve\r\n---\r\n\r\nBeginning marker paragraph.\r\n\r\n';
  const count=Math.floor((1048576-4096)/Buffer.byteLength(chunk));
  const original=preamble+chunk.repeat(Math.floor(count/2))+'Middle marker paragraph.\r\n\r\n'+chunk.repeat(Math.ceil(count/2))+'End marker paragraph.\r\n\r\n[label][ref]\r\n\r\n[ref]: ./unchanged.md "keep"\r\n\r\n<!-- untouched -->\r\n';
  const file=join(source,'large.md');await writeFile(file,original);await writeFile(join(source,'unchanged.md'),'Neighbour exact\r\n');
  console.log('Large Markdown fixture bytes: '+Buffer.byteLength(original));
  const picker=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});
  try{await evaluate(`document.querySelector('button[aria-label="Link folder"]').click()`);await wait(`document.querySelector('[aria-label="Linked sources"]')?.textContent.includes(${JSON.stringify(basename(source))})`,'Linked source');}finally{dialog.showOpenDialog=picker;}
  await evaluate(`[...document.querySelectorAll('[aria-label="Linked sources"] button')].find(b=>b.textContent.includes(${JSON.stringify(basename(source))})).click()`);await wait(`document.querySelector('[aria-label="Linked sources"]')?.textContent.includes('large.md')`,'Source listing');
  const opened=performance.now();await click('large.md');await wait(`document.querySelector('.tiptap')?.textContent.includes('End marker paragraph.')`,'1 MiB rich editor');const openMs=performance.now()-opened;
  await evaluate(`document.querySelector('.tiptap').focus()`);await wait('Boolean(window.__vaultor_editor)','Editor focus');
  await evaluate(`(()=>{const e=window.__vaultor_editor;let pos;e.state.doc.descendants((n,p)=>{if(n.isText&&n.text==='Beginning marker paragraph.')pos=p+5;});e.commands.setTextSelection(pos);e.commands.focus();window.largeKeys=[];e.view.dom.addEventListener('keydown',()=>{const t=performance.now();requestAnimationFrame(()=>window.largeKeys.push(performance.now()-t));},{capture:true});})()`);
  for(let i=0;i<24;i++){wc.sendInputEvent({type:'keyDown',keyCode:'X'});wc.sendInputEvent({type:'char',keyCode:'x'});wc.sendInputEvent({type:'keyUp',keyCode:'X'});await delay(12);}
  await wait(`document.querySelector('.tiptap')?.textContent.includes('xxxxx')`,'Native typing');
  await delay(800);const keys=await evaluate('window.largeKeys');
  assert.equal(await readFile(file,'utf8'),original);
  wc.sendInputEvent({type:'keyDown',keyCode:'Z',modifiers:['control']});wc.sendInputEvent({type:'keyUp',keyCode:'Z',modifiers:['control']});
  await wait(`!document.querySelector('.tiptap')?.textContent.includes('xxxxx')`,'Undo');
  wc.sendInputEvent({type:'keyDown',keyCode:'Z',modifiers:['control','shift']});wc.sendInputEvent({type:'keyUp',keyCode:'Z',modifiers:['control','shift']});await wait(`document.querySelector('.tiptap')?.textContent.includes('xxxxx')`,'Redo');
  wc.sendInputEvent({type:'keyDown',keyCode:'Z',modifiers:['control']});wc.sendInputEvent({type:'keyUp',keyCode:'Z',modifiers:['control']});await wait(`!document.querySelector('.tiptap')?.textContent.includes('xxxxx')`,'Undo to base');
  let expected=original;const saves=[];
  for(const marker of ['Beginning','Middle','End']){
    await evaluate(`(()=>{const e=window.__vaultor_editor;let pos;e.state.doc.descendants((n,p)=>{if(n.isText&&n.text===${JSON.stringify(marker+' marker paragraph.')})pos=p+${marker.length};});e.commands.setTextSelection({from:pos,to:pos+1});e.commands.setTextSelection(pos);e.commands.insertContent(' LOCAL');})()`);
    expected=expected.replace(marker+' marker paragraph.',marker+' LOCAL marker paragraph.');
    const start=performance.now();wc.sendInputEvent({type:'keyDown',keyCode:'S',modifiers:['control']});wc.sendInputEvent({type:'keyUp',keyCode:'S',modifiers:['control']});
    for(let i=0;i<300;i++){const disk=await readFile(file,'utf8').catch(e=>{if(['ENOENT','EBUSY'].includes(e.code))return null;throw e;});if(disk===expected)break;await delay(100);}
    assert.equal(await readFile(file,'utf8'),expected);saves.push(performance.now()-start);
    await wait(`[...document.querySelectorAll('[role="status"]')].some(s=>s.textContent==='Saved')`,'Save receipt completed');
  }
  assert.equal(await readFile(join(source,'unchanged.md'),'utf8'),'Neighbour exact\r\n');
  await evaluate(`(()=>{const e=window.__vaultor_editor;let pos;e.state.doc.descendants((n,p)=>{if(n.isText&&n.text==='End LOCAL marker paragraph.')pos=p+n.nodeSize;});e.commands.setTextSelection(pos);e.commands.insertContent(' DRAFT');})()`);
  await delay(1800);assert.equal(await readFile(file,'utf8'),expected);
  await click('Recovery');await wait(`document.querySelector('[role="dialog"]')?.textContent.includes('large.md')`,'Protected large draft');await click('Keep drafts and close');
  for(let i=0;;i++){try{await appendFile(file,'\r\nExternal concurrent change.\r\n');break;}catch(e){if(e.code!=='EBUSY'||i===30)throw e;await delay(100);}}
  const external=expected+'\r\nExternal concurrent change.\r\n';
  await click('Save');await wait(`document.body.innerText.includes('original file changed') || document.body.innerText.includes('file changed outside Vaultor') || document.body.innerText.includes('source changed') || document.body.innerText.includes('CONFLICT')`,'External conflict');
  assert.equal(await readFile(file,'utf8'),external);
  await writeFile(join(directory,'large-markdown-restart.json'),JSON.stringify({file,external}));
  await writeFile(join(directory,'large-markdown.png'),(await wc.capturePage()).toPNG());
  const result={bytes:Buffer.byteLength(original),openMs,keySamples:keys.length,keyP95:[...keys].sort((a,b)=>a-b)[Math.ceil(keys.length*.95)-1],saveMs:saves,exactSource:true,nativeUndoRedo:true,conflict:true,protectedRecovery:true};
  await writeFile(join(directory,'large-markdown.json'),JSON.stringify(result,null,2));console.log('PASS packaged large Markdown '+JSON.stringify(result));
}
