import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir,stat} from 'node:fs/promises';
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
  const note='Unicode café stays readable.\n\n[Read data](asset.bin)\n\n1. First\n2. Second\n';
  const asset=Buffer.from([0,7,42,255,3]);
  await writeFile(join(nested,'Summary.md'), '# Imported summary\n\n'+note);
  await writeFile(join(nested,'asset.bin'),asset);
  const single=join(folder,'Separate.txt');
  await writeFile(single,'An independently selected source file.');
  for(let i=0;i<100;i++)await writeFile(join(nested,'Document '+i+'.txt'),'Managed content '.repeat(64));
  const block=Buffer.alloc(32*1048576,173);
  const payloadHash=createHash('sha256').update(block).digest('hex');
  for(let i=0;i<8;i++)await writeFile(join(large,'Large '+i+'.bin'),block);
  report.dataset='103 small mixed files and eight 32 MiB managed files';
  report.transferFixture={smallFiles:103,nestedTextFiles:100,largeFiles:8,largeFileBytes:block.length,hash:payloadHash,collections:['Library input','Nested','Large']};
  report.transferRecipe={sha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')};
  const mixed=await importSource('nested-mixed-import',[join(folder,'Library input'),single],'100 small text files, Markdown with relative attachment, binary and independent text file.');
  assert.equal(mixed.result.imported,103);
  const repeated=await importSource('repeat-import',[join(folder,'Library input'),single],'Exact source paths and bytes from the preceding import.');
  assert.equal(repeated.result.reused,103);
  const searchSummary=()=>workspace({kind:'search',options:{query:'Summary',content:false,collection:null,order:'title',view:'library'},limit:30});
  const summaryPage=await searchSummary();
  const summary=summaryPage.items.find(item=>item.title==='Summary.md');
  assert(summary,'Imported summary must appear in search');
  const saved=await workspace({kind:'read',id:summary.id});
  const found=JSON.stringify(saved.content).match(/"resourceId":"([a-f0-9-]{36})"/);
  assert(found,'Relative Markdown link must resolve to managed attachment');
  const assetId=found[1];
  const largeReview=await preview([large]);
  assert.equal(largeReview.files,8);

  const editorSelector='document.querySelector(".tiptap[contenteditable=true]")';
  const row='document.querySelector('+JSON.stringify('[data-row-open="'+summary.id+'"]')+')';
  // Search by visible title through the mounted search bar to reach the last page without loading prior editors.
  await evaluate("document.querySelector('.library-filters input').focus();true");
  await cdp('Input.insertText',{text:'Summary'});
  await wait(row,'imported resource selected by Library search');
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
  await wait("document.querySelector('[role=status][aria-label=saved]') || [...document.querySelectorAll('[role=status]')].some(e=>e.textContent==='saved')",'managed edit saved before export');

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
  const full=join(folder,'Full.vaultor');
  const subset=join(folder,'Selected.vaultor');
  await submit('full-archive',{op:'archive',destination:full},'All committed resources including 256 MiB of originals.');
  await submit('selected-archive',{op:'archiveSelection',ids:[summary.id],collection:null,destination:subset},'One note plus its managed attachment.');
  const verifiedAt=performance.now();
  const inspected=await transfer({op:'inspectArchive',source:full});
  record('m22-archive-inspect',1,'integrity_preview',performance.now()-verifiedAt,'ms','Verification streams the complete archive.');
  const restored=join(folder,'Restored');
  await submit('archive-restore',{op:'restore',source:full,destination:restored,manifestHash:inspected.manifestHash},'Restore as new, including database integrity check.');
  assert.equal((await readdir(join(restored,'managed'))).length,111);
  const partial=await transfer({op:'inspectArchive',source:subset});
  assert(partial.partial&&partial.resources===2);
  const merge=()=>({op:'merge',source:subset,manifestHash:partial.manifestHash});
  const merged=await submit('archive-merge',merge(),'Selected note and managed attachment.');
  assert.equal(merged.resources,2);
  assert.equal((await submit('archive-merge-repeat',merge(),'Exact digest repeat.')).reused,true);
  const notes=(await searchSummary()).items;
  const added=notes.find(item=>item.id!==summary.id);
  assert(added);
  const remapped=JSON.stringify((await workspace({kind:'read',id:added.id})).content).match(/"resourceId":"([a-f0-9-]{36})"/)[1];
  assert.notEqual(remapped,assetId);
  assert((await readFile(join(folder,'workspace','managed',remapped+'.bin'))).equals(asset));

  const newFiles=join(folder,'Interrupted');
  await mkdir(newFiles);
  for(let i=0;i<8;i++)await writeFile(join(newFiles,'Interrupt '+i+'.bin'),block);
  const input=await preview([newFiles]);
  const {id:interrupted}=await transfer({op:'import',token:input.token,separate:false});
  const restartedAt=performance.now();
  await restart();
  const task=(await transfer({op:'tasks'})).find(task=>task.id===interrupted);
  assert(task?.state==='interrupted'||task?.state==='completed',JSON.stringify(task));
  const retry=await importSource('interrupted-reselection',[newFiles],'Reselect 256 MiB after terminating the owned process and restarting.');
  assert.equal(retry.result.imported+retry.result.reused,8);
  assert.equal(task.state,'interrupted','Termination must overlap import to qualify recovery');
  record('m22-interrupted-recovery',1,'restart_to_retry_complete',performance.now()-restartedAt,'ms','Termination, restart, source review and completion.');
  await sleep(2000);
  report.checks.push('Mixed selection, nested imports, source reuse, relative reference conversion, raw file hash, all offered managed export containers, graph and archive verification, restore as new, transactional remapping, idempotent merge, interrupted task reconciliation.');
}
