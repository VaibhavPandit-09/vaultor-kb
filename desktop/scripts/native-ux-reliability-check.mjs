import assert from 'node:assert/strict';
import {dialog,nativeTheme} from 'electron';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,basename} from 'node:path';

export async function prepareUxFirstPaint(wc,directory){
 assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
 await wc.loadURL('about:blank'); // Start Chromium before issuing Page commands.
 wc.debugger.attach('1.3');let count=0;
 wc.debugger.on('message',(_event,method,params)=>{if(method!=='Page.screencastFrame')return;void wc.debugger.sendCommand('Page.screencastFrameAck',{sessionId:params.sessionId});if(count<12&&wc.getURL().startsWith('vaultor://app'))void writeFile(join(directory,'ux-first-frame-'+(++count)+'.png'),Buffer.from(params.data,'base64'));});
 await wc.debugger.sendCommand('Page.enable');await wc.debugger.sendCommand('Page.startScreencast',{format:'png',everyNthFrame:1,maxWidth:1440,maxHeight:900});
 await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`window.__vaultorBootFrames=[];(()=>{let n=0;const record=()=>{window.__vaultorBootFrames.push({theme:document.documentElement?.dataset.theme,root:document.documentElement?getComputedStyle(document.documentElement).backgroundColor:'',body:document.body?getComputedStyle(document.body).backgroundColor:''});if(++n<60)requestAnimationFrame(record);};requestAnimationFrame(record);})();`});
}

/** Actual renderer/native tickets/SQLite/filesystem; only picker destinations
 * are supplied. Every path is under the disposable chrome-smoke profile. */
export async function runUxReliabilityCheck(window,directory,owned){
 assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
 const wc=window.webContents,evaluate=code=>wc.executeJavaScript(code),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(code,label)=>{for(let n=0;n<900;n++){if(await evaluate(code).catch(()=>false))return;await delay(100);}throw Error(label+': '+await evaluate('document.body.innerText'));};
 const click=label=>evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled&&!b.closest('[hidden],[inert]'));if(!button)throw Error('Missing '+${JSON.stringify(label)});button.click();})()`);
 const request=async(path,method='GET',body,workspace)=>{
  for(let n=0;n<60;n++){const response=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,'X-Vaultor-Protocol':'3',...(workspace?{'X-Vaultor-Workspace':workspace}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
   const text=await response.text(),data=text?JSON.parse(text):null;if(response.status===409&&data?.code==='WORKSPACE_BUSY'){await delay(100);continue;}assert.ok(response.ok,path+' '+response.status+' '+(data?.detail??''));return data;}
  throw Error('Workspace remained busy: '+path);
 };
 const capture=async name=>{await delay(180);await writeFile(join(directory,name),(await wc.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
 const activity=()=>evaluate(`document.querySelector('.activity-chrome button').click()`);
 const close=async()=>{wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});await delay(70);};
 const nav=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('.sidebar-nav')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing navigation');b.click();})()`);
 const marker=await readFile(join(directory,'ux-success.json'),'utf8').then(JSON.parse).catch(()=>null);
 window.showInactive();window.setSize(1440,900);nativeTheme.themeSource='light';
 if(marker){
  assert.equal((await request('/resources/trash?size=1')).totalItems,0);assert.equal((await request('/resources?size=1')).totalItems,1);
  await wait(`document.documentElement.dataset.theme==='oled'`,'Cold OLED restoration');assert.equal(window.getBackgroundColor().toLowerCase(),'#000000');await capture('ux-cold-oled.png');
  const boot=await evaluate('window.__vaultorBootFrames');assert.ok(boot.length>0);assert.ok(boot.every(frame=>!frame.theme||frame.theme==='oled'));assert.ok(boot.every(frame=>!['rgb(255, 255, 255)','rgb(246, 247, 249)'].includes(frame.root)));await writeFile(join(directory,'ux-boot-frames.json'),JSON.stringify(boot));
  console.log('UX restart passed: OLED renderer/native background, completed Trash stayed empty, late resource retained.');return;
 }
 const purgeRestart=await readFile(join(directory,'ux-purge-restart.json'),'utf8').then(JSON.parse).catch(()=>null);
 if(purgeRestart){
  const checkpoint=purgeRestart;
  const count=(await request('/resources/trash?size=1')).totalItems;assert.ok(checkpoint.remaining>1&&checkpoint.remaining<275,'A real partial purge must have been checkpointed');assert.ok(count<275,'Purge progress must survive host restart');
  await activity();if(count>1){await wait(`document.querySelector('.activity-task[aria-label="Empty Trash"]')?.textContent.includes('paused')`,'Retained purge task');await click('Resume');}await wait(`document.querySelector('.activity-task[aria-label="Empty Trash"]')?.textContent.includes('Trash snapshot permanently deleted')`,'Restarted 274-item purge');await capture('ux-empty-trash-complete.png');await close();
  if((await request('/resources/trash?size=1')).totalItems===1){const lateSaved=(await request('/resources/trash?size=100')).items[0];assert.equal(lateSaved.id,checkpoint.lateId);await request('/resources/lifecycle','PUT',[{operationId:randomUUID(),resourceId:lateSaved.id,action:'restore',revision:lateSaved.revision}]);}else assert.equal((await request('/resources?size=1')).totalItems,1);
  for(let n=0;n<checkpoint.paths.length;n++){const part=checkpoint.paths[n];assert.ok(!part.split(/[\\/]/).includes('..'));assert.ok(!/^[\\/]|^[a-z]:/i.test(part));assert.equal(createHash('sha256').update(await readFile(join(directory,'docs',part))).digest('hex'),checkpoint.hashes[n]);}
  await evaluate(`localStorage.setItem('vaultor-device-presentation-v1',JSON.stringify({...JSON.parse(localStorage.getItem('vaultor-device-presentation-v1')||'{}'),theme:'oled'}))`);
  await wc.reload();await wait(`document.querySelector('.library-view')&&document.documentElement.dataset.theme==='oled'`,'Warm OLED restart');await capture('ux-warm-oled.png');assert.equal(window.getBackgroundColor().toLowerCase(),'#000000');
  const failures=await evaluate(`(async()=>{window.__uxNativeErrors=[];window.addEventListener('vaultor:error',event=>window.__uxNativeErrors.push({action:event.detail.action,message:event.detail.message,requestId:event.detail.requestId}));const href=[...document.querySelectorAll('link[rel="modulepreload"]')].find(link=>new URL(link.href).pathname.split('/').pop().startsWith('api-')).href;const module=await import(href);const api=Object.values(module).find(value=>value?.defaults?.baseURL==='/api'&&value.interceptors.response.handlers.some(handler=>handler?.rejected));if(!api)throw Error('Shared API export unavailable');try{await api.get('/resources/'+crypto.randomUUID());}catch{}return window.__uxNativeErrors;})()`);assert.ok(failures.some(event=>event.action.startsWith('get /resources/')&&event.requestId));await capture('ux-genuine-failure.png');await writeFile(join(directory,'ux-genuine-failure.json'),JSON.stringify(failures));
  await writeFile(join(directory,'ux-success.json'),JSON.stringify({files:137,notes:119,originals:18,resourcesAfterCopy:274,allPagesPurged:274,lateRetained:checkpoint.lateId,widths:checkpoint.widths,midPurgeRestart:true,sourceHashesUnchanged:true}));
  console.log('UX native check passed: 137 files, nonmodal Activity, pause/reselect/reload, byte-verified repeat skip, independent copy, edited-note protection, verified export, compact widths, 274-item snapshot purge, late-arrival protection and warm OLED.');
  return;
 }
 const resumeBrowse=await readFile(join(directory,'ux-browse-checkpoint.json'),'utf8').then(JSON.parse).catch(()=>null);
 const root=join(directory,'docs'),paths=[];
 for(let n=0;n<18;n++)await mkdir(join(root,n===17?'empty':'d'+n),{recursive:true});
 for(let n=0;n<119;n++){
  const path=n===0?join(root,'README.md'):join(root,'d'+(n%17),n<3?'same.md':'note-'+n+'.md');
  await writeFile(path,n===0?'# Root\n\n[Other](d1/same.md)\n\n![Picture](d0/image.png)\n\n[Missing](missing.md)\n\n```md\n[Literal](d1/same.md)\n```':'# Note '+n+'\n\n[Root](../README.md)');paths.push(path);
 }
 const image=join(root,'d0','image.png');await writeFile(image,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0V8AAAAASUVORK5CYII=','base64'));paths.push(image);
 for(let n=0;n<17;n++){const path=join(root,'d'+n,'asset.bin');await writeFile(path,Buffer.from([0,1,n,255]));paths.push(path);}
 assert.equal(paths.length,137);
 const hashes=async()=>Promise.all(paths.map(async path=>createHash('sha256').update(await readFile(path)).digest('hex'))),before=await hashes();
 const previousPicker=dialog.showOpenDialog,previousSave=dialog.showSaveDialog;
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});dialog.showSaveDialog=async(...args)=>{const options=args.at(-1);return({canceled:false,filePath:join(directory,String(options.defaultPath).includes('partial')?'verified-partial.zip':'verified-workspace.zip')});};
 const openImport=async()=>{await evaluate(`document.querySelector('[aria-label="Import options"]').click()`);await click('Import folder');await wait(`document.querySelector('[role=dialog][aria-modal=true]')?.textContent.includes('137 files')`,'137-file review');await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Import in background'&&!b.disabled)||document.body.innerText.includes('Resume in Activity')||document.body.innerText.includes('Skip already imported')`,'Source fingerprint verification');};
 try{
  if(!resumeBrowse){
  await openImport();await capture('ux-import-review.png');await click('Import in background');
  await wait(`!document.querySelector('[role=dialog][aria-modal=true]')`,'Review closes on dispatch');
  await openImport();await click('Resume in Activity');await wait(`document.body.innerText.includes('This import is already running in Activity')`,'Second initiation safely refused');await click('Close');
  await activity();await wait(`document.querySelector('.activity-task')?.textContent.includes('Import docs')`,'Activity dispatch');let earlyNote;for(let n=0;n<100;n++){earlyNote=(await request('/resources?type=note&size=1&sort=updated')).items[0];if(earlyNote)break;await delay(20);}assert.ok(earlyNote);await click('Pause');await wait(`document.querySelector('.activity-task')?.textContent.includes('Paused —')`,'Import pause');await capture('ux-import-paused.png');await close();
  await nav('Library');await wait(`[...document.querySelectorAll('.workspace-main .library-resource button[title]')].some(node=>node.title===${JSON.stringify(earlyNote.title)})`,'Paused imported note');await evaluate(`[...document.querySelectorAll('.workspace-main .library-resource button[title]')].find(node=>node.title===${JSON.stringify(earlyNote.title)}).click()`);await wait(`document.querySelector('.tiptap')`,'Imported editor during retained work');assert.equal(await evaluate(`Boolean(document.querySelector('.tiptap .resource-link-chip'))`),false);await capture('ux-editor-during-import.png');await nav('Collections');await wait(`document.querySelector('[aria-label="Collections"]')`,'Navigation during retained task');window.minimize();await delay(120);window.restore();await nav('Library');
  await wc.reload();await wait(`document.querySelector('.library-view')&&document.querySelector('.activity-chrome')`,'Renderer restart');
  await nav('Library');await wait(`[...document.querySelectorAll('.workspace-main .library-resource button[title]')].some(node=>node.title===${JSON.stringify(earlyNote.title)})`,'Restored imported note');await evaluate(`[...document.querySelectorAll('.workspace-main .library-resource button[title]')].find(node=>node.title===${JSON.stringify(earlyNote.title)}).click()`);await wait(`document.querySelector('.tiptap')`,'Open retained imported note before finalization');
  await openImport();await wait(`document.body.innerText.includes('An unfinished import matches')`,'Resume journal');await click('Resume in Activity');window.minimize();await delay(250);window.restore();
  await activity();await wait(`document.querySelector('.activity-task')?.textContent.includes('Import complete')`,'Import completion');await capture('ux-import-complete.png');await close();
  assert.equal((await request('/resources?size=1')).totalItems,137);await wait(`document.querySelector('.tiptap .resource-link-chip')`,'Clean imported editor receives finalized links');
  const collections=(await request('/collections?parent=&size=100')).items,docs=collections.find(value=>value.name==='docs');assert.ok(docs);assert.equal(docs.childCount,18);
  const readme=(await request('/resources?collection='+docs.id)).items[0];let saved=await request('/resources/'+readme.id);const encoded=JSON.stringify(saved.content);assert.ok(encoded.includes('resourceLink'));assert.ok(encoded.includes('[Literal](d1/same.md)'));
  const edited={...saved.content,content:[...saved.content.content,{type:'paragraph',content:[{type:'text',text:'Vaultor-only edit'}]}]};
  await request('/resources/'+readme.id+'/note','PUT',{title:readme.title,content:edited});
  await openImport();await wait(`document.body.innerText.includes('identical verified bytes')`,'Repeat review');await click('Skip already imported');assert.equal((await request('/resources?size=1')).totalItems,137);assert.ok(JSON.stringify((await request('/resources/'+readme.id)).content).includes('Vaultor-only edit'));
  await openImport();await evaluate(`document.querySelector('input[name="repeat-import"][type=radio]:last-of-type')`);await evaluate(`(()=>{const labels=[...document.querySelectorAll('label')];labels.find(label=>label.textContent.includes('Create independent copy')).querySelector('input').click();})()`);await click('Create independent copy');await wait(`!document.querySelector('[role=dialog][aria-modal=true]')`,'Copy review closes after admission');await activity();await wait(`document.querySelectorAll('.activity-task[aria-label="Import docs"]').length===2&&document.querySelector('.activity-task[aria-label="Import docs"]')?.textContent.includes('Import complete')`,'Independent copy completion');await close();assert.equal((await request('/resources?size=1')).totalItems,274);
  console.log('UX import, restart, protected skip and explicit copy passed.');
  // Entire workspace export is prepared in Activity; disk publication is separate.
  await evaluate(`document.querySelector('button[title="Export workspace"]').click()`);await click('Create ZIP export');await activity();await wait(`document.body.innerText.includes('Verified ZIP ready to save')`,'Verified export');await click('Save output…');await wait(`true`,'Save dispatch');await delay(400);assert.ok((await readFile(join(directory,'verified-workspace.zip'))).subarray(0,2).equals(Buffer.from('PK')));await close();
  // Partial export uses the same retained host receipt and a separate output.
  await nav('Library');await delay(150);await evaluate(`document.querySelector('.workspace-main .library-view:not([hidden]) input[type=checkbox]').click()`);await click('Export selection…');await click('Prepare partial ZIP in Activity');await activity();await wait(`document.querySelector('.activity-task[aria-label="Export 1 selected resources"]')?.textContent.includes('Verified ZIP ready to save')`,'Partial ZIP receipt');await click('Save output…');await delay(350);assert.ok((await readFile(join(directory,'verified-partial.zip'))).subarray(0,2).equals(Buffer.from('PK')));await close();await click('Clear selection');
  // ZIP preparation closes Workspaces; publication requires a second review.
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[join(directory,'verified-workspace.zip')]});await evaluate(`window.dispatchEvent(new Event('vaultor:workspace-import'))`);await wait(`document.querySelector('input[aria-label="Imported workspace name"]')`,'Workspace review');await evaluate(`(()=>{const i=document.querySelector('input[aria-label="Imported workspace name"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'UX copy');i.dispatchEvent(new Event('input',{bubbles:true}));})()`);await click('Import ZIP as new workspace');await wait(`!document.querySelector('[aria-label="Workspaces"][role=dialog]')`,'Workspace preview backgrounds');await activity();await wait(`document.querySelector('.activity-task[aria-label="Review UX copy"]')?.textContent.includes('Needs approval')`,'Retained ZIP approval');await click('Review transfer…');await wait(`document.body.innerText.includes('Create separate workspace')`,'Separate workspace confirmation');await click('Create separate workspace');await activity();await wait(`document.querySelector('.activity-task[aria-label="UX copy"]')?.textContent.includes('Verified workspace ready')`,'Atomic workspace publication');await close();const createdWorkspace=(await request('/workspaces')).find(value=>value.name==='UX copy');assert.ok(createdWorkspace);assert.equal((await request('/resources?size=1','GET',undefined,createdWorkspace.id)).totalItems,274);assert.equal((await request('/resources?size=1')).totalItems,274);
  await writeFile(join(directory,'ux-browse-checkpoint.json'),JSON.stringify({resources:274,files:137,exportSaved:true}));
  }else assert.equal((await request('/resources?size=1')).totalItems,274);
  // Stress the same title/actions at actual content widths using native bounds.
  const widths=[];
  window.setMinimumSize(440,480); // Width stress only; shipped minimum stays 600.
  for(const width of [1440,900,680,440]){
   window.setSize(width,760);await nav('Library');await delay(100);
   await evaluate(`(()=>{document.activeElement?.blur();const v=document.querySelector('.workspace-main .library-view:not([hidden])');v.scrollTop=500;v.dispatchEvent(new Event('scroll'));})()`);
   await wait(`(()=>{const v=document.querySelector('.workspace-main .library-view:not([hidden])');if(!v||v.scrollHeight<=v.clientHeight+100)return false;v.scrollTop=500;v.dispatchEvent(new Event('scroll'));return v.querySelector('.library-orientation')?.dataset.compact==='true';})()`,'One-row compression '+width);
   widths.push(await evaluate(`(()=>{const v=document.querySelector('.workspace-main .library-view:not([hidden])'),h=v.querySelector('.library-orientation'),title=h.querySelector('h1').getBoundingClientRect(),actions=h.querySelector('.library-heading-actions').getBoundingClientRect(),tools=h.querySelector('.library-compact-tools').getBoundingClientRect();return {width:${width},height:h.getBoundingClientRect().height,overflow:v.scrollWidth>v.clientWidth,titleRight:title.right,actionsLeft:actions.left,actionsRight:actions.right,toolsLeft:tools.left};})()`));
   const result=widths.at(-1);assert.equal(result.overflow,false);assert.ok(result.titleRight<=result.actionsLeft+1);assert.ok(result.actionsRight<=result.toolsLeft+1);await capture('ux-compact-'+width+'.png');
  }
  window.setSize(1440,900);await delay(120);const primary=(await request('/collections?parent=&size=100')).items.find(value=>value.name==='docs'||value.name.startsWith('Documentation and reference material'));const longName='Documentation and reference material with a deliberately long collection title for width stress';await request('/collections/'+primary.id,'PUT',{name:longName});await nav('Collections');await wait(`[...document.querySelectorAll('.workspace-main .library-view:not([hidden]) .library-resource strong')].some(node=>node.textContent===${JSON.stringify(longName)})`,'Long collection title');await evaluate(`[...document.querySelectorAll('.workspace-main .library-view:not([hidden]) .library-resource strong')].find(node=>node.textContent===${JSON.stringify(longName)}).closest('button').click()`);await wait(`document.querySelector('.collection-transform h1')?.textContent===${JSON.stringify(longName)}`,'Collection detail');await wait(`document.querySelector('.collection-transform').textContent.includes('1 direct resources · 18 child collections')`,'Loaded direct and child collection counts');
  for(const width of [1440,900,680,440]){window.setSize(width,760);await delay(100);await evaluate(`(()=>{document.activeElement?.blur();const v=document.querySelector('.collection-transform');v.scrollTop=500;v.dispatchEvent(new Event('scroll'));})()`);await wait(`document.querySelector('.collection-transform .library-orientation').dataset.compact==='true'`,'Collection compression');const fits=await evaluate(`(()=>{const v=document.querySelector('.collection-transform'),h=v.querySelector('h1').getBoundingClientRect(),a=v.querySelector('.library-heading-actions').getBoundingClientRect(),t=v.querySelector('.library-compact-tools').getBoundingClientRect();return v.scrollWidth<=v.clientWidth&&h.right<=a.left+1&&a.right<=t.left+1;})()`);assert.ok(fits,'Collection actions/title overlap at '+width);await capture('ux-collection-'+width+'.png');}
  window.setSize(1440,900);await nav('Library');await delay(120);
  const all=[];for(let page=0;page<3;page++)all.push(...(await request('/resources?page='+page+'&size=100')).items);assert.equal(all.length,274);
  for(let n=0;n<all.length;n+=100)assert.ok((await request('/resources/lifecycle','PUT',all.slice(n,n+100).map(resource=>({operationId:randomUUID(),resourceId:resource.id,action:'trash',revision:resource.revision})))).every(result=>result.status==='trashed'));
  await nav('Trash');await wait(`document.querySelector('input[aria-label="Search Trash"]')`,'Trash');
  await evaluate(`(()=>{const input=document.querySelector('input[aria-label="Search Trash"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'README');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate(`document.querySelector('button[aria-label="Empty Trash"]').click()`);await wait(`document.body.innerText.includes('Permanently delete 274 resources')`,'All-pages snapshot confirmation');await capture('ux-empty-trash-review.png');
  const late=await request('/resources','POST',{type:'note',title:'Late arrival',content:{type:'doc',content:[]}});await request('/resources/lifecycle','PUT',[{operationId:randomUUID(),resourceId:late.id,action:'trash',revision:late.revision}]);
  await evaluate(`window.__uxPausePurge=()=>{const task=document.querySelector('.activity-task[aria-label="Empty Trash"]'),progress=task?.querySelector('progress');if(progress?.value>0&&progress.value<progress.max){const pause=[...task.querySelectorAll('button')].find(button=>button.textContent==='Pause');if(pause){pause.click();return;}}requestAnimationFrame(window.__uxPausePurge);};requestAnimationFrame(window.__uxPausePurge);`);
  await click('Permanently delete 274 resources');await activity();
  await wait(`document.querySelector('.activity-task[aria-label="Empty Trash"]')?.textContent.includes('Paused —')`,'Pause purge after bounded batch');const remaining=(await request('/resources/trash?size=1')).totalItems;assert.ok(remaining>1&&remaining<275);await capture('ux-empty-trash-paused.png');await close();
  await writeFile(join(directory,'ux-purge-restart.json'),JSON.stringify({lateId:late.id,remaining,widths,paths:paths.map(path=>path.slice(root.length+1)),hashes:before}));console.log('UX phase one passed; partial snapshot purge retained for complete app/host restart.');
 }finally{dialog.showOpenDialog=previousPicker;dialog.showSaveDialog=previousSave;}
}
