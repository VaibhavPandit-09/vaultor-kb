import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {roleSamples} from './process-role-samples.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const paragraph=text=>({type:'paragraph',content:[{type:'text',text}]});
const prose=Array.from({length:110},(_,i)=>paragraph(`${i} `+'Vaultor notes preserve editable structure and shared history. '.repeat(10)));
const dense={type:'table',content:Array.from({length:181},(_,r)=>({type:'tableRow',content:Array.from({length:12},(_,c)=>({
  type:r?'tableCell':'tableHeader',content:[paragraph(r?`Entry ${r}-${c} quoted 雪`:`Column ${c+1}`)],
}))}))};

function pdfFixture(){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 3 /Kids [4 0 R 6 0 R 8 0 R] >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for(let i=1;i<=3;i++){
    const stream=`BT /F1 24 Tf 48 700 Td (M19 fixture page ${i}) Tj ET\n`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${3+i*2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  }
  let output='%PDF-1.4\n';
  const offsets=objects.map((object,i)=>{const start=output.length;output+=`${i+1} 0 obj\n${object}\nendobj\n`;return start;});
  const xref=output.length;
  output+=`xref\n0 ${offsets.length+1}\n0000000000 65535 f \n`+offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('');
  return Buffer.from(output+`trailer\n<< /Size ${offsets.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

function wavFixture(){
  const rate=48000,samples=rate*36,wav=Buffer.alloc(44+samples*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
  wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
  return wav;
}

export async function qualifyPreviews({evaluate,cdp,wait,report,folder,record,processSnapshot}){
  const api=request=>evaluate('benchRequest('+JSON.stringify(request)+')');
  const transfer=request=>evaluate("window.__TAURI_INTERNALS__.invoke('transfer',{request:"+JSON.stringify(request)+"})");
  const snapshot=await api({kind:'snapshot'});
  assert.equal(resolve(snapshot.path.replace(/^\\\\\?\\/,'')),resolve(join(folder,'workspace')));
  await cdp('Emulation.setDeviceMetricsOverride',{width:1800,height:1000,deviceScaleFactor:1,mobile:false});
  const measure=async(phase,cycle=1)=>{
    await sleep(2400);
    const state=await processSnapshot();
    const heap=await cdp('Runtime.getHeapUsage');
    const scenario='m19-'+phase;
    for(const sample of roleSamples(state)){
      if(sample.metric.endsWith('_workingSet')||sample.metric.endsWith('_privateBytes'))
        record(scenario,cycle,sample.metric,sample.value,sample.unit,'Role snapshot following 2.4 s of settling.');
    }
    record(scenario,cycle,'process_tree_working_set',state.processes.reduce((total,p)=>total+p.workingSet,0)/1048576,'MiB','Working sets include shared pages.');
    record(scenario,cycle,'js_heap_used',heap.usedSize/1048576,'MiB','CDP used heap without explicit GC.');
  };
  const click=async selector=>{
    await wait('!!document.querySelector('+JSON.stringify(selector)+')?.getClientRects().length','visible '+selector);
    const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});
  };
  const openRow=id=>click(`[data-row-open="${id}"]`);
  const one=()=>wait('document.querySelectorAll(".tiptap").length===1 && document.querySelector(".tiptap")?.editor?.isEditable','one editable note');
  const back=async()=>{await click('[aria-label="Return to Library"]');await wait('!document.querySelector(".tiptap") && document.querySelector("[data-list-focus]")?.getAttribute("aria-busy")==="false"','Library returned');};
  const org=request=>api({kind:'organization',request});
  await measure('fresh');
  const fixtures={
    'M19 local.pdf':pdfFixture(),
    'M19 waveform.wav':wavFixture(),
    'M19 raster.png':Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pP1sAAAAASUVORK5CYII=','base64'),
  };
  const paths=Object.keys(fixtures).map(name=>join(folder,name));
  await Promise.all(paths.map((path,i)=>writeFile(path,Object.values(fixtures)[i])));
  const plan=await transfer({op:'preview',paths,folder:false,collection:null});
  const task=await transfer({op:'import',token:plan.token,separate:false});
  await wait(`window.__TAURI_INTERNALS__.invoke('transfer',{request:{op:'tasks'}}).then(tasks=>tasks.some(task=>task.id===${JSON.stringify(task.id)}&&task.state==='completed'))`,'managed fixtures imported');
  const notes=[];
  for(const [title,content] of [['M19 prose',prose],...['A','B','C'].map(title=>['M19 dense '+title,[paragraph(title),dense,paragraph('End')]])]){
    const note=await api({kind:'createNote',title,collection:null});
    await api({kind:'save',id:note.id,revision:note.revision,title,content:{type:'doc',content}});
    notes.push(note);
  }
  const list=await api({kind:'list',collection:null,limit:30});
  const files=Object.keys(fixtures).map(name=>list.items.find(item=>item.title===name));
  assert(files.every(Boolean));
  await org({op:'pin',ids:[...notes.slice(1),...files].map(item=>item.id),value:true});
  await api({kind:'behavior',path:snapshot.path,value:{maxVisiblePanes:3,noteOpening:'fill'}});
  await api({kind:'preferences',value:{previewMode:'side',autoCompanion:false}});
  report.dataset=createHash('sha256').update(JSON.stringify([prose,dense])).update(Buffer.concat(Object.values(fixtures))).digest('hex');
  await cdp('Page.reload');
  await wait('!!document.querySelector("[data-ready=true][data-session-ready=true]")','ready fixture workspace');
  assert.equal((await evaluate("window.__TAURI_INTERNALS__.invoke('workspace',{request:{kind:'snapshot'}})")).path,snapshot.path);
  await evaluate("window.benchRequest=request=>window.__TAURI_INTERNALS__.invoke('workspace',{request})");
  await openRow(notes[0].id);await one();await measure('one-prose');await back();
  await openRow(notes[1].id);await one();await measure('one-dense');
  for(const count of [2,3]){
    await click('[aria-label="Split active note"]');
    await wait(`document.querySelectorAll('.tiptap').length===${count} && [...document.querySelectorAll('.tiptap')].every(e=>e.editor?.isEditable)`,'split ready');
  }
  await measure('three-shared-dense');
  await click('#next-category-shortcuts');
  const shortcut=title=>'#next-category-panel-shortcuts .sidebar-shortcut-open[title^='+JSON.stringify(title+' ·')+']';
  const readiness=async(phase,selector,expression,cycle)=>{
    const start=performance.now();
    await click(selector);await wait(expression,phase);
    record('m19-'+phase,cycle,'content_ready_ms',performance.now()-start,'ms','CDP click through content-ready condition. Includes polling, excludes motion completion.');
  };
  const close=async(cycle=1)=>{
    const started=performance.now();
    await click('[data-preview-close]');await wait('!document.querySelector("[data-preview-resource]")','preview dismissed');
    record('m19-preview-close',cycle,'content_released_ms',performance.now()-started,'ms','Preview subtree detached. Resource ownership checked separately.');
  };
  for(let cycle=1;cycle<=2;cycle++){
    await readiness('pdf-first-page',shortcut(files[0].title),'document.querySelector(".next-pdf-text")?.textContent.includes("M19 fixture page 1")',cycle);
    assert(await evaluate(`(()=>{const canvas=document.querySelector('.next-pdf-page canvas'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return pixels.some((value,i)=>i%4===0&&value<150&&pixels[i+3]>200);})()`),'PDF page contains visible rasterized glyphs');
    assert.equal(await evaluate('document.querySelectorAll(".tiptap").length'),3);
    const started=performance.now();
    await evaluate(`[...document.querySelectorAll('.next-pdf button')].find(e=>e.textContent==='Next page').click();true`);
    await wait('document.querySelector(".next-pdf-text")?.textContent.includes("M19 fixture page 2")','PDF next page');
    record('m19-pdf-navigation',cycle,'content_ready_ms',performance.now()-started,'ms','Page change through text-layer readiness.');
    await click('[aria-label="Expand file preview"]');
    assert.equal(await evaluate('document.querySelector(".preview-geometry")?.dataset.mode'),'modal');
    await measure('pdf-open',cycle);
    await close();
    await readiness('raster-ready',shortcut(files[2].title),'document.querySelector(".next-resource-preview img")?.naturalWidth===1',cycle);
    await close();await measure('previews-closed',cycle);
  }
  await readiness('media-metadata',shortcut(files[1].title),'document.querySelector(".next-playback audio")?.duration>30',1);
  await evaluate('document.querySelector(".next-playback audio").currentTime=32;true');
  await wait('document.querySelector(".next-playback audio")?.currentTime>30 && !document.querySelector(".next-playback audio")?.seeking','range seek');
  await measure('media-open');await close();
  assert.equal(await evaluate('document.querySelector(".next-playback audio")===null'),true);
  await back();
  for(const note of notes.slice(1)){
    await click(shortcut(note.title));
    await wait(`!!document.querySelector('[data-note-id="${note.id}"] .tiptap')?.editor?.isEditable`,'distinct dense note ready');
  }
  assert.equal(await evaluate('document.querySelectorAll(".tiptap").length'),3);
  await measure('three-distinct-dense');
  for(let cycle=1;cycle<=2;cycle++){
    await back();await openRow(notes[1].id);await one();await measure('returned-one-dense',cycle);
  }
  await api({kind:'new',path:join(folder,'switched-workspace')});
  assert(await evaluate(`window.__TAURI_INTERNALS__.invoke('resource_bytes',{id:${JSON.stringify(files[0].id)},workspace:${JSON.stringify(snapshot.path)}}).then(()=>false,()=>true)`),'older workspace byte request rejected');
  assert(await evaluate(`window.__TAURI_INTERNALS__.invoke('open_media_preview',{id:${JSON.stringify(files[1].id)},workspace:${JSON.stringify(snapshot.path)}}).then(()=>false,()=>true)`),'older workspace media request rejected');
  report.checks.push('Three-page PDF first/next page text, side to floating expansion, repeated raster/PDF cleanup, >2 MiB WAV metadata and range seek, three shared and distinct note panes, and returned one-dense-pane snapshots.');
  report.checks.push('After switching the Rust owner to a second disposable workspace, stale PDF and media requests for the original workspace were refused.');
}
