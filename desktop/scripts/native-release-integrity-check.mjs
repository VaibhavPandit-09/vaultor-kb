import assert from 'node:assert/strict';
import {app} from 'electron';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve,basename,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {NativeChannel} from '../src/linked/native-channel.mjs';
import {runNavigatorRefinementCheck} from './native-navigator-refinement-check.mjs';

/** Three actual packaged launches, only disposable profiles. Never edits journal locks or fabricates recovery records. */
export async function runReleaseIntegrityCheck(window,directory,owned){
 assert.equal(process.platform,'win32');assert.equal(resolve(app.getAppPath()),resolve(process.resourcesPath,'app'));assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));assert.equal(app.getVersion(),'0.26.0');
 const marker=join(directory,'release-integrity-state.json'),prior=await readFile(marker,'utf8').then(JSON.parse).catch(()=>null),run=code=>window.webContents.executeJavaScript(code),delay=ms=>new Promise(done=>setTimeout(done,ms));
 const wait=async code=>{for(let i=0;i<200;i++){if(await run(code).catch(()=>false))return;await delay(100);}throw Error('Packaged release qualification: '+code);};
 const request=async(path,method='GET',body)=>{const response=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.ok(response.ok,path+' '+response.status);return response.status===204?null:response.json();};
 const identity=await request('/workspace/identity'),scope=createHash('sha256').update(identity.id+'\n'+identity.generation).digest('hex');
 const rows=async()=>JSON.parse(await readFile(join(directory,'linked-sources',scope,'sources.json'),'utf8'));
 const desktop=(await run('window.vaultorDesktop.bootstrap()')).value;assert.equal(desktop.desktopBuild,'0.26.0');const database='vaultor-desktop-sessions-'+desktop.active;
 const draftInStore=id=>`new Promise((resolve,reject)=>{const opening=indexedDB.open(${JSON.stringify(database)});opening.onerror=()=>reject(opening.error);opening.onsuccess=()=>{const db=opening.result,query=db.transaction('records').objectStore('records').getAll();query.onsuccess=()=>{resolve(query.result.some(record=>record?.noteId===${JSON.stringify(id)}&&JSON.stringify(record.value?.content).includes('Protected restart draft')));db.close();};query.onerror=()=>reject(query.error);};})`;
 window.setSize(1400,850);window.showInactive();
 if(!prior){
  await runNavigatorRefinementCheck(window,directory,owned);
  const registered=await rows(),root=registered.roots[0];assert.ok(basename(dirname(root.path)).startsWith('vaultor-navigator-tree-'));
  const sourceFile=join(root.path,'Topic','Deep folder','Linked topic.md'),original=await readFile(sourceFile,'utf8');assert.equal(original,'# Linked topic\n\nNative sidebar exploration.\n');
  const duplicate=new NativeChannel({java:join(process.resourcesPath,'bundle/runtime/bin/java.exe'),classes:join(process.resourcesPath,'bundle/linked-files.jar'),workspace:identity.id,generation:identity.generation,privateRoot:join(directory,'linked-sources',scope,'journal'),protectedRoot:directory,applicationRoot:app.getAppPath(),protectedPaths:[join(process.resourcesPath,'bundle'),join(app.getAppPath(),'ui')],production:true});
  try{await assert.rejects(duplicate.ready,/JOURNAL_OWNER_LOCK/);}finally{await duplicate.close();}
  const token=(await run('window.vaultorDesktop.bootstrap()')).value.token;
  const alive=await run(`window.vaultorDesktop.linked(${JSON.stringify({token,workspace:identity.id,generation:identity.generation,operation:'list',payload:{source:root.id,offset:0,limit:10}})})`);assert.equal(alive.ok,true);assert.ok(alive.value.items.length);
  await writeFile(marker,JSON.stringify({stage:'restart',identity,sourceFile,original,sourceId:root.id}));console.log('Packaged phase1 passed: real initialization, source grant/tree/open/drag, managed Save, duplicate journal refusal and original owner survival; normal Quit follows.');return;
 }
 assert.deepEqual(identity,prior.identity);assert.equal(await readFile(prior.sourceFile,'utf8'),prior.original);
 await run("document.querySelector('#navigator-tab-sources').click()");await wait("document.querySelector('#navigator-panel-sources [data-linked-source]')");
 const token=(await run('window.vaultorDesktop.bootstrap()')).value.token;
 const reacquired=await run(`window.vaultorDesktop.linked(${JSON.stringify({token,workspace:identity.id,generation:identity.generation,operation:'list',payload:{source:prior.sourceId,offset:0,limit:10}})})`);assert.equal(reacquired.ok,true);assert.ok(reacquired.value.items.length);
 if(prior.stage==='restart'){
  await request('/settings','PATCH',{workspace:{autosaveDelay:60000}});await run("window.dispatchEvent(new Event('vaultor:settings-refresh'))");await delay(500);
  const note=await request('/resources','POST',{title:'Release recovery note',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Saved baseline'}]}]}});
  await run("[...document.querySelectorAll('.sidebar-primary button')].find(button=>button.textContent.trim()==='Library').click()");await wait(`document.querySelector('[data-resource-row="${note.id}"] .library-resource button')`);await run(`document.querySelector('[data-resource-row="${note.id}"] .library-resource button').click()`);await wait(`document.querySelector('[data-note-pane="${note.id}"] .tiptap')`);
  await run(`document.querySelector('[data-note-pane="${note.id}"] .tiptap').editor.commands.insertContentAt(1,'Protected restart draft ')`);await wait(draftInStore(note.id));await delay(800);assert.ok(!JSON.stringify((await request('/resources/'+note.id)).content).includes('Protected restart draft'));
  await writeFile(marker,JSON.stringify({...prior,stage:'recover',noteId:note.id}));
  await owned.stop();console.log('Packaged phase2 passed: full normal restart and native journal reacquisition; real unsaved draft durable in IndexedDB, backend still baseline. Intentional disposable-process interruption follows.');app.exit(0);return;
 }
 assert.equal(prior.stage,'recover');await wait(`document.querySelector('[data-note-pane="${prior.noteId}"] .tiptap')?.editor.getText().includes('Protected restart draft')`);assert.ok(await run(draftInStore(prior.noteId)));
 await request('/settings','PATCH',{workspace:{autosaveDelay:0}});await run("window.dispatchEvent(new Event('vaultor:settings-refresh'))");await delay(500);await run(`document.querySelector('[data-note-pane="${prior.noteId}"] .tiptap').editor.commands.insertContentAt(1,'Acknowledged after restart ')`);
 let saved=false;for(let i=0;i<100;i++){const content=JSON.stringify((await request('/resources/'+prior.noteId)).content);if(content.includes('Protected restart draft')&&content.includes('Acknowledged after restart')){saved=true;break;}await delay(100);}assert.ok(saved);await wait(`(${draftInStore(prior.noteId)}).then(value=>!value)`);assert.equal(await run("document.body.textContent.includes('A note changed on another device')"),false);assert.equal(await readFile(prior.sourceFile,'utf8'),prior.original);
 await writeFile(marker,JSON.stringify({...prior,stage:'passed',packagedVersion:app.getVersion(),startupRestart:true,journalReacquired:true,duplicateOwnerRejected:true,linkedSourcePreserved:true,dirtyRecovery:true,saveAcknowledged:true}));console.log('Packaged phase3 passed: journal reacquisition, actual dirty-draft recovery and conditional Save acknowledgement, no false own-save conflict, external source unchanged; normal Quit follows.');
}
