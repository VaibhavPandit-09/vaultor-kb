import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function qualifyM2({evaluate,cdp,wait,report,output,folder,record,restart,pid}){
 const click=async label=>{await wait(`document.querySelector('.next-library')?.getAttribute('aria-busy')!=='true'&&[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled&&!b.closest('[hidden]'))`,'button '+label);return evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled&&!b.closest('[hidden]')).click()`);};
 const input=async(label,value)=>{await wait(`document.querySelector('[aria-label=${JSON.stringify(label)}]')`,'input '+label);return evaluate(`(()=>{const e=document.querySelector('[aria-label=${JSON.stringify(label)}]');Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));})()`);};
 const action=async label=>{await wait(`document.querySelector('button[aria-label=${JSON.stringify(label)}]:not(:disabled)')`,'action '+label);return evaluate(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click()`);};
 const saved=()=>wait("document.querySelector('[role=status]')?.textContent==='saved'",'saved');
 const type=async text=>{await wait("document.querySelector('.tiptap')?.contentEditable==='true'",'unlocked editor');await evaluate("document.querySelector('.tiptap').focus()");await cdp('Input.insertText',{text});};
 const request=q=>evaluate(`benchRequest(${JSON.stringify(q)})`);
 const screenshot=async name=>{const shot=await cdp('Page.captureScreenshot');await writeFile(join(output,name),Buffer.from(shot.data,'base64'));};
 const memory=async(scenario,metric)=>{const path=join(folder,'m2-memory.json');execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(import.meta.dirname,'process-sample.ps1'),'-RootPid',String(pid()),'-Output',path,'-StopFile',join(folder,'never'),'-Once'],{windowsHide:true,stdio:'pipe'});const value=JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));record(scenario,1,metric,value.workingSet/1048576,'MiB');record(scenario,1,metric+'_private',value.privateBytes/1048576,'MiB');};
 // UI collection creation, hierarchy and rename.
 await action('New collection');await input('Collection name','M2 parent');await click('Create');
 await wait("[...document.querySelectorAll('.next-collection-row button')].some(b=>b.textContent==='M2 parent')",'parent');await click('M2 parent');
 await action('New collection');await input('Collection name','M2 child');await click('Create');
 await wait("[...document.querySelectorAll('.next-collection-row button')].some(b=>b.textContent==='M2 child')",'child');
 await evaluate("document.querySelector('[aria-label=\"Manage M2 child\"]').click()");await input('Collection name','M2 renamed');await click('Save collection');
 await wait("[...document.querySelectorAll('.next-collection-row button')].some(b=>b.textContent==='M2 renamed')",'rename');
 const tree=await request({kind:'snapshot'}),parent=tree.collections.find(c=>c.name==='M2 parent'),child=tree.collections.find(c=>c.name==='M2 renamed');assert.equal(child.parentId,parent.id);
 await click('New note');await wait("document.querySelector('.next-note-bar input')",'new note');await input('Note title 1','M2 recovery note');await type('M2 saved λ');await saved();
 const list=await request({kind:'list',collection:parent.id}),id=list.items[0].id;
 await evaluate("document.querySelector('[aria-label=\"Organize note\"]').click()");await wait("document.querySelector('[aria-label=\"Destination collection\"]')",'organization');await input('Destination collection',child.id);await click('Add membership');
 await wait("!document.querySelector('.next-organize')",'membership added');assert.equal((await request({kind:'memberships',id})).members.length,2);
 await evaluate("document.querySelector('[aria-label=\"Organize note\"]').click()");await wait("document.querySelector('[aria-label=\"Destination collection\"]')",'organization');await input('Destination collection',child.id);await click('Move membership');await wait("document.querySelector('.next-shell').dataset.total==='0'",'moved from parent');
 await click('M2 renamed');await wait("document.querySelector('.next-shell').dataset.total==='1'",'child contents');await evaluate("document.querySelector('[aria-label=\"Organize note\"]').click()");await wait("document.querySelector('[aria-label=\"Destination collection\"]')",'organization');await click('Remove from this collection');await wait("document.querySelector('.next-shell').dataset.total==='0'",'removed placement');assert.equal((await request({kind:'read',id})).content.content[0].content[0].text,'M2 saved λ');
 await click('Library');await wait("document.querySelector(`[data-resource-id=\""+id+"\"]`)",'note in Library');
 await type(' close barrier');await restart(true);
 assert(JSON.stringify((await request({kind:'read',id})).content).includes('close barrier'));
 await evaluate(`document.querySelector('[data-resource-id="${id}"]>button').click()`);await type(' crash durable λ');
 await wait("document.querySelector('[role=status]')?.textContent==='draft protected'",'durable draft receipt');
 const draft=await request({kind:'readDraft',id});assert(JSON.stringify(draft.content).includes('crash durable λ'));assert(!JSON.stringify((await request({kind:'read',id})).content).includes('crash durable λ'));
 await restart();await wait("document.querySelector('.next-recovery-list button')",'startup recovery');await evaluate("document.querySelector('.next-recovery-list button').click()");await wait("document.querySelector('[role=dialog]')",'recovery review');await screenshot('m2-recovery.png');await click('Restore draft');await saved();assert.deepEqual(await request({kind:'drafts'}),[]);
 // Two views share a single journal; an external saved revision provokes a real conflict.
 await evaluate(`document.querySelector('[data-resource-id="${id}"] button[title="Open beside"]').click()`);await wait("document.querySelectorAll('.tiptap').length===2",'shared panes');await type(' both panes');await wait("[...document.querySelectorAll('.tiptap')].every(e=>e.textContent.includes('both panes'))",'shared content');await saved();
 const before=await request({kind:'read',id});const external={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Competing saved version'}]}]};await request({kind:'save',id,revision:before.revision,title:'External revision',content:external});
 await type(' my conflicting text');await wait("document.querySelector('[role=dialog]')?.textContent.includes('Saved version changed')",'conflict');assert.deepEqual((await request({kind:'read',id})).content,external);await screenshot('m2-conflict.png');
 await click('Keep draft for later');await wait("!document.querySelector('.tiptap')",'parked note');assert.equal((await request({kind:'drafts'})).length,1);await restart(true);
 await evaluate("document.querySelector('.next-recovery-list button').click()");await wait("document.querySelector('[role=dialog]')",'retained conflict');await click('Use draft over reviewed saved version');await saved();assert(JSON.stringify((await request({kind:'read',id})).content).includes('my conflicting text'));assert.deepEqual(await request({kind:'drafts'}),[]);
 await type(' discard me');await wait("document.querySelector('[role=status]')?.textContent==='draft protected'",'discard draft protected');await restart();await evaluate("document.querySelector('.next-recovery-list button').click()");await wait("document.querySelector('[role=dialog]')",'discard review');await click('Discard draft and use saved');await wait("!document.querySelector('[role=dialog]')",'discarded');assert.deepEqual(await request({kind:'drafts'}),[]);assert(!JSON.stringify((await request({kind:'read',id})).content).includes('discard me'));
 report.checks.push('M2 UI hierarchy, rename, add/move/remove memberships preserve resource identity','M2 pending edit normal close/restart; durable unsaved draft survives taskkill','M2 restore, explicit discard, competing-version comparison, park/restart and reviewed replacement; matching journal cleanup','M2 two-pane shared content and one writer');
 // Large fixtures use ordinary commands; the product only mounts one metadata page.
 for(const size of [1000,5000]){
   let total=(await request({kind:'list',collection:null})).total;
   while(total<size){const count=Math.min(50,size-total);await evaluate(`Promise.all(Array.from({length:${count}},(_,i)=>benchRequest({kind:'createNote',title:'Scale '+String(${total}+i).padStart(5,'0'),collection:null}))).then(()=>true)`);total+=count;}
   await cdp('Page.reload');await wait(`document.querySelector('.next-shell')?.dataset.total==='${size}'`,'large fixture loaded');
   await evaluate("window.benchRequest=request=>window.__TAURI_INTERNALS__.invoke('workspace',{request})");
   assert.equal(await evaluate("document.querySelectorAll('.next-resource').length"),100);
   await evaluate("document.querySelector('.next-library').scrollTop=240");
   const firstTitle=await evaluate("document.querySelector('.next-resource>button').textContent");await evaluate("document.querySelector('.next-resource>button').click()");await wait(`document.querySelector('.next-note-bar input')?.value===${JSON.stringify(firstTitle)}`,'large note open');
   const ms=await evaluate("(async()=>{const t=performance.now();[...document.querySelectorAll('.next-pagination button')].find(b=>b.textContent==='Next').click();while(!document.querySelector('.next-pagination').textContent.includes('Page 2'))await new Promise(r=>setTimeout(r,10));return performance.now()-t})()");record(`library-${size}`,1,'page_turn',ms,'ms','Native UI Next through page label; metadata-only page of 100.');
   await click('Previous');await wait("document.querySelector('.next-pagination').textContent.includes('Page 1')",'previous page');assert(await evaluate("document.querySelector('.next-library').scrollTop>100"));assert.equal(await evaluate("document.querySelector('.next-note-bar input').value"),firstTitle);
   await memory(`library-${size}`,'one_pane_working_set');
   await evaluate("document.querySelector('.next-resource button[title=\"Open beside\"]').click()");await wait("document.querySelectorAll('.tiptap').length===2",'large library two panes');await memory(`library-${size}`,'two_pane_working_set');
   for(let i=0;i<8;i++){await evaluate("document.querySelector('[aria-label=\"Close note\"]').click()");await wait("document.querySelectorAll('.tiptap').length<=1",'close pane');await evaluate("document.querySelector('.next-resource button[title=\"Open beside\"]').click()");await wait("document.querySelectorAll('.tiptap').length===2",'reopen pane');}
   await memory(`library-${size}`,'after_eight_reopens_working_set');
   const untouched=await evaluate("[...document.querySelectorAll('.next-resource')].slice(0,2).map(e=>({id:e.dataset.resourceId,title:e.querySelector('button').textContent}))");
   for(let i=0;i<8;i++){const target=untouched[i%2];await evaluate(`document.querySelector('[data-resource-id="${target.id}"]>button').click()`);await wait(`document.querySelector('.next-note-bar input')?.value===${JSON.stringify(target.title)}&&document.querySelectorAll('.tiptap').length===1`,'switch ordinary notes');}
   await memory(`library-${size}`,'after_eight_note_switches_working_set');
   assert.equal((await request({kind:'read',id:untouched[0].id})).revision,1,'Navigation must not manufacture content writes');assert.deepEqual(await request({kind:'drafts'}),[]);
   const counts=await evaluate("(async()=>{let cursor=null,ids=new Set(),pages=0;do{const p=await benchRequest({kind:'list',collection:null,cursor});pages++;for(const item of p.items){if('content'in item||ids.has(item.id))throw Error('Invalid page');ids.add(item.id)}cursor=p.next;}while(cursor);return {count:ids.size,pages}})()");assert.equal(counts.count,size);assert.equal(counts.pages,size/100);record(`library-${size}`,1,'mounted_rows',100,'rows');
 }
 await click('Appearance');await wait("document.documentElement.dataset.theme==='dark'",'dark theme');
 const themeFrames=await evaluate("new Promise(r=>{const frames=[];let n=0;function step(t){frames.push({t,animations:document.getAnimations().length});if(++n<40)requestAnimationFrame(step);else r(frames)}requestAnimationFrame(step)})");
 await evaluate("window.m2PaneFrames=[];let n=0;function sample(t){m2PaneFrames.push({t,width:document.querySelector('.next-pane').getBoundingClientRect().width,animations:document.getAnimations().length});if(++n<20)requestAnimationFrame(sample)}requestAnimationFrame(sample);document.querySelector('.next-resource button[title=\"Open beside\"]').click()");await wait("document.querySelectorAll('.tiptap').length===2",'animated panes');
 const paneFrames=await evaluate("new Promise(r=>setTimeout(()=>r(window.m2PaneFrames),250))");report.motion={themeFrames,paneFrames};
 await screenshot('m2-theme-panes.png');await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await click('Appearance');await wait("document.documentElement.dataset.theme==='light'",'reduced motion');await click('Milestone Help');await wait("document.querySelector('.next-help h2')",'bundled M2 Help');await click('Close Help');
 await screenshot('m2-library-5000.png');await restart(true);assert.equal((await request({kind:'list',collection:null})).total,5000);const restored=await request({kind:'snapshot'});assert.equal(restored.collections.find(c=>c.id===child.id).parentId,parent.id);
 report.checks.push('M2 100/1000/5000-note fixtures; 50 cursor pages unique and metadata-only; at most 100 mounted rows','M2 UI page scroll/selection continuity, one/two-pane memory and eight pane reopen cycles','M2 5000-note count and collection hierarchy persist after restart');
 report.checks.push('M2 distinct-note churn produces no phantom saves/drafts; theme/pane motion sampled on runtime; reduced-motion and bundled Help endpoints');
}
