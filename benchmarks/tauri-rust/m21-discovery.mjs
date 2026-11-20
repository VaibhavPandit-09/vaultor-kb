import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function qualifyDiscovery({evaluate,cdp,wait,report,folder,record,restart,processSnapshot}){
  const invocation=(command,request)=>evaluate("window.__TAURI_INTERNALS__.invoke("+JSON.stringify(command)+",{request:"+JSON.stringify(request)+"})");
  const api=request=>invocation('workspace',request);
  const linked=request=>api({kind:'linked',request});
  const media=request=>api({kind:'media',request});
  const organization=request=>api({kind:'organization',request});
  const transfer=request=>invocation('transfer',request);
  const clock=async(scenario,operation,notes,iteration=1)=>{
    const start=performance.now();
    const result=await operation();
    record('m21-'+scenario,iteration,'elapsed',performance.now()-start,'ms',notes);
    return result;
  };
  const search=(query,options={})=>api({kind:'search',options:{query,content:true,collection:null,order:'title',view:'library',...options},limit:30});
  async function until(operation,predicate,label,timeout=45_000){
    const start=performance.now();
    while(performance.now()-start<timeout){
      const result=await operation();
      if(predicate(result))return result;
      await pause(30);
    }
    throw Error('Timed out: '+label);
  }
  const click=async(selector)=>{
    const expression='document.querySelector('+JSON.stringify(selector)+')';
    await wait(expression+'?.getClientRects().length',selector);
    await evaluate(expression+'.click();true');
  };
  const button=async(label)=>{
    const expression='[...document.querySelectorAll("button")].find(b=>!b.disabled&&!b.closest("[hidden]")&&b.getClientRects().length&&(b.getAttribute("aria-label")==='+JSON.stringify(label)+'||b.textContent.trim()==='+JSON.stringify(label)+'))';
    await wait(expression,label);await evaluate(expression+'.click();true');
  };
  const awaitTask=(kind,id)=>until(()=>transfer({op:'tasks'}),rows=>rows.some(row=>row.kind===kind&&(!id||row.id===id)&&row.finished),kind)
    .then(rows=>{const result=rows.find(row=>row.kind===kind&&(!id||row.id===id)&&row.finished);assert.equal(result.state,'completed',result.error);return result;});
  const sourcePath=join(folder,'m21-source');
  const file=join(sourcePath,'Entry.md');
  await mkdir(join(sourcePath,'Nested'),{recursive:true});await mkdir(join(sourcePath,'Corpus'));
  const markdown='# Entry\r\n\r\nCinnabar corpus [other](Nested/Target.md).\r\n';
  const heading='# Large\r\n\r\n';
  const paragraph='Boundary-preserving paragraph. '.repeat(48)+'\r\n\r\n';
  const large=heading+paragraph.repeat(690);
  assert(Buffer.byteLength(large)>1000*1024&&Buffer.byteLength(large)<=1024*1024);
  const ordinary=n=>'# Document '+n+'\n\nCorpus body '+n+' '+'ordinary search words '.repeat(22)+'\n';
  const corpus=2048;
  await Promise.all([writeFile(file,markdown),writeFile(join(sourcePath,'Nested','Target.md'),'# Target\n'),writeFile(join(sourcePath,'Large.md'),large)]);
  const seed=createHash('sha256').update(markdown).update(large);
  for(let i=0;i<corpus;i+=64){
    const indices=Array.from({length:Math.min(64,corpus-i)},(_,offset)=>i+offset);
    await Promise.all(indices.map(n=>writeFile(join(sourcePath,'Corpus','Doc '+n+'.md'),ordinary(n))));
    for(const n of indices)seed.update(ordinary(n));
  }
  report.fixture={markdownFiles:corpus+3,largeBytes:Buffer.byteLength(large),ordinaryDocumentBytes:Buffer.byteLength(ordinary(0)),directoryEntries:corpus};
  report.dataset=seed.digest('hex');
  const beforeIndex=Date.now();
  const source=await clock('initial-index',async()=>{
    const result=await linked({op:'register',path:sourcePath});
    const task=await awaitTask('linked-index');
    assert.equal(task.result.discovered,corpus+3);
    return result.id;
  },'Register to automatic Activity completion. 2,051 Markdown files. Polls every 30 ms.');
  report.indexWindow={start:beforeIndex,end:Date.now()};
  const scoped={view:'source:'+source};
  const linkedId=(await search('cinnabar',scoped)).items[0].id;
  const created=join(sourcePath,'New.md');
  const update=async(scenario,action,word,expected)=>{
    const result=await clock(scenario,async()=>{
      await action();
      return until(()=>search(word,scoped),row=>expected?row.items.some(item=>item.id===expected):row.total===1,word);
    },'Filesystem call through committed Rust search result, including native delivery, coalescing, extraction and 30 ms test polling.');
    return result.items[0];
  };
  await update('create',()=>writeFile(created,'# Creation\n\nAmberfind\n'),'amberfind');
  const changed=await update('edit',()=>writeFile(file,markdown.replace('Cinnabar','Vermilion')),'vermilion',linkedId);
  assert.equal(changed.id,linkedId);
  assert.equal((await search('cinnabar',scoped)).total,0);
  const moved=join(sourcePath,'Moved.md');
  await update('rename',()=>rename(file,moved),'moved',linkedId);
  const previousTasks=new Set((await transfer({op:'tasks'})).map(row=>row.id));
  const folderRenameAt=performance.now();
  await clock('folder-rename',async()=>{
    await rename(join(sourcePath,'Nested'),join(sourcePath,'Moved folder'));
    await until(()=>search('target',scoped),row=>row.items.some(item=>item.sourcePath==='Moved folder/Target.md'),'folder rename');
  },'First searchable new relative path. The bounded Activity scan can still be running.');
  const folderReceipt=await until(()=>transfer({op:'tasks'}),rows=>rows.some(row=>row.kind==='linked-index'&&!previousTasks.has(row.id)&&row.finished),'folder scan completion');
  const folderTask=folderReceipt.find(row=>row.kind==='linked-index'&&!previousTasks.has(row.id)&&row.finished);
  assert.equal(folderTask.state,'completed',folderTask.error);
  record('m21-folder-scan-complete',1,'elapsed',performance.now()-folderRenameAt,'ms','Folder rename to completed Activity receipt for the full source.');
  const replacement=await update('replacement',()=>writeFile(file,'# Replacement\n\nreplacementword\n'),'replacementword');
  assert.notEqual(replacement.id,linkedId);
  await clock('burst',async()=>{
    await Promise.all(Array.from({length:24},(_,i)=>writeFile(join(sourcePath,'Burst '+i+'.md'),'# Burst\n\nburstkeyword\n')));
    await until(()=>search('burstkeyword',scoped),row=>row.total===24,'burst results');
  },'24 distinct new files, same source, 30 ms receipt polling.');
  await clock('delete',async()=>{
    await (await import('node:fs/promises')).unlink(created);
    await until(()=>search('amberfind',scoped),row=>row.total===0,'deleted search hit');
  },'External deletion to search withdrawal, including polling.');
  await update('refresh-relative',()=>writeFile(moved,markdown.replace('Cinnabar','Vermilion').replace('Nested/Target.md','Moved%20folder/Target.md')+'\r\nrelativecheck\r\n'),'relativecheck',linkedId);
  const nextTarget=(await linked({op:'follow',id:linkedId.slice(7),href:'Moved%20folder/Target.md'})).id;
  const note=await api({kind:'createNote',title:'Discovery note',collection:null});
  await api({kind:'save',id:note.id,revision:1,title:note.title,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Vermilion managed fixture'},{type:'resourceLink',attrs:{resourceId:linkedId,label:'External target'}}]}]}});
  const collection=(await api({kind:'createCollection',name:'Discovery collection',parentId:null})).id;
  const tags=[];
  for(const name of ['Discovery first','Discovery second']){
    const tag=(await organization({op:'tag',id:null,name,color:'#525940'})).id;
    await organization({op:'tagging',ids:[linkedId,note.id],tag,add:true});
    tags.push(tag);
  }
  await api({kind:'bulkMembership',ids:[linkedId,note.id],add:collection,remove:null});
  for(let sample=1;sample<=5;sample++){
    const global=await clock('global-search',()=>search('vermilion',{order:'match'}),'One managed and one linked FTS5 match with plain snippets.',sample);
    assert.equal(global.total,2);assert(global.items.every(hit=>hit.searchSnippet.highlights.length));
    const combined=await clock('combined-search',()=>search('vermilion',{collection,tags,anyTag:false}),'Collection and two required tags applied before paging.',sample);
    assert.equal(combined.total,2);
  }
  const managedPath=join(folder,'managed-table.csv');
  await writeFile(managedPath,'Name,Reason\nFixture,persimmon\n');
  const plan=await transfer({op:'preview',paths:[managedPath],folder:false,collection:null});
  const imported=await transfer({op:'import',token:plan.token,separate:false});
  await awaitTask('file-import',imported.id);
  assert.equal((await search('persimmon')).items[0].title,'managed-table.csv');
  const rebuilt=await transfer({op:'rebuildFileText'});
  await awaitTask('managed-text-index',rebuilt.id);
  assert.equal((await search('persimmon')).total,1);
  const references=await clock('backlinks',()=>media({op:'references',id:linkedId,direction:'incoming',page:0}),'Rust saved reference receipt across managed and linked identities.');
  assert(references.items.some(item=>item.id===note.id));
  assert.equal((await media({op:'references',id:nextTarget,direction:'incoming'})).items[0].id,linkedId);
  report.checks.push('Automatic create, edit, file rename, folder rename and burst convergence; managed UTF-8 and linked search, combined tags, rebuild and unified backlinks.');

  await cdp('Page.reload');
  await wait('document.querySelector("[data-session-ready=true]")','workspace after reload');
  await button('Commands');
  await button('Resources · saved titles');
  await clock('palette',async()=>{
    await cdp('Input.insertText',{text:'Discovery'});
    await wait('[...document.querySelectorAll("[role=option]")].some(row=>row.textContent.includes("Discovery collection"))','collection palette result');
  },'Native WebView2 insertion to collection discovery option, including debounce.');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  const row='[data-row-open="'+note.id+'"]';
  await wait('document.querySelector('+JSON.stringify(row)+')?.getClientRects().length','managed reference source row');
  await evaluate('document.querySelector('+JSON.stringify(row)+').dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:460,clientY:410}));true');
  await clock('relationship-dialog',async()=>{
    await button('Used in / links…');
    await button('Links to');
    await wait('document.querySelector(".reference-view")?.innerText.includes("Explore links for Moved.md")','managed outgoing relationship');
  },'Original references dialog open, switch direction and show linked destination.');
  await button('Explore links for Moved.md');
  await wait('document.querySelector("[role=dialog]")?.textContent.includes("Back through links")','focused relationship exploration');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  await wait('!document.querySelector(".reference-view")','dismissed reference dialog');
  await button('Linked sources');
  await click('[data-browser=sources] [data-linked-source="'+source+'"]');
  await click('[data-browser=sources] button[title$="Moved folder"]');
  await wait('!!document.querySelector('+JSON.stringify('[data-browser=sources] [data-linked-path="Moved folder/Target.md"]')+')','expanded nested source');
  await pause(1100);
  await restart();
  await wait('document.querySelector("[data-session-ready=true]")','restored workspace');
  await wait('!!document.querySelector('+JSON.stringify('[data-browser=sources] [data-linked-path="Moved folder/Target.md"]')+')','nested expansion restored');
  await clock('open-large',async()=>{
    await click('[data-browser=sources] [data-linked-path="Large.md"]');
    await wait('document.querySelector(".next-linked-pane .tiptap")?.contentEditable==="true"','near 1 MiB editable view');
  },'Source row to editable standard linked pane, with 50 ms polling.');
  await evaluate('(()=>{const editor=document.querySelector(".next-linked-pane .tiptap").editor;editor.view.focus();editor.commands.setTextSelection(2);})()');
  for(let i=1;i<=5;i++){
    await evaluate('(()=>{const e=document.querySelector(".next-linked-pane .tiptap");window.inputSample=new Promise(resolve=>{e.addEventListener("beforeinput",()=>requestAnimationFrame(()=>resolve(performance.now()-window.inputStart)),{once:true});setTimeout(()=>resolve(null),3500);});window.inputStart=performance.now();})()');
    await cdp('Input.insertText',{text:'x'});
    const value=await evaluate('window.inputSample');assert.equal(typeof value,'number');
    record('m21-large-typing',i,'input_to_raf',value,'ms','CDP input to animation frame on near 1 MiB CRLF prose.');
  }
  const history=async(command,expected)=>{
    assert(await evaluate('document.querySelector(".next-linked-pane .tiptap").editor.commands.'+command+'()'));
    assert((await evaluate('document.querySelector(".next-linked-pane .tiptap h1").textContent')).startsWith(expected));
  };
  await clock('large-undo',()=>history('undo','Large'),'Loaded editor Undo with one visible linked pane.');
  await clock('large-redo',()=>history('redo','Lxxxxxarge'),'Loaded editor Redo with one visible linked pane.');
  assert.equal(await readFile(join(sourcePath,'Large.md'),'utf8'),large);
  await clock('large-save',async()=>{
    await button('Save linked Markdown');
    await wait('document.querySelector(".next-linked-pane [role=status]")?.textContent==="source unchanged"','large Save receipt');
  },'Explicit pane Save through verified native publication.');
  assert.equal(await readFile(join(sourcePath,'Large.md'),'utf8'),large.replace('# Large','# Lxxxxxarge'));
  await until(()=>transfer({op:'tasks'}),rows=>!rows.some(row=>row.kind==='linked-index'&&!row.finished),'startup linked index settled');
  const before=await processSnapshot();await pause(2200);const after=await processSnapshot();
  const totals=p=>p.processes.reduce((value,process)=>({cpu:value.cpu+process.cpuSeconds,working:value.working+process.workingSet,private:value.private+process.privateBytes}),{cpu:0,working:0,private:0});
  const a=totals(before),b=totals(after);
  const seconds=(Date.parse(after.timestamp)-Date.parse(before.timestamp))/1000;
  record('m21-registered-settled',1,'cpu_one_core_percent',100*(b.cpu-a.cpu)/seconds,'%','Short settled sample with one visible near 1 MiB editor and a registered source.');
  record('m21-registered-settled',1,'process_tree_working_set',b.working/1048576,'MiB','May count shared resident pages more than once.');
  record('m21-registered-settled',1,'process_tree_private_bytes',b.private/1048576,'MiB','Sum of process private byte counters.');
  const largePath=join(sourcePath,'Large.md');
  const published=await readFile(largePath,'utf8');
  const clean=published+'\r\nClean external marker.\r\n';
  await writeFile(largePath,clean);
  await button('Reload source');
  await wait('document.querySelector(".next-linked-pane .tiptap")?.textContent.includes("Clean external marker.")','clean reload from watcher');
  await evaluate('document.querySelector(".next-linked-pane .tiptap").editor.view.focus()');
  await cdp('Input.insertText',{text:'protected draft'});
  const competing=clean+'\r\nCompeting external marker.\r\n';
  await writeFile(largePath,competing);
  await button('Review protected draft');
  await wait('!!document.querySelector("[role=dialog]")','dirty conflict review from watcher');
  assert.equal(await readFile(largePath,'utf8'),competing);
  assert((await linked({op:'drafts'})).some(item=>item.path==='Large.md'));
  report.checks.push('Live notifications drove clean reload and dirty conflict review while preserving both the external bytes and the protected draft.');

  const unavailable=sourcePath+'-away';
  await rename(sourcePath,unavailable);
  await until(()=>search('vermilion',scoped),row=>row.total===0,'disconnected source withdrawal');
  await rename(unavailable,sourcePath);
  await until(()=>search('vermilion',scoped),row=>row.items.some(item=>item.id===linkedId),'restored root discovery');
  report.checks.push('Filesystem root loss withdrew search and restoring the same authorized folder restored the original identity.');
  await linked({op:'remove',source});
  assert(!(await search('vermilion')).items.some(row=>row.id===linkedId));
  report.checks.push('WebView2 palette and original references dialog exploration/dismissal, native restart with nested expansion, near-1 MiB editor open/typing/Undo/Redo and byte-exact explicit Save; source revocation withdraws search.');
  report.limitations.push('End-to-end filesystem timings include event receipt, debounce, processing and polling. No separate kernel-event timestamp or matched M20 full-refresh comparison.');
}
