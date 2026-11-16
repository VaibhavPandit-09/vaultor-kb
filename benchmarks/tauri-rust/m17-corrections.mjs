import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

// Focused runtime checks only. OS input and Explorer evidence are recorded separately.
export async function qualifyCorrections({evaluate,cdp,wait,report,folder,restart}) {
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const command=request=>evaluate('window.__TAURI_INTERNALS__.invoke("workspace",{request:'+JSON.stringify(request)+'})');
 const root=(await command({kind:'snapshot'})).path;
 assert.equal(resolve(root.replace(/^\\\\\?\\/,'')),resolve(join(folder,'workspace')),'Disposable workspace required');
 const click=async selector=>{
  await wait('Boolean(document.querySelector('+JSON.stringify(selector)+'))','control ready');
  const point=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.scrollIntoView({block:"nearest"});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()');
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});await pause(250);
 };
 const ids=[];
 for(const title of ['Correction A','Correction B','Correction C','Correction D'])ids.push((await command({kind:'createNote',title,collection:null})).id);
 report.correctionFixture={root,ids};
 const sessions=ids.map((id,i)=>({id,paneId:'correction-'+i,cursor:0,history:[{visitId:'visit-'+i,resourceId:id,title:'Correction '+String.fromCharCode(65+i)}]}));
 const receipt={version:1,documents:[{id:ids[0]}],activePane:0,ratio:50,browse:{screen:'resources',collection:null,criteria:{query:'',content:false,order:'created'}},sidebar:true,companion:'sessions',journeys:{sessions,panes:[sessions[0]],activePaneId:sessions[0].paneId,positions:{'visit-0':{scrollTop:30,scrollLeft:0}}}};
 const paneIds=()=>evaluate('[...document.querySelectorAll("[data-note-id]")].map(e=>e.dataset.noteId)');
 const geometryOnly=process.argv.includes("--corrections-geometry-only");
 if(geometryOnly){const visible=sessions.slice(0,3);await command({kind:"behavior",path:root,value:{maxVisiblePanes:3,noteOpening:"fill"}});await command({kind:"session",path:root,value:{...receipt,documents:ids.slice(0,3).map(id=>({id})),journeys:{...receipt.journeys,panes:visible}}});await cdp("Page.reload");await wait('document.querySelectorAll(".tiptap").length===3',"geometry fixture restored");}
 for(const max of geometryOnly?[]:[1,2,3]){
  await command({kind:'behavior',path:root,value:{maxVisiblePanes:max,noteOpening:'fill',autosaveDelay:1000,focusMode:false}});
  await command({kind:'preferences',value:{autoCompanion:false,openBeside:false,theme:'dark'}});
  await command({kind:'session',path:root,value:receipt});await cdp('Page.reload');
  await wait('document.querySelector("[data-session-ready=true]")&&document.querySelectorAll(".tiptap").length===1','receipt restored');
  for(let i=1;i<4;i++){
   await click('[data-session-id="correction-'+i+'"] .sidebar-nav');
   await wait('Boolean(document.querySelector('+JSON.stringify('[data-note-id="'+ids[i]+'"]')+'))','note assigned');
   assert.equal((await paneIds()).length,Math.min(max,i+1));
  }
  const before=await paneIds();await click('[data-session-id="correction-3"] .sidebar-nav');assert.deepEqual(await paneIds(),before);
  await pause(1000);await restart();await wait('document.querySelector("[data-session-ready=true]")','restart restored');
  assert.deepEqual(await paneIds(),before);
  assert.equal((await command({kind:'snapshot'})).settings.behavior.noteOpening,'fill');
  report.checks.push('Configured '+max+' pane policy: spare slots filled; occupied active slot replaced; existing session reused; assignments and fill preference survive process restart.');
 }
 if(!geometryOnly){await click('[aria-label="Application menu"]');await wait('document.querySelector(".library-popover.application-menu")','application menu');
 const rows=await evaluate('[...document.querySelectorAll("[role=menu] .menu-action")].map(e=>{const r=e.getBoundingClientRect(),l=e.querySelector(".menu-label").getBoundingClientRect(),k=e.querySelector("kbd")?.getBoundingClientRect();return {label:e.textContent,top:r.top,bottom:r.bottom,labelRight:l.right,shortcutLeft:k?.left};})');
 assert(rows.length>=6);for(let i=0;i<rows.length;i++){if(i)assert(rows[i].top>=rows[i-1].bottom);if(rows[i].shortcutLeft)assert(rows[i].shortcutLeft>=rows[i].labelRight);}
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35});
 assert((await evaluate('document.activeElement.textContent')).includes('Help'));
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await wait('document.activeElement?.getAttribute("aria-label")==="Application menu"','menu focus restored');
 report.checks.push('Application menu measured distinct rows/shortcut columns; End selects Help; Escape restores its trigger.');}
 await cdp("Emulation.clearDeviceMetricsOverride");
 report.captionGeometry=[];
 for(const width of process.argv.includes("--corrections-native-only")?[]:[760,1200,1800]){
  await evaluate('window.__TAURI_INTERNALS__.invoke("plugin:window|set_size",{value:{Logical:{width:'+width+',height:820}}})');await pause(600);
  const geometry=await evaluate('(()=>{const drag=document.querySelector(".next-title-drag").getBoundingClientRect();const controls=document.querySelector(".next-window-controls").getBoundingClientRect();const buttons=[...document.querySelectorAll(".next-toolbar-actions button")].filter(e=>e.getClientRects().length&&getComputedStyle(e).display!=="none").map(e=>({label:e.getAttribute("aria-label"),...e.getBoundingClientRect().toJSON()}));const journey=document.querySelector(".journey-bar").getBoundingClientRect();const journeyControls=document.querySelector(".journey-controls").getBoundingClientRect();return {width:innerWidth,drag:drag.toJSON(),controls:controls.toJSON(),journey:journey.toJSON(),journeyControls:journeyControls.toJSON(),buttons};})()');
  assert.equal(geometry.width,width,"Actual viewport must follow the native window size");assert(geometry.drag.width>=80);assert(geometry.journey.top>=0);assert(geometry.journey.bottom<=40);assert(geometry.journeyControls.right<=geometry.journey.right);assert(geometry.journey.right<=geometry.drag.left);assert(geometry.buttons.every(b=>b.right<=geometry.controls.left));
  for(let i=1;i<geometry.buttons.length;i++)assert(geometry.buttons[i].left>=geometry.buttons[i-1].right);
  report.captionGeometry.push(geometry);
 }
 if(!process.argv.includes('--corrections-native-only'))report.checks.push('Real Tauri window sizes 760/1200/1800: caption drag width >=80; right controls have disjoint bounds and reserved native-control space.');
 await evaluate('window.__TAURI_INTERNALS__.invoke("plugin:window|set_size",{value:{Logical:{width:1200,height:820}}})');
 if(process.argv.includes('--hold-corrections')){
  const marker=join(folder,'corrections-native.done');console.log('CORRECTIONS native hold: '+marker);
  let released=false;for(let i=0;i<1800;i++){try{await readFile(marker);released=true;break;}catch{}await pause(1000);}
  assert(released,'Native hold expired; acceptance not completed');
 }
 report.limitations.push('Runtime/CDP checks do not certify physical OS dragging, Explorer drops, Snap hover, touchpad, IME or screen-reader speech. Separate Windows input evidence is required. No benchmark measurements were added.');
}
