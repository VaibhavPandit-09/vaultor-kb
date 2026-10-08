// One bounded Atlas extraction observation, importing only the verified synthetic baseline into new storage.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {OwnedServer} from '../src/owned-server.mjs';
const atlas=fileURLToPath(new URL('../cache/atlas/',import.meta.url)),resume=process.argv.includes('--resume')?process.argv[process.argv.indexOf('--resume')+1]:null,root=resume??await mkdtemp(join(tmpdir(),'vaultor-file-search-atlas-'));
if(resume){const previous=JSON.parse(await readFile(join(root,'report.json')));assert.equal(previous.seed,'atlas-2026-10-v1');assert.equal(previous.root,root);assert.ok(root.startsWith(join(tmpdir(),'vaultor-file-search-atlas-')));}
const manifest=JSON.parse(await readFile(join(atlas,'manifest.json'))),zip=await readFile(join(atlas,'baseline.zip'));
assert.equal(manifest.seed,'atlas-2026-10-v1');assert.equal(createHash('sha256').update(zip).digest('hex'),manifest.archive.sha256);
const owned=new OwnedServer({bundle:process.env.VAULTOR_BUILD_BUNDLE??fileURLToPath(new URL('../bundle/',import.meta.url)),data:join(root,'data')});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const report={seed:manifest.seed,version:'0.7.0',root,checks:[],limitations:'60-second partial observation during indexing; no cold-cache, peak-memory, percentile, speedup or completed corpus coverage claim.'};
async function request(path,method='GET',body){for(let i=0;i<200;i++){const form=body instanceof FormData,r=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,'X-Vaultor-Protocol':'3','X-Request-ID':randomUUID(),...(!form&&body?{'Content-Type':'application/json'}:{})},body:body?(form?body:JSON.stringify(body)):undefined});if(r.status===409||r.status===503){await sleep(100);continue;}const d=await r.json();assert.ok(r.ok,path+' '+r.status);return d;}throw new Error('Timed out: '+path);}
const workingSet=()=>Number(execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-Process -Id ${owned.child.pid}).WorkingSet64`],{encoding:'utf8',windowsHide:true}).trim());
try{
 await owned.start();const start=performance.now();if(!resume){const form=new FormData();form.set('file',new Blob([zip],{type:'application/zip'}),'atlas-baseline.zip');
 const review=await request('/imports/preview','POST',form);await request('/imports/'+review.operation.id+'/commit','POST',{mode:'replace',confirmation:'replace'});
 for(let i=0;i<1200;i++){const op=await request('/operations/'+review.operation.id);if(op.status==='SUCCEEDED')break;if(op.status==='FAILED')throw new Error(op.detail);await sleep(100);}
 report.importMilliseconds=performance.now()-start;}else report.resumedAfter='Initial 5000-resource replacement completed but operation status borrowed the single SQLite connection for 30 seconds and returned 500; retained as a Sprint 5 limitation.';const page=await request('/resources?size=1');assert.equal(page.totalItems,5000);report.resourceCount=page.totalItems;report.initialCoverage=(await request('/diagnostics/search')).files;report.initialWorkingSet=workingSet();
 const samples=[];for(let i=0;i<6;i++){const t=performance.now(),p=await request('/resources/query?q=habitat');assert.ok(p.totalItems>0);samples.push(performance.now()-t);}
 report.searchMilliseconds={samples,median:([...[...samples].sort((a,b)=>a-b)].slice(2,4).reduce((a,b)=>a+b,0)/2),max:Math.max(...samples)};
 await sleep(60000);report.after60Seconds=(await request('/diagnostics/search')).files;report.afterWorkingSet=workingSet();report.totalMilliseconds=performance.now()-start;report.success=true;
 console.log('Bounded Atlas file-search observation passed. Report: '+root);
}catch(e){report.failure=e.message;throw e;}finally{await owned.stop();await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));}
