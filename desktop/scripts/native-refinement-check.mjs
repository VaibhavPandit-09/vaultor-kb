import assert from 'node:assert/strict';
import {dialog,nativeTheme} from 'electron';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';

/** Disposable real Electron UI/owned host/native files; picker results are fixtures. */
export async function runRefinementCheck(window,directory){
 assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
 const wc=window.webContents,evaluate=code=>wc.executeJavaScript(code),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(code,label)=>{for(let n=0;n<300;n++){if(await evaluate(code).catch(()=>false))return;await delay(100);}throw Error(label+': '+await evaluate('document.body.innerText'));};
 const capture=async name=>{await delay(250);await writeFile(join(directory,name),(await wc.capturePage()).toPNG());};
 const click=label=>evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled);if(!button)throw Error('Missing '+${JSON.stringify(label)});button.click();})()`);
 window.showInactive();window.setMinimumSize(440,480);window.setSize(1320,850);nativeTheme.themeSource='dark';
 if(process.env.VAULTOR_REFINEMENT_BEFORE==='1'){await capture('refinement-before.png');return;}
 await wait(`document.querySelector('.sidebar-import')`,'Unified Import');
 await delay(750);await capture('refinement-after.png');
 const measurements=[];
 for(const width of [1320,680,440]){
  window.setSize(width,850);await delay(200);if(await evaluate(`document.getElementById('workspace-sidebar').inert`))await evaluate(`document.getElementById('sidebar-trigger').click()`);await delay(350);await click('Import');await wait(`document.querySelector('.import-acquisition')`,'Import acquisition');
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Import options"]').length`),0);
  assert.ok(await evaluate(`(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})()`));
  measurements.push({width,focus:await evaluate(`document.activeElement?.textContent`)});await capture('refinement-import-'+width+'.png');
  wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait(`!document.querySelector('.import-acquisition')`,'Escape closes import');
  await wait(`document.activeElement===document.querySelector('.sidebar-import')`,'Import focus restored');
  await evaluate(`document.querySelector('[aria-label="Sidebar options"]').click()`);await wait(`document.querySelector('.library-popover')`,'Sidebar menu');assert.ok(await evaluate(`(()=>{const r=document.querySelector('.library-popover').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})()`));await capture('refinement-menu-'+width+'.png');wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});
 }
 window.setSize(1320,850);
 await evaluate(`document.documentElement.dataset.animation='smooth'`);
 const motion=[];await evaluate(`document.querySelector('[aria-controls="sidebar-pinned"]').click()`);
 for(let frame=0;frame<5;frame++){await delay(35);motion.push(await evaluate(`({expanded:document.querySelector('[aria-controls="sidebar-pinned"]').getAttribute('aria-expanded'),transform:getComputedStyle(document.querySelector('[aria-controls="sidebar-pinned"] .disclosure-indicator'),'::after').transform,inert:document.getElementById('sidebar-pinned').parentElement.inert})`));await writeFile(join(directory,'refinement-disclosure-'+frame+'.png'),(await wc.capturePage()).toPNG());}
 assert.ok(motion.every(frame=>frame.expanded==='false'&&frame.inert));await evaluate(`document.querySelector('[aria-controls="sidebar-pinned"]').click()`);await delay(250);assert.equal(await evaluate(`document.querySelector('[aria-controls="sidebar-pinned"]').getAttribute('aria-expanded')`),'true');
 const root=join(await mkdtemp(join(tmpdir(),'vaultor-refinement-source-')),'Refinement docs');await mkdir(root);await mkdir(join(root,'empty'));
 const source='# Guide\n\n[Other](Other.md#part)\n';await writeFile(join(root,'Guide.md'),source);await writeFile(join(root,'Other.md'),'# Other\n\n[Guide](Guide.md)\n\n## Part\n');
 const previous=dialog.showOpenDialog;let cancelPicker=true;dialog.showOpenDialog=async()=>cancelPicker?{canceled:true,filePaths:[]}:{canceled:false,filePaths:[root]};
 try{
  await click('Import');await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Browse folder').focus()`);await click('Browse folder');await wait(`document.querySelector('.import-acquisition')&&document.activeElement?.textContent==='Browse folder'&&!document.activeElement.disabled`,'Picker cancellation keeps acquisition focus');cancelPicker=false;await click('Browse folder');await wait(`document.querySelector('[role=dialog]')?.textContent.includes('2 files')`,'Folder review');await capture('refinement-review.png');
  await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Import folder'&&!b.disabled)`,'Import ready');await click('Import folder');
  await wait(`!document.querySelector('[role=dialog]')`,'Activity owns import');await evaluate(`document.querySelector('.activity-chrome button[aria-haspopup]').click()`);await wait(`document.querySelector('.activity-chrome button[aria-haspopup]').getAttribute('aria-expanded')==='true'&&document.body.innerText.includes('Import complete')`,'Activity completion');await capture('refinement-activity.png');wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait(`!document.querySelector('.library-popover')`,'Activity closed');
  // A system drag carries native File objects through preload webUtils, exercising
  // the same ticket acquisition as the native folder chooser, including repeats.
  await click('Import');await wait(`document.querySelector('.import-acquisition')`,'Drop surface');
  const point=await evaluate(`(()=>{const r=document.querySelector('.import-acquisition').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  wc.debugger.attach('1.3');try{for(const type of ['dragEnter','dragOver','drop'])await wc.debugger.sendCommand('Input.dispatchDragEvent',{type,...point,data:{items:[],files:[root],dragOperationsMask:1}});}finally{wc.debugger.detach();}
  await wait(`document.querySelector('[role=dialog]')?.textContent.includes('Skip imported files')`,'Dropped folder duplicate recognition');await capture('refinement-drop-repeat.png');
  await evaluate(`document.querySelector('[aria-label="Close modal"]').click()`);await wait(`!document.querySelector('[role=dialog]')`,'Review closed');
  await evaluate(`document.querySelector('[aria-label="Link folder"]').click()`);await wait(`[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-expanded')==='false'&&b.textContent.includes('Refinement docs'))`,'Linked source');
  const label=await evaluate(`[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-expanded')==='false'&&b.textContent.includes('Refinement docs'))?.textContent`);assert.ok(label);await click(label);
  await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Guide.md')`,'Linked document');await click('Guide.md');
  await wait(`document.querySelector('.tiptap')`,'Linked editor');
  await capture('refinement-linked.png');
  await wait(`document.querySelector('[aria-label="Actions for Guide.md"]')`,'Linked resource actions');await evaluate(`document.querySelector('[aria-label="Actions for Guide.md"]').click()`);await click('Links and mentions…');
  await wait(`document.querySelector('.reference-view')?.innerText.includes('Other.md')`,'Linked backlink');await capture('refinement-backlinks.png');
  await click('Links to');await wait(`document.querySelector('.reference-view')?.innerText.includes('Other.md')`,'Linked outgoing edge');await capture('refinement-outgoing.png');
  await evaluate(`document.querySelector('[aria-label="Close modal"]').click()`);await wait(`!document.querySelector('.reference-view')`,'References closed');assert.equal(await readFile(join(root,'Guide.md'),'utf8'),source);
 }finally{dialog.showOpenDialog=previous;}
 wc.debugger.attach('1.3');try{await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await click('Import');await wait(`document.querySelector('.import-acquisition')`,'Reduced-motion import');assert.equal(await evaluate(`getComputedStyle(document.querySelector('.disclosure-indicator'),'::after').transitionDuration`),'0s');await capture('refinement-reduced.png');
 }finally{wc.debugger.detach();}
 nativeTheme.themeSource='light';await capture('refinement-light.png');
 await writeFile(join(directory,'refinement-results.json'),JSON.stringify({measurements,motion,sourceUnchanged:true,nativeDropDuplicate:true}));
 console.log('Refinement native checks passed: widths, Escape/focus, folder Activity, native drop/repeat, linked source and reduced motion.');
}
