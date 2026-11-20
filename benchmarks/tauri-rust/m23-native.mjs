import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function qualifyM23({evaluate,wait,record,report,folder,fixture}) {
  const invoke=(command,payload={})=>evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(payload)})`);
  const ws=request=>invoke('workspace',{request});
  const transfer=request=>invoke('transfer',{request});
  const linked=request=>ws({kind:'linked',request});
  const workspace=(await ws({kind:'snapshot'})).path;
  const reviews=request=>ws({kind:'reviews',path:workspace,request});
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fileBytes=32*1024*1024;
  report.dataset=createHash('sha256').update('M23: 100 reviews on one saved note, 32 MiB binary, one linked Markdown descriptor').digest('hex');
  report.fixture={reviewCount:100,managedFileBytes:fileBytes,linkedFiles:1,recipeSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')};
  fixture.submissionMs.forEach((ms,index)=>record('m23-review-submission',index+1,'owner_service',ms,'ms','Optimized offline fixture executable; SQLite service call through commit. No IPC or renderer.'));
  const list=async(index=1)=>{
    const start=performance.now();
    const result=await reviews({op:'list',status:'open',resourceId:null,page:0,size:50});
    record('m23-review-list',index,'ipc_round_trip',performance.now()-start,'ms','One page of up to 50 items from 100 total reviews in the native host.');
    return result;
  };
  const first=await list();
  assert.equal(first.counts.open,100);
  assert.equal(first.items[0].attachment,'attached');
  for(let index=2;index<=5;index++)await list(index);
  const owner=first.items[0];
  const status=(value,revision=owner.revision)=>reviews({op:'status',id:owner.id,status:value,generation:first.generation,revision});
  const selectors={
    entry:'button[aria-label^="Review inbox"]',
  };
  await wait(`document.querySelector(${JSON.stringify(selectors.entry)})?.getAttribute('aria-label').includes('100 open')`,'event-driven Review counts');
  await click(selectors.entry);
  await wait("document.querySelector('[role=dialog] details summary')?.textContent.includes('attached')",'captured evidence in Review Inbox');
  const detail=performance.now();
  await click('[role=dialog] details summary');
  await wait("document.querySelector('[role=dialog] details[open] blockquote')?.textContent.includes('benchmark evidence')",'Review evidence expansion');
  record('m23-review-detail',1,'ui_detail_open',performance.now()-detail,'ms','WebView2 DOM click through visible evidence.');
  await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(button=>button.textContent==='Resolve').click()");
  await wait(`!document.querySelector('[role=dialog] ul')?.textContent.includes(${JSON.stringify(owner.comment)})`,'Resolve removes the row from the open filter');
  const startResolve=performance.now();
  const updated=await status('resolved');
  record('m23-review-resolution',1,'ipc_idempotent_retry',performance.now()-startResolve,'ms','Immediate retry of the preceding mounted UI resolution.');
  assert.equal((await status('resolved')).revision,updated.revision);
  await assert.rejects(status('dismissed'),/changed/i);
  await status('dismissed',updated.revision);
  await click('[role=dialog] button[aria-label="Close modal"]');
  const content={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'New saved wording.'}]}]};
  await ws({kind:'save',id:fixture.resource,title:'M23 renamed fixture',content,revision:2});
  assert.equal((await list(6)).items[0].attachment,'changed');
  assert.equal((await ws({kind:'read',id:fixture.resource})).revision,3);

  const sleep=time=>new Promise(resolve=>setTimeout(resolve,time));
  const job=async(scenario,request)=>{
    const start=performance.now();
    const {id}=await transfer(request);
    for(let count=0;count<1200;count++){
      const task=(await transfer({op:'tasks'})).find(task=>task.id===id);
      if(task?.finished){
        assert.equal(task.state,'completed',JSON.stringify(task));
        record(scenario,1,'task_execution',task.finished-task.started,'ms','Rust Activity start through terminal timestamp.');
        record(scenario,1,'command_to_receipt',performance.now()-start,'ms','Command through terminal receipt with 25 ms polling.');
        return task.result;
      }
      await sleep(25);
    }
    throw Error('Activity timed out: '+scenario);
  };

  const imported=join(folder,'managed.bin');
  await writeFile(imported,Buffer.alloc(fileBytes,65));
  const preview=await transfer({op:'preview',paths:[imported],folder:false,collection:null});
  await job('m23-fixture-import',{op:'import',token:preview.token,separate:false});
  const file=(await ws({kind:'list',collection:null,limit:100})).items.find(item=>item.kind==='file');
  assert(file);
  const copyStart=performance.now();
  const copies=await invoke('prepare_drag',{path:workspace,ids:[file.id]});
  assert.deepEqual(copies.names,['managed.bin']);
  const copyPath=join(folder,'native-export-copies',copies.receipt,copies.names[0]);
  assert.equal((await stat(copyPath)).size,fileBytes);
  record('m23-drag-preparation',1,'verified_file_handoff_preparation',performance.now()-copyStart,'ms','32 MiB managed original through validated native copy and receipt. No physical drop.');
  const cleanup=performance.now();
  await invoke('release_drag',{receipt:copies.receipt});
  await assert.rejects(stat(copyPath),{code:'ENOENT'});
  record('m23-drag-cleanup',1,'cancel_release',performance.now()-cleanup,'ms','Cancelled preparation and verified cached copy removal.');

  const duplicates=await job('m23-duplication',{op:'duplicate',workspace,ids:[fixture.resource,file.id]});
  const [duplicatedNote,duplicatedFile]=duplicates.copies;
  assert.notEqual(duplicatedNote.id,fixture.resource);
  assert.equal((await ws({kind:'read',id:duplicatedNote.id})).content.content[0].content[0].text,'New saved wording.');
  await ws({kind:'save',id:duplicatedNote.id,title:duplicatedNote.title,revision:1,content:{type:'doc',content:[{type:'paragraph'}]}});
  assert.deepEqual((await ws({kind:'read',id:fixture.resource})).content,content);
  assert.equal((await stat(join(folder,'workspace','managed',duplicatedFile.id+'.bin'))).size,fileBytes);
  await ws({kind:'organization',request:{op:'trash',ids:[duplicatedFile.id],restore:false}});
  await job('m23-duplicate-purge',{op:'purge',ids:[duplicatedFile.id]});
  assert.equal((await stat(join(folder,'workspace','managed',file.id+'.bin'))).size,fileBytes);
  await assert.rejects(stat(join(folder,'workspace','managed',duplicatedFile.id+'.bin')),{code:'ENOENT'});

  const external=join(folder,'external'), relocated=join(folder,'relocated');
  await Promise.all([mkdir(external),mkdir(relocated)]);
  await writeFile(join(external,'Identity.md'),'# Stable descriptor\n');
  const source=await linked({op:'register',path:external});
  const attached=await linked({op:'identify',source:source.id,path:'Identity.md'});
  const collection=await ws({kind:'createCollection',name:'M23 folder'});
  await ws({kind:'membership',id:attached.id,add:collection.id,remove:null});
  await ws({kind:'organization',request:{op:'pin',ids:[attached.id],value:true}});

  const archivePath=join(folder,'M23.vaultor'), restored=join(folder,'restored');
  await job('m23-review-archive',{op:'archive',destination:archivePath});
  const manifest=await transfer({op:'inspectArchive',source:archivePath});
  assert.equal(manifest.version,4);
  assert.equal(manifest.reviews,100);
  assert.equal(manifest.linkedDescriptors,1);
  const clean=await job('m23-review-restore',{op:'restore',source:archivePath,destination:restored,manifestHash:manifest.manifestHash});
  assert.equal(clean.reviews,100);
  const merge=()=>job('m23-review-merge',{op:'merge',source:archivePath,manifestHash:manifest.manifestHash});
  assert.equal((await merge()).reviews,100);
  const replay=await transfer({op:'merge',source:archivePath,manifestHash:manifest.manifestHash});
  await wait(`window.__TAURI_INTERNALS__.invoke('transfer',{request:{op:'tasks'}}).then(rows=>rows.find(row=>row.id===${JSON.stringify(replay.id)})?.result?.reused)`,'exact-repeat merge');
  const all=await reviews({op:'list',status:null,resourceId:null,page:0,size:0});
  assert.equal(all.totalItems,200);
  await evaluate(`window.dispatchEvent(new CustomEvent('vaultor-next-transfer',{detail:{op:'open',path:${JSON.stringify(restored)}}}))`);
  await wait("document.querySelector('[aria-label=\"Open workspace\"]')?.title.endsWith('restored') && document.querySelector('.next-shell')?.dataset.sessionReady==='true'",'restored workspace opens through the normal UI');
  const active=await ws({kind:'snapshot'});
  const restoredScope=active.path;
  await assert.rejects(reviews({op:'list',status:null,resourceId:null,page:0,size:1}),/workspace changed/i);
  const saved=await ws({kind:'reviews',path:restoredScope,request:{op:'list',status:'dismissed',resourceId:null,page:0,size:50}});
  assert.equal(saved.items[0].id,owner.id);
  assert.equal(saved.items[0].imported,true);
  const rebind=()=>linked({op:'rebindDescriptor',workspace:restoredScope,id:attached.id,path:relocated});
  await writeFile(join(relocated,'Identity.md'),'# Wrong file\n');
  await assert.rejects(rebind(),/different path or revision/i);
  assert.equal((await linked({op:'sources'})).length,0);
  await writeFile(join(relocated,'Identity.md'),'# Stable descriptor\n');
  const rebindStart=performance.now();
  await rebind();
  record('m23-descriptor-rebind',1,'ipc_binding_commit',performance.now()-rebindStart,'ms','One exact relative-path and SHA-256 match on NTFS.');
  assert.equal((await linked({op:'openId',id:attached.id.slice(7)})).id,attached.id);
  assert.deepEqual((await ws({kind:'memberships',id:attached.id})).members,[collection.id]);
  assert.equal(await readFile(join(external,'Identity.md'),'utf8'),'# Stable descriptor\n');
  const pin=async(id,value=true)=>ws({kind:'organization',request:{op:'pin',ids:[id],value}});
  await pin(fixture.resource);
  await ws({kind:'organization',request:{op:'arrangePin',workspace:restoredScope,
    source:{collection:false,id:fixture.resource},target:{collection:false,id:attached.id},after:false}});
  const pins=await ws({kind:'organization',request:{op:'pins',kind:'all',query:'',limit:10,offset:0}});
  assert.deepEqual(pins.items.map(item=>item.id),[fixture.resource,attached.id]);
  report.checks.push('Review Inbox counts/evidence, idempotent triage and stale revision display',
    'Review archive restore and exact-repeat merge with 200 retained rows',
    'Independent managed duplication and 32 MiB checked native copy/cancellation',
    'NTFS descriptor mismatch refusal, exact binding, membership and external bytes',
    'Pinned order projection after an anchored move');
}
