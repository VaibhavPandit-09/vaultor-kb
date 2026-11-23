import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,rename,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function qualifyM23({evaluate,cdp,wait,record,report,folder,output,fixture}) {
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
  if(process.argv.includes('--m26-deep'))await qualifyDeep({ws,linked,job,wait,folder,restoredScope,fixture,owner,file,report,transfer,evaluate,cdp,output});
}


async function qualifyDeep({ws,linked,job,wait,folder,restoredScope,fixture,owner,file,report,transfer,evaluate,cdp,output}) {
  const external=join(folder,'deep-linked'), bad=join(folder,'deep-mismatch');
  const base='level-1/level-2';
  const hubPath=base+'/notes/Hub.md', oldPath=base+'/assets/Draft Target.md', targetPath=base+'/assets/Final Target.md';
  const hubText='# Hub\r\n\r\n[open target][target] and [again][target].\r\n\r\n![Chart](../assets/chart.png)\r\n\r\n[target]: ../assets/Final%20Target.md#point\r\n';
  const targetText='# Point\r\n\r\nArchive target with original line endings.\r\n';
  const png=Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da63fcff1f0003030200efa2a75b0000000049454e44ae426082','hex');
  for(const root of [external,bad]){
    await mkdir(join(root,base,'notes'),{recursive:true});
    await mkdir(join(root,base,'assets'),{recursive:true});
    await writeFile(join(root,hubPath),hubText);
  }
  await writeFile(join(bad,targetPath),'# A different file');
  await writeFile(join(external,oldPath),targetText);
  await writeFile(join(external,base,'assets','chart.png'),png);
  const source=await linked({op:'register',path:external});
  const old=await linked({op:'identify',source:source.id,path:oldPath});
  await rename(join(external,oldPath),join(external,targetPath));
  await job('m26-deep-index',{op:'indexLinked',source:source.id});
  const hub=await linked({op:'identify',source:source.id,path:hubPath});
  const target=await linked({op:'identify',source:source.id,path:targetPath});
  assert.equal(target.id,old.id);
  const parent=await ws({kind:'createCollection',name:'Deep parent',parentId:null});
  const nested=await ws({kind:'createCollection',name:'Deep child',parentId:parent.id});
  for(const add of [parent.id,nested.id])await ws({kind:'membership',id:target.id,add,remove:null});
  const tag=await ws({kind:'organization',request:{op:'tag',id:null,name:'Deep portability',color:'#336699'}});
  await ws({kind:'organization',request:{op:'tagging',ids:[target.id],tag:tag.id,add:true}});
  await ws({kind:'organization',request:{op:'pin',ids:[target.id],value:true}});
  const org=request=>ws({kind:'organization',request});
  const verifyOrganization=async id=>{
    const state=await ws({kind:'snapshot'});
    const membership=(await ws({kind:'memberships',id})).members;
    const parent=state.collections.find(row=>row.name==='Deep parent');
    const child=state.collections.find(row=>row.name==='Deep child');
    assert.equal(child.parentId,parent.id);
    assert.deepEqual(membership.sort(),[child.id,parent.id].sort());
    const {items}=await org({op:'tags',query:'Deep portability',after:null});
    assert.equal(items.length,1);
    assert.equal(items[0].color,'#336699');
    assert.deepEqual(await org({op:'assigned',ids:[id]}),[{id,tags:[items[0].id]}]);
    assert((await org({op:'pins',kind:'all',query:'',limit:20,offset:0})).items.some(row=>row.id===id));
  };
  const note=await ws({kind:'createNote',title:'Deep managed reference',collection:nested.id});
  const reference={type:'doc',content:[{type:'paragraph',content:[{type:'resourceLink',attrs:{resourceId:target.id,label:'Deep target',type:'note'}}]}]};
  await ws({kind:'save',id:note.id,revision:note.revision,title:'Deep managed reference',content:reference});
  const reviewList=(path,resourceId)=>ws({kind:'reviews',path,request:{op:'list',status:'dismissed',resourceId,page:0,size:50}});
  const review=(await reviewList(restoredScope,fixture.resource)).items.find(row=>row.id===owner.id);
  assert(review?.imported);
  const assertEvidence=actual=>{
    assert.equal(actual.imported,true);
    for(const key of ['author','targetTitle','targetType','comment','quote','context','locator','createdAt','updatedAt','baseRevision','status'])assert.deepEqual(actual[key],review[key],key);
  };
  const verifyLinks=async(h,t)=>{
    const rel=id=>linked({op:'relationships',id:id.slice(7)});
    assert((await rel(h)).outgoing.some(row=>row.id===t&&row.occurrences===2));
    assert((await rel(t)).incoming.some(row=>row.id===h&&row.occurrences===2));
    assert.equal((await linked({op:'follow',id:h.slice(7),href:'../assets/Final%20Target.md#point'})).id,t);
    const asset=await linked({op:'asset',id:h.slice(7),href:'../assets/chart.png'});
    assert.deepEqual(Buffer.from(asset.bytes),png);
  };
  await verifyLinks(hub.id,target.id);

  const path=join(folder,'deep.vaultor');
  await job('m26-deep-archive',{op:'archive',destination:path});
  const preview=await transfer({op:'inspectArchive',source:path});
  assert.equal(preview.linkedDescriptors,3);
  const destination=join(folder,'deep-restored');
  await job('m26-deep-restore',{op:'restore',source:path,destination,manifestHash:preview.manifestHash});
  await evaluate(`window.dispatchEvent(new CustomEvent('vaultor-next-transfer',{detail:{op:'open',path:${JSON.stringify(destination)}}}))`);
  await wait(`document.querySelector('[aria-label="Open workspace"]')?.title.endsWith('deep-restored') && document.querySelector('.next-shell')?.dataset.sessionReady==='true'`,'deep restored workspace opened normally');
  const scope=(await ws({kind:'snapshot'})).path;
  const descriptors=await linked({op:'archived',workspace:scope,after:null});
  assert(descriptors.items.some(row=>row.id===target.id&&row.path===targetPath));
  assert.equal((await linked({op:'sources'})).length,0);
  await qualifyArchivedDialog({evaluate,cdp,wait,output,report});
  const rebind=(root,active,ids)=>linked({op:'rebindDescriptors',workspace:active,ids,path:root});
  await assert.rejects(rebind(bad,scope,[hub.id,target.id]),/different path or revision/i);
  assert.equal((await linked({op:'sources'})).length,0);
  assert.equal((await linked({op:'archived',workspace:scope,after:null})).items.length,3);
  const rebound=await rebind(external,scope,[hub.id,target.id]);
  await job('m26-deep-restored-index',{op:'indexLinked',source:rebound.id});
  await verifyLinks(hub.id,target.id);
  await verifyOrganization(target.id);
  assert.deepEqual((await ws({kind:'read',id:note.id})).content,reference);
  assertEvidence((await reviewList(scope,fixture.resource)).items.find(row=>row.id===owner.id));
  const original=await readFile(join(destination,'managed',file.id+'.bin'));
  assert.equal(original.length,32*1024*1024);
  assert(original.every(byte=>byte===65));

  const mergeDest=join(folder,'deep-merge');
  const mergeScope=(await ws({kind:'new',path:mergeDest})).path;
  const parked=await ws({kind:'createNote',title:'Destination draft',collection:null});
  await ws({kind:'draft',id:parked.id,baseRevision:parked.revision,token:'deep-draft',sequence:1,title:'Parked destination',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Keep this draft'}]}]}});
  const merge={op:'merge',source:path,manifestHash:preview.manifestHash};
  assert.equal((await job('m26-deep-merge',merge)).reused,false);
  const firstMerge=await ws({kind:'list',collection:null,limit:100});
  assert.equal((await job('m26-deep-merge-retry',merge)).reused,true);
  const mapped=(await linked({op:'archived',workspace:mergeScope,after:null})).items;
  const mappedHub=mapped.find(row=>row.path===hubPath), mappedTarget=mapped.find(row=>row.path===targetPath);
  assert.notEqual(mappedTarget.id,target.id);
  assert.equal((await linked({op:'sources'})).length,0);
  const merged=(await ws({kind:'list',collection:null,limit:100})).items;
  assert.deepEqual(merged.map(row=>row.id).sort(),firstMerge.items.map(row=>row.id).sort());
  const mappedNote=merged.find(row=>row.title==='Deep managed reference');
  assert.notEqual(mappedNote.id,note.id);
  assert.equal((await ws({kind:'read',id:mappedNote.id})).content.content[0].content[0].attrs.resourceId,mappedTarget.id);
  const mappedReview=(await reviewList(mergeScope,null)).items.find(row=>row.comment===review.comment);
  assertEvidence(mappedReview);
  assert.notEqual(mappedReview.id,owner.id);
  assert.notEqual(mappedReview.resourceId,fixture.resource);
  assert.equal((await ws({kind:'read',id:mappedReview.resourceId})).title,'M23 renamed fixture');
  assert.equal((await ws({kind:'readDraft',id:parked.id})).title,'Parked destination');
  const mappedFile=merged.find(row=>row.kind==='file'&&row.title==='managed.bin');
  assert.notEqual(mappedFile.id,file.id);
  assert.deepEqual(await readFile(join(mergeDest,'managed',mappedFile.id+'.bin')),original);
  const mergedGrant=await rebind(external,mergeScope,[mappedHub.id,mappedTarget.id]);
  await job('m26-deep-merged-index',{op:'indexLinked',source:mergedGrant.id});
  await verifyLinks(mappedHub.id,mappedTarget.id);
  await verifyOrganization(mappedTarget.id);
  await org({op:'trash',ids:[mappedReview.resourceId],restore:false});
  const unavailable=(await reviewList(mergeScope,mappedReview.resourceId)).items.find(row=>row.id===mappedReview.id);
  assert.equal(unavailable.availability,'trashed');
  assertEvidence(unavailable);
  await linked({op:'remove',source:mergedGrant.id});
  await assert.rejects(linked({op:'openId',id:mappedTarget.id.slice(7)}));
  assert.deepEqual(await readFile(join(external,hubPath)),Buffer.from(hubText));
  assert.deepEqual(await readFile(join(external,targetPath)),Buffer.from(targetText));
  assert.deepEqual(await readFile(join(external,base,'assets','chart.png')),png);
  report.deepPortability={manifestHash:preview.manifestHash,descriptors:preview.linkedDescriptors,reviewRows:preview.reviews,managedOriginalSha256:createHash('sha256').update(original).digest('hex')};
  report.checks.push('Deep archive preserved exact originals, rename identity, reference-style/encoded links and repeated backlinks, raster bytes, nested memberships, tags, pins, Review evidence for a trashed target and a parked destination draft. Atomic group rebinding refused a mismatch and succeeded after Restore and Merge. Revocation withdrew linked access. Merge replay reused its receipt and resource identities.');
}

async function qualifyArchivedDialog({evaluate,cdp,wait,output,report}) {
  const trigger='button[aria-label="Workspace transfers"]';
  const dialog='[role="dialog"][aria-modal="true"]';
  await wait(`document.querySelector('[data-session-ready="true"] ${trigger}')`,'workspace transfer controls ready');
  const key=async (name,code,virtual)=>{
    const event={key:name,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual};
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',...event});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',...event});
  };
  await wait(`(()=>{if([...document.querySelectorAll('button')].some(b=>b.textContent==='Locate archived linked references…'))return true;const trigger=document.querySelector(${JSON.stringify(trigger)});if(trigger&&!trigger.disabled&&trigger.getAttribute('aria-expanded')!=='true'){trigger.focus();trigger.click();}return false})()`,'archived references in transfer menu');
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Locate archived linked references…').click()`);
  await wait(`document.querySelectorAll('${dialog} input[type=checkbox]').length===3`,'three archived references visible');
  const {nodes}=await cdp('Accessibility.getFullAXTree');
  const dialogNode=nodes.find(node=>node.role?.value==='dialog'&&node.name?.value==='Archived linked references');
  assert(dialogNode);
  const indexed=new Map(nodes.map(node=>[node.nodeId,node]));
  const descendants=node=>(node.childIds??[]).flatMap(id=>{
    const child=indexed.get(id);
    return child?[child,...descendants(child)]:[];
  });
  assert.equal(descendants(dialogNode).filter(node=>node.role?.value==='checkbox'&&node.name?.value?.trim()).length,3);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('${dialog} button')).find(b=>b.textContent.startsWith('Locate source for selected')).disabled`),true);
  await evaluate(`document.querySelector('${dialog} input[type=checkbox]').focus()`);
  await key(' ','Space',32);
  assert.equal(await evaluate(`document.querySelector('${dialog} input[type=checkbox]').checked`),true);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('${dialog} button')).find(b=>b.textContent.startsWith('Locate source for selected')).disabled`),false);
  const image=await cdp('Page.captureScreenshot');
  await writeFile(join(output,'m26b-closure-archived-references.png'),Buffer.from(image.data,'base64'));
  await key('Escape','Escape',27);
  await wait(`!document.querySelector('${dialog}') && document.activeElement?.matches(${JSON.stringify(trigger)})`,'Escape restores focus to workspace transfers');
  report.checks.push('Archived linked references dialog has a named AX dialog and three named checkboxes; Space enables the batch action; Escape restores focus to workspace transfers');
}
