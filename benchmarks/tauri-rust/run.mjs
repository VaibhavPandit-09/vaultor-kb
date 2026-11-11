import {roleSamples} from './process-role-samples.mjs';
// Production UI/native runtimes; disposable storage only. No owner credentials leave the renderer.
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, appendFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir, cpus, totalmem, hostname, release, arch } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '../..'), output = resolve(import.meta.dirname, 'raw');
await mkdir(output, { recursive: true });
const architecture = process.argv[2];
if (!['electron-java', 'tauri-rust'].includes(architecture)) throw Error('Usage: node benchmarks/tauri-rust/run.mjs electron-java|tauri-rust [--inspect]');
const inspect = process.argv.includes('--inspect');
const m2 = process.argv.includes('--m2');
const m3 = process.argv.includes('--m3');
const m4 = process.argv.includes('--m4');
const m5 = process.argv.includes('--m5');
const m13 = process.argv.includes('--m13');
const m12 = process.argv.includes('--m12');
const m11 = process.argv.includes('--m11')||m12||m13;
const m10 = process.argv.includes('--m10')||m11;
const m9 = process.argv.includes('--m9');
const m8 = process.argv.includes('--m8');
const m7 = process.argv.includes('--m7');
const m6 = process.argv.includes('--m6')||m7||m8||m9||m10;
const folder = await mkdtemp(join(tmpdir(), 'vaultor-next-bench-'));
const profile = join(folder, 'profile'); await mkdir(profile);
const port = architecture === 'electron-java' ? 9431 : 9432;
const stamp = new Date().toISOString().replaceAll(':', '-');
const evidence = `benchmarks/tauri-rust/raw/${architecture}-${stamp}.json`;
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const report = { architecture, commit, timestamp: new Date().toISOString(), system: { device: hostname(), os: release(), arch: arch(), cpu: cpus()[0].model, logicalCpus: cpus().length, ramBytes: totalmem() }, folder, samples: [], checks: [], limitations: ['No OS cache flush; first-profile startup is not true cold boot.', 'Input-to-rAF is a responsiveness proxy, not physical input-to-presentation.', 'Process working sets sum shared pages; sampled peak can miss short spikes.'] };
if(m6)report.limitations.push('M6 uses an isolated WebView2 profile to coexist with a running personal app; first-profile webview caches differ from M1–M5 shared-profile runs.', 'Only the disposable application process tree is sampled; background apps, power and cache conditions are uncontrolled. The M8 reference had a coexisting personal process; inspect coexistingPersonalReference for this run.');
report.coexistingPersonalReference=process.platform==='win32'&&execFileSync('tasklist',['/FI','IMAGENAME eq vaultor-next-m6-running.exe','/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true}).toLowerCase().includes('vaultor-next-m6-running.exe');
report.nativeInspectionHelperActiveBefore=process.platform==='win32'&&execFileSync('tasklist',['/FI','IMAGENAME eq codex-computer-use.exe','/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true}).toLowerCase().includes('codex-computer-use.exe');
report.dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim());
const executablePath = process.env.VAULTOR_BENCH_EXECUTABLE || (architecture === 'electron-java' ? join(root,'desktop/node_modules/electron/dist/electron.exe') : join(root,'next/src-tauri/target/release/vaultor-next.exe'));
report.executableSha256 = createHash('sha256').update(await readFile(executablePath)).digest('hex');
const delay = ms => new Promise(r => setTimeout(r, ms));
const csvEscape = v => '"' + String(v ?? '').replaceAll('"', '""') + '"';
function record(scenario, iteration, metric, value, unit, notes = '', valid = true) {
  report.samples.push({ scenario, iteration, metric, value, unit, notes, valid });
}
let child, sampler, socket, pending = new Map(), nextId = 0;
async function connect() {
  for (let i = 0; i < 1200; i++) {
    if (child.exitCode !== null) throw Error('Application exited during startup');
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find(t => t.type === 'page' && /vaultor|tauri|localhost/.test(t.url));
      if (target) {
        socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
        socket.onmessage = event => { const msg = JSON.parse(event.data); if (msg.id) { const entry = pending.get(msg.id); pending.delete(msg.id); msg.error ? entry?.reject(Error(msg.error.message)) : entry?.resolve(msg.result); } };
        return;
      }
    } catch { /* Wait for native webview creation. */ }
    await delay(50);
  }
  throw Error('Native CDP target unavailable');
}
function cdp(method, params = {}) {
  const id = ++nextId; return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 60000);
    pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.exception?.value ?? r.exceptionDetails.text);
  return r.result.value;
}
async function wait(expression, label) {
  for (let i = 0; i < 600; i++) { try { if (await evaluate(`Boolean(${expression})`)) return; } catch (e) { if (!/navigated|context|closed/.test(String(e))) throw e; } await delay(50); }
  throw Error(`Timed out: ${label}; ${await evaluate('document.body.innerText.slice(0,1800)')}`);
}
async function launch(iteration) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(VAULTOR_|HOST_|ELECTRON_RUN_AS_NODE|WEBVIEW2_)/.test(k)));
  const executable = executablePath;
  const args = architecture === 'electron-java' ? [join(root, 'desktop'), `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${port}`] : [];
  Object.assign(env, architecture === 'electron-java' ? { VAULTOR_DESKTOP_TEST_DIRECTORY: profile, HOST_NETWORK_PORT: '0', NODE_ENV: 'production' } : { VAULTOR_NEXT_WORKSPACE: join(folder, 'workspace'), ...(m6?{WEBVIEW2_USER_DATA_FOLDER:profile}:{}), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` });
  const start = performance.now();
  child = spawn(executable, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', data => { report.runtimeLog = ((report.runtimeLog ?? '') + data).slice(-4000); });
  await connect();
  await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:820,deviceScaleFactor:1,mobile:false});
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
  if (architecture === 'electron-java') {
    await wait("Boolean(document.querySelector('.library-view'))", 'Electron library');
    await evaluate(`window.benchRequest=async(path,method='GET',body)=>{
      const state=(await window.vaultorDesktop.bootstrap()).value;
      const result=await window.vaultorDesktop.request({id:crypto.randomUUID(),token:state.token,path,method,timeout:30000,headers:{'X-Vaultor-Protocol':'3',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:{kind:'text',value:JSON.stringify(body)}}:{})});
      if(!result.ok)throw Error(result.error.detail);const value=result.value;if(value.status>=400)throw Error(path+' '+value.status+' '+new TextDecoder().decode(new Uint8Array(value.data)));return value.status===204?null:JSON.parse(new TextDecoder().decode(new Uint8Array(value.data)));
    }`);
    await wait("!document.body.innerText.includes('Loading resources')", 'Electron resources usable');
  } else {
    await wait(m10?"document.querySelector('[data-ready=true][data-session-ready=true]') !== null":"document.querySelector('[data-ready=true]') !== null", 'Tauri workspace');
    await evaluate("window.benchRequest=request=>window.__TAURI_INTERNALS__.invoke('workspace',{request})");
  }
  record(iteration >= 3 ? 'qualification' : iteration === 1 ? 'first-profile' : 'restart', iteration, 'startup_usable', performance.now() - start, 'ms', 'Process spawn to Library mounted, command bridge ready; 50ms polling; warm OS cache possible.');
  report.runtime = await cdp('Browser.getVersion').catch(()=>({unavailable:true}));
  report.viewport = await evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,theme:document.documentElement.dataset.theme})');
  report.node = process.version;
  report.appVersion = JSON.parse(await readFile(join(root,architecture==='electron-java'?'desktop/package.json':'next/package.json'),'utf8')).version;
  report.instrument = 'm1-cdp-v2';
  if(iteration>=3)return null; // Recovery restarts need assertions, not a racing second sampler.
  const stop = join(folder, `stop-${iteration}`), sampleFile = join(folder, `process-${iteration}.json`);
  sampler = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(import.meta.dirname, 'process-sample.ps1'), '-RootPid', String(child.pid), '-Output', sampleFile, '-StopFile', stop], { windowsHide: true, stdio: ['ignore','ignore','pipe'] });
  sampler.stderr.on('data', data => { report.samplerLog = ((report.samplerLog ?? '') + data).slice(-1500); });
  return { stop, sampleFile };
}
async function stopSampler(run, iteration) {
  if(!run)return;
  await writeFile(run.stop, 'stop');
  await new Promise(r => { if (sampler.exitCode !== null) r(); else sampler.once('exit', r); });
  const rows = JSON.parse((await readFile(run.sampleFile, 'utf8')).replace(/^\uFEFF/, ''));
  const samples = Array.isArray(rows) ? rows : [rows];
  report[`process${iteration}`] = samples;
  if(iteration===1&&report.idleWindow){
    const idle=samples.filter(s=>Date.parse(s.timestamp)>=report.idleWindow.start&&Date.parse(s.timestamp)<=report.idleWindow.end);
    const first=idle[0],last=idle.at(-1),seconds=(Date.parse(last.timestamp)-Date.parse(first.timestamp))/1000;
    record('settled-idle-5min',1,'cpu_one_core_percent',100*(last.cpuSeconds-first.cpuSeconds)/seconds,'%',`${seconds.toFixed(1)}s sampled span within 300s untouched window after 30s settling; 100% = one core.`);
    record('settled-idle-5min',1,'process_tree_working_set',last.workingSet/1048576,'MiB');
    record('settled-idle-5min',1,'process_tree_private_bytes',last.privateBytes/1048576,'MiB');
  }
  if(iteration>=3)return;
  record('workload', iteration, 'sampled_peak_working_set', Math.max(...samples.map(s => s.workingSet)) / 1048576, 'MiB');
  record('idle', iteration, 'process_tree_working_set', samples.at(-1).workingSet / 1048576, 'MiB');
  record('idle', iteration, 'process_tree_private_bytes', samples.at(-1).privateBytes / 1048576, 'MiB');
  record('idle', iteration, 'java_working_set', (samples.at(-1).javaWorkingSet ?? 0) / 1048576, 'MiB');
  if (architecture === 'tauri-rust') assert(!samples.some(s => s.names.some(n => /java/i.test(n))), 'Tauri must not launch Java');
  const first = samples.at(-5) ?? samples[0], last = samples.at(-1);
  const duration = (Date.parse(last.timestamp) - Date.parse(first.timestamp)) / 1000;
  if (duration > 0) record('idle', iteration, 'cpu_one_core_percent', 100 * (last.cpuSeconds - first.cpuSeconds) / duration, '%', 'Aggregate tree CPU / wall time; 100% = one logical CPU.');
}
async function quit() {
  if (child && child.exitCode === null) await new Promise(r => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); killer.once('exit', r);
  });
  // Keep a diagnostic pause in force until the owned process is terminated.
  // Closing DevTools first resumes it and can let autosave defeat crash tests.
  socket?.close();
}
try {
  let run = await launch(1);
  if (inspect) {
    if(m13||process.argv.includes('--reference-m13'))await (await import('./m13-inspect.mjs')).inspectM13({evaluate,cdp,wait,report,folder,output,reference:architecture==='electron-java',restart:async()=>{await quit();if(run)await stopSampler(run,1);run=await launch(3);}});
    else if(m12){const inspection=await import('./m12-inspect.mjs');await (process.argv.includes('--probe-containment')?inspection.probeContainment:inspection.inspectM12)({evaluate,cdp,wait,report,folder,output});}
    else if(m11){const inspection=await import('./m11-qualify.mjs');await (process.argv.includes('--linked-only')?inspection.inspectLinkedM11:process.argv.includes('--trash-only')?inspection.inspectTrashM11:inspection.inspectM11)({evaluate,cdp,wait,report,folder,output});}
    if(m10&&process.argv.includes('--final-smoke'))await (await import('./m10-qualify.mjs')).smokeFinal({evaluate,cdp,wait,report});
    if(m10&&process.argv.includes('--native-m10')){await cdp('Emulation.clearDeviceMetricsOverride');
      for(let i=1;i<=3;i++){const start=performance.now();await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'k',code:'KeyK',windowsVirtualKeyCode:75,modifiers:2});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'k',code:'KeyK',modifiers:0});await wait("document.activeElement?.getAttribute('aria-label')==='Search commands'",'palette search initial focus');record('command-palette-m10',i,'open_to_focused_input',performance.now()-start,'ms','Native WebView key dispatch to focused command input;50ms readiness polling and driver overhead;inspection mode,not common idle.');const query=performance.now();await cdp('Input.insertText',{text:'Open Library'});await wait("document.querySelector('[role=option]')?.textContent.includes('Open Library')",'ranked command');record('command-palette-m10',i,'query_ui_ready',performance.now()-query,'ms','Native text delivery to ranked command DOM;not completed paint/motion.');await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await wait("!document.querySelector('[role=dialog]')",'palette dismissal');}
      report.checks.push('Three palette openings focused command input automatically and returned ranked commands;Escape dismissed');console.log('M10 focus inspection ready: '+join(folder,'m10-native.done'));for(let i=0;i<600;i++){try{await readFile(join(folder,'m10-native.done'));break;}catch{}await delay(1000);}}
    if(process.argv.includes('--native-m9'))await cdp('Emulation.clearDeviceMetricsOverride');
    if(process.argv.includes('--native-m9'))await (await import('./m9-qualify.mjs')).inspectM9({evaluate,wait,report,folder,output});
    if(process.argv.includes('--reference-m6'))await (await import('./m6-reference.mjs')).referenceM6({evaluate,cdp,wait,output,report});
    if(process.argv.includes('--reference-m12')){
      await evaluate("localStorage.setItem('vaultor-device-presentation-v1',JSON.stringify({...JSON.parse(localStorage.getItem('vaultor-device-presentation-v1')||'{}'),theme:'oled'}));true");await cdp('Page.reload');await wait("document.documentElement.dataset.theme==='oled'&&document.querySelector('[title=Settings]')",'original OLED and application ready');
      await wait("document.querySelector('[title=Settings]')",'original Settings trigger ready');await evaluate("document.querySelector('[title=Settings]').click();true");await wait("document.querySelector('.settings-window')",'original Settings');await delay(600);let image=await cdp('Page.captureScreenshot');await writeFile(join(output,'m12-reference-settings-oled.png'),Buffer.from(image.data,'base64'));
      await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',windowsVirtualKeyCode:27});await wait("!document.querySelector('.settings-window')",'original Settings dismissal');await evaluate("document.querySelector('[aria-label=\"Help for this screen\"]').click();true");await wait("document.querySelector('.help-center')",'original Help');await delay(500);image=await cdp('Page.captureScreenshot');await writeFile(join(output,'m12-reference-help-oled.png'),Buffer.from(image.data,'base64'));report.checks.push('Original Electron Settings and Help opened in OLED;capture comparison with shared Rust-backed presentation');
    }
    console.log(await evaluate('document.body.innerText.slice(0,5000)'));
    await cdp('Page.captureScreenshot').then(async r => writeFile(join(output, 'inspect.png'), Buffer.from(r.data, 'base64')));
    await delay(3000); await stopSampler(run, 1); await quit();
  } else {
    const doc = { type: 'doc', content: Array.from({ length: 120 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Paragraph ${i}. Vaultor comparable managed-note benchmark. ` + 'Writing, reading and organizing knowledge. '.repeat(12) }] })) };
    const dataset = createHash('sha256').update(JSON.stringify(doc)).digest('hex'); report.dataset = dataset;
    // Setup writes are not timed as product interactions.
    const seed = architecture === 'tauri-rust'
      ? `(async()=>{const c=await benchRequest({kind:'createCollection',name:'Benchmark'});let ids=[];for(let i=0;i<100;i++){const n=await benchRequest({kind:'createNote',title:'Bench note '+String(i).padStart(3,'0'),collection:c.id});if(i>=98)await benchRequest({kind:'save',id:n.id,title:n.title,revision:n.revision,content:${JSON.stringify(doc)}});ids.push(n.id);}return {ids,collection:c.id}})()`
      : `(async()=>{const c=await benchRequest('/collections/creations/${randomUUID()}','PUT',{name:'Benchmark',resourceIds:[]});let ids=[];for(let i=0;i<100;i++){const n=await benchRequest('/resources','POST',{title:'Bench note '+String(i).padStart(3,'0'),content:i>=98?${JSON.stringify(doc)}:{type:'doc',content:[{type:'paragraph'}]},collectionId:c.id});ids.push(n.id);}return {ids,collection:c.id}})()`;
    const fixture = await evaluate(seed); report.fixture = fixture;
    await cdp('Page.reload').catch(e => { if (!/navigated|closed/.test(String(e))) throw e; });
    await delay(800);
    await wait(architecture === 'tauri-rust' ? "document.querySelectorAll('.next-resource').length===100" : "document.body.innerText.includes('Bench note')", 'seeded library');
    if (architecture === 'electron-java') await wait("!document.body.innerText.includes('Loading resources')", 'seed list settled');
    const clickTitle = title => architecture === 'tauri-rust'
      ? `document.querySelectorAll('${m3||m4||m5||m6?'[data-row-open]':'.next-resource>button:first-child'}')`
      : `document.querySelectorAll('[data-resource-id],.resource-card,.resource-row,button')`;
    if(process.argv.includes('--profile-open'))await evaluate(`window.openProfile={mutations:0};window.openObserver=new MutationObserver(records=>openProfile.mutations+=records.length);openObserver.observe(document.querySelector('.next-library'),{subtree:true,attributes:true,childList:true});true`);
    for (let i = 0; i < 3; i++) {
      if(m6)await evaluate("document.querySelector('[aria-label=\"Return to Library\"]')?.click();true");
      if(m6)await wait("document.querySelector('.next-library-region:not([hidden]) [data-row-open]')&&document.querySelector('[aria-label=Notes]')?.getAttribute('aria-busy')==='false'",'full Library before next open');
      if (architecture === 'electron-java') {
        await evaluate("[...document.querySelectorAll('.sidebar-nav button,button')].find(b=>b.textContent.trim()==='Library'&&!b.closest('[hidden]')).click()");
        await wait("document.querySelector('.workspace-view:not([hidden])') && !document.body.innerText.includes('Loading resources')", 'return to Library');
      }
      const opened = await evaluate(`(async()=>{const start=performance.now();const title='Bench note 0${99-i%2}';const candidates=[...${clickTitle()}];const row=candidates.find(e=>e.textContent.trim()===title&&!e.closest('[hidden],[inert]'))||[...document.querySelectorAll('*')].find(e=>e.childElementCount===0&&e.textContent.trim()===title&&!e.closest('[hidden],[inert]'));if(!row)throw Error('Missing '+title);row.click();for(let n=0;n<1200;n++){const dom=document.querySelector('.tiptap');const selected=${architecture === 'tauri-rust' ? "document.querySelector('.next-note-bar input')?.value===title" : "document.querySelector('.note-title[data-active=true]')?.textContent.trim()===title"};if(selected&&dom?.contentEditable==='true'&&dom.textContent.includes('Paragraph 119'))return performance.now()-start;await new Promise(r=>setTimeout(r,10));}throw Error('Editor mount timeout')})()`);
      record('managed-note-64k', 1, 'note_open', opened, 'ms', 'DOM click to end marker mounted; 10ms polling, includes UI work.');
    }
    if(process.argv.includes('--profile-open')){report.openProfile=await evaluate('openObserver.disconnect();window.openProfile');report.openProfile.readRoundtrips=[];for(let i=0;i<3;i++)report.openProfile.readRoundtrips.push(await evaluate(`(async()=>{const t=performance.now();await window.__TAURI_INTERNALS__.invoke('workspace',{request:{kind:'read',id:'${fixture.ids[99]}'}});return performance.now()-t})()`));record('opening-profile',1,'library_dom_mutations',report.openProfile.mutations,'count','External MutationObserver over three opens; diagnostic overhead present.');report.openProfile.readRoundtrips.forEach((ms,i)=>record('opening-profile',i+1,'read_roundtrip',ms,'ms','Independent 64KiB read through IPC/SQLite/serialization, not isolated SQL.'));console.log(JSON.stringify(report.openProfile));}
    // Real native webview input via CDP, not direct editor insertContent.
    const typing = [];
    await wait("document.querySelector('.tiptap')?.contentEditable==='true'", 'editable unlocked note');
    for (let i = 0; i < 12; i++) {
      await evaluate(`(()=>{const dom=document.querySelector('.tiptap');dom.focus();window.benchInput=new Promise(r=>{dom.addEventListener('beforeinput',()=>requestAnimationFrame(()=>r(performance.now()-window.benchStart)),{once:true});setTimeout(()=>r(null),3000)});window.benchStart=performance.now();})()`);
      await cdp('Input.insertText', { text: 'x' }); typing.push(await evaluate('window.benchInput'));
    }
    for (const value of typing) if(value!==null) record('managed-note-64k', 1, 'input_to_raf', value, 'ms', 'CDP insertText → DOM beforeinput → next rAF; includes CDP delivery overhead.');
    await delay(1000);
    await wait(architecture === 'tauri-rust' ? "[...document.querySelectorAll('[role=status]')].some(e=>e.textContent==='saved')" : "!document.body.innerText.includes('Saving…')", 'autosave');
    const frames = await evaluate(`new Promise(resolve=>{let last,values=[],count=0;const dom=document.querySelector('.tiptap');let scroll=dom.parentElement;while(scroll&&scroll.scrollHeight<=scroll.clientHeight+10)scroll=scroll.parentElement;const frame=t=>{if(last)values.push(t-last);last=t;if(scroll)scroll.scrollTop+=12;if(++count<61)requestAnimationFrame(frame);else resolve(values)};requestAnimationFrame(frame)})`);
    for(const value of frames) record('managed-note-64k',1,'scroll_frame_interval',value,'ms','rAF intervals during scripted scroll; not compositor presentation.');
    const screenshot = await cdp('Page.captureScreenshot'); await writeFile(join(output, architecture + '-editor.png'), Buffer.from(screenshot.data, 'base64'));
    if(process.argv.includes('--idle-five')) {
      if(m8||m9||m10)record('settled-idle-5min',1,'activity_history_tasks',(await evaluate("window.__TAURI_INTERNALS__.invoke('transfer',{request:{op:'tasks'}}).then(t=>t.length)")),'count','History count before untouched window; no polling during it.');
      console.log('Settling for 30 seconds before untouched five-minute idle window.');
      await delay(30000);
      console.log('Five-minute idle window started; no renderer polling or user input.');
      const start=Date.now(); await delay(300000);
      report.idleWindow={start,end:Date.now()};
      if(m9){const file=join(folder,'m9-idle-roles.json');execFileSync('powershell.exe',['-NoProfile','-File',join(import.meta.dirname,'process-breakdown.ps1'),'-RootPid',String(child.pid),'-Output',file],{windowsHide:true,stdio:'pipe'});const breakdown=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));report.breakdowns=[{phase:'after-untouched-idle-window',...breakdown}];for(const sample of roleSamples(breakdown))record(sample.scenario,sample.iteration,sample.metric,sample.value,sample.unit,sample.notes);}
    }
    await delay(3500); await stopSampler(run, 1); await quit();
    run = await launch(2);
    const saved = await evaluate(architecture === 'tauri-rust' ? `benchRequest({kind:'read',id:'${fixture.ids[99]}'})` : `benchRequest('/resources/${fixture.ids[99]}')`);
    assert(JSON.stringify(saved.content).includes('xxxxxxxxxxxx'), 'Typed content must persist after process restart');
    report.checks.push('12 native text inputs saved and read back after process restart', '100-note collection fixture created');
    await delay(4000); await stopSampler(run, 2);
    if((m2||m3||m4||m5||m6)&&process.argv.includes('--qualify')) {
      const qualify=m12?(await import('./m12-qualify.mjs')).qualifyM12:m11?(await import('./m11-qualify.mjs')).qualifyM11:m10?(await import('./m10-qualify.mjs')).qualifyM10:m9?(await import('./m9-qualify.mjs')).qualifyM9:m8?(await import('./m8-qualify.mjs')).qualifyM8:m7?(await import('./m7-qualify.mjs')).qualifyM7:m6?(await import('./m6-qualify.mjs')).qualifyM6:m5?(await import('./m5-qualify.mjs')).qualifyM5:m4?(await import('./m4-qualify.mjs')).qualifyM4:m3?(await import('./m3-qualify.mjs')).qualifyM3:(await import('./m2-qualify.mjs')).qualifyM2;let iteration=2,activeRun;
      const restart=async(normal=false)=>{
        if(normal){await evaluate("void window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'});true").catch(e=>{if(!/closed|navigated/.test(String(e)))throw e;});for(let i=0;i<100&&child.exitCode===null;i++)await delay(50);assert(child.exitCode!==null,'Normal close must flush and exit');}
        await quit(); // Kill immediately at the observed draft receipt, before sampler cleanup can allow autosave.
        if(activeRun)await stopSampler(activeRun,iteration);
        activeRun=await launch(++iteration);
      };
      await qualify({evaluate,cdp,wait,report,output,folder,record,restart,pid:()=>child.pid});
      if(activeRun)await stopSampler(activeRun,iteration);
    }
    if(!m2&&!m3&&!m4&&!m5&&!m6&&architecture==='tauri-rust'&&process.argv.includes('--qualify')) {
      const {qualify,conflict}=await import('./qualify.mjs');
      const id=await qualify({evaluate,cdp,wait,output,report,rootPid:child.pid,folder});
      await evaluate("document.querySelector('.tiptap').focus()");
      await cdp('Input.insertText',{text:' close barrier'});
      await evaluate("window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'})").catch(e=>{if(!/closed|navigated/.test(String(e)))throw e;});
      for(let i=0;i<100&&child.exitCode===null;i++)await delay(50);
      assert(child.exitCode!==null,'Normal close must exit the process');
      socket?.close();
      run=await launch(3);
      await conflict({evaluate,cdp,wait,id,report});
      await stopSampler(run,3);
    }
    await quit();
  }
  report.nativeInspectionHelperActiveAfter=process.platform==='win32'&&execFileSync('tasklist',['/FI','IMAGENAME eq codex-computer-use.exe','/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true}).toLowerCase().includes('codex-computer-use.exe');
  report.success = true;
} catch (e) { report.success = false; report.error = String(e); console.error(e); process.exitCode = 1; }
finally {
  await quit();
  await writeFile(resolve(root, evidence), JSON.stringify(report, null, 2));
  for (const s of report.samples) if(!inspect||(m10&&s.scenario==='command-palette-m10')) await appendFile(join(import.meta.dirname, 'benchmark_runs.csv'), [randomUUID(),report.timestamp,m12?'m12-managed-notes-v1':m11?'m11-managed-notes-v1':m10?'m10-managed-notes-v1':m9?'m9-managed-notes-v1':m8?'m8-managed-notes-v1':m7?'m7-managed-notes-v1':m6?'m6-managed-notes-v1':m5?'m5-managed-notes-v1':m4?'m4-managed-notes-v1':m3?'m3-managed-notes-v1':m2?'m2-managed-notes-v1':'m1-managed-notes-v2',architecture,commit,hostname(),release(),'uncontrolled',s.scenario,report.dataset ?? '',s.iteration,s.metric,s.value,s.unit,s.valid,'m1-cdp-v2',evidence,s.notes].map(csvEscape).join(',')+'\n');
  if (!report.success && !inspect) await appendFile(join(import.meta.dirname,'benchmark_runs.csv'), [randomUUID(),report.timestamp,m12?'m12-managed-notes-v1':m11?'m11-managed-notes-v1':m10?'m10-managed-notes-v1':m9?'m9-managed-notes-v1':m8?'m8-managed-notes-v1':m7?'m7-managed-notes-v1':m6?'m6-managed-notes-v1':m5?'m5-managed-notes-v1':m4?'m4-managed-notes-v1':m3?'m3-managed-notes-v1':m2?'m2-managed-notes-v1':'m1-managed-notes-v2',architecture,commit,hostname(),release(),'uncontrolled','qualification',report.dataset ?? '',1,'run_failure','','',false,'m1-cdp-v2',evidence,report.error].map(csvEscape).join(',')+'\n');
  console.log(JSON.stringify({ success: report.success, evidence, metrics: report.samples.length, error: report.error }));
}
