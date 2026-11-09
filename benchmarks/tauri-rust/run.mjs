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
const folder = await mkdtemp(join(tmpdir(), 'vaultor-next-bench-'));
const profile = join(folder, 'profile'); await mkdir(profile);
const port = architecture === 'electron-java' ? 9431 : 9432;
const stamp = new Date().toISOString().replaceAll(':', '-');
const evidence = `benchmarks/tauri-rust/raw/${architecture}-${stamp}.json`;
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const report = { architecture, commit, timestamp: new Date().toISOString(), system: { device: hostname(), os: release(), arch: arch(), cpu: cpus()[0].model, logicalCpus: cpus().length, ramBytes: totalmem() }, folder, samples: [], checks: [], limitations: ['No OS cache flush; first-profile startup is not true cold boot.', 'Input-to-rAF is a responsiveness proxy, not physical input-to-presentation.', 'Process working sets sum shared pages; sampled peak can miss short spikes.'] };
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
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
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
  Object.assign(env, architecture === 'electron-java' ? { VAULTOR_DESKTOP_TEST_DIRECTORY: profile, HOST_NETWORK_PORT: '0', NODE_ENV: 'production' } : { VAULTOR_NEXT_WORKSPACE: join(folder, 'workspace'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` });
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
    await wait("document.querySelector('[data-ready=true]') !== null", 'Tauri workspace');
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
  socket?.close();
  if (child && child.exitCode === null) await new Promise(r => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); killer.once('exit', r);
  });
}
try {
  let run = await launch(1);
  if (inspect) {
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
      ? `document.querySelectorAll('.next-resource>button:first-child')`
      : `document.querySelectorAll('[data-resource-id],.resource-card,.resource-row,button')`;
    for (let i = 0; i < 3; i++) {
      if (architecture === 'electron-java') {
        await evaluate("[...document.querySelectorAll('.sidebar-nav button,button')].find(b=>b.textContent.trim()==='Library'&&!b.closest('[hidden]')).click()");
        await wait("document.querySelector('.workspace-view:not([hidden])') && !document.body.innerText.includes('Loading resources')", 'return to Library');
      }
      const opened = await evaluate(`(async()=>{const start=performance.now();const title='Bench note 0${99-i%2}';const candidates=[...${clickTitle()}];const row=candidates.find(e=>e.textContent.trim()===title&&!e.closest('[hidden],[inert]'))||[...document.querySelectorAll('*')].find(e=>e.childElementCount===0&&e.textContent.trim()===title&&!e.closest('[hidden],[inert]'));if(!row)throw Error('Missing '+title);row.click();for(let n=0;n<1200;n++){const dom=document.querySelector('.tiptap');const selected=${architecture === 'tauri-rust' ? "document.querySelector('.next-note-bar input')?.value===title" : "document.querySelector('.note-title[data-active=true]')?.textContent.trim()===title"};if(selected&&dom?.contentEditable==='true'&&dom.textContent.includes('Paragraph 119'))return performance.now()-start;await new Promise(r=>setTimeout(r,10));}throw Error('Editor mount timeout')})()`);
      record('managed-note-64k', 1, 'note_open', opened, 'ms', 'DOM click to end marker mounted; 10ms polling, includes UI work.');
    }
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
      await delay(30000);
      const start=Date.now(); await delay(300000);
      report.idleWindow={start,end:Date.now()};
    }
    await delay(3500); await stopSampler(run, 1); await quit();
    run = await launch(2);
    const saved = await evaluate(architecture === 'tauri-rust' ? `benchRequest({kind:'read',id:'${fixture.ids[99]}'})` : `benchRequest('/resources/${fixture.ids[99]}')`);
    assert(JSON.stringify(saved.content).includes('xxxxxxxxxxxx'), 'Typed content must persist after process restart');
    report.checks.push('12 native text inputs saved and read back after process restart', '100-note collection fixture created');
    await delay(4000); await stopSampler(run, 2);
    if(m2&&process.argv.includes('--qualify')) {
      const {qualifyM2}=await import('./m2-qualify.mjs');let iteration=2,activeRun;
      const restart=async(normal=false)=>{
        if(normal){await evaluate("window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'})").catch(e=>{if(!/closed|navigated/.test(String(e)))throw e;});for(let i=0;i<100&&child.exitCode===null;i++)await delay(50);assert(child.exitCode!==null,'Normal close must flush and exit');}
        await quit(); // Kill immediately at the observed draft receipt, before sampler cleanup can allow autosave.
        if(activeRun)await stopSampler(activeRun,iteration);
        activeRun=await launch(++iteration);
      };
      await qualifyM2({evaluate,cdp,wait,report,output,folder,record,restart,pid:()=>child.pid});
      if(activeRun)await stopSampler(activeRun,iteration);
    }
    if(!m2&&architecture==='tauri-rust'&&process.argv.includes('--qualify')) {
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
  report.success = true;
} catch (e) { report.success = false; report.error = String(e); console.error(e); process.exitCode = 1; }
finally {
  await quit();
  await writeFile(resolve(root, evidence), JSON.stringify(report, null, 2));
  if (!inspect) for (const s of report.samples) await appendFile(join(import.meta.dirname, 'benchmark_runs.csv'), [randomUUID(),report.timestamp,m2?'m2-managed-notes-v1':'m1-managed-notes-v2',architecture,commit,hostname(),release(),'uncontrolled',s.scenario,report.dataset ?? '',s.iteration,s.metric,s.value,s.unit,s.valid,'m1-cdp-v2',evidence,s.notes].map(csvEscape).join(',')+'\n');
  if (!report.success && !inspect) await appendFile(join(import.meta.dirname,'benchmark_runs.csv'), [randomUUID(),report.timestamp,m2?'m2-managed-notes-v1':'m1-managed-notes-v2',architecture,commit,hostname(),release(),'uncontrolled','qualification',report.dataset ?? '',1,'run_failure','','',false,'m1-cdp-v2',evidence,report.error].map(csvEscape).join(',')+'\n');
  console.log(JSON.stringify({ success: report.success, evidence, metrics: report.samples.length, error: report.error }));
}
