import assert from 'node:assert/strict';
import { nativeTheme } from 'electron';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

/** Mutates only the chrome harness's disposable owned workspace. */
export async function runSessionCheck(window, directory, owned) {
  assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
  const wc=window.webContents;
  const evaluate=async code=>{
    let timer;
    try { return await Promise.race([wc.executeJavaScript(code),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Renderer evaluation timed out: '+code)),15000);})]); }
    finally {clearTimeout(timer);}
  };
  const wait=async code=>{for(let i=0;i<200;i++){if(await evaluate(code).catch(()=>false))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Session check timed out: '+code+' :: '+await evaluate('document.body.innerText'));};
  const request=async(path,method='GET',body,headers={})=>{
    const response=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,'X-Vaultor-Protocol':'3','X-Request-ID':randomUUID(),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
    assert.ok(response.ok,`Disposable fixture ${path}: ${response.status}`);const text=await response.text();return text?JSON.parse(text):undefined;
  };
  const click=async(selector,label)=>evaluate(`(()=>{const button=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Missing '+${JSON.stringify(label)});button.click();})()`);
  const capture=async name=>{await new Promise(r=>setTimeout(r,350));await writeFile(join(directory,name),(await wc.capturePage()).toPNG());};
  const active=id=>`document.querySelector('[data-note-pane="${id}"][data-focused="true"] .tiptap')`;
  const session=id=>`document.querySelector('[data-open-session="${id}"]')`;
  const open=async note=>{
    await click('.sidebar-primary .sidebar-nav','Library');
    await wait(`document.querySelector('.library-view:not([hidden]) .library-resource button[title=${JSON.stringify(note.title)}]')`);
    await evaluate(`document.querySelector('.library-resource button[title=${JSON.stringify(note.title)}]').click()`);
    await wait(active(note.id));
  };
  const select=async note=>{await evaluate(`${session(note.id)}.querySelector('button[title]').click()`);await wait(active(note.id));};
  const lifecycle=async(note,action)=>{
    const current=action==='trash'?await request('/resources/'+note.id+'/summary'):(await request('/resources/trash')).items.find(r=>r.id===note.id);
    const result=await request('/resources/lifecycle','PUT',[{operationId:randomUUID(),resourceId:note.id,revision:current.revision,action}]);
    assert.ok(['trashed','restored','purged'].includes(result[0].status));
  };
  window.setSize(1800,950);window.showInactive();nativeTheme.themeSource='dark';
  await request('/settings','PATCH',{workspace:{maxOpenNotes:3,autosaveDelay:1000}});
  await evaluate("window.dispatchEvent(new Event('vaultor:settings-refresh'))");
  const notes=[];
  for(let i=0;i<8;i++)notes.push(await request('/resources','POST',{type:'note',title:'Session '+i,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Disposable session body '+i}]}]}}));
  const first=await request('/resources/'+notes[0].id);
  await request('/resources/'+first.id+'/note','PUT',{title:first.title,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Journey source '},{type:'resourceLink',attrs:{resourceId:notes[7].id,label:notes[7].title,type:'note'}}]}]}},{'If-Match':'"'+first.revision+'"'});
  for(const note of notes.slice(0,7))await open(note);
  assert.equal(await evaluate("document.querySelectorAll('[data-open-session]').length"),7);
  assert.equal(await evaluate("document.querySelectorAll('.tiptap').length"),1);
  assert.equal(await evaluate("document.body.innerText.includes('Pane limit reached')"),false);
  // Renaming an inactive metadata-only session must preserve its saved document.
  const bodyBefore=(await request('/resources/'+notes[4].id)).content;
  await click('.sidebar-primary .sidebar-nav','Library');
  await wait('document.querySelector(\'[aria-label="Actions for Session 4"]\')');
  await evaluate('document.querySelector(\'.library-view [aria-label="Actions for Session 4"]\').click()');
  await click('.library-popover button','Rename…');await wait('document.querySelector(\'[aria-label="Resource name"]\')');
  await evaluate(`(()=>{const input=document.querySelector('[aria-label="Resource name"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Session 4 renamed');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('button','Save name');await wait('!document.querySelector(\'[aria-label="Resource name"]\')');
  assert.deepEqual((await request('/resources/'+notes[4].id)).content,bodyBefore);notes[4].title='Session 4 renamed';
  await wait(session(notes[4].id)+".querySelector('button[title]')?.title==='Session 4 renamed'");
  await select(notes[0]);
  await evaluate("document.querySelector('.tiptap').focus()");wc.insertText(' Preserved departure ');
  await select(notes[1]);
  assert.ok(JSON.stringify((await request('/resources/'+notes[0].id)).content).includes('Preserved departure'));
  await select(notes[0]);
  await evaluate("document.querySelector('.tiptap .resource-link-chip').click()");await wait(active(notes[7].id));
  const key=(keyCode,modifiers=[])=>{wc.sendInputEvent({type:'keyDown',keyCode,modifiers});wc.sendInputEvent({type:'keyUp',keyCode,modifiers});};
  key('Left',['control','alt']);await wait(active(notes[0].id));key('Right',['control','alt']);await wait(active(notes[7].id));
  // Existing session selection must keep the source-owned journey.
  await select(notes[2]);await select(notes[7]);key('Left',['control','alt']);await wait(active(notes[0].id));
  for(const note of [notes[1],notes[2]]){
    await evaluate(`document.querySelector('[aria-label="Session actions for ${note.title}"]').click()`);
    await wait("document.querySelector('.library-popover')");await click('.library-popover button','Open in another pane');await wait(active(note.id));
  }
  assert.equal(await evaluate("document.querySelectorAll('.tiptap').length"),3);
  await capture('sessions-dark.png');
  // Local Trash uses the same coordinator/save barrier as the shipped Actions UI.
  await evaluate(`document.querySelector('[data-focused="true"] [aria-label="Actions for ${notes[2].title}"]').click()`);
  await wait("document.querySelector('.library-popover')");await click('.library-popover button','Move to Trash…');
  await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Move to Trash'&&!b.disabled)");await click('[role="dialog"] button','Move to Trash');
  await wait('!'+session(notes[2].id));console.log('Session check: local Trash reconciled.');assert.equal(await evaluate(active(notes[2].id)),null);
  if(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Done')"))await click('button','Done');
  // Foreign inactive deletion, restore without reopen, permanent deletion and restart.
  await lifecycle(notes[5],'trash');await wait('!'+session(notes[5].id));console.log('Session check: foreign inactive Trash reconciled.');
  await lifecycle(notes[5],'restore');await new Promise(r=>setTimeout(r,600));assert.equal(await evaluate(session(notes[5].id)),null);
  console.log('Session check: restore stayed closed.');await open(notes[5]);console.log('Session check: restored note explicitly opened.');await lifecycle(notes[5],'trash');await wait('!'+session(notes[5].id));await lifecycle(notes[5],'purge');
  // Resolve the deliberately retained disposable recovery copy through the product UI.
  if(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.startsWith('Review drafts ('))")) {
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Review drafts (')).click()");
    while(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Use saved version')")) {
      const count=await evaluate("[...document.querySelectorAll('button')].filter(b=>b.textContent==='Use saved version').length");
      await click('button','Use saved version');
      await wait("[...document.querySelectorAll('button')].filter(b=>b.textContent==='Use saved version').length<"+count);
    }
    await evaluate("document.querySelector('[aria-label=\"Close modal\"]').click()");
  }
  await new Promise(r=>setTimeout(r,1200));
  const before=await evaluate("[...document.querySelectorAll('[data-open-session]')].map(e=>e.dataset.openSession)");
  const visible=await evaluate("[...document.querySelectorAll('[data-note-pane]')].map(e=>e.dataset.notePane)");
  console.log('Session check: purge complete; reloading.');
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Reload timed out')),20000);wc.once('did-finish-load',()=>{clearTimeout(timer);resolve();});wc.reload();});
  await wait("Boolean(document.querySelector('[data-open-session]'))");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-open-session]')].map(e=>e.dataset.openSession)"),before);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-note-pane]')].map(e=>e.dataset.notePane)"),visible);
  await new Promise(r=>setTimeout(r,800));
  assert.equal(await evaluate("document.body.innerText.includes('Retry collections')"),false,'Restoration must remain below native request admission');
  nativeTheme.themeSource='light';window.setSize(900,780);await capture('sessions-light-narrow.png');
  const preferences=await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches");
  await wc.debugger.attach('1.3');
  try {
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await select(notes[3]);assert.equal(await evaluate("document.querySelector('.workspace-pane-layout').style.getPropertyValue('--pane-duration')"),'0ms');
    await capture('sessions-reduced.png');
  } finally {wc.debugger.detach();}
  // Closing one pane must retain its session; capture-phase close shortcut closes the session.
  await click('.journey-bar button,button.library-button','Close pane');
  assert.ok(await evaluate(session(notes[3].id)));await select(notes[3]);
  key('Backspace',['control','shift']);await wait('!'+session(notes[3].id));
  assert.ok(!preferences || await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"));
  console.log('Native sessions: seven direct opens/one editor, three explicit panes, unsaved departure, links/history, local+foreign Trash/Restore/purge, reload, themes/narrow/reduced motion, pane close and close shortcut passed.');
}
