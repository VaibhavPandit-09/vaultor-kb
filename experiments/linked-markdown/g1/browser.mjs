// Run against the separate frontend/vite.markdown-g1.config.ts laboratory.
// Browser package path is provided by load_workspace_dependencies, not shipped.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const modulePath = process.env.VAULTOR_PLAYWRIGHT_PACKAGE;
if (!modulePath) throw new Error('Set VAULTOR_PLAYWRIGHT_PACKAGE to the bundled playwright/index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const output = fileURLToPath(new URL('./evidence/', import.meta.url)); mkdirSync(output, { recursive: true });
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
  const open = async source => { await page.evaluate(source => window.markdownG1.open(source, true), source); await page.evaluate(() => window.markdownG1.settled()); };
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

  for (const path of ['docs/CODEBASE.md', 'docs/workspace/SESSIONS.md', 'docs/workspace/NAVIGATION.md', 'docs/security/HOST-ACCESS.md', 'docs/design/UI_PHILOSOPHY.md']) {
    const raw = readFileSync(new URL('../../../' + path, import.meta.url), 'utf8'); await open(raw);
    assert.equal(await page.evaluate(() => window.markdownG1.lab.session.source), raw);
    corpus.push({ path, bytes: Buffer.byteLength(raw), sha256: createHash('sha256').update(raw).digest('hex') });
    checks.push('corpus no-op mounted real worker: ' + path);
  }
  for (const target of [8192, 65536, 131072, 262144, 1048000]) {
    const chunk = 'Paragraph alpha with **bold** and _italic_ 😀. ' + 'ordinary documentation words '.repeat(12) + '\n\n';
    const raw = chunk.repeat(Math.floor(target / Buffer.byteLength(chunk)));
    const opened = performance.now(); await open(raw); const openMs = performance.now() - opened;
    await page.evaluate(() => {
      const lab = window.markdownG1.lab; lab.keys.length = 0;
      window.g1Measurement = { longTasks: [], gaps: [], patch: [], validation: [], last: -1, heapBefore: performance.memory?.usedJSHeapSize ?? null };
      const m = window.g1Measurement; m.observer = new PerformanceObserver(list => m.longTasks.push(...list.getEntries().map(e => e.duration))); m.observer.observe({ entryTypes: ['longtask'] });
      let previous = performance.now(); m.timer = setInterval(() => { const now = performance.now(); m.gaps.push(now - previous); previous = now; }, 8);
      m.detach = lab.session.subscribe(() => { if (lab.session.status.acceptedVersion !== m.last && lab.session.lastResult) { m.last = lab.session.status.acceptedVersion; m.patch.push(lab.session.lastResult.patchMs); m.validation.push(lab.session.lastResult.validationMs); } });
      lab.editor.commands.setTextSelection(2); lab.editor.commands.focus();
    });
    await focused();
    await page.keyboard.type('qualificationtyping12345', { delay: 12 }); await page.evaluate(() => window.markdownG1.settled());
    const result = await page.evaluate(() => {
      const lab = window.markdownG1.lab, m = window.g1Measurement; clearInterval(m.timer); m.observer.disconnect(); m.detach();
      return { keys: lab.keys, mainThreadLongTasks: m.longTasks, intervalGaps: m.gaps, patchMs: m.patch, validationMs: m.validation, heapBefore: m.heapBefore, heapAfter: performance.memory?.usedJSHeapSize ?? null, sourceHistoryBytes: lab.session.historyBytes, accepted: lab.session.status.state === 'ready' };
    });
    const structural = await page.evaluate(async () => {
      const lab = window.markdownG1.lab, start = performance.now(); lab.editor.commands.setTextSelection(15); lab.editor.commands.splitBlock(); const dispatchMs = performance.now() - start;
      await window.markdownG1.settled(); return { dispatchMs, acknowledgedMs: performance.now() - start, result: lab.session.lastResult };
    });
    assert(result.accepted); assert(structural.result.accepted); assert.equal(result.keys.length, 'qualificationtyping12345'.length);
    const summary = { bytes: Buffer.byteLength(raw), openMs, keyToFrameP95Ms: p95(result.keys), keySamples: result.keys.length, patchP95Ms: p95(result.patchMs), validationP95Ms: p95(result.validationMs), maxIntervalGapMs: Math.max(0, ...result.intervalGaps), structuralDispatchMs: structural.dispatchMs, structuralAckMs: structural.acknowledgedMs, ...result };
    metrics.push(summary); console.log(JSON.stringify({ bytes: summary.bytes, keyP95: summary.keyToFrameP95Ms, structuralMs: summary.structuralAckMs, heap: summary.heapAfter }));
    summary.workerMemory = await workerMemory();
  }
  await open(source); await page.screenshot({ path: output + 'mounted.png', fullPage: true });
  assert.deepEqual(errors, []);
  const assets = fileURLToPath(new URL('../../../frontend/node_modules/.cache/markdown-g1-build/assets/', import.meta.url)), workerAsset = readdirSync(assets).find(f => f.startsWith('markdown.worker-'));
  const compiledWorker = workerAsset && process.env.VAULTOR_G1_URL?.includes(':5175/') ? { asset: workerAsset, sha256: createHash('sha256').update(readFileSync(assets + workerAsset)).digest('hex') } : null;
  writeFileSync(output + 'browser.json', JSON.stringify({ date: new Date().toISOString(), browser: browser.version(), url: process.env.VAULTOR_G1_URL ?? 'dev:5174', compiledWorker, surface: 'Headless Edge/Chromium; actual React BlockEditor and module Worker; CDP keyboard, DOM clipboard; not installed Electron or physical IME', method: '24 keydown-to-next-animation-frame samples per size; DOM/frame latency proxy, not physical presentation latency; worker telemetry across acknowledged coalesced drafts. heapBefore/After are foreground JS heap. workerMemory uses CDP Runtime.getHeapUsage before/after forced GC on the actual worker after timing, not total process/native memory or an allocation peak. sourceHistoryBytes is accounted inverse-patch storage. Single run per size; no statistical hardware qualification.', checks, corpus, metrics, errors }, null, 2) + '\n');
  console.log('Browser checks: ' + checks.length);
} finally { await browser.close(); }
