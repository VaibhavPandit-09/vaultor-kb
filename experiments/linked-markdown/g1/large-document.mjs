// Targeted continuation of the Gate 1 native-worker/mounted-editor benchmark.
// VAULTOR_PLAYWRIGHT_PACKAGE points to the existing external test dependency.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(pathToFileURL(process.env.VAULTOR_PLAYWRIGHT_PACKAGE).href);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 820 }, reducedMotion: 'reduce' });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const p95 = values => [...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1] ?? 0;
const metrics = [];
// JSON escapes preserve the measured mixed LF/CRLF fixture across checkouts.
const unit = JSON.parse(readFileSync(new URL('./large-document-fixture.json', import.meta.url), 'utf8'));
try {
  await page.goto(process.env.VAULTOR_G1_URL ?? 'http://127.0.0.1:5174/markdown-g1.html');
  await page.waitForFunction(()=>window.markdownG1?.lab?.editor && window.markdownG1.lab.session.status.state==='ready');
  for (const kib of [256,512,1024]) {
    const target = kib*1024-4096;
    const preamble = '\ufeff---\r\ntitle: Preserve frontmatter\r\n---\r\n\r\n';
    let raw = preamble + unit.repeat(Math.floor((target-Buffer.byteLength(preamble))/Buffer.byteLength(unit)));
    raw += '\n\nPadding prose ' + 'word '.repeat(Math.max(0, Math.floor((target-Buffer.byteLength(raw)-18)/5))) + '\n';
    const opened = performance.now();
    // Baseline uses the pre-existing diagnostic override above 256 KiB only.
    const stress = process.env.VAULTOR_BASELINE === '1' && kib>256;
    try { await page.evaluate(({raw,stress})=>window.markdownG1.open(raw,stress),{raw,stress}); }
    catch(e) { metrics.push({kib,bytes:Buffer.byteLength(raw),refusal:e.message}); continue; }
    const openMs = performance.now()-opened;
    const shape = await page.evaluate(()=>{const e=window.markdownG1.lab.editor;let nodes=0;e.state.doc.descendants(()=>{nodes++;});return {roots:e.state.doc.childCount,nodes};});
    await page.evaluate(()=>{
      const lab=window.markdownG1.lab;
      window.measurement={patch:[],validation:[],longTasks:[],last:-1};const m=window.measurement;
      m.observer=new PerformanceObserver(list=>m.longTasks.push(...list.getEntries().map(e=>e.duration)));m.observer.observe({entryTypes:['longtask']});
      m.detach=lab.session.subscribe(()=>{const t=lab.session.lastTelemetry;if(t&&t.version!==m.last){m.last=t.version;m.patch.push(t.result.patchMs);m.validation.push(t.result.validationMs);}});
      let first;lab.editor.state.doc.descendants((n,p)=>{if(first===undefined&&n.isText)first=p;});lab.editor.commands.setTextSelection(first+1);lab.editor.commands.focus();lab.keys.length=0;
    });
    await page.waitForFunction(()=>window.markdownG1.lab.editor.view.hasFocus());
    await page.keyboard.type('qualificationtyping12345',{delay:12});await page.evaluate(()=>window.markdownG1.settled());
    const typing=await page.evaluate(()=>{const lab=window.markdownG1.lab,m=window.measurement;m.observer.disconnect();m.detach();return {keys:lab.keys,patch:m.patch,validation:m.validation,longTasks:m.longTasks,heap:performance.memory?.usedJSHeapSize,accepted:lab.session.status.state==='ready'};});
    assert(typing.accepted);
    const operations=await page.evaluate(async()=>{
      const lab=window.markdownG1.lab,e=lab.editor,results=[];
      // Use actual paragraphs near beginning/middle/end; test byte locality independently.
      for(const fraction of [0,.5,1]){
        const positions=[];e.state.doc.descendants((n,p)=>{if(n.type.name==='paragraph'&&n.textContent.length>20)positions.push(p+2);});
        const pos=positions[Math.floor((positions.length-1)*fraction)],before=lab.session.source;
        let start=performance.now();e.commands.setTextSelection({from:pos,to:pos+3});e.commands.setTextSelection(pos);const selectionMs=performance.now()-start;
        start=performance.now();e.commands.insertContent('LOCAL');await window.markdownG1.settled();const editMs=performance.now()-start,result=lab.session.lastResult;
        if(!result.accepted)throw Error(result.reason);
        const bytes=new TextEncoder().encode(before),patch=result.patches[0];
        const patched=new Uint8Array([...bytes.slice(0,patch.start),...new TextEncoder().encode(patch.text),...bytes.slice(patch.end)]);
        if(new TextDecoder('utf8',{ignoreBOM:true}).decode(patched)!==lab.session.source||patch.removed!==''||patch.text!=='LOCAL')throw Error('NONLOCAL_PATCH');
        const after=lab.session.source;
        start=performance.now();e.commands.undo();await window.markdownG1.settled();const undoMs=performance.now()-start;
        // Earlier native typing may share an undo group; redo must restore exact provenance.
        start=performance.now();e.commands.redo();await window.markdownG1.settled();const redoMs=performance.now()-start;
        if(lab.session.source!==after)throw Error('REDO_SOURCE_MISMATCH');
        start=performance.now();const saved=lab.session.bytes();const saveCandidateMs=performance.now()-start;
        results.push({fraction,selectionMs,editMs,undoMs,redoMs,saveCandidateMs,bytes:saved.length,patchBytes:patch.text.length});
      }
      return results;
    });
    metrics.push({kib,bytes:Buffer.byteLength(raw),stress,openMs,...shape,keyP95:p95(typing.keys),patchP95:p95(typing.patch),validationP95:p95(typing.validation),workerReplies:typing.patch.length,longTasks:typing.longTasks,heap:typing.heap,operations});
    console.log(JSON.stringify(metrics.at(-1)));
  }
  assert.deepEqual(errors,[]);
} finally {
  mkdirSync(new URL('./large-document/',import.meta.url),{recursive:true});
  writeFileSync(new URL(`./large-document/${process.env.VAULTOR_BASELINE==='1'?'baseline':'final'}.json`,import.meta.url),JSON.stringify({metrics,errors},null,2));
  await browser.close();
}
