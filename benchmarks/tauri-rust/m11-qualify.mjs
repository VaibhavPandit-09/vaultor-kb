import {execFileSync} from 'node:child_process';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
export async function inspectM11({evaluate,cdp,wait,report,folder,output}){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const shot=async name=>{await pause(500);const image=await cdp('Page.captureScreenshot');await writeFile(join(output,'m11-'+name+'.png'),Buffer.from(image.data,'base64'));};
 const fixture=await evaluate(`(async()=>{const c=await benchRequest({kind:'createCollection',name:'Research'});let ids=[];for(let i=0;i<100;i++){const n=await benchRequest({kind:'createNote',title:'Research '+String(i).padStart(3,'0'),collection:c.id});if(i>97)await benchRequest({kind:'save',id:n.id,title:n.title,revision:n.revision,content:{type:'doc',content:Array.from({length:50},(_,n)=>({type:'paragraph',content:[{type:'text',text:'Paragraph '+n+'. Writing and organizing local knowledge. '.repeat(8)}]}))}});ids.push(n.id);}return ids})()`);
 await cdp('Page.reload');await wait("document.querySelectorAll('[data-row-open]').length===100&&!document.querySelector('[aria-label=Notes]').getAttribute('aria-busy').includes('true')",'100-row Library');
 await shot('library-expanded-light');
 await evaluate("document.querySelector('[aria-label=Notes]').scrollTop=500;true");await pause(750);await shot('library-compact-light');
 report.headerGeometry=await evaluate(`(()=>{const h=document.querySelector('.library-orientation'),title=h.querySelector('h1').getBoundingClientRect(),search=h.querySelector('input[type=search]').getBoundingClientRect();return {compact:h.dataset.compact,title:{x:title.x,y:title.y,width:title.width,height:title.height},search:{x:search.x,y:search.y,width:search.width,height:search.height},overflow:document.querySelector('[aria-label=Notes]').scrollWidth>document.querySelector('[aria-label=Notes]').clientWidth}})()`);
 await evaluate("document.querySelector('[aria-label=Notes]').scrollTop=0;true");await pause(650);
 await evaluate(`document.querySelector('[data-select-resource="${fixture[99]}"]').click();true`);await shot('selection');
 await evaluate(`document.querySelector('[data-resource-id="${fixture[99]}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:700,clientY:300}));true`);await shot('context');await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',windowsVirtualKeyCode:27});
 await evaluate(`document.querySelector('[data-row-open="${fixture[99]}"]').click();true`);await wait("document.querySelector('.tiptap')?.textContent.includes('Paragraph 49')",'note workspace');await shot('note-light');
 await evaluate("document.querySelector('[aria-label=\"Split active note\"]').click();true");await wait("document.querySelectorAll('.tiptap').length===2",'shared panes');await shot('two-panes');
 assert(await evaluate("document.querySelectorAll('.note-orientation').length===2"),'Original note orientation in both panes');
 await evaluate("document.querySelector('[aria-label=\"Return to Library\"]').click();true");await wait("document.querySelector('[data-row-open]')",'return to Library');
 await evaluate("document.querySelector('[aria-label=Appearance]').click();true");await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent==='OLED black').click();true");await pause(700);await shot('library-oled');
 await cdp('Emulation.setDeviceMetricsOverride',{width:800,height:700,deviceScaleFactor:1,mobile:false});await shot('library-narrow');await cdp('Emulation.clearDeviceMetricsOverride');
 report.checks.push('Windows optimized app:100 rows;Library selection/context menu;managed note;two views of shared document;return to Library;OLED and narrow captures');
 report.limitations.push('Capture inspection is recorded separately from automated assertions;remaining editor,linked-source recovery and broad feature regressions reuse unchanged M10 evidence unless specifically tested.');
 if(process.argv.includes('--native-m11')){console.log('M11 native inspection ready: '+join(folder,'m11-native.done'));for(let i=0;i<600;i++){try{await readFile(join(folder,'m11-native.done'));break;}catch{}await pause(1000);}}
}

export async function qualifyM11({evaluate,wait,report,folder,record,pid}){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const memory=async phase=>{const file=join(folder,'m11-'+phase+'.json');execFileSync('powershell.exe',['-NoProfile','-File',join(import.meta.dirname,'process-breakdown.ps1'),'-RootPid',String(pid()),'-Output',file],{windowsHide:true});const snapshot=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));for(const key of ['workingSet','privateBytes'])record('frontend-churn-m11',1,phase+'_'+key,snapshot.processes.reduce((n,p)=>n+p[key],0)/1048576,'MiB','Aggregate live process tree; no forced GC; isolated WebView profile.');};
 await memory('before');
 for(let i=0;i<5;i++){const start=performance.now();await evaluate("document.querySelector('[aria-label=\"Return to Library\"]')?.click();true");await wait("document.querySelector('[data-row-open]')&&!document.querySelector('[aria-label=Notes]').getAttribute('aria-busy').includes('true')",'churn Library');await evaluate("document.querySelector('[aria-label=Notes]').scrollTop=400;true");await pause(250);await evaluate("document.querySelector('[aria-label=Notes]').scrollTop=0;document.querySelector('[data-row-open]').click();true");await wait("document.querySelector('.tiptap')&&document.querySelector('[aria-label=\"Split active note\"]')&&!document.querySelector('[aria-label=\"Note title 1\"]').disabled",'churn note');await evaluate("document.querySelector('[aria-label=\"Split active note\"]').click();true");await wait("document.querySelectorAll('.tiptap').length===2",'churn panes');await pause(220);record('frontend-churn-m11',i+1,'round_ui_ready',performance.now()-start,'ms','Library scroll, managed open and shared pane mount; includes explicit250+220ms inspection settling, not note-open latency.');}
 await memory('after');await pause(30000);await memory('idle30');report.checks.push('Five bounded Library/header/note/shared-pane navigation rounds; memory before/after/30s idle; no forced GC');
}
