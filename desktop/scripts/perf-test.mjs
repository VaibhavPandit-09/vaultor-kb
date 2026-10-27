import { readFile, writeFile, mkdir, mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir, cpus, totalmem, release, version, hostname } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { hash, protocol, fixture, summary, comparison, markdown, isolatedEnvironment } from './perf-support.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)), desktop=join(root,'desktop');
const results=join(root,'performance-results'), stamp=join(desktop,'cache','perf-build.json');
const args=process.argv.slice(2), valid=['--smoke','--extended','--baseline','--rebuild'];
const size=args.find(a=>/^--size=(64|256|512|1024)$/.test(a));
if(args.some(a=>!valid.includes(a)&&a!==size) || (args.includes('--smoke')&&args.includes('--extended')) || (size&&!args.includes('--smoke')))throw Error('Usage: npm run perf:test -- [--smoke [--size=64|256|512|1024]|--extended] [--baseline] [--rebuild]');
const mode=args.includes('--smoke')?'smoke':args.includes('--extended')?'extended':'normal';
const workload={sizes:mode==='smoke'?[64]:[64,256,512,1024],keys:mode==='extended'?12:mode==='smoke'?2:6,samples:mode==='extended'?3:mode==='smoke'?1:2,rounds:mode==='extended'?5:mode==='smoke'?1:3};
if(size)workload.sizes=[Number(size.split('=')[1])];
const json=async path=>JSON.parse(await readFile(path,'utf8'));
// Concurrent benchmarks distort results and race build/latest outputs. Recover
// a stale lock only when its recorded process no longer exists; never kill it.
await mkdir(results,{recursive:true});
const lock=join(results,'.running.json');
for(let attempt=0;;attempt++){
  try{await writeFile(lock,JSON.stringify({pid:process.pid}),{flag:'wx'});break;}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const owner=await json(lock).catch(()=>null);
    let alive=true;
    if(Number.isInteger(owner?.pid))try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}
    if(alive||attempt)throw Error('Another performance run owns performance-results/.running.json. Wait for it to finish.');
    await rm(lock);
  }
}
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8',windowsHide:true}).trim();
const children=new Set();let temporary,interrupted=false;
const killTree=child=>new Promise(resolveKill=>{
  if(child.exitCode!==null)return resolveKill();
  const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  killer.once('error',resolveKill);killer.once('close',resolveKill);
});
const run=(command,argv,cwd,env=process.env,timeout=600000)=>new Promise((done,reject)=>{
  if(interrupted)return reject(Error('Benchmark interrupted'));
  const child=spawn(command,argv,{cwd,env,windowsHide:true,stdio:'inherit'});children.add(child);
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;void killTree(child);},timeout);
  child.once('error',error=>{clearTimeout(timer);children.delete(child);reject(error);});
  child.once('close',code=>{clearTimeout(timer);children.delete(child);code===0&&!timedOut?done():reject(Error(timedOut?'Operation timed out (owned process tree stopped)':`${command} exited ${code}`));});
});
// Hash relevant source bytes rather than mtimes; no stale UI/server reuse after
// switching commits or editing source. Tests/docs/results are not build inputs.
async function fingerprint(paths) {
  const parts=[];
  async function walk(path){
    const info=await stat(path).catch(()=>null);if(!info)return;
    if(info.isDirectory()){for(const name of (await readdir(path)).sort())await walk(join(path,name));}
    else parts.push(path.slice(root.length).replaceAll('\\','/')+'\0'+hash(await readFile(path)));
  }
  for(const path of paths)await walk(join(root,path));
  return hash(parts.join('\n'));
}
const npm=(cwd,script)=>run(process.execPath,[process.env.npm_execpath,'run',script],cwd);
const result={id:new Date().toISOString().replaceAll(':','-'),mode,runtime:'Windows Electron (local production UI + bundled Java/native host; unpackaged Electron shell)',success:false,documents:[],environment:{commit:git('rev-parse','HEAD'),dirty:Boolean(git('status','--porcelain')),appVersion:(await json(join(desktop,'package.json'))).version,os:`${version()} ${release()}`,machine:hostname(),cpu:cpus()[0]?.model,cpuCount:cpus().length,ramBytes:totalmem(),arch:process.arch,node:process.version},workload,protocol};
const interrupt=()=>{interrupted=true;process.exitCode=1;void Promise.all([...children].map(killTree));};
process.once('SIGINT',interrupt);
process.once('SIGTERM',interrupt);
try {
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('perf:test currently supports Windows x64 only.');
  if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22+ is required.');
  if(!process.env.npm_execpath)throw Error('Launch with npm run perf:test from the repository root.');
  for(const folder of ['frontend','desktop']) {
    const expected=(await json(join(root,folder,'package-lock.json'))).packages;
    const installed=await json(join(root,folder,'node_modules','.package-lock.json')).catch(()=>({}));
    const stale=Object.entries(expected).some(([name,pkg])=>name&&!pkg.optional&&pkg.version!==installed.packages?.[name]?.version);
    if(stale||!await stat(join(root,folder,'node_modules')).catch(()=>null)){
      console.log(`Installing locked ${folder} dependencies…`);
      await run(process.execPath,[process.env.npm_execpath,'ci'],join(root,folder));
    }
  }
  const uiConfig=(await readdir(join(root,'frontend'),{withFileTypes:true})).filter(e=>e.isFile()&&/\.(json|[cm]?js|ts|html)$/.test(e.name)).map(e=>'frontend/'+e.name);
  const uiHash=await fingerprint(['frontend/src','frontend/public',...uiConfig,'desktop/scripts/copy-ui.mjs']);
  const serverHash=await fingerprint(['backend/src/main','backend/pom.xml','native/linked-markdown/src','native/linked-markdown/platform/windows','desktop/runtime-lock.json','desktop/scripts/prepare-server.mjs','desktop/scripts/build-linked-native.mjs']);
  const prior=await json(stamp).catch(()=>({}));
  if(args.includes('--rebuild')||prior.ui!==uiHash||prior.uiOutput!==await fingerprint(['desktop/ui'])||!await stat(join(desktop,'ui','index.html')).catch(()=>null))await npm(desktop,'build');
  if(args.includes('--rebuild')||prior.server!==serverHash||prior.serverOutput!==await fingerprint(['desktop/bundle/manifest.json'])||!await stat(join(desktop,'bundle','manifest.json')).catch(()=>null)) {
    try{execFileSync('javac',['-version'],{windowsHide:true,stdio:'pipe'});}catch{throw Error('A Java 25 JDK on PATH is required to prepare the bundled server. See desktop setup documentation.');}
    await npm(desktop,'prepare-server');
  }
  await mkdir(join(desktop,'cache'),{recursive:true});await writeFile(stamp,JSON.stringify({ui:uiHash,server:serverHash,uiOutput:await fingerprint(['desktop/ui']),serverOutput:await fingerprint(['desktop/bundle/manifest.json'])}));
  result.build={ui:uiHash,server:serverHash};
  const require=createRequire(new URL('../package.json',import.meta.url)),electron=require('electron');
  result.environment.electron=(await json(join(desktop,'node_modules','electron','package.json'))).version;
  result.environment.javaRuntime=(await json(join(desktop,'bundle','manifest.json'))).runtime;
  // Commits/app versions are recorded but deliberately excluded: compare code
  // revisions only when the workload, toolchain and machine remain identical.
  const harnessPaths=['desktop/scripts/perf-test.mjs','desktop/scripts/native-perf-test.mjs','desktop/scripts/perf-support.mjs','desktop/scripts/perf-process.ps1','desktop/scripts/native-chrome-smoke.mjs'];
  const harnessHash=await fingerprint(harnessPaths);
  result.compatibility=hash(JSON.stringify({protocol,workload,environment:{...result.environment,commit:undefined,dirty:undefined,appVersion:undefined},fixtures:workload.sizes.map(k=>hash(fixture(k))),harness:harnessHash}));
  temporary=await mkdtemp(join(tmpdir(),'vaultor-perf-'));
  for(let round=0;round<workload.rounds;round++) {
    const directory=join(temporary,`profile-${round}`),source=join(temporary,`source-${round}`);
    await mkdir(directory);await mkdir(source);
    await writeFile(join(directory,'perf-config.json'),JSON.stringify({...workload,source}));
    // Allowlisted environment avoids inherited test switches, owner credentials,
    // source roots or dev URLs from changing the application under test.
    const env=isolatedEnvironment(process.env);
    Object.assign(env,{VAULTOR_CHROME_SMOKE_DIRECTORY:directory,VAULTOR_PERF_TEST:'1',HOST_NETWORK_PORT:'0',NODE_ENV:'production',VAULTOR_PERF_EXECUTABLE:electron,VAULTOR_PERF_APP:desktop});
    console.log(`Electron benchmark ${round+1}/${workload.rounds} (${mode})…`);
    try {await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(desktop,'scripts','perf-process.ps1')],desktop,env,mode==='extended'?1200000:600000);}
    catch(error){const detail=await json(join(directory,'perf-error.json')).catch(()=>null);throw Error(detail?`${error.message}: ${detail.message}`:error.message);}
    finally {
      const raw=await json(join(directory,'perf-raw.json')).catch(()=>null);
      if(raw){result.environment.runtimeVersions=raw.runtimeVersions;result.documents.push(...raw.documents.map(d=>({...d,round})));}
    }
  }
  if(harnessHash!==await fingerprint(harnessPaths))throw Error('Benchmark scripts changed during this run; results cannot be compared.');
  result.rounds=result.documents;
  result.documents=workload.sizes.map(kib=>{
    const rounds=result.rounds.filter(d=>d.kib===kib),raw={};
    if(new Set(rounds.map(d=>d.status)).size!==1)throw Error(`Inconsistent admission across rounds: ${kib} KiB`);
    for(const d of rounds)for(const [key,values]of Object.entries(d.raw)) (raw[key]??=[]).push(...values);
    return {kib,status:rounds[0].status,bytes:rounds[0].bytes,reason:rounds[0].reason,sourcePreserved:rounds.every(d=>d.sourcePreserved),metrics:Object.fromEntries(Object.entries(raw).map(([key,v])=>[key,summary(v)]))};
  });
  result.success=true;
} catch(error) {result.error=error.message;process.exitCode=1;console.error('Performance harness failed: '+error.message);}
finally {
  await Promise.all([...children].map(killTree));
  if(temporary) {
    const target=resolve(temporary),parent=resolve(tmpdir());
    if(!target.startsWith(parent+sep)||!target.slice(parent.length+1).startsWith('vaultor-perf-'))throw Error('Refusing unsafe cleanup target');
    try{await rm(target,{recursive:true,force:true,maxRetries:20,retryDelay:250});result.cleanup='temporary profiles/sources removed; owned Electron exited';}
    catch(error){result.cleanup='FAILED: '+error.message;result.success=false;process.exitCode=1;}
  }else result.cleanup='no application launched';
  await mkdir(results,{recursive:true});
  const files=(await readdir(results)).filter(n=>/^\d.*(?<!\.raw)\.json$/.test(n)).sort().reverse();
  let previous;
  for(const file of files){const candidate=await json(join(results,file)).catch(()=>null);if(candidate?.success&&candidate.compatibility===result.compatibility){previous=candidate;break;}}
  const baseline=await json(join(results,'baseline.json')).catch(()=>null);
  result.comparisons={previous:comparison(result,previous),...(baseline?{baseline:comparison(result,baseline)}:{})};
  if(!previous&&files.length)result.comparisons.previous.reason='No compatible successful history (other modes/environments are not compared).';
  const raw=result.rounds??result.documents;
  result.rawFile=result.id+'.raw.json';
  await writeFile(join(results,result.rawFile),JSON.stringify(raw,null,2)+'\n');
  delete result.rounds;
  // Failure reports keep partial operation evidence only in the raw file.
  if(!result.success)result.documents=result.documents.map(({raw,operations,longTasks,...doc})=>doc);
  const output=JSON.stringify(result,null,2)+'\n',report=markdown(result);
  await writeFile(join(results,result.id+'.json'),output);await writeFile(join(results,result.id+'.md'),report);
  // Write each latest file by rename to avoid partially written history.
  const {rename}=await import('node:fs/promises');
  for(const [name,value]of [['latest.json',output],['latest.md',report]]){await writeFile(join(results,name+'.tmp'),value);await rename(join(results,name+'.tmp'),join(results,name));}
  if(args.includes('--baseline')&&result.success)await writeFile(join(results,'baseline.json'),output);
  await rm(lock);
  console.log(report);console.log('Reports: '+results);
}
