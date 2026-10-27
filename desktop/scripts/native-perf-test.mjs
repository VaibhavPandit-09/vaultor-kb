import assert from 'node:assert/strict';
import { dialog, nativeTheme } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { fixture, hash, summary } from './perf-support.mjs';
import { structuralCases } from './perf-structures.mjs';
import { saveDiagnostics, saveFailureMessage, saveFailureEvidence, observeSaveUI } from './perf-save-diagnostics.mjs';
import { LinkedManager } from '../src/linked/manager.mjs';
import { NativeChannel } from '../src/linked/native-channel.mjs';

export async function runPerfTest(window, directory) {
  const diagnostics=saveDiagnostics(LinkedManager.prototype,NativeChannel.prototype);
  try{return await executePerfTest(window,directory,diagnostics);}finally{diagnostics.restore();}
}
async function executePerfTest(window, directory, diagnostics) {
  const config=JSON.parse(await readFile(join(directory,'perf-config.json'),'utf8'));
  const cases=config.suite==='structures'?structuralCases({smoke:config.smoke,caseName:config.caseName}):config.sizes.map(kib=>({kib,file:'perf-'+kib+'.md',text:fixture(kib),targets:['Beginning','Middle','End'].map(label=>({label,prefix:label,needle:label+' marker paragraph.',kind:'paragraph'}))}));
  const wc=window.webContents, evaluate=code=>wc.executeJavaScript(code);
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async(code,label)=>{const end=Date.now()+60000;while(Date.now()<end){if(await evaluate(code))return;await delay(25);}throw Error('Timed out: '+label);};
  const click=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled&&b.getBoundingClientRect().width);if(!b)throw Error('Missing button: '+${JSON.stringify(label)});b.click();})()`);
  const saved=`[...document.querySelectorAll('[role="status"]')].some(s=>s.textContent==='Saved')`;
  const settled=`![...document.querySelectorAll('[role="status"]')].some(s=>s.textContent==='Checking edit…') && window.perf.pending===0`;
  nativeTheme.themeSource='light';wc.setZoomFactor(1);window.setSize(1200,820); window.show();window.focus();
  // Test-only interception of EXISTING worker telemetry; no app build flags or
  // production editor changes. Do not retain source/doc payloads in reports.
  await evaluate(`(()=>{
    const NativeWorker=window.Worker;
    window.perf={pending:0,validation:[],patch:[],keys:[],long:[],dispatch:[],errors:[],pageErrors:[],timeline:[],marker:null,keyIndex:0};
    window.addEventListener('error',e=>{if(e.error)window.perf.pageErrors.push(e.message);});
    window.addEventListener('unhandledrejection',e=>window.perf.pageErrors.push(String(e.reason)));
    window.Worker=new Proxy(NativeWorker,{construct(Target,args){const w=new Target(...args);const post=w.postMessage.bind(w);w.postMessage=(msg,...rest)=>{if(['open','edit','splice','source'].includes(msg.type))window.perf.pending++;if(${Boolean(config.diagnostics)})window.perf.timeline.push({event:'worker-send',type:msg.type,t:performance.now()});return post(msg,...rest);};w.addEventListener('message',e=>{const m=window.perf;if(${Boolean(config.diagnostics)})m.timeline.push({event:'worker-reply',type:e.data.type,t:performance.now()});if(['ready','result','error'].includes(e.data.type))m.pending=Math.max(0,m.pending-1);if(e.data.result){m.validation.push(e.data.result.validationMs);m.patch.push(e.data.result.patchMs);}if(e.data.type==='error')m.errors.push(e.data.reason);});return w;}});
    window.perf.observer=new PerformanceObserver(list=>window.perf.long.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));
    window.perf.observer.observe({entryTypes:['longtask']});
    document.addEventListener('keydown',e=>{if(e.key==='x'){const t=performance.now();const marker=window.perf.marker,index=window.perf.keyIndex++;requestAnimationFrame(()=>{const end=performance.now();window.perf.keys.push(end-t);if(${Boolean(config.diagnostics)})window.perf.timeline.push({event:'key-frame',marker,index,t,end,ms:end-t});});}},true);
  })()`);
  await writeFile(join(config.source,'unchanged.md'),'Neighbour exact\r\n');
  for(const f of cases) await writeFile(join(config.source,f.file),f.text);
  const picker=dialog.showOpenDialog;
  try {
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[config.source]});
    await evaluate(`document.querySelector('button[aria-label="Link folder"]').click()`);
    await wait(`document.querySelector('[aria-label="Linked sources"]')?.textContent.includes(${JSON.stringify(basename(config.source))})`,'native source approval');
  } finally {dialog.showOpenDialog=picker;}
  await evaluate(`[...document.querySelectorAll('[aria-label="Linked sources"] button')].find(b=>b.textContent.includes(${JSON.stringify(basename(config.source))})).click()`);
  await wait(`[...document.querySelectorAll('[aria-label="Linked sources"] button')].some(b=>b.textContent.trim()===${JSON.stringify(cases[0].file)})`,'source listing');
  const docs=[];
  const close=async name=>{
    await evaluate(`document.querySelector(${JSON.stringify('[aria-label="Close '+name+'"]')}).click()`);
    await wait(`!document.querySelector('.tiptap') && !document.querySelector(${JSON.stringify('[aria-label="Close '+name+'"]')})`,'close benchmark note');
  };
  // Persist partial results after every fixture; parent still reports failures.
  const persist=()=>writeFile(join(directory,'perf-raw.json'),JSON.stringify({documents:docs,runtimeVersions:process.versions},null,2));
  for(const f of cases) {
    const {kib,targets}=f,original=f.text,file=join(config.source,f.file);
    const doc={kib,bytes:Buffer.byteLength(original),fixtureHash:hash(original),status:'running',raw:{openMs:[],usableMs:[],typingFrameMs:[],workerValidationMs:[],patchMs:[],transactionDispatchMs:[],selectionMs:[],editAcknowledgementMs:[],undoMs:[],redoMs:[],saveMs:[],rendererHeapMiB:[]},operations:[],limitations:['No compositor paint/presentation metric; frame callbacks are a responsiveness proxy.','Heap is foreground JS only; excludes worker/native/process peak memory.','Transaction duration measures synchronous view.dispatch, not total React/render cost.','Selection measures synchronous Tiptap selection/cursor dispatch; OS pointer/selection-paint latency is not measured.']};
    if(f.caseId)Object.assign(doc,{caseId:f.caseId,type:f.type,expectedAdmission:f.admission,complexity:f.complexity,targets});
    docs.push(doc); await persist();
    await evaluate('window.perf.previousEditor=window.__vaultor_editor;window.perf.long=[]');
    const opened=performance.now(); await click(f.file);
    await wait(`(window.__vaultor_editor!==window.perf.previousEditor && [...document.querySelectorAll('.tiptap')].some(e=>e.textContent.includes('End marker paragraph.'))) || document.body.innerText.includes('Linked · Read only') || document.body.innerText.includes('too complex for safe rich-text editing') || window.perf.errors.length>0`,'editor or explicit refusal');
    const refusal=await evaluate(`window.perf.errors.find(e=>['SOURCE_COMPLEXITY_LIMIT','DOCUMENT_SHAPE_LIMIT','SOURCE_BYTE_LIMIT'].includes(e)) || (document.body.innerText.includes('too complex for safe rich-text editing')?'DOCUMENT_SHAPE_LIMIT':document.body.innerText.includes('Rich-text editing supports documents up to 1 MiB')?'LARGE_DOCUMENT':null)`);
    if(refusal){assert.equal(f.admission,'expected-refusal','Unexpected safety fallback for editable fixture');assert.ok(f.reason===refusal || (f.reason==='DOCUMENT_SHAPE_LIMIT'&&refusal==='SOURCE_COMPLEXITY_LIMIT'),'Unexpected refusal reason');doc.status='expected-refusal';doc.reason=refusal;doc.refusalMs=performance.now()-opened;doc.sourcePreserved=(await readFile(file,'utf8'))===original;assert.ok(doc.sourcePreserved);assert.equal(await evaluate('Boolean(document.querySelector(\'.tiptap[contenteditable="true"]\'))'),false);assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save'&&!b.disabled)`),false);await persist();await close(f.file);await evaluate('window.perf.errors=[]');continue;}
    assert.notEqual(f.admission,'expected-refusal','Over-limit document unexpectedly editable');
    const openMs=performance.now()-opened;
    await evaluate(`document.querySelector('.tiptap').focus()`);await wait('Boolean(window.__vaultor_editor?.view.hasFocus())','editor focus');
    await evaluate(`(()=>{const e=window.__vaultor_editor,dispatch=e.view.dispatch.bind(e.view);e.view.dispatch=tr=>{const t=performance.now();try{return dispatch(tr);}finally{const end=performance.now();window.perf.dispatch.push(end-t);if(${Boolean(config.diagnostics)})window.perf.timeline.push({event:'dispatch',t,end,ms:end-t,docChanged:tr.docChanged});}};})()`);
    const changed=(target,suffix)=>target.needle.replace(target.prefix,target.prefix+suffix);
    const position=(target,suffix='')=>evaluate(`(()=>{const e=window.__vaultor_editor;let pos;e.state.doc.descendants((n,p)=>{if(n.isText&&n.text.includes(${JSON.stringify(changed(target,suffix))}))pos=p+n.text.indexOf(${JSON.stringify(changed(target,suffix))})+${target.prefix.length};});if(pos===undefined)throw Error('Missing edit target');const resolved=e.state.doc.resolve(pos);if(!Array.from({length:resolved.depth},(_,i)=>resolved.node(i+1).type.name).includes(${JSON.stringify(target.kind)}))throw Error('Wrong structural target');window.perf.marker=${JSON.stringify(target.label)};window.perf.keyIndex=0;e.commands.setTextSelection(pos);e.commands.focus();})()`);
    const insert=async()=>{
      const before=await evaluate('window.perf.validation.length');
      assert.ok(await evaluate(`window.__vaultor_editor.commands.insertContent(' LOCAL')`),'Insert command refused');
      await wait(`window.perf.validation.length>${before} && (${settled})`,'insert worker acknowledgement');
    };
    const history=async command=>{
      const before=await evaluate('window.perf.validation.length');
      const start=performance.now();assert.ok(await evaluate(`window.__vaultor_editor.commands.${command}()`),command+' refused');await wait(`window.perf.validation.length>${before} && (${settled})`,command+' validation');return performance.now()-start;
    };
    const markerPresent=text=>evaluate(`window.__vaultor_editor.getText().includes(${JSON.stringify(text)})`);
    // Native typing can span multiple natural history groups on slow documents.
    // Measure restoring the whole workload, rather than assuming one Ctrl+Z.
    const historyBatch=async(command,target)=>{
      const start=performance.now();let groups=0;
      while(!await markerPresent(target)){
        assert.ok(groups<config.keys+2,command+' did not restore the expected workload');
        await history(command);groups++;
      }
      assert.ok(groups,command+' had no work');
      return {ms:performance.now()-start,groups};
    };
    // Warm-up proves usability with a real transaction + worker reply + frame.
    await position(targets[0]);await insert();await wait(settled,'warmup edit');
    assert.ok(await markerPresent('Beginning LOCAL marker paragraph.'),'warmup changed document');
    await evaluate('new Promise(r=>requestAnimationFrame(r))');const usableMs=performance.now()-opened;
    doc.openAndWarmupLongTasks=await evaluate('window.perf.long');
    await history('undo');
    await evaluate(`window.perf.validation=[];window.perf.patch=[];window.perf.keys=[];window.perf.dispatch=[];window.perf.long=[];window.perf.timeline=[]`);
    doc.raw.openMs.push(openMs);doc.raw.usableMs.push(usableMs);
    // Sequential native keyboard inputs at each marker, with frame completion
    // detected instead of fixed sleeps. Undo restores exact starting bytes.
    if(config.cpuProfile){doc.profileStart=await evaluate('performance.now()');wc.debugger.attach('1.3');await wc.debugger.sendCommand('Profiler.enable');await wc.debugger.sendCommand('Profiler.start');}
    for(const target of targets) {
      const marker=target.label;await position(target);const selectionMs=await evaluate(`(()=>{const e=window.__vaultor_editor,p=e.state.selection.from,t=performance.now();e.commands.setTextSelection({from:p,to:p+3});e.commands.setTextSelection(p);return performance.now()-t;})()`);doc.raw.selectionMs.push(selectionMs);
      const count=await evaluate('window.perf.keys.length');
      for(let i=0;i<config.keys;i++){
        wc.sendInputEvent({type:'keyDown',keyCode:'X'});wc.sendInputEvent({type:'char',keyCode:'x'});wc.sendInputEvent({type:'keyUp',keyCode:'X'});
        await wait(`window.perf.keys.length===${count+i+1}`,'typing frame');
      }
      await wait(settled,'typing validation');
      assert.ok(await evaluate(`window.__vaultor_editor.getText().includes(${JSON.stringify(changed(target,'x'.repeat(config.keys)))})`),'native typing changed intended marker');
      const undo=await historyBatch('undo',target.needle);doc.raw.undoMs.push(undo.ms);
      const redo=await historyBatch('redo',changed(target,'x'.repeat(config.keys)));doc.raw.redoMs.push(redo.ms);
      doc.operations.push({marker,undoGroups:undo.groups,redoGroups:redo.groups});
      await historyBatch('undo',target.needle);
    }
    if(config.cpuProfile){const {profile}=await wc.debugger.sendCommand('Profiler.stop');wc.debugger.detach();await writeFile(join(directory,'cpu-'+(f.caseId??kib)+'.json'),JSON.stringify(profile));doc.cpuProfile='cpu-'+kib+'.json';}
    let expected=original;
    for(let sample=0;sample<config.samples;sample++)for(const target of targets) {
      const marker=target.label;
      await position(target,' LOCAL'.repeat(sample));
      const start=performance.now();await insert();const editMs=performance.now()-start;doc.raw.editAcknowledgementMs.push(editMs);
      const previousSaved=expected;
      expected=expected.replace(changed(target,' LOCAL'.repeat(sample)),changed(target,' LOCAL'.repeat(sample+1)));
      await evaluate(`window.perf.saveUI?.stop();window.perf.saveUI=(${observeSaveUI.toString()})(document);void 0`);
      const boundary=diagnostics.cursor;
      const saving=performance.now();let clickReturned=false;
      try{await click('Save');clickReturned=true;
      await wait(saved,'Save receipt');assert.ok((await readFile(file,'utf8'))===expected,'Complete source preservation');
      }catch(error){
        doc.status='failed';
        doc.failure=await saveFailureEvidence({context:{round:(config.round??0)+1,caseId:f.caseId??'size-'+kib,marker,sample,operation:'save',clickReturned,elapsedMs:performance.now()-saving},readUI:()=>evaluate(`({...window.perf.saveUI.snapshot(),pending:window.perf.pending,workerErrors:window.perf.errors.length,pageErrors:window.perf.pageErrors.length})`),readSource:()=>readFile(file),expected,original,previousSaved,stages:diagnostics.since(boundary),traceTruncated:diagnostics.truncatedSince(boundary)});
        await persist();
        throw Error(saveFailureMessage(error)+' [round '+doc.failure.round+', '+doc.failure.caseId+', target '+marker+', sample '+sample+', UI '+doc.failure.ui.statuses?.join('/')+']');
      }
      const saveMs=performance.now()-saving;doc.raw.saveMs.push(saveMs);
      await evaluate('window.perf.saveUI.stop()');
      const stages=diagnostics.since(boundary),ended=(stage,operation,state)=>stages.some(e=>e.stage===stage&&e.operation===operation&&e.phase==='end'&&(!state||e.state===state));
      doc.operations.push({marker,sample,editAcknowledgementMs:editMs,saveMs,receipt:{nativeCommitted:ended('native','save','COMMITTED'),acknowledgementReturned:ended('native','ack-save'),dispatchCommitted:ended('dispatch','save','COMMITTED')}});
    }
    const measured=await evaluate(`(()=>{const m=window.perf;m.long.push(...m.observer.takeRecords().map(e=>({start:e.startTime,duration:e.duration})));return {timeline:m.timeline,keys:m.keys,validation:m.validation,patch:m.patch,dispatch:m.dispatch,long:m.long,heap:performance.memory?.usedJSHeapSize,errors:m.errors,pageErrors:m.pageErrors};})()`);
    assert.deepEqual(measured.errors,[],'Worker errors');
    assert.deepEqual(measured.pageErrors,[],'Renderer exceptions');
    assert.equal(measured.keys.length,config.keys*targets.length);
    assert.ok(measured.validation.length,'Worker telemetry missing');
    Object.assign(doc.raw,{typingFrameMs:measured.keys,workerValidationMs:measured.validation,patchMs:measured.patch,transactionDispatchMs:measured.dispatch});
    if(measured.heap)doc.raw.rendererHeapMiB.push(measured.heap/1048576);else doc.limitations.push('Renderer heap API unavailable.');
    if(config.diagnostics)doc.timeline=measured.timeline;
    doc.structure=await evaluate(`(()=>{const doc=window.__vaultor_editor.state.doc;let nodes=0,maxDepth=0;const walk=(n,d)=>{nodes++;maxDepth=Math.max(maxDepth,d);n.forEach(c=>walk(c,d+1));};walk(doc,0);return {nodes,rootBlocks:doc.childCount,maxDepth};})()`);
    doc.longTasks=measured.long;doc.sourcePreserved=true;doc.status='editable';
    doc.metrics=Object.fromEntries(Object.entries(doc.raw).map(([key,values])=>[key,summary(values)]));
    assert.equal(await readFile(join(config.source,'unchanged.md'),'utf8'),'Neighbour exact\r\n');
    await persist();console.log(`Performance: ${kib} KiB complete; typing p95 ${doc.metrics.typingFrameMs.p95.toFixed(1)} ms`);
    await close(f.file);
  }
  assert.deepEqual(await evaluate('window.perf.pageErrors'),[],'Renderer exceptions after closing notes');
  await evaluate('window.perf.observer.disconnect()');await persist();
}
