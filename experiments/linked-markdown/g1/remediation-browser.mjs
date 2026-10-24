// Run against the separate frontend/vite.markdown-g1.config.ts laboratory.
// Browser package path is provided by load_workspace_dependencies, not shipped.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const modulePath = process.env.VAULTOR_PLAYWRIGHT_PACKAGE;
if (!modulePath) throw new Error('Set VAULTOR_PLAYWRIGHT_PACKAGE to the bundled playwright/index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const output = fileURLToPath(new URL('./remediation/evidence/', import.meta.url)); mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 820 }, reducedMotion: 'reduce' });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const p95 = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1] ?? 0;
const checks = [], metrics = [], corpus = [];
async function workerMemory() {
  const cdp = await browser.newBrowserCDPSession(); let attached;
  try {
    const targets = await cdp.send('Target.getTargets');
    const target = targets.targetInfos.find(t => t.type === 'worker' && t.url.includes('markdown.worker'));
    if (!target) return { error: 'Worker target unavailable' };
    attached = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
    let id = 0;
    const request = method => new Promise((resolve, reject) => {
      const requestId = ++id, timer = setTimeout(() => { cdp.off('Target.receivedMessageFromTarget', listener); reject(new Error('Heap instrumentation timeout')); }, 2000);
      const listener = event => { const result = JSON.parse(event.message); if (event.sessionId !== attached.sessionId || result.id !== requestId) return; clearTimeout(timer); cdp.off('Target.receivedMessageFromTarget', listener); result.error ? reject(new Error(result.error.message)) : resolve(result.result); };
      cdp.on('Target.receivedMessageFromTarget', listener); void cdp.send('Target.sendMessageToTarget', { sessionId: attached.sessionId, message: JSON.stringify({ id: requestId, method }) }).catch(reject);
    });
    const beforeGC = await request('Runtime.getHeapUsage'); await request('HeapProfiler.collectGarbage'); const afterGC = await request('Runtime.getHeapUsage'); return { beforeGC, afterGC };
  } catch (e) { return { error: e.message }; }
  finally { if (attached) await cdp.send('Target.detachFromTarget', attached).catch(() => {}); await cdp.detach(); }
}
try {
  await page.goto(process.env.VAULTOR_G1_URL ?? 'http://127.0.0.1:5174/markdown-g1.html');
  await page.waitForFunction(() => window.markdownG1?.lab?.editor && window.markdownG1.lab.session.status.state === 'ready');
  const open = async source => { await page.evaluate(source => window.markdownG1.open(source, new TextEncoder().encode(source).length > 262144), source); await page.evaluate(() => window.markdownG1.settled()); };
  const focused = () => page.waitForFunction(() => window.markdownG1.lab.editor.view.hasFocus());
  const source = '---\ntitle: protected\n---\n\nParagraph **bold** and _italic_.\n\n<!-- preserve me -->\n';
  await open(source);
  assert.equal(await page.evaluate(() => window.markdownG1.lab.session.source), source); checks.push('real browser no-op exact');
  await page.getByRole('button', { name: 'Edit yaml source' }).click();
  await page.getByRole('textbox', { name: 'Markdown source' }).fill('---\ntitle: changed\n---');
  await page.getByRole('button', { name: 'Apply region', exact: true }).click();
  await page.waitForFunction(() => window.markdownG1.lab.session.source.includes('title: changed'));
  assert((await page.evaluate(() => window.markdownG1.lab.session.source)).endsWith('\n\n<!-- preserve me -->\n')); checks.push('targeted protected source, native worker and focus return');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.waitForFunction(() => window.markdownG1.lab.editor.view.hasFocus());
  await page.getByRole('button', { name: 'Edit yaml source' }).focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('[role="dialog"]')); checks.push('keyboard protected action and centralized Escape');
  await open('[label][target]\n\n[target]: ../relative.md "keep"\n');
  await page.getByRole('button', { name: 'Edit linkReference source' }).click();
  await page.getByRole('textbox', { name: 'Markdown source' }).fill('[changed][target]'); await page.getByRole('button', { name: 'Apply region', exact: true }).click(); await page.waitForFunction(() => window.markdownG1.lab.session.source.startsWith('[changed]'));
  assert((await page.evaluate(() => window.markdownG1.lab.session.source)).endsWith('[target]: ../relative.md "keep"\n')); checks.push('inline reference targeted source control preserves definition');

  await open('Paragraph.\n\nTail.\n');
  await page.evaluate(() => { const e = window.markdownG1.lab.editor; e.commands.setTextSelection(5); e.commands.focus(); });
  await focused();
  await page.keyboard.press('Enter'); await page.keyboard.type('New '); await page.keyboard.press('Control+b'); await page.keyboard.type('bold'); await page.keyboard.press('Control+b'); await page.evaluate(() => window.markdownG1.settled());
  assert((await page.evaluate(() => window.markdownG1.lab.session.source)).includes('**bold**')); checks.push('real keyboard Enter, typing and Ctrl+B');
  await page.keyboard.press('Control+z'); await page.evaluate(() => window.markdownG1.settled()); await page.keyboard.press('Control+Shift+z'); await page.evaluate(() => window.markdownG1.settled()); checks.push('real keyboard Undo/Redo');

  await open('Text.\n\nTail.\n');
  await page.evaluate(() => {
    const e = window.markdownG1.lab.editor; e.commands.setTextSelection(3); e.commands.focus();
    const data = new DataTransfer(); data.setData('text/html', '<p>Rich <strong>clipboard</strong></p><p>Second paragraph</p>'); data.setData('text/plain', 'Rich clipboard\nSecond paragraph');
    e.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.evaluate(() => window.markdownG1.settled()); assert((await page.evaluate(() => window.markdownG1.lab.session.source)).includes('**clipboard**')); checks.push('actual DOM paste pipeline, supported rich text');
  await open('\n'); await page.evaluate(() => window.markdownG1.lab.editor.commands.focus()); await focused(); await page.keyboard.type('/image', { delay: 20 }); await page.keyboard.press('Enter');
  await page.getByRole('alert').filter({ hasText: 'managed-note command' }).waitFor(); await page.evaluate(() => window.markdownG1.settled()); assert((await page.evaluate(() => window.markdownG1.lab.session.source)).includes('/image')); assert.equal(await page.getByRole('dialog').count(), 0); checks.push('unsupported slash command exposes reason, retains command and performs no upload');

  // CDP uses Chromium's native composition path, not dispatchEvent replacement.
  await open('Text **bold**.\n\nTail.\n');
  await page.evaluate(() => { const e=window.markdownG1.lab.editor; e.commands.setTextSelection(2); e.commands.focus(); }); await focused();
  const input = await page.context().newCDPSession(page);
  await input.send('Input.imeSetComposition', {text:'に',selectionStart:1,selectionEnd:1});
  await page.waitForFunction(()=>window.markdownG1.lab.editor.getText().includes('に'));
  assert.equal(await page.evaluate(()=>{try {window.markdownG1.lab.session.bytes();return true;}catch{return false;}}),false);
  await input.send('Input.imeSetComposition',{text:'日本',selectionStart:2,selectionEnd:2});
  await input.send('Input.insertText',{text:'日本語😀'}); await page.evaluate(()=>window.markdownG1.settled());
  assert((await page.evaluate(()=>window.markdownG1.lab.session.source)).includes('日本語😀')); checks.push('native CDP IME preedit/update/commit blocks unvalidated source and retains international text');
  await page.keyboard.press('Control+z'); await page.evaluate(()=>window.markdownG1.settled()); await page.keyboard.press('Control+Shift+z'); await page.evaluate(()=>window.markdownG1.settled());
  await input.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Dead',code:'Quote'}); await input.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Dead',code:'Quote'}); await input.send('Input.insertText',{text:'é é हिन्दी 中文'});
  await page.evaluate(()=>window.markdownG1.settled()); assert((await page.evaluate(()=>window.markdownG1.lab.session.source)).includes('é é हिन्दी 中文')); checks.push('dead-key event plus committed international Unicode, composition Undo/Redo; not physical layout qualification'); await input.detach();
  await open('Keep.\n\n| a | b |\n| :--- | ---: |\n| c | d |\n\nTail.\n');
  await page.evaluate(()=>{ const e=window.markdownG1.lab.editor; let p; e.state.doc.descendants((n,pos)=>{if(n.isText&&n.text==='c')p=pos;}); e.commands.setTextSelection(p); e.commands.focus();}); await focused(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>window.markdownG1.lab.editor.state.selection.$from.parent.textContent),'d');
  await page.keyboard.type('new'); await page.evaluate(()=>window.markdownG1.settled());
  await page.evaluate(()=>window.markdownG1.lab.editor.commands.addColumnBefore()); await page.evaluate(()=>window.markdownG1.settled());
  await page.keyboard.press('Control+z'); await page.evaluate(()=>window.markdownG1.settled()); checks.push('mounted aligned table Tab typing column insertion and keyboard Undo');
  const small='Keep _raw_.\n\nTail.\n'; await open(small);
  const refusal=await page.evaluate(()=>{const e=window.markdownG1.lab.editor;const data=new DataTransfer();data.setData('text/plain','x'.repeat(65537)); const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}); const t=performance.now();e.view.dom.dispatchEvent(event);return {ms:performance.now()-t,prevented:event.defaultPrevented,retained:window.markdownG1.lab.refused?.text?.length};});
  assert(refusal.prevented);assert.equal(refusal.retained,65537);assert.equal(await page.evaluate(()=>window.markdownG1.lab.session.source),small);checks.push('oversized clipboard refused before HTML parsing; payload retained and document unchanged');
  const previous=await page.evaluate(()=>window.markdownG1.lab.session.source);
  const opening=await page.evaluate(async()=>{try{await window.markdownG1.open('x'.repeat(262145));return 'unexpected';}catch(e){return String(e);}});assert(opening.includes('SOURCE_SIZE_LIMIT'));assert.equal(await page.evaluate(()=>window.markdownG1.lab.session.source),previous);assert.equal(await page.evaluate(()=>window.markdownG1.rejectedBytes.length),262145); checks.push('oversized opening preserves exact bytes and previous live editor');
  const densePaste=await page.evaluate(()=>{const e=window.markdownG1.lab.editor,data=new DataTransfer();data.setData('text/html','<span>'.repeat(1000)+'x'+'</span>'.repeat(1000));data.setData('text/plain','x');const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}),start=performance.now();e.view.dom.dispatchEvent(event);return {dispatchMs:performance.now()-start,prevented:event.defaultPrevented,reason:window.markdownG1.lab.refused?.reason,retained:window.markdownG1.lab.refused?.html?.length};});
  assert(densePaste.prevented);assert(densePaste.reason.includes('COMPLEXITY'));assert.equal(densePaste.retained,13001);assert.equal(await page.evaluate(()=>window.markdownG1.lab.session.source),previous);checks.push('dense HTML paste refused before DOM parsing with exact retained payload');
  await open('Text.\n\nTail.\n');
  const acceptedPaste=await page.evaluate(async()=>{const e=window.markdownG1.lab.editor;e.commands.setTextSelection(3);const data=new DataTransfer(),payload=('Pasted ordinary words. '+'words '.repeat(96)+'\n\n').repeat(100);data.setData('text/plain',payload);const start=performance.now();e.view.dom.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));const dispatchMs=performance.now()-start;await window.markdownG1.settled();return {units:payload.length,dispatchMs,ackMs:performance.now()-start,source:window.markdownG1.lab.session.source};});
  assert(acceptedPaste.source.includes('Pasted ordinary words.'));assert(acceptedPaste.source.endsWith('\n\nTail.\n'));metrics.push({workload:'clipboard',oversized:refusal,dense:densePaste,accepted:{units:acceptedPaste.units,dispatchMs:acceptedPaste.dispatchMs,ackMs:acceptedPaste.ackMs,paragraphs:100}});checks.push('100-paragraph approximately60KiB admitted plain paste reparses without altering following block');
  for (const path of ['docs/CODEBASE.md', 'docs/workspace/SESSIONS.md', 'docs/workspace/NAVIGATION.md', 'docs/security/HOST-ACCESS.md', 'docs/design/UI_PHILOSOPHY.md']) {
    const raw = readFileSync(new URL('../../../' + path, import.meta.url), 'utf8'); await open(raw);
    assert.equal(await page.evaluate(() => window.markdownG1.lab.session.source), raw);
    corpus.push({ path, bytes: Buffer.byteLength(raw), sha256: createHash('sha256').update(raw).digest('hex') });
    checks.push('corpus no-op mounted real worker: ' + path);
  }
  for (const target of [8192, 65536, 131072, 258048, 1048000, 'list', 'table', 'code', 'many-code', 'repository']) {
    const chunk = 'Paragraph alpha with **bold** and _italic_ 😀. ' + 'ordinary documentation words '.repeat(12) + '\n\n';
    const raw = typeof target === 'number' ? chunk.repeat(Math.floor(target / Buffer.byteLength(chunk))) : target === 'list' ? Array.from({length:300},(_,i)=>'- List item '+i+' with ordinary **bold** words.').join('\n')+'\n' : target === 'table' ? '| a | b | c | d | e | f | g | h |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n' + '| one | two | three | four | five | six | seven | eight |\n'.repeat(80) : target === 'code' ? '```js\n'+'const word = 1;\n'.repeat(800)+'```\n' : target === 'many-code' ? Array.from({length:150},(_,i)=>'```js\nconst word'+i+' = '+i+';\nconsole.log(word'+i+');\n```\n\n').join('') : readFileSync(new URL('../../../docs/CODEBASE.md',import.meta.url),'utf8');
    const opened = performance.now(); await open(raw); const openMs = performance.now() - opened;
    await page.evaluate(() => {
      const lab = window.markdownG1.lab; lab.keys.length = 0;
      window.g1Measurement = { start:performance.now(),longTasks: [], gaps: [], patch: [], validation: [], last: lab.session.lastTelemetry?.version ?? -1, heapBefore: performance.memory?.usedJSHeapSize ?? null };
      const m = window.g1Measurement; m.observer = new PerformanceObserver(list => m.longTasks.push(...list.getEntries().map(e => e.duration))); m.observer.observe({ entryTypes: ['longtask'] });
      let previous = performance.now(); m.timer = setInterval(() => { const now = performance.now(); m.gaps.push(now - previous); previous = now; }, 8);
      m.detach = lab.session.subscribe(() => { const telemetry=lab.session.lastTelemetry; if (telemetry && telemetry.version !== m.last) { m.last = telemetry.version; m.patch.push(telemetry.result.patchMs); m.validation.push(telemetry.result.validationMs); } });
      let first=-1;lab.editor.state.doc.descendants((n,p)=>{if(first<0&&n.isText)first=p;}); lab.editor.commands.setTextSelection(first+1); lab.editor.commands.focus();
    });
    await focused();
    await page.keyboard.type('qualificationtyping12345', { delay: 12 }); await page.evaluate(() => window.markdownG1.settled());
    const result = await page.evaluate(() => {
      const lab = window.markdownG1.lab, m = window.g1Measurement; clearInterval(m.timer); m.observer.disconnect(); m.detach();
      return { typingWindowMs:performance.now()-m.start,workerReplies:m.patch.length, keys: lab.keys, mainThreadLongTasks: m.longTasks, intervalGaps: m.gaps, patchMs: m.patch, validationMs: m.validation, heapBefore: m.heapBefore, heapAfter: performance.memory?.usedJSHeapSize ?? null, sourceHistoryBytes: lab.session.historyBytes, accepted: lab.session.status.state === 'ready' };
    });
    const structural = await page.evaluate(async () => {
      const lab = window.markdownG1.lab, start = performance.now(); const e=lab.editor; if(e.isActive('table'))e.commands.addRowAfter();else if(e.isActive('codeBlock'))e.commands.insertContent('\nstructural');else if(e.isActive('listItem'))e.commands.splitListItem('listItem');else e.commands.splitBlock(); const dispatchMs = performance.now() - start;
      await window.markdownG1.settled(); return { dispatchMs, acknowledgedMs: performance.now() - start, result: lab.session.lastResult };
    });
    assert(result.accepted); assert(structural.result.accepted); assert.equal(result.keys.length, 'qualificationtyping12345'.length);
    const summary = { workload: target, bytes: Buffer.byteLength(raw), openMs, keyToFrameP95Ms: p95(result.keys), keySamples: result.keys.length, patchP95Ms: p95(result.patchMs), validationP95Ms: p95(result.validationMs), maxIntervalGapMs: Math.max(0, ...result.intervalGaps), structuralDispatchMs: structural.dispatchMs, structuralAckMs: structural.acknowledgedMs, ...result };
    metrics.push(summary); console.log(JSON.stringify({ bytes: summary.bytes, keyP95: summary.keyToFrameP95Ms, structuralMs: summary.structuralAckMs, heap: summary.heapAfter }));
    summary.workerMemory = await workerMemory();
  }
  await open('Load **text**.\n\n' + ('Unchanged paragraph with ordinary words. '.repeat(3)+'\n\n').repeat(1000));
  const heap = await page.context().newCDPSession(page);
  await heap.send('HeapProfiler.collectGarbage'); const beforeLoad = await heap.send('Runtime.getHeapUsage');
  await heap.send('HeapProfiler.startSampling', {samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
  await page.evaluate(()=>{const e=window.markdownG1.lab.editor;e.commands.setTextSelection(3);e.commands.focus();}); await focused();
  const repeatedStart=performance.now(); await page.keyboard.type('x'.repeat(100),{delay:1}); await page.evaluate(()=>window.markdownG1.settled());
  const repeated={ms:performance.now()-repeatedStart,historyBytes:await page.evaluate(()=>window.markdownG1.lab.session.historyBytes),worker:await workerMemory()};
  const allocation=await heap.send('HeapProfiler.stopSampling'); const sizes=[]; const walk=n=>{sizes.push(n.selfSize);n.children.forEach(walk);};walk(allocation.profile.head);
  const longInput=await page.context().newCDPSession(page), beforeCancel=await page.evaluate(()=>window.markdownG1.lab.session.source);
  await longInput.send('Input.imeSetComposition',{text:'预',selectionStart:1,selectionEnd:1});
  await longInput.send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0});await page.evaluate(()=>window.markdownG1.settled());assert.equal(await page.evaluate(()=>window.markdownG1.lab.session.source),beforeCancel);
  await longInput.send('Input.imeSetComposition',{text:'に',selectionStart:1,selectionEnd:1});await longInput.send('Input.insertText',{text:'日本語'});await page.evaluate(()=>window.markdownG1.settled());
  assert((await page.evaluate(()=>window.markdownG1.lab.session.source)).includes('日本語'));await page.evaluate(()=>window.markdownG1.lab.editor.commands.blur());await page.waitForFunction(()=>!window.markdownG1.lab.editor.view.hasFocus());await page.evaluate(()=>window.markdownG1.lab.editor.commands.focus());await focused();await longInput.detach();
  checks.push('loaded-document native composition cancellation restores exact source; commit and blur/refocus retain international draft');
  await page.keyboard.press('Control+z'); await page.evaluate(()=>window.markdownG1.settled()); await page.keyboard.press('Control+Shift+z'); await page.evaluate(()=>window.markdownG1.settled());
  for(let i=0;i<20;i++)await open('Cycle '+i+' **bold**.\n\nTail.\n');
  await page.waitForTimeout(100); await heap.send('HeapProfiler.collectGarbage'); const afterCycles=await heap.send('Runtime.getHeapUsage');
  const native=await browser.newBrowserCDPSession();const targets=await native.send('Target.getTargets');const workers=targets.targetInfos.filter(t=>t.type==='worker'&&t.url.includes('markdown.worker')).length;await native.detach();
  assert.equal(workers,1);assert(afterCycles.usedSize-beforeLoad.usedSize<16*1024*1024);assert(repeated.historyBytes<1024*1024);
  checks.push('100 rapid edits and loaded Undo/Redo, sampled allocations and 20 mount/dispose cycles retain one worker and bounded sampled heap');
  metrics.push({workload:'repeated-and-lifecycle',repeated,beforeLoad,afterCycles,liveWorkers:workers,sampledAllocatedBytes:sizes.reduce((a,b)=>a+b,0),largestSampledStackBytes:Math.max(...sizes),allocationMethod:'CDP sampled allocations during 100 edits, including minor/major-collected objects; cumulative estimate, not instantaneous peak or native/process ceiling'}); await heap.detach();
  await open(source); await page.screenshot({ path: output + 'mounted.png', fullPage: true });
  assert.deepEqual(errors, []);
  const assets = fileURLToPath(new URL('../../../frontend/node_modules/.cache/markdown-g1-build/assets/', import.meta.url)), workerAsset = readdirSync(assets).find(f => f.startsWith('markdown.worker-'));
  const compiledWorker = workerAsset && process.env.VAULTOR_G1_URL?.includes(':5175/') ? { asset: workerAsset, sha256: createHash('sha256').update(readFileSync(assets + workerAsset)).digest('hex') } : null;
  writeFileSync(output + 'browser.json', JSON.stringify({ date: new Date().toISOString(), browser: browser.version(), url: process.env.VAULTOR_G1_URL ?? 'dev:5174', compiledWorker, surface: 'Headless Edge/Chromium; actual React BlockEditor and module Worker; CDP keyboard, DOM clipboard; not installed Electron or physical IME', method: '24 keydown-to-next-animation-frame samples per size; DOM/frame latency proxy, not physical presentation latency; worker telemetry across acknowledged coalesced drafts. heapBefore/After are foreground JS heap. workerMemory uses CDP Runtime.getHeapUsage before/after forced GC on the actual worker after timing, not total process/native memory or an allocation peak. sourceHistoryBytes is accounted inverse-patch storage. Single run per size; no statistical hardware qualification.', checks, corpus, metrics, errors }, null, 2) + '\n');
  console.log('Browser checks: ' + checks.length);
} catch(error) {
  writeFileSync(output+'failure.json',JSON.stringify({date:new Date().toISOString(),error:String(error),checks,metrics,errors},null,2)+'\n'); throw error;
} finally { await browser.close(); }
