import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {createServer as createHttpServer} from 'node:http';
import {mkdir, writeFile, readFile, access, readdir, symlink, unlink} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Use a disposable hosted runner only');
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
assert.equal(process.platform, 'win32');
const [predecessor, input, expectedInstallerHash] = process.argv.slice(2);
const predecessors = {
  '0.25.2': 'ff2036ef27d4160d626ee43e44f1a7bc387841b4c6dacd707128feb3b9864f4e',
  '0.26.0': '3a7b1d741d6d8d3d187b86b37d3f7536e40cf82c4a52810800a382679ebe3003',
  '0.27.0': '72500247d0ac5e0d0b78f81069f17d432a3da2fe72c333bad9e2e6a4dcfc7d55',
};
assert(predecessor === 'fresh' || Object.hasOwn(predecessors, predecessor));
const dir = resolve(input);
const legacy = join(process.env.LOCALAPPDATA, 'Programs', 'Vaultor');
const install = join(process.env.LOCALAPPDATA, 'Vaultor Next');
const legacyProfile = join(process.env.APPDATA, 'Vaultor');
const profile = join(process.env.APPDATA, 'com.vaultor.next');
const workspacePath = join(profile, 'Workspace');
const exists = path => access(path).then(() => true, () => false);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
if (expectedInstallerHash) {
  assert.match(expectedInstallerHash, /^[a-f0-9]{64}$/);
  assert.equal(sha(await readFile(join(dir, 'first.exe'))), expectedInstallerHash);
}
function registrationAndShortcuts() {
  const raw = execFileSync('pwsh', ['-NoProfile', '-Command', `
    $roots = [Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('DesktopDirectory')
    $shell = New-Object -ComObject WScript.Shell
    $links = @(Get-ChildItem -LiteralPath $roots -Filter 'Vaultor*.lnk' -Recurse -ErrorAction Stop |
      ForEach-Object { @{name=$_.BaseName; target=$shell.CreateShortcut($_.FullName).TargetPath} })
    $registration = Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Vaultor Next' -ErrorAction SilentlyContinue
    @{links=$links; version=$registration.DisplayVersion; uninstall=$registration.UninstallString} | ConvertTo-Json -Compress
  `], {encoding:'utf8',windowsHide:true});
  return JSON.parse(raw);
}
for (const path of [legacy, install, legacyProfile, profile]) assert(!await exists(path), 'Runner profile is already populated');
const oldRegistry = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\f6d10ccf-3944-54a9-b8ec-1f95df56a56c';
const registryExists = () => {
  try {execFileSync('reg.exe', ['query', oldRegistry], {stdio:'ignore'}); return true}
  catch(error) {if(error.status !== 1) throw error; return false}
};
assert(!registryExists(), 'Unexpected old installation registration on runner');

async function run(executable, args) {
  const child = spawn(executable, args, {windowsHide:true, stdio:'ignore'});
  const timer = setTimeout(() => child.kill(), 180_000);
  try {
    const code = await new Promise((done, fail) => {
      child.once('error', fail);
      child.once('exit', done);
    });
    assert.equal(code, 0, 'Installer failed: ' + executable);
  } finally {clearTimeout(timer)}
}

async function eventually(check, label) {
  for (let attempt = 0; attempt < 240; attempt++) {
    try {const value = await check(); if(value) return value} catch {}
    await delay(250);
  }
  throw Error('Timed out: ' + label);
}

async function port() {
  const server = createServer();
  await new Promise((done, fail) => {server.once('error', fail); server.listen(0, '127.0.0.1', done)});
  const number = server.address().port;
  await new Promise(done => server.close(done));
  return number;
}

async function connect(number, electron) {
  let seen = [];
  const endpoint = await eventually(async () => {
    const entries = await (await fetch('http://127.0.0.1:'+number+'/json/list', {signal:AbortSignal.timeout(1000)})).json();
    seen = entries.map(({type,url})=>({type,url}));
    return entries.find(value => value.type === 'page' && (electron ? value.url.startsWith('vaultor://app/') : value.url.includes('next.html')))?.webSocketDebuggerUrl;
  }, electron?'installed Electron renderer':'installed Next WebView').catch(error=>{
    throw Error(error.message+'; reported targets '+JSON.stringify(seen));
  });
  const socket = new WebSocket(endpoint);
  await new Promise((done, fail) => {socket.addEventListener('open', done, {once:true}); socket.addEventListener('error', fail, {once:true})});
  let sequence = 0;
  const evaluate = expression => new Promise((done, fail) => {
    const id = ++sequence;
    const timeout = setTimeout(() => {socket.removeEventListener('message', response); fail(Error('CDP request timed out'))}, 30000);
    function response(event) {
      const payload = JSON.parse(event.data);
      if (payload.id !== id) return;
      socket.removeEventListener('message', response);
      clearTimeout(timeout);
      if (payload.error || payload.result.exceptionDetails) {
        const exception=payload.result?.exceptionDetails?.exception;
        fail(Error(exception?.description ?? exception?.value ?? JSON.stringify(payload.error)));
      }
      else done(payload.result.result.value);
    }
    socket.addEventListener('message', response);
    socket.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression, returnByValue:true, awaitPromise:true}}));
  });
  return {number, socket, evaluate, invoke:(command,args={}) => evaluate('window.__TAURI_INTERNALS__.invoke('+JSON.stringify(command)+','+JSON.stringify(args)+')')};
}

async function attach(executable, electron = false) {
  const requestedPort = electron ? await port() : 0;
  const flags = '--remote-debugging-port=' + requestedPort + ' --remote-debugging-address=127.0.0.1';
  const debugDirectory = electron ? null : join(dir,'webview-debug-'+crypto.randomUUID());
  if (debugDirectory) await mkdir(debugDirectory);
  const child = spawn(executable, electron ? flags.split(' ') : [], {
    windowsHide:true, stdio:['ignore','ignore','pipe'], env:{...process.env, ...(electron ? {} : {
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:flags,
      WEBVIEW2_USER_DATA_FOLDER:debugDirectory,
    })},
  });
  child.on('error', e => console.error(e.message));
  let stderr='';
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-2000)});
  try {
    const number = electron ? requestedPort : await eventually(async () => {
      const marker = await readFile(join(debugDirectory,'EBWebView','DevToolsActivePort'),'utf8');
      return Number(marker.split(/\r?\n/)[0]);
    }, 'WebView2 debugger port file');
    return {...await connect(number, electron), child};
  }
  catch(error) {
    if (!electron && child.pid) {
      const diagnostic = execFileSync('pwsh', ['-NoProfile', '-Command', `
        $app = Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue
        $app | Select-Object Id,SessionId,Responding,MainWindowTitle | Format-List
        Get-CimInstance Win32_Process -Filter 'ParentProcessId=${child.pid}' |
          Select-Object Name,ProcessId,SessionId,@{Name='DebugFlag';Expression={ [regex]::Match($_.CommandLine,'--remote-debugging-port=\\d+').Value }} | Format-Table
        whoami /groups /fo csv | Select-String 'S-1-16-'
        Get-ChildItem 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients' -ErrorAction SilentlyContinue |
          Get-ItemProperty | Where-Object name -Match 'WebView2' | Select-Object name,pv | Format-List
      `], {encoding:'utf8',windowsHide:true});
      console.error(diagnostic, 'Workspace initialized:', await exists(join(workspacePath,'vaultor-next.json')));
    }
    throw Error(error.message+'; exit='+child.exitCode+'; stderr='+stderr);
  }
}

const doc = text => ({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
const external = join(dir, 'external');
await mkdir(external);
const linked = join(external, 'Original.md');
const backup = join(external, 'Independent-backup.zip');
const unexpected = join(legacyProfile, 'User-owned sentinel.txt');
const externalBytes = '# Keep this linked original\r\n';
let independentBytes = Buffer.from('Independent disposable backup sentinel');
await writeFile(linked, externalBytes);
await writeFile(backup, independentBytes);
let old;
if (predecessor !== 'fresh') {
  const url = 'https://github.com/VaibhavPandit-09/vaultor-kb/releases/download/v'+predecessor+'/Vaultor-'+predecessor+'-windows-x64.exe';
  const asset = await fetch(url, {signal:AbortSignal.timeout(120_000)});
  assert(asset.ok);
  const bytes = Buffer.from(await asset.arrayBuffer());
  assert.equal(sha(bytes), predecessors[predecessor]);
  const file = join(dir, 'old.exe');
  await writeFile(file, bytes);
  await run(file, ['/S','/currentuser']);
  assert(registryExists());
  old = await attach(join(legacy, 'Vaultor.exe'), true);
  await eventually(() => old.evaluate("Boolean(document.querySelector('.library-view')) && !document.body.innerText.includes('Loading resources')"), 'original Electron Library');
  await eventually(() => old.evaluate("window.vaultorDesktop.bootstrap().then(result=>Boolean(result.value?.token))"), 'original workspace connection');
  await old.evaluate(`window.fixtureWire=async(path,method,body)=>{
    const state=(await window.vaultorDesktop.bootstrap()).value;
    const result=await window.vaultorDesktop.request({id:crypto.randomUUID(),token:state.token,path,method,timeout:30000,headers:{'X-Vaultor-Protocol':'3','Content-Type':'application/json'},...(body?{body}:{})});
    if(!result.ok)throw Error(method+' '+path+' refused: '+(result.error?.detail??'bridge error'));
    if(result.value.status>=400)throw Error(method+' '+path+' HTTP '+result.value.status);
    return new Uint8Array(result.value.data);
  };window.fixtureCall=async(path,method,body)=>JSON.parse(new TextDecoder().decode(await fixtureWire(path,method,body&&{kind:'text',value:JSON.stringify(body)})))`);
  const collection = await old.evaluate("fixtureCall('/collections/creations/'+crypto.randomUUID(),'PUT',{name:'Legacy fixture collection',resourceIds:[]})");
  const created = await old.evaluate("fixtureCall('/resources','POST',"+JSON.stringify({title:'Legacy fixture note',content:doc('Disposable Electron data'),collectionId:collection.id})+")");
  assert(created.id);
  const attachment = await old.evaluate(`fixtureWire('/resources/imports/'+crypto.randomUUID(),'PUT',{kind:'multipart',parts:[
    {name:'title',value:'legacy-original.bin'},
    {name:'file',filename:'legacy-original.bin',type:'application/octet-stream',value:new Uint8Array([3,7,11,255])}
  ]}).then(bytes=>JSON.parse(new TextDecoder().decode(bytes)))`);
  assert(attachment.id);
  const archived = await old.evaluate("fixtureCall('/exports','POST',{scope:'workspace',format:'zip'})");
  await eventually(async () => (await old.evaluate("fixtureCall('/operations/"+archived.id+"','GET')")).status === 'SUCCEEDED', 'original workspace ZIP');
  independentBytes = Buffer.from(await old.evaluate("fixtureWire('/exports/"+archived.id+"/download','GET').then(bytes=>Array.from(bytes))"));
  assert.equal(independentBytes.subarray(0,2).toString(),'PK');
  await writeFile(backup,independentBytes);
  if (predecessor === '0.26.0') {
    const cache = join(legacyProfile,'Cache');
    await mkdir(cache,{recursive:true});
    await symlink(external,join(cache,'External junction'),'junction');
    await writeFile(unexpected, 'This file has no application ownership');
  }
  // Electron writes this test-only debugger marker. The production installer
  // need not know about files created by the qualification harness.
  const marker = join(legacyProfile, 'DevToolsActivePort');
  if (await exists(marker)) await unlink(marker);
  assert(await exists(join(legacyProfile,'local-workspace','app.db')));
  console.log('Seeded the original installed '+predecessor+' workspace and exported its independent ZIP.');
  // Leave the real older application running to exercise verified shutdown.
}

await run(join(dir,'first.exe'), ['/S']);
old?.socket.close();
if (old) {
  await eventually(() => old.child.exitCode !== null, 'original Electron shut down');
  assert(!await exists(join(legacy,'Vaultor.exe')));
  assert(!await exists(join(legacyProfile,'local-workspace')));
  assert(!registryExists(), 'Old registration remains');
}
const receipt = await readFile(join(profile,'electron-replacement.txt'),'utf8');
if (predecessor === '0.26.0') {
  assert.match(receipt,/Reparse object retained:/);
  assert(await exists(join(legacyProfile,'Cache','External junction')));
  assert(receipt.includes(unexpected));
  assert.equal(await readFile(unexpected,'utf8'),'This file has no application ownership');
} else assert.match(receipt,/Complete/);
const exe = join(install,'vaultor-next.exe');
assert(await exists(exe));
assert.equal(await readFile(linked,'utf8'),externalBytes);
assert.equal(sha(await readFile(backup)),sha(independentBytes));
const initialShell = registrationAndShortcuts();
assert.equal(initialShell.version, '0.28.0');
assert.equal(initialShell.uninstall, '"'+join(install,'uninstall.exe')+'"');
assert(initialShell.links.some(link => link.name === 'Vaultor Next' && link.target.toLowerCase() === exe.toLowerCase()));
assert(!initialShell.links.some(link => link.target.toLowerCase() === join(legacy,'Vaultor.exe').toLowerCase()));
console.log('Verified replacement registration, Start Menu shortcut and external file bytes.');
process.env.VAULTOR_QUALIFICATION_IMAGE=exe;
function installedPids() {
  const values=execFileSync('pwsh',['-NoProfile','-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='vaultor-next.exe'\" | Where-Object ExecutablePath -EQ $env:VAULTOR_QUALIFICATION_IMAGE | Select-Object -ExpandProperty ProcessId",
  ],{encoding:'utf8',windowsHide:true}).trim();
  return values ? values.split(/\s+/).map(Number) : [];
}
let tampered = true;
if (!expectedInstallerHash) {
  const nextPayload = await readFile(join(dir,'second.exe'));
  const nextSig = (await readFile(join(dir,'second.exe.sig'),'utf8')).trim();
  const feed = createHttpServer((req,res)=>{
    if(req.url === '/vaultor-next-windows-update.json') {
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({
        version:'0.28.1',
        platforms:{'windows-x86_64':{signature:nextSig,url:'http://127.0.0.1:'+feed.address().port+'/second.exe'}},
      }));
    } else if(req.url === '/second.exe') {
      const bytes = Buffer.from(nextPayload);
      if(tampered) bytes[bytes.length - 1] ^= 1;
      res.end(bytes);
    } else {res.writeHead(404).end()}
  });
  await new Promise(done=>feed.listen(0,'127.0.0.1',done));
  feed.unref();
  process.env.VAULTOR_QUALIFICATION_UPDATE_PORT = String(feed.address().port);
}
let app = await attach(exe);
const request = payload => app.invoke('workspace', {request:payload});
const transfer = payload => app.invoke('transfer',{request:payload});
const snapshot = await eventually(() => request({kind:'snapshot'}), 'fresh Rust workspace');
const normalize = path => path.replace(/^\\\\\?\\/,'').toLowerCase();
assert.equal(normalize(snapshot.path), normalize(workspacePath));
assert.equal((await request({kind:'list',collection:null})).items.length,0);
assert.deepEqual(await app.invoke('next_update_info'),['0.28.0',true]);
console.log('Started the installed Next fixture with a fresh production-layout workspace.');

const collection = await request({kind:'createCollection',name:'Retain this collection',parentId:null});
const note = await request({kind:'createNote',title:'Retain this note',collection:collection.id});
await request({kind:'save',id:note.id,title:note.title,revision:note.revision,content:doc('Saved in Next before updating')});
const saved = await request({kind:'read',id:note.id});
await request({kind:'draft',id:note.id,baseRevision:saved.revision,token:'qualification-2026',sequence:1,title:note.title,content:doc('Protected before updating')});
await request({kind:'setting',key:'theme',value:'dark'});
const sample = join(dir,'known-bytes.bin');
const payload = Buffer.from([7,15,127,255,0,2]);
await writeFile(sample,payload);
const preview = await transfer({op:'preview',paths:[sample],folder:false,collection:null});
const {id:taskId} = await transfer({op:'import',token:preview.token,separate:false});
const imported = await eventually(async () => (await transfer({op:'tasks'})).find(task=>task.id===taskId&&task.finished), 'managed file commitment');
assert.equal(imported.state,'completed');
const beforeBytes = (await request({kind:'list',collection:null})).items.find(item=>item.title==='known-bytes.bin');
assert(beforeBytes);
async function verifyManagedExport() {
  const exportFolder = join(external,'managed-original');
  const {id:exportId} = await transfer({op:'export',ids:[beforeBytes.id],destination:exportFolder,format:'original'});
  const exported = await eventually(async ()=>(await transfer({op:'tasks'})).find(task=>task.id===exportId&&task.finished),'exact managed export');
  assert.equal(exported.state,'completed');
  assert.equal(sha(await readFile(join(exportFolder,(await readdir(exportFolder))[0]))),sha(payload));
}
async function quitNext() {
  await app.evaluate("setTimeout(()=>window.__TAURI_INTERNALS__.invoke('close_next',{quit:true}),10);true");
  await eventually(()=>installedPids().length===0, 'Vaultor Next quit');
  app.socket.close();
}
async function uninstallNext() {
  await run(join(install,'uninstall.exe'),['/S']);
  await eventually(async ()=>{
    if (await exists(exe)) return false;
    const shell = registrationAndShortcuts();
    return !shell.version && !shell.links.some(link => link.target.toLowerCase() === exe.toLowerCase());
  },'uninstaller removed the application, shortcut and registration');
  assert(await exists(join(workspacePath,'vaultor-next.json')));
}
if (expectedInstallerHash) {
  await eventually(() => app.evaluate("Boolean(document.querySelector('[data-ready=true][data-session-ready=true]'))"), 'installed Library');
  const matches = await request({kind:'search',options:{query:'Saved in Next',content:true,collection:null,order:'title'}});
  assert(matches.items.some(row => row.id === note.id));
  await app.evaluate("document.querySelector('button[title=Settings]').click()");
  await app.evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Application and Storage').click()");
  await eventually(() => app.evaluate("document.body.innerText.includes('Vaultor Next 0.28.0') && [...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Check for updates')"), 'installed version and update controls');
  await app.evaluate("document.querySelector('button[aria-label=\"Help with settings\"]').click()");
  await eventually(() => app.evaluate("document.body.innerText.includes('Settings and keyboard commands') && document.body.innerText.includes('Help 0.28.0')"), 'installed Help');
  const pdfFolder = join(external, 'installed-pdf');
  const {id:pdfId} = await transfer({op:'export',ids:[note.id],destination:pdfFolder,format:'pdf'});
  const pdf = await eventually(async () => (await transfer({op:'tasks'})).find(task => task.id === pdfId && task.finished), 'installed PDF export');
  assert.equal(pdf.state,'completed');
  const pdfBytes = await readFile(join(pdfFolder,(await readdir(pdfFolder)).find(name => name.endsWith('.pdf'))));
  assert.equal(pdfBytes.subarray(0,5).toString(),'%PDF-');
  await quitNext();
  // An ordinary repeat install exercises the one-time receipt using the
  // exact candidate installer a second time.
  await run(join(dir,'first.exe'), ['/S']);
  app = await attach(exe);
  assert.deepEqual(await app.invoke('next_update_info'),['0.28.0',true]);
  assert.equal((await request({kind:'read',id:note.id})).content.content[0].content[0].text,'Saved in Next before updating');
  assert.equal((await request({kind:'readDraft',id:note.id})).content.content[0].content[0].text,'Protected before updating');
  assert.equal((await request({kind:'snapshot'})).settings.theme,'dark');
  await verifyManagedExport();
  assert.equal(await readFile(join(profile,'electron-replacement.txt'),'utf8'),receipt);
  await quitNext();
  await uninstallNext();
  assert.equal(await readFile(linked,'utf8'),externalBytes);
  assert.equal(sha(await readFile(backup)),sha(independentBytes));
  console.log(JSON.stringify({predecessor, installerSHA256:expectedInstallerHash, exactColdReadback:true, repeatedInstallPreservedData:true, ordinaryUninstallPreservedWorkspace:true}));
  process.exit(0);
}
await assert.rejects(()=>app.invoke('stage_next_update'), /signature|verification/i);
tampered = false;
assert.equal(await app.invoke('stage_next_update'),'0.28.1');
console.log('The installed updater refused changed bytes and accepted the signed fixture.');
const debugPort = app.number;
const previousPid = app.child.pid;
await app.evaluate("setTimeout(()=>window.__TAURI_INTERNALS__.invoke('install_next_update',{version:'0.28.1'}),10);true");
await eventually(() => app.child.exitCode !== null, 'updater handed off to installer');
app.socket.close();
const relaunched = await eventually(()=>installedPids().find(pid=>pid!==previousPid),'installed updater relaunched the app');
try {
  const entries=await (await fetch('http://127.0.0.1:'+debugPort+'/json/list',{signal:AbortSignal.timeout(1000)})).json();
  if(!entries.some(target=>target.url.includes('next.html'))) throw Error('No inherited debugger target');
  app=await connect(debugPort,false);
} catch {
  // The installer can restart in the interactive shell environment without
  // inheriting the harness's debug flags. The observed PID proves relaunch.
  assert(installedPids().includes(relaunched));
  process.kill(relaunched);
  await eventually(()=>!installedPids().includes(relaunched),'disposable relaunch closed for readback');
  app=await attach(exe);
}
await eventually(() => request({kind:'snapshot'}), 'updated installed workspace');
assert.deepEqual(await app.invoke('next_update_info'),['0.28.1',true]);
assert.equal((await request({kind:'read',id:note.id})).content.content[0].content[0].text,'Saved in Next before updating');
assert.equal((await request({kind:'readDraft',id:note.id})).content.content[0].content[0].text,'Protected before updating');
assert.equal((await request({kind:'snapshot'})).settings.theme,'dark');
assert((await request({kind:'snapshot'})).collections.some(value=>value.id===collection.id));
await verifyManagedExport();
assert.equal(await readFile(linked,'utf8'),externalBytes);
assert.equal(sha(await readFile(backup)),sha(independentBytes));
assert.equal(await readFile(join(profile,'electron-replacement.txt'),'utf8'),receipt);
await quitNext();
await uninstallNext();
console.log(JSON.stringify({predecessor,originalInstallerSHA256:predecessors[predecessor],replacement:true,signedUpdate:true,tamperedUpdateRefused:true,protectedDraft:true,exactManagedBytes:true,externalFiles:true,ordinaryUninstallPreservedWorkspace:true}));
