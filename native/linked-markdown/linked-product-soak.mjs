import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {LinkedRegistry} from '../../desktop/src/linked/registry.mjs';
import {LinkedDocuments} from '../../desktop/src/linked/documents.mjs';
const repo=fileURLToPath(new URL('../../',import.meta.url)),assets=join(repo,'frontend/dist/assets'),worker=join(assets,(await readdir(assets)).find(n=>/^markdown\.worker-.*\.js$/.test(n))??'missing');
if(process.platform!=='win32')throw Error('Windows qualification only');
const output=join(repo,process.env.VAULTOR_LINKED_SOAK_QUICK==='1'?'native/linked-markdown/evidence/production/product-soak-bounded-worker.json':'native/linked-markdown/evidence/production/product-soak.json'),all=[],started=Date.now();
const summary=values=>{const sorted=[...values].sort((a,b)=>a-b);return {count:values.length,p50:sorted[Math.floor(sorted.length*.5)]??0,p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]??0,max:sorted.at(-1)??0};};
for(const [size,edits] of (process.env.VAULTOR_LINKED_SOAK_QUICK==='1'?[[262000,100]]:[[4096,1000],[65536,500],[262000,500]])){
  const base=await mkdtemp(join(repo,'native/linked-markdown/.scratch/product-soak-')),root=join(base,'source'),privateDir=join(base,'private');await mkdir(root);await mkdir(privateDir);
  let source='# Long editing session\n\nCounter 000000.\n\n';while(Buffer.byteLength(source)<size){const remaining=size-Buffer.byteLength(source);source+='x'.repeat(Math.min(10000,Math.max(0,remaining-2)))+'\n\n';if(remaining<=2)break;}
  await writeFile(join(root,'Guide.md'),source);const scope={token:randomUUID(),workspace:randomUUID(),generation:randomUUID(),epoch:randomUUID(),kind:'owned-local',mainFrame:true};
  const registry=new LinkedRegistry({directory:join(privateDir,'sources'),java:join(repo,'desktop/bundle/runtime/bin/java.exe'),classes:join(repo,'native/linked-markdown/build'),protectedRoot:privateDir,applicationRoot:join(repo,'desktop'),current:()=>scope,picker:async()=>({canceled:false,filePaths:[root]})});await registry.load(scope);let documents;
  try{
    const {root:rootId}=await registry.add(scope),page=await registry.list(scope,{source:rootId});documents=new LinkedDocuments(registry,{worker});let opened=await documents.open(scope,page.items[0].id),host=documents.documents.get(opened.id),draft=structuredClone((await host.validator.ready).doc);const baseline=(await registry.native.call('metrics')).map(Number),samples=[],protect=[],save=[],mount=[];let previousCounter='000000',version=0;const runStarted=Date.now();
    for(let i=1;i<=edits;i++){
      const counter=String(i).padStart(6,'0');draft=structuredClone(draft);const edit=node=>{if(node.text==='Counter '+previousCounter+'.')node.text='Counter '+counter+'.';node.content?.forEach(edit);};edit(draft);source=source.replace('Counter '+previousCounter+'.','Counter '+counter+'.');previousCounter=counter;
      let begin=performance.now();const protectedDraft=await documents.protect(scope,{document:opened.id,binding:opened.binding,version:++version,draft,source});protect.push(performance.now()-begin);assert.equal(protectedDraft.validated,true);
      if(i%25===0){begin=performance.now();const receipt=await documents.save(scope,{document:opened.id,binding:opened.binding,version});save.push(performance.now()-begin);assert.equal(receipt.state,'COMMITTED');assert.equal(await readFile(join(root,'Guide.md'),'utf8'),source);}
      if(i%100===0){const stats=await host.validator.worker.getHeapStatistics(),native=(await registry.native.call('metrics')).map(Number);samples.push({edit:i,workerHeap:stats.used_heap_size,workerTotalHeap:stats.total_heap_size,coordinatorRss:process.memoryUsage().rss,native});
        const begin=performance.now();await documents.close(scope,{document:opened.id,binding:opened.binding});assert.equal(host.validator.worker.threadId,-1);opened=await documents.open(scope,opened.id);host=documents.documents.get(opened.id);draft=structuredClone((await host.validator.ready).doc);mount.push(performance.now()-begin);version=Math.max(version,opened.nativeVersion??0);
      }
    }
    await documents.close(scope,{document:opened.id,binding:opened.binding});const after=(await registry.native.call('metrics')).map(Number);assert.equal(after[4],0);assert.ok(after[3]<=baseline[3]+32,'native handle growth');assert.ok(after[7]<=256*1024*1024,'private quota');
    all.push({sourceBytes:Buffer.byteLength(source),edits,elapsedMs:Date.now()-runStarted,protectMs:summary(protect),saveMs:summary(save),remountMs:summary(mount),baseline,after,samples});console.log(JSON.stringify({...all.at(-1),samples:undefined}));
  }finally{await documents?.dispose();await registry.close();}
}
await writeFile(output,JSON.stringify({environment:{node:process.version,platform:process.platform,arch:process.arch,worker:worker.split(/[\\/]/).at(-1),javaRuntime:'bundled Temurin25.0.4.1',rendererFrames:'not measured by this headless host experiment'},elapsedMs:Date.now()-started,cases:all},null,2)+'\n');console.log('Wrote bounded-host/worker soak evidence.');
