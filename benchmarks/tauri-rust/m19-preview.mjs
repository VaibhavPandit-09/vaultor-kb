import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {roleSamples} from './process-role-samples.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const paragraph=text=>({type:'paragraph',content:[{type:'text',text}]});
const prose=Array.from({length:110},(_,i)=>paragraph(`${i} `+'Vaultor notes preserve editable structure and shared history. '.repeat(10)));
const dense={type:'table',content:Array.from({length:181},(_,r)=>({type:'tableRow',content:Array.from({length:12},(_,c)=>({
  type:r?'tableCell':'tableHeader',content:[paragraph(r?`Entry ${r}-${c} quoted 雪`:`Column ${c+1}`)],
}))}))};

function pdfFixture(label='M19 fixture'){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 3 /Kids [4 0 R 6 0 R 8 0 R] >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for(let i=1;i<=3;i++){
    const stream=`BT /F1 24 Tf 48 700 Td (${label} page ${i}) Tj ET\n`;
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

export async function qualifyPreviews({evaluate,cdp,wait,report,folder,record,processSnapshot,extended=false}){
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
    if(extended){
      record(scenario,cycle,'process_tree_count',state.processes.length,'count');
      record(scenario,cycle,'process_tree_handles',state.processes.reduce((total,p)=>total+p.handles,0),'count');
      record(scenario,cycle,'process_tree_private_bytes',state.processes.reduce((total,p)=>total+p.privateBytes,0)/1048576,'MiB');
    }
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
  const protectedPdf = process.env.VAULTOR_BENCH_PROTECTED_PDF;
  if (protectedPdf) fixtures['M26 protected.pdf'] = await readFile(protectedPdf);
  const paths=Object.keys(fixtures).map(name=>join(folder,name));
  await Promise.all(paths.map((path,i)=>writeFile(path,Object.values(fixtures)[i])));
  const plan=await transfer({op:'preview',paths,folder:false,collection:null});
  const importStarted=performance.now();
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
  if(process.argv.includes('--m26b-pdf-index')){
    const linked=request=>api({kind:'linked',request});
    const search=(query,kind='pdf')=>api({kind:'search',options:{query,kind,content:true,collection:null,order:'match'}});
    const initial=await search('fixture page 3');
    assert.deepEqual(initial.items.map(item=>item.id),[files[0].id]);
    assert.match(initial.items[0].searchSnippet.text,/M19 fixture page 3/);
    record('m26b-managed-pdf',1,'import_and_readback_ms',performance.now()-importStarted,'ms','Fixture import, Activity completion and FTS readback, including polling and intervening setup.');
    const rebuild=await transfer({op:'rebuildFileText'});
    await wait(`window.__TAURI_INTERNALS__.invoke('transfer',{request:{op:'tasks'}}).then(tasks=>tasks.some(task=>task.id===${JSON.stringify(rebuild.id)}&&task.state==='completed'))`,'managed index rebuild');
    assert.equal((await search('fixture page 2')).items[0].id,files[0].id);
    await org({op:'trash',ids:[files[0].id],restore:false});
    assert.equal((await search('fixture page 3')).total,0);
    await org({op:'trash',ids:[files[0].id],restore:true});
    assert.equal((await search('fixture page 3')).total,1);
    const source=join(folder,'linked-pdf');
    const linkedFile=join(source,'report.pdf');
    await mkdir(source);
    const original=pdfFixture('Quartz astrolabe');
    await writeFile(linkedFile,original);
    const linkedStarted=performance.now();
    const registration=await linked({op:'register',path:source});
    const searchInWebView=query=>`benchRequest(${JSON.stringify({kind:'search',options:{query,kind:'pdf',content:true,collection:null,order:'match'}})})`;
    await wait(`${searchInWebView('Quartz astrolabe')}.then(result=>result.total===1)`,'linked PDF first index');
    record('m26b-linked-pdf',1,'registration_and_match_ms',performance.now()-linkedStarted,'ms','Source registration through FTS readiness, including polling.');
    const first=(await search('Quartz astrolabe')).items[0];
    assert.equal(first.sourcePath,'report.pdf');
    const bytes=await evaluate(`window.__TAURI_INTERNALS__.invoke('resource_bytes',${JSON.stringify({id:first.id,workspace:snapshot.path})}).then(buffer=>Array.from(new Uint8Array(buffer)))`);
    assert.deepEqual(Buffer.from(bytes),original);
    await openRow(first.id);
    await wait('document.querySelector(".next-pdf-text")?.textContent.includes("Quartz astrolabe")','read-only linked PDF opened in the desktop preview');
    await click('[data-preview-close]');
    await wait('!document.querySelector("[data-preview-resource]")','linked PDF preview dismissed');
    const revision=pdfFixture('Topaz sextant');
    await writeFile(linkedFile,revision);
    await wait(`${searchInWebView('Topaz sextant')}.then(result=>result.total===1)`,'linked PDF refreshed after disk edit');
    assert.equal((await search('Topaz sextant')).items[0].id,first.id);
    assert.equal((await search('Quartz astrolabe')).total,0);
    await linked({op:'remove',source:registration.id});
    assert.equal((await search('Topaz sextant')).total,0);
    const refused=await evaluate(`window.__TAURI_INTERNALS__.invoke('resource_bytes',${JSON.stringify({id:first.id,workspace:snapshot.path})}).then(()=>false,()=>true)`);
    assert.equal(refused,true);
    assert.deepEqual(await readFile(linkedFile),revision);
    report.checks.push('PDF saved-body import and rebuild, multiple pages, Trash and restore, linked update, source revocation, preview byte refusal and exact untouched linked original');
  }
  await org({op:'pin',ids:[...notes.slice(1),...files.slice(0,3)].map(item=>item.id),value:true});
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
    await readiness('pdf-first-page',shortcut(files[0].title),`(()=>{
      if(!document.querySelector('.next-pdf-text')?.textContent.includes('M19 fixture page 1'))return false;
      const canvas=document.querySelector('.next-pdf-page canvas');
      if(!canvas?.width||!canvas.height)return false;
      const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      return pixels.some((value,i)=>i%4===0&&value<150&&pixels[i+3]>200);
    })()`,cycle);
    assert.equal(await evaluate('document.querySelectorAll(".tiptap").length'),3);
    const started=performance.now();
    await evaluate(`[...document.querySelectorAll('.next-pdf button')].find(e=>e.textContent==='Next page').click();true`);
    await wait('document.querySelector(".next-pdf-text")?.textContent.includes("M19 fixture page 2")','PDF next page');
    record('m19-pdf-navigation',cycle,'content_ready_ms',performance.now()-started,'ms','Page change through text-layer readiness.');
    if(cycle===1&&process.argv.includes('--m26b-pdf-index')){
      await evaluate("[...document.querySelectorAll('.next-pdf button')].find(button=>button.textContent==='Find in PDF').click()");
      await wait('document.activeElement?.getAttribute("aria-label")==="Find PDF text"','PDF Find focus');
      const {nodes}=await cdp('Accessibility.getFullAXTree');
      assert(nodes.some(node=>!node.ignored&&node.role?.value==='searchbox'&&node.name?.value==='Find PDF text'));
      assert(nodes.some(node=>!node.ignored&&node.role?.value==='button'&&node.name?.value==='Close Find'));
      await cdp('Input.insertText',{text:'fixture page 3'});
      await click('.next-pdf form button[type=submit]');
      await wait('document.querySelector(".next-pdf-text")?.textContent.includes("M19 fixture page 3")','PDF Find selected matching page');
      await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await wait('document.activeElement?.textContent==="Find in PDF" && !document.querySelector(".next-pdf input[type=search]")','PDF Find Escape preserves preview and restores focus');
      report.checks.push('PDF Find searched across pages, opened the matching page and restored toolbar focus on Escape');
    }
    await click('[aria-label="Expand file preview"]');
    assert.equal(await evaluate('document.querySelector(".preview-geometry")?.dataset.mode'),'modal');
    await measure('pdf-open',cycle);
    await close(cycle);
    await readiness('raster-ready',shortcut(files[2].title),'document.querySelector(".next-resource-preview img")?.naturalWidth===1',cycle);
    await close(cycle);await measure('previews-closed',cycle);
  }
  await readiness('media-metadata',shortcut(files[1].title),'document.querySelector(".next-playback audio")?.duration>30',1);
  await evaluate('document.querySelector(".next-playback audio").currentTime=32;true');
  await wait('document.querySelector(".next-playback audio")?.currentTime>30 && !document.querySelector(".next-playback audio")?.seeking','range seek');
  await evaluate('(async()=>{const player=document.querySelector(".next-playback audio");player.muted=true;await player.play();return true})()');
  await wait('document.querySelector(".next-playback audio")?.currentTime>32.05','muted audio playback');
  await measure('media-open');await close();
  assert.equal(await evaluate('document.querySelector(".next-playback audio")===null'),true);
  await back();
  if(protectedPdf){
    const password='[name="password"]';
    const open=()=>openRow(files[3].id);
    const submit=async value=>{
      await wait('document.querySelector('+JSON.stringify(password)+')?.type==="password"','PDF password field');
      await evaluate('document.querySelector('+JSON.stringify(password)+').focus()');
      await cdp('Input.insertText',{text:value});
      await click('.next-pdf button[type="submit"]');
    };
    await open();
    await submit('incorrect');
    await wait('document.querySelector(".next-pdf [role=alert]")?.textContent.includes("Incorrect PDF password")','wrong password');
    await submit('m26-fixture');
    await wait('document.querySelector(".next-pdf-text")?.textContent.includes("M26 protected fixture")','unlocked PDF text');
    await close(3);
    await open();
    await wait('document.querySelector('+JSON.stringify(password)+')?.value===""','password is requested again');
    await close(4);
    report.checks.push('Protected PDF wrong and correct passwords, text readback, close and reopen without password retention');
  }
  for(const note of notes.slice(1)){
    await click(shortcut(note.title));
    await wait(`!!document.querySelector('[data-note-id="${note.id}"] .tiptap')?.editor?.isEditable`,'distinct dense note ready');
  }
  assert.equal(await evaluate('document.querySelectorAll(".tiptap").length'),3);
  await measure('three-distinct-dense');
  if(extended){
    const start=performance.now();
    for(let cycle=1;cycle<=6;cycle++){
      await readiness('cycle-pdf',shortcut(files[0].title),'document.querySelector(".next-pdf-text")?.textContent.includes("M19 fixture page 1")',cycle);
      await close(cycle);
      await readiness('cycle-raster',shortcut(files[2].title),'document.querySelector(".next-resource-preview img")?.naturalWidth===1',cycle);
      await close(cycle);
      await readiness('cycle-audio',shortcut(files[1].title),'document.querySelector(".next-playback audio")?.duration>30',cycle);
      await close(cycle);
      await back();
      await measure('cycle-returned-library',cycle);
      if(cycle<6){
        for(const note of notes.slice(1)){
          await click(shortcut(note.title));
          await wait(`!!document.querySelector('[data-note-id="${note.id}"] .tiptap')?.editor?.isEditable`,'distinct dense note reopened');
        }
        assert.equal(await evaluate('document.querySelectorAll(".tiptap").length'),3);
      }
    }
    record('m19-extended-churn',1,'duration',performance.now()-start,'ms','Six three-dense-pane cycles with PDF, raster, audio and return to Library.');
    await sleep(30_000);
    await measure('cycle-settled-library');
  }
  for(let cycle=1;cycle<=2;cycle++){
    if(!extended||cycle>1)await back();
    await openRow(notes[1].id);await one();await measure('returned-one-dense',cycle);
  }
  // The first transaction may initialize table/column identities on the seeded fixture.
  const noteContent=`JSON.stringify(document.querySelector('.tiptap').editor.getJSON(),(key,value)=>
    key==='tableId'||key==='columnIds'?undefined:value)`;
  const beforePaste=await evaluate(noteContent);
  const pasteMarkdown=`(()=>{
    const view=document.querySelector('.tiptap'),editor=view.editor;
    editor.commands.focus('end');
    const data=new DataTransfer();data.setData('text/plain','# M19 clipboard heading');
    view.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
    return true;
  })()`;
  await evaluate(pasteMarkdown);
  const review='[...document.querySelectorAll("[role=dialog]")].find(e=>e.textContent.includes("Review Markdown paste"))';
  await wait(`!!(${review})`,'Markdown review ready');
  await evaluate(`[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent==='Cancel').click();true`);
  await wait(`!(${review}) && document.activeElement?.classList.contains('tiptap')`,'Markdown cancel returned focus');
  assert(await evaluate(noteContent)===beforePaste,'Markdown cancellation preserves note content');
  await evaluate(pasteMarkdown);
  await wait(`[...((${review})?.querySelectorAll('button')??[])].some(e=>e.textContent==='Insert'&&!e.disabled)`,'Markdown review reopened');
  await evaluate(`[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent==='Insert').click();true`);
  await wait('document.querySelector(".tiptap h1")?.textContent==="M19 clipboard heading"','structured Markdown inserted');
  await evaluate('document.querySelector(".tiptap").editor.commands.undo();true');
  assert(await evaluate(noteContent)===beforePaste,'Markdown undo restores note content');
  if(process.argv.includes('--m19-video')){
    // Render a local, disposable VP8 fixture with the same desktop codec stack.
    const bytes=await evaluate(`(async()=>{
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=96;
      const ctx=canvas.getContext('2d'),stream=canvas.captureStream(10);
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),parts=[];
      recorder.ondataavailable=event=>parts.push(event.data);
      const finished=new Promise(resolve=>recorder.onstop=resolve);
      recorder.start();for(let i=0;i<8;i++){ctx.fillStyle=i%2?'blue':'green';ctx.fillRect(0,0,128,96);await new Promise(resolve=>setTimeout(resolve,130));}
      recorder.stop();await finished;stream.getTracks().forEach(track=>track.stop());
      return Array.from(new Uint8Array(await new Blob(parts).arrayBuffer()));
    })()`);
    assert(bytes.length>100);
    const path=join(folder,'M19 motion.webm');
    await writeFile(path,Buffer.from(bytes));
    const plan=await transfer({op:'preview',paths:[path],folder:false,collection:null});
    const task=await transfer({op:'import',token:plan.token,separate:false});
    await wait(`window.__TAURI_INTERNALS__.invoke('transfer',{request:{op:'tasks'}}).then(tasks=>tasks.some(task=>task.id===${JSON.stringify(task.id)}&&task.state==='completed'))`,'video fixture imported');
    await back();
    const listed=await api({kind:'list',collection:null,limit:30});
    const video=listed.items.find(item=>item.title==='M19 motion.webm');
    assert(video);
    await openRow(video.id);
    await wait('document.querySelector(".next-playback video")?.videoWidth===128','WebM first frame');
    await evaluate('(async()=>{const player=document.querySelector(".next-playback video");player.muted=true;await player.play();return true})()');
    await wait('document.querySelector(".next-playback video")?.currentTime>0.1','WebM playback');
    await click('[data-preview-close]');
    await wait('!document.querySelector(".next-playback video")','closed video released');
    report.checks.push('A generated 128 × 96 VP8/WebM fixture reached its first frame, played, and released its preview.');
  }
  await api({kind:'new',path:join(folder,'switched-workspace')});
  assert(await evaluate(`window.__TAURI_INTERNALS__.invoke('resource_bytes',{id:${JSON.stringify(files[0].id)},workspace:${JSON.stringify(snapshot.path)}}).then(()=>false,()=>true)`),'older workspace byte request rejected');
  assert(await evaluate(`window.__TAURI_INTERNALS__.invoke('open_media_preview',{id:${JSON.stringify(files[1].id)},workspace:${JSON.stringify(snapshot.path)}}).then(()=>false,()=>true)`),'older workspace media request rejected');
  report.checks.push('Three-page PDF first/next page text, side to floating expansion, repeated raster/PDF cleanup, >2 MiB WAV metadata and range seek, three shared and distinct note panes, and returned one-dense-pane snapshots.');
  report.checks.push('After switching the Rust owner to a second disposable workspace, stale PDF and media requests for the original workspace were refused.');
  report.checks.push('Markdown clipboard review cancelled without a mutation, then converted a heading and undid the insertion.');
}
