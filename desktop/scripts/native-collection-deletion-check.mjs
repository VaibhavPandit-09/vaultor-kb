import assert from 'node:assert/strict';
import {dialog,nativeTheme} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {randomUUID} from 'node:crypto';

/** Disposable real folder acquisition, renderer confirmations and bundled-server lifecycle. */
export async function runCollectionDeletionCheck(window,directory,owned){
 assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
 const wc=window.webContents,evaluate=code=>wc.executeJavaScript(code),delay=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async(code,label)=>{console.log('Collection deletion check: '+label);for(let i=0;i<600;i++){if(await evaluate(code).catch(()=>false))return;await delay(100);}throw Error(label+': '+await evaluate('document.body.innerText'));};
 const click=label=>evaluate(`(()=>{const buttons=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled&&b.getBoundingClientRect().width);const b=buttons.at(-1);if(!b)throw Error('Button unavailable: '+${JSON.stringify(label)});b.focus();b.click()})()`);
 const request=async(path,method='GET',body)=>{const r=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,'X-Vaultor-Protocol':'3',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,path+' '+r.status);const text=await r.text();return text?JSON.parse(text):undefined;};
 const capture=async name=>{await delay(200);await writeFile(join(directory,name),(await wc.capturePage()).toPNG());};
 const create=async(name,parentId=null)=>request('/collections/creations/'+randomUUID(),'PUT',{name,parentId,resourceIds:[]});
 const add=async(ids,targetId)=>{for(let start=0;start<ids.length;start+=100)await request('/organization/memberships','POST',{resourceIds:ids.slice(start,start+100),kind:'collection',targetId,action:'add'});};
 const root=join(directory,'docs');await mkdir(root,{recursive:true});
 const folders=['guide','guide/setup','guide/setup/deep','api','api/auth','api/resources','design','design/motion','development','development/tests','releases','releases/history','empty','reference'];
 for(const folder of folders)await mkdir(join(root,folder),{recursive:true});
 await writeFile(join(root,'README.md'),'# Documentation\n\nImported overview.');
 for(let i=0;i<203;i++)await writeFile(join(root,folders[i%12],`Note-${i}.md`),'# Documentation '+i+'\n\nOriginal imported content '+i+'.');
 window.setSize(1120,850);window.showInactive();nativeTheme.themeSource='dark';
 const originalPicker=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});
 try{
  await evaluate("document.querySelector('[aria-label=\"Import options\"]').click()");await click('Import folder');
  await wait("document.querySelector('[role=dialog]')?.textContent.includes('204 files')",'Folder review');
  await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Import'&&!b.disabled)",'Import ready');
  await click('Import');await wait("document.querySelector('[role=dialog]')?.textContent.includes('Import complete')",'Import complete');
  await click('View destination');
 }finally{dialog.showOpenDialog=originalPicker;}
 const imported=(await request('/collections?parent=&size=100')).items.find(c=>c.name==='docs');assert.ok(imported);
 const firstPlan=await request('/collections/'+imported.id+'/deletion-plan');assert.equal(firstPlan.collections.length,15);assert.equal(firstPlan.managedResources,204);
 const originals=firstPlan.exclusiveResources,readme=originals.find(r=>r.title==='README');assert.ok(readme);
 const unrelated=await request('/resources','POST',{type:'note',title:'Unrelated acceptance document',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Do not change this original.'}]}]}});
 const unrelatedBefore=await request('/resources/'+unrelated.id);
 const startDeletion=async()=>{await evaluate("document.querySelector('.collection-transform [aria-label=\"More\"]').click()");await click('Rename / move / delete…');await click('Delete collection…');await wait("[...document.querySelectorAll('[role=dialog]')].some(d=>d.textContent.includes('unique managed resources'))",'Deletion plan');};
 // Open the imported note before deleting its organization. Existing editors must remain mounted.
 await evaluate("[...document.querySelectorAll('.library-resource button')].find(b=>b.title==='README').click()");
 await wait("Boolean(document.querySelector('.tiptap'))",'Imported note open');
 const mountedEditors=await evaluate("document.querySelectorAll('.tiptap').length");
 await evaluate("document.querySelector('.sidebar-nav[aria-current=page]')?.blur();[...document.querySelectorAll('.sidebar-nav')].find(b=>b.textContent==='Collections').click()");
 await wait("[...document.querySelectorAll('[data-collection-open]')].some(b=>b.querySelector('strong')?.textContent==='docs')",'Collections directory');
 await evaluate("[...document.querySelectorAll('[data-collection-open]')].find(b=>b.querySelector('strong')?.textContent==='docs').click()");
 await startDeletion();assert.equal(await evaluate("[...document.querySelectorAll('input[type=radio]')].find(r=>r.checked)?.closest('label').textContent.includes('Delete collections only')"),true);
 assert.ok(await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).textContent.includes('204 unique managed resources')"));await capture('collection-delete-keep.png');
 // Escape restores focus and leaves hierarchy intact; reopen and confirm default.
 wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});
 await wait("document.querySelectorAll('[role=dialog]').length===1",'Escape confirmation');
 assert.equal(await evaluate("document.activeElement?.textContent"),'Delete collection…');await click('Delete collection…');
 await wait("[...document.querySelectorAll('[role=dialog]')].some(d=>d.textContent.includes('204 unique'))",'Reviewed again');
 await click('Delete hierarchy');await wait("document.querySelectorAll('[role=dialog]').length===0&&document.querySelector('[aria-label=\"Collections\"] h1')?.textContent==='Collections'",'Root navigation after keep');
 assert.equal((await request('/resources?size=1')).totalItems,205);
 assert.equal((await request('/resources/trash?size=1')).totalItems,0);
 assert.equal((await request('/collections?size=1')).totalItems,0);
 assert.equal(await evaluate("document.querySelectorAll('.tiptap').length"),mountedEditors,'Keep leaves editor mounted');
 assert.equal((await request('/resources/'+readme.id)).id,readme.id);
 // Reorganize the same originals into a second nested hierarchy; seven have surviving memberships.
 const parent=await create('Surviving parent'),trashRoot=await create('Cleanup hierarchy',parent.id),outside=await create('Shared outside');
 const children=[];for(let i=0;i<14;i++)children.push(await create('Section '+i,i===0?trashRoot.id:children[(i-1)>>1].id));
 for(let i=0;i<14;i++)await add(originals.filter((_,n)=>n%14===i).map(r=>r.id),children[i].id);
 const shared=[readme,...originals.filter(r=>r.id!==readme.id).slice(0,6)];await add(shared.map(r=>r.id),outside.id);await add(originals.filter((_,n)=>n%3===0).map(r=>r.id),trashRoot.id);
 await request('/collections/'+trashRoot.id+'/favorite','PUT',{favorite:true});
 const dirtyTarget=originals.find((r,i)=>i%3===0&&!shared.some(s=>s.id===r.id));assert.ok(dirtyTarget);
 await click('Library');await click('Collections');
 await wait("[...document.querySelectorAll('[data-collection-open]')].some(b=>b.querySelector('strong')?.textContent==='Cleanup hierarchy')",'New hierarchy directory');
 await evaluate("[...document.querySelectorAll('[data-collection-open]')].find(b=>b.querySelector('strong')?.textContent==='Cleanup hierarchy').click()");
 await wait("[...document.querySelectorAll('.collection-transform .library-resource button')].some(b=>b.title==="+JSON.stringify(dirtyTarget.title)+")",'Exclusive note row');
 await evaluate("[...document.querySelectorAll('.collection-transform .library-resource button')].find(b=>b.title==="+JSON.stringify(dirtyTarget.title)+").click()");
 await wait("[...document.querySelectorAll('.tiptap')].some(e=>e.getBoundingClientRect().width>0)",'Exclusive note editor');
 await evaluate("[...document.querySelectorAll('.tiptap')].find(e=>e.getBoundingClientRect().width>0).focus()");wc.insertText('Protected before collection deletion. ');
 await click('Collections');await wait("[...document.querySelectorAll('[data-collection-open]')].some(b=>b.querySelector('strong')?.textContent==='Cleanup hierarchy')",'Return to hierarchy');
 await evaluate("[...document.querySelectorAll('[data-collection-open]')].find(b=>b.querySelector('strong')?.textContent==='Cleanup hierarchy').click()");
 await startDeletion();assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).textContent.includes('7 shared outside')"),true);
 await evaluate("[...document.querySelectorAll('input[type=radio]')].find(r=>r.closest('label').textContent.includes('move exclusive')).click()");
 window.setSize(680,760);nativeTheme.themeSource='light';await capture('collection-delete-trash-narrow.png');
 assert.ok(await evaluate("(()=>{const d=[...document.querySelectorAll('[role=dialog]')].at(-1);return d.scrollWidth<=d.clientWidth})()"));
 await click('Delete hierarchy');await wait("document.querySelectorAll('[role=dialog]').length===0&&document.querySelector('.collection-transform h1')?.textContent==='Surviving parent'",'Nearest surviving parent');
 assert.equal((await request('/resources/trash?size=1')).totalItems,197);
 assert.equal((await request('/resources?size=1')).totalItems,8);
 assert.equal((await request('/collections?size=1')).totalItems,2);
 assert.equal((await request('/resources?collection='+outside.id+'&size=1')).totalItems,7);
 assert.deepEqual(await request('/resources/'+unrelated.id),unrelatedBefore);
 assert.equal(await evaluate("document.querySelectorAll('.tiptap').length"),mountedEditors,'Only actually trashed editors close');
 const trash=(await request('/resources/trash?size=100&q='+encodeURIComponent(dirtyTarget.title))).items;
 const restored=trash.find(r=>r.id===dirtyTarget.id);assert.ok(restored);
 const result=await request('/resources/lifecycle','PUT',[{operationId:randomUUID(),resourceId:restored.id,action:'restore',revision:restored.revision}]);assert.equal(result[0].status,'restored');
 assert.ok(JSON.stringify((await request('/resources/'+restored.id)).content).includes('Protected before collection deletion.'),'Draft barrier preserves edited content through Restore');
 assert.equal((await request('/resources/trash?size=1')).totalItems,196);
 assert.deepEqual(await request('/resources/'+unrelated.id),unrelatedBefore);
 await capture('collection-delete-parent.png');
 await writeFile(join(directory,'collection-deletion-success.json'),JSON.stringify({version:process.env.BUILD_VERSION??'packaged',collections:15,resources:204,shared:7,trashed:197,restore:true,unrelatedPreserved:true}));
 console.log('Recursive deletion native check passed: real 204-file import, 15 collections, keep, explicit Trash197/shared7, surviving parent, mounted editor protection, Escape/focus, narrow/light and Restore. Evidence: '+directory);
}
