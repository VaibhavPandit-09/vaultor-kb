import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir,rename,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

export async function qualifyTransfers({evaluate,cdp,wait,report,folder,record,restart}){
  const transfer=request=>evaluate("window.__TAURI_INTERNALS__.invoke('transfer',{request:"+JSON.stringify(request)+"})");
  const workspace=request=>evaluate("window.benchRequest("+JSON.stringify(request)+")");
  const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
  const finish=async id=>{
    for(let i=0;i<2400;i++){
      const task=(await transfer({op:'tasks'})).find(task=>task.id===id);
      if(task?.finished)return task;
      await sleep(25);
    }
    throw Error('Transfer did not finish');
  };
  const submit=async(scenario,request,notes='',expected='completed')=>{
    const start=performance.now();
    const {id}=await transfer(request);
    const result=await finish(id);
    assert.equal(result.state,expected,JSON.stringify(result));
    record('m22-'+scenario,1,'command_to_receipt',performance.now()-start,'ms',notes+' Invoke to terminal receipt with 25 ms polling.');
    record('m22-'+scenario,1,'task_execution',result.finished-result.started,'ms',notes+' Rust task start to terminal timestamp.');
    return result.result;
  };
  const preview=(paths,recursive=true)=>transfer({op:'preview',paths,folder:recursive,collection:null});
  const importSource=async(scenario,paths,notes)=>{
    const start=performance.now();
    const review=await preview(paths);
    record('m22-'+scenario,1,'review_discovery',performance.now()-start,'ms',notes+' Discovery and source hashing.');
    return {review,result:await submit(scenario,{op:'import',token:review.token,separate:false},notes)};
  };
  const nested=join(folder,'Library input','Nested');
  const large=join(folder,'Large');
  await mkdir(nested,{recursive:true});
  await mkdir(large);
  const note='Unicode café stays readable.\n\n[Read data](asset.bin)\n\n![Reviewed image](pixel.png)\n\n1. First\n2. Second\n';
  const asset=Buffer.from([0,7,42,255,3]);
  await writeFile(join(nested,'Summary.md'), '# Imported summary\n\n'+note);
  await writeFile(join(nested,'asset.bin'),asset);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64');
  await writeFile(join(nested,'pixel.png'),png);
  const single=join(folder,'Separate.txt');
  await writeFile(single,'An independently selected source file.');
  for(let i=0;i<100;i++)await writeFile(join(nested,'Document '+i+'.txt'),'Managed content '.repeat(64));
  const block=Buffer.alloc(32*1048576,173);
  const payloadHash=createHash('sha256').update(block).digest('hex');
  for(let i=0;i<8;i++)await writeFile(join(large,'Large '+i+'.bin'),block);
  report.dataset='104 small mixed files and eight 32 MiB managed files';
  report.transferFixture={smallFiles:104,nestedTextFiles:100,largeFiles:8,largeFileBytes:block.length,hash:payloadHash,collections:['Library input','Nested','Large']};
  report.transferRecipe={sha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')};
  const mixed=await importSource('nested-mixed-import',[join(folder,'Library input'),single],'100 small text files, Markdown with relative attachment, binary and independent text file.');
  assert.equal(mixed.result.imported,104);
  const repeated=await importSource('repeat-import',[join(folder,'Library input'),single],'Exact source paths and bytes from the preceding import.');
  assert.equal(repeated.result.reused,104);
  const searchSummary=()=>workspace({kind:'search',options:{query:'Summary',content:false,collection:null,order:'title',view:'library'},limit:30});
  const summaryPage=await searchSummary();
  const summary=summaryPage.items.find(item=>item.title==='Summary.md');
  assert(summary,'Imported summary must appear in search');
  const saved=await workspace({kind:'read',id:summary.id});
  const found=JSON.stringify(saved.content).match(/"resourceId":"([a-f0-9-]{36})"/);
  assert(found,'Relative Markdown link must resolve to managed attachment');
  const assetId=found[1];
  assert(saved.content.content.some(node=>node.type==='image'&&node.attrs.alt==='Reviewed image'),'Relative raster image must resolve to a managed image');
  const largeReview=await preview([large]);
  assert.equal(largeReview.files,8);

  const editorSelector='document.querySelector(".tiptap[contenteditable=true]")';
  const row='document.querySelector('+JSON.stringify('[data-row-open="'+summary.id+'"]')+')';
  // Search by visible title through the mounted search bar to reach the last page without loading prior editors.
  await evaluate("document.querySelector('.library-filters input').focus();true");
  await cdp('Input.insertText',{text:'Summary'});
  await wait(row+" && document.querySelector('[aria-label=Notes]')?.getAttribute('aria-busy')==='false'",'settled Library search for the imported note');
  await evaluate(row+'.click();true');
  await wait(editorSelector,'visible managed editor');
  const start=Date.now();
  const pending=submit('large-import',{op:'import',token:largeReview.token,separate:false},'Eight 32 MiB originals.');
  await evaluate("document.querySelector('.tiptap').focus();true");
  for(let i=0;i<3;i++){
    await evaluate("window.m22Frame=new Promise(resolve=>document.querySelector('.tiptap').addEventListener('beforeinput',()=>{const start=performance.now();requestAnimationFrame(()=>resolve(performance.now()-start));},{once:true}));true");
    await cdp('Input.insertText',{text:' M22'});
    const elapsed=await evaluate('window.m22Frame');
    const overlapping=(await transfer({op:'tasks'})).some(task=>task.kind==='file-import'&&task.state==='running');
    record('m22-editor-during-import',i+1,'input_to_animation_frame',elapsed,'ms',overlapping?'Import still running after animation frame.':'No overlap proven.');
  }
  const imported=await pending;
  report.largeWindow={start,end:Date.now()};
  assert.equal(imported.imported,8);
  record('m22-large-import',1,'bytes',8*block.length,'bytes');
  await wait("document.querySelector('[data-save-status=saved]')",'managed edit saved before export');

  for(const [format,ids,extension] of [
    ['original',[assetId],'.bin'],['markdown',[summary.id],'.md'],['pdf',[summary.id],'.pdf'],['docx',[summary.id],'.docx'],
    ['markdownZip',[summary.id],'.zip'],['graph',[summary.id,assetId],'.json'],
  ]){
    const destination=join(folder,'Export '+format);
    await submit('export-'+format,{op:'export',ids,destination,format},'Independent output folder.');
    const filenames=await readdir(destination);
    assert.equal(filenames.length,1);
    assert(filenames[0].endsWith(extension));
    const file=join(destination,filenames[0]);
    assert((await stat(file)).size>0);
    const data=await readFile(file);
    if(format==='original')assert(data.equals(asset));
    if(format==='pdf')assert.equal(data.subarray(0,5).toString(),'%PDF-');
    if(format==='docx'||format==='markdownZip')assert.equal(data.subarray(0,2).toString(),'PK');
    if(format==='graph')assert(JSON.parse(data).relationships.some(edge=>edge.target===assetId));
  }
  const linkedDir=join(folder,'authorized linked fixture');
  await mkdir(linkedDir);
  const linkedPath=join(linkedDir,'External.md');
  const linkedText='# External file\r\n\r\nOriginal source bytes.\r\n';
  await writeFile(linkedPath,linkedText);
  const linked=request=>workspace({kind:'linked',request});
  const source=await linked({op:'register',path:linkedDir});
  const external=await linked({op:'open',source:source.id,path:'External.md'});
  const linkedOut=join(folder,'Linked Markdown copy');
  await submit('linked-markdown-export',{op:'export',ids:[external.id],destination:linkedOut,format:'original'},'Granted current external Markdown; original untouched.');
  assert.equal(await readFile(join(linkedOut,(await readdir(linkedOut))[0]),'utf8'),linkedText);
  assert.equal(await readFile(linkedPath,'utf8'),linkedText);

  const full=join(folder,'Full.vaultor');
  const subset=join(folder,'Selected.vaultor');
  await submit('full-archive',{op:'archive',destination:full},'All committed resources including 256 MiB of originals and an inactive linked descriptor.');
  await submit('selected-archive',{op:'archiveSelection',ids:[summary.id],collection:null,destination:subset},'One note plus its managed attachment and image.');
  const verifiedAt=performance.now();
  const inspected=await transfer({op:'inspectArchive',source:full});
  record('m22-archive-inspect',1,'integrity_preview',performance.now()-verifiedAt,'ms','Verification streams the complete archive.');
  assert.equal(inspected.linkedDescriptors,1);
  const fileHandle=await (await import('node:fs/promises')).open(full,'r');
  try{
    const header=Buffer.alloc(48);
    await fileHandle.read(header);
    const metadata=Buffer.alloc(Number(header.readBigUInt64LE(8)));
    await fileHandle.read(metadata);
    const descriptors=JSON.parse(metadata).linked;
    assert.equal(descriptors[0].path,'External.md');
    assert(!metadata.toString().includes('authorized linked fixture'));
    assert(!metadata.toString().includes('Original source bytes.'));
  }finally{await fileHandle.close();}
  const restored=join(folder,'Restored');
  await submit('archive-restore',{op:'restore',source:full,destination:restored,manifestHash:inspected.manifestHash},'Restore as new, including database integrity check.');
  assert.equal((await readdir(join(restored,'managed'))).length,112);
  const partial=await transfer({op:'inspectArchive',source:subset});
  assert(partial.partial&&partial.resources===3);
  const merge=()=>({op:'merge',source:subset,manifestHash:partial.manifestHash});
  const merged=await submit('archive-merge',merge(),'Selected note and two dependencies.');
  assert.equal(merged.resources,3);
  assert.equal((await submit('archive-merge-repeat',merge(),'Exact digest repeat.')).reused,true);
  const notes=(await searchSummary()).items;
  const added=notes.find(item=>item.id!==summary.id);
  assert(added);
  const remapped=JSON.stringify((await workspace({kind:'read',id:added.id})).content).match(/"resourceId":"([a-f0-9-]{36})"/)[1];
  assert.notEqual(remapped,assetId);
  assert((await readFile(join(folder,'workspace','managed',remapped+'.bin'))).equals(asset));

  const latest=await workspace({kind:'read',id:summary.id});
  const draft={kind:'draft',id:summary.id,title:latest.title,baseRevision:latest.revision,token:'disposable-benchmark',sequence:1,
    content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Protected copy content'}]}]}};
  await workspace(draft);
  const recoveryPath=join(folder,'Recovery.json');
  await submit('protected-draft-export',{op:'exportRecovery',id:summary.id,linked:false,destination:recoveryPath},'Protected managed draft copy keeps saved and protected revisions unchanged.');
  assert.deepEqual(JSON.parse(await readFile(recoveryPath,'utf8')).document,draft.content);
  assert.deepEqual((await workspace({kind:'readDraft',id:summary.id})).content,draft.content);
  assert.equal((await workspace({kind:'read',id:summary.id})).revision,latest.revision);

  await linked({op:'protect',id:external.documentId,revision:external.revision,base:external.base,
    content:{type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:'External file'}]},
      {type:'paragraph',content:[{type:'text',text:'Protected linked wording.'}]}]},
    token:'linked-protected-copy',sequence:1});
  const linkedRecovery=join(folder,'Linked recovery.json');
  await submit('linked-draft-export',{op:'exportRecovery',id:external.id,linked:true,destination:linkedRecovery},'Authorized review copies the stored draft and baseline.');
  const recovery=JSON.parse(await readFile(linkedRecovery,'utf8'));
  assert(recovery.draftMarkdown.includes('Protected linked wording.'));
  assert.equal(recovery.baseMarkdown,linkedText);
  assert.equal(await readFile(linkedPath,'utf8'),linkedText);

  // Repeat with a different path and then changed source bytes. Earlier resources stay intact.
  const replacement=join(folder,'Another input','Separate.txt');
  await mkdir(join(folder,'Another input'));
  await writeFile(replacement,await readFile(single));
  const distinct=await importSource('distinct-source',[replacement],'Same name and bytes from a different source path.');
  assert.equal(distinct.result.imported,1);
  await writeFile(replacement,'New version and unchanged destination.');
  assert.equal((await importSource('changed-source',[replacement],'Same source path with different bytes.')).result.imported,1);

  const newFiles=join(folder,'Interrupted');
  await mkdir(newFiles);
  // Leave enough work for taskkill to reach the running Rust task on fast disks.
  const interruptionBlock=process.argv.includes('--m26b')?Buffer.alloc(256*1048576,173):block;
  for(let i=0;i<8;i++)await writeFile(join(newFiles,'Interrupt '+i+'.bin'),interruptionBlock);
  const cancellation=await preview([newFiles]);
  const {id:cancelled}=await transfer({op:'import',token:cancellation.token,separate:false});
  await transfer({op:'cancel',id:cancelled});
  assert.equal((await finish(cancelled)).state,'cancelled');
  const input=await preview([newFiles]);
  const {id:interrupted}=await transfer({op:'import',token:input.token,separate:false});
  const restartedAt=performance.now();
  await restart();
  const task=(await transfer({op:'tasks'})).find(task=>task.id===interrupted);
  assert(task?.state==='interrupted'||task?.state==='completed',JSON.stringify(task));
  const retry=await importSource('interrupted-reselection',[newFiles],`Reselect ${8*interruptionBlock.length/1048576} MiB after terminating the owned process and restarting.`);
  assert.equal(retry.result.imported+retry.result.reused,8);
  assert.equal(task.state,'interrupted','Termination must overlap import to qualify recovery');
  record('m22-interrupted-recovery',1,'restart_to_retry_complete',performance.now()-restartedAt,'ms','Termination, restart, source review and completion.');
  if (process.argv.includes('--m26-export-fidelity')) {
    const originalSource = await readFile(new URL('../../backend/src/test/java/com/vaultor/vaultor/NoteRendererTests.java',import.meta.url),'utf8');
    const json = originalSource.split('mapper.readTree("""')[1].split('""");')[0].replaceAll('\\\\n','\\n');
    const content = JSON.parse(json);
    const imagePath = join(folder,'Original renderer image.png');
    const originalImage = await readFile(new URL('../../backend/target/note-export-review/assets/image.png',import.meta.url));
    await writeFile(imagePath,originalImage);
    await importSource('original-fixture-image',[imagePath],'Exact original renderer fixture image.');
    const foundImage = await workspace({kind:'search',options:{query:'Original renderer image.png',content:false,collection:null,order:'title'},limit:30});
    const image = foundImage.items.find(item=>item.title==='Original renderer image.png');
    assert(image);
    content.content.find(node=>node.type==='image').attrs.resourceId=image.id;
    content.content.find(node=>node.content?.[0]?.type==='resourceLink').content[0].attrs.resourceId='8f385db0-7aec-4e3a-b30f-5e28dd0d144a';
    const fixture = await workspace({kind:'createNote',title:'Original renderer comparison',collection:null});
    await workspace({kind:'save',id:fixture.id,revision:fixture.revision,title:fixture.title,content});
    for (const format of ['markdown','markdownZip','docx','pdf']) {
      const destination=join(folder,'Original renderer '+format);
      await submit('original-fixture-'+format,{op:'export',ids:[fixture.id],destination,format},
        'Structured fixture from the original Java renderer test.');
    }
    report.checks.push('Original rich renderer fixture imported with its PNG and exported to Markdown, Markdown ZIP, DOCX and Unicode text-layout PDF.');
    const unsupported = await workspace({kind:'createNote',title:'Missing glyph fixture',collection:null});
    await workspace({kind:'save',id:unsupported.id,revision:unsupported.revision,title:unsupported.title,
      content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Unmapped glyph 🛸'}]}]}});
    const failed = join(folder,'Missing glyph PDF');
    await submit('pdf-glyph-refusal',{op:'export',ids:[unsupported.id],destination:failed,format:'pdf'},
      'An unsupported glyph must refuse publication.', 'failed');
    await assert.rejects(stat(failed),{code:'ENOENT'});
  }
  if (process.argv.includes('--m26a2-legacy')) {
    const archive = join(folder,'Electron original v5.zip');
    await writeFile(archive,await readFile(new URL('../../next/src-tauri/fixtures/electron-workspace-v5.zip',import.meta.url)));
    const receipt = await transfer({op:'inspectArchive',source:archive});
    assert.equal(receipt.legacyVersion,5);
    const manifestHash = receipt.manifestHash;
    const restored = join(folder,'Restored original v5');
    await submit('electron-v5-restore',{op:'restore',source:archive,destination:restored,manifestHash});
    const [id] = await readdir(join(restored,'managed'));
    assert.equal(await readFile(join(restored,'managed',id),'utf8'),'unchanged-original');
    const request = {op:'merge',source:archive,manifestHash};
    assert.equal((await submit('electron-v5-merge',request)).reused,false);
    assert.equal((await submit('electron-v5-replay',request)).reused,true);
    const database=join(restored,'workspace.sqlite3');
    const preserved=join(restored,'preserved.sqlite3');
    await rename(database,preserved);
    try {
      await assert.rejects(workspace({kind:'open',path:restored}),/workspace database is missing or unsafe/i);
      await assert.rejects(stat(database),{code:'ENOENT'});
    } finally {
      await rename(preserved,database);
    }
    report.checks.push('Original Java workspace ZIP v5 passed native Next inspection, restore, exact-byte readback, merge and repeat.');
    report.checks.push('Native workspace open refused a marked legacy-restored workspace with its SQLite database temporarily absent.');
  }
  await sleep(2000);
  report.checks.push('Mixed selection, nested imports, source reuse, relative reference and image conversion, raw file preservation, managed export containers, graph and archive verification, linked descriptors and original bytes, restore as new, transactional remapping, idempotent merge, recovery-copy preservation and interrupted task reconciliation.');
}

export async function measureLargeTransfer({evaluate,report,folder,record}){
  const command=request=>evaluate("window.__TAURI_INTERNALS__.invoke('transfer',{request:"+JSON.stringify(request)+"})");
  const bytes=128*1048576;
  const buffer=Buffer.alloc(bytes,141);
  const source=join(folder,'Sustained import input');
  await mkdir(source);
  for(let i=0;i<8;i++)await writeFile(join(source,'Block '+i+'.bin'),buffer);
  report.dataset='Eight 128 MiB managed originals for process sampling';
  report.transferFixture={files:8,fileBytes:bytes,totalBytes:8*bytes};
  report.transferRecipe={sha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')};
  const discovery=performance.now();
  const review=await command({op:'preview',paths:[source],folder:true,collection:null});
  record('m22-sustained-import',1,'review_discovery',performance.now()-discovery,'ms','Discover eight files and read their source digests.');
  assert.equal(review.bytes,8*bytes);
  const start=Date.now();
  const requested=performance.now();
  const {id}=await command({op:'import',token:review.token,separate:false});
  let receipt;
  for(let i=0;i<2400;i++){
    receipt=(await command({op:'tasks'})).find(row=>row.id===id);
    if(receipt?.finished)break;
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  report.largeWindow={start,end:Date.now()};
  assert.equal(receipt?.state,'completed',JSON.stringify(receipt));
  assert.equal(receipt.result.imported,8);
  record('m22-sustained-import',1,'command_to_receipt',performance.now()-requested,'ms','Eight 128 MiB originals, with 25 ms receipt polling.');
  record('m22-sustained-import',1,'task_execution',receipt.finished-receipt.started,'ms','Rust task interval.');
  await new Promise(resolve=>setTimeout(resolve,2000));
  report.checks.push('Imported one GiB of disposable originals before sampling settled application memory.');
}
