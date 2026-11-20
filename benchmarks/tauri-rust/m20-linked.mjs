import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function qualifyLinked({evaluate, cdp, wait, report, folder, record, restart}) {
  const command = request => evaluate('benchRequest('+JSON.stringify(request)+')');
  const linked = request => command({kind:'linked',request});
  const org = request => command({kind:'organization',request});
  const media = request => command({kind:'media',request});
  const transfer = request => evaluate("window.__TAURI_INTERNALS__.invoke('transfer',{request:"+JSON.stringify(request)+'})');
  const time = async (scenario, metric, run, notes, iteration=1) => {
    const start = performance.now();
    const value = await run();
    record('m20-'+scenario,iteration,metric,performance.now()-start,'ms',notes);
    return value;
  };
  const click = async selector => {
    const js = 'document.querySelector('+JSON.stringify(selector)+')';
    await wait(js+'?.getClientRects().length','visible '+selector);
    await evaluate(js+'.click();true');
  };
  const label = async title => {
    const js = '[...document.querySelectorAll("button")].find(b=>!b.disabled&&!b.closest("[hidden]")&&b.getClientRects().length&&(b.getAttribute("aria-label")==='+JSON.stringify(title)+'||b.textContent.trim()==='+JSON.stringify(title)+'))';
    await wait(js,'enabled '+title);
    await evaluate(js+'.click();true');
  };
  const task = async source => {
    const request = await transfer({op:'indexLinked',source});
    for(let i=0;i<900;i++){
      const result = (await transfer({op:'tasks'})).find(row=>row.id===request.id);
      if(result?.finished){
        assert.equal(result.state,'completed',result.error||result.phase);
        return result.result;
      }
      await pause(50);
    }
    throw Error('Index task did not finish');
  };
  const sourcePath = join(folder,'m20-source');
  const dragProbe=process.argv.includes('--m20-drag-probe');
  const corpus=dragProbe?12:2048;
  const first = '# Linked source\r\n\r\ncinnabar original [target][ref] and [again](Nested/Other%20Page.md#anchor).\r\n\r\n[ref]: Nested/Other%20Page.md#anchor\r\n';
  const other = '# Anchor\n\nQuick reference [back](../Entry.md).\n';
  const big = '# Large\r\n\r\nFirst paragraph.\r\n\r\n'+('Boundary-preserving paragraph. '.repeat(44)+'\r\n\r\n').repeat(250);
  const dense = '| One | Two | Three | Four | Five | Six | Seven | Eight |\n|---|---|---|---|---|---|---|---|\n'+('| a | b | c | d | e | f | g | h |\n').repeat(181);
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pP1sAAAAASUVORK5CYII=','base64');
  const files = {'Entry.md':first,'Nested/Other Page.md':other,'Large.md':big,'Dense.md':dense,'Assets.md':'# Assets\n\n![Fixture image](dot.png)\n','dot.png':image,'ignore.bin':'ignored'};
  await mkdir(join(sourcePath,'Nested'),{recursive:true});
  await mkdir(join(sourcePath,'Corpus'));
  await Promise.all(Object.entries(files).map(([name,body])=>writeFile(join(sourcePath,name),body)));
  const document = index => '# Document '+index+'\n\nCorpus body '+index+' '+ 'ordinary search words '.repeat(22)+'\n';
  for(let i=0;i<corpus;i+=64){
    await Promise.all(Array.from({length:Math.min(64,corpus-i)},(_,offset)=>{
      const n=i+offset;return writeFile(join(sourcePath,'Corpus','Doc '+n+'.md'),document(n));
    }));
  }
  report.fixture={markdownFiles:corpus+5,unsupportedFiles:2,folders:2,ordinaryDocumentBytes:Buffer.byteLength(document(0)),largeBytes:Buffer.byteLength(big),denseBytes:Buffer.byteLength(dense),denseRows:181,denseColumns:8};
  const hash=createHash('sha256');
  for(const body of Object.values(files))hash.update(body);
  for(let i=0;i<corpus;i++)hash.update(document(i));
  report.dataset=hash.digest('hex');
  const registration=await time('register','ipc_roundtrip_ms',()=>linked({op:'register',path:sourcePath}),'Native registration of fixed NTFS root, prior to indexing.');
  const source=registration.id;
  const start=Date.now();
  const initial=await time('initial-index','receipt_ready_ms',()=>task(source),'Cancellable Activity submit-to-completion with 50 ms polling. Fixture already on disk.');
  report.indexWindow={start,end:Date.now()};
  assert.equal(initial.discovered,corpus+5);
  const smallPath=join(folder,'m20-small');
  await mkdir(smallPath);
  await Promise.all(['One','Two','Three'].map(name=>writeFile(join(smallPath,name+'.md'),'# '+name+'\n\nSmall fixture.\n')));
  const small=await time('small-register','ipc_roundtrip_ms',()=>linked({op:'register',path:smallPath}),'Registration for a separate three-document source.');
  const smallIndex=await time('small-index','receipt_ready_ms',()=>task(small.id),'Three Markdown files, 50 ms receipt polling.');
  assert.equal(smallIndex.discovered,3);
  await linked({op:'remove',source:small.id});
  const browse=path=>linked({op:'directory',source,path,after:null});
  const root=await time('root-directory','ipc_roundtrip_ms',()=>browse(''),'First page of source root.');
  const page=await time('dense-directory','ipc_roundtrip_ms',()=>browse('Corpus'),'First result page from 2,048 entries.');
  assert.equal(page.entries.length,Math.min(corpus,100));assert.equal(Boolean(page.next),corpus>100);
  const id=root.entries.find(row=>row.path==='Entry.md').id;
  const docId=id.slice(7);
  const assetDoc=root.entries.find(row=>row.path==='Assets.md');
  const denseId=root.entries.find(row=>row.path==='Dense.md').id;
  const largeId=root.entries.find(row=>row.path==='Large.md').id;
  const collection=(await command({kind:'createCollection',name:'M20 selected documents',parentId:null})).id;
  const tag=(await org({op:'tag',name:'M20 linked',color:'#3c8a71',id:null})).id;
  await command({kind:'bulkMembership',ids:[id,largeId,denseId,assetDoc.id],add:collection,remove:null});
  await org({op:'tagging',ids:[id],tag,add:true});
  await org({op:'pin',ids:[id],value:true});
  assert.equal(await readFile(join(sourcePath,'Entry.md'),'utf8'),first);
  const search=(query,c=null,t=null)=>command({kind:'search',options:{query,content:true,order:'title',view:'source:'+source,collection:c,tag:t}});
  for(let i=1;i<=5;i++){
    const result=await time('linked-search','ipc_roundtrip_ms',()=>search('cinnabar',collection,tag),'One source, collection and tag scoped FTS5 result.',i);
    assert.equal(result.items[0].id,id);
  }
  const follow=await linked({op:'follow',id:docId,href:'Nested/Other%20Page.md#anchor'});
  assert.equal(follow.title,'Other Page.md');
  assert.equal((await linked({op:'relationships',id:follow.documentId})).incoming[0].occurrences,2);
  const raster=await linked({op:'asset',id:assetDoc.id.slice(7),href:'dot.png'});
  assert.deepEqual(Buffer.from(raster.bytes),image);
  await assert.rejects(linked({op:'asset',id:assetDoc.id.slice(7),href:'../dot.png'}));
  report.checks.push('Native directory paging, source/collection/tag search, multiple reference occurrences, encoded relative navigation, exact raster bytes and root-escape refusal.');

  await cdp('Page.reload');
  await wait('document.querySelector("[data-ready=true][data-session-ready=true]")','reloaded fixture');
  await evaluate("window.benchRequest=request=>window.__TAURI_INTERNALS__.invoke('workspace',{request})");
  await label('Linked sources');
  await time('browse-ui','renderer_ready_ms',async()=>{
    await click('[data-browser=sources] [data-linked-source="'+source+'"]');
    await wait('document.querySelector('+JSON.stringify('[data-browser=sources] [data-linked-path="Large.md"]')+')','source rows');
  },'Source root expansion to visible file rows, includes polling.');
  // Use the native WebView2 pointer path over an indexed source title.
  await org({op:'pin',ids:[id],value:false});
  const center=selector=>evaluate('(()=>{const node=document.querySelector('+JSON.stringify(selector)+');const r=node.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()');
  await pause(350);
  const origin=await center('[data-browser=sources] [data-linked-path="Entry.md"]');
  const pin=await center('.sidebar-primary [data-pin-drop]');
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...origin});
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:origin.x+10,y:origin.y});
  await pause(40);
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,...pin});
  await pause(160);
  const dragReached=await evaluate('document.querySelector(".sidebar-primary [data-pin-drop]")?.dataset.dropState==="valid"');
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...pin});
  const pinQuery={op:'pins',kind:'all',query:'Entry',offset:0,limit:100};
  let dragApplied=false;
  if(dragReached){
    for(let i=0;i<20&&!dragApplied;i++){
      const pinned=await org(pinQuery);
      dragApplied=pinned.items.some(row=>row.id===id);
      if(!dragApplied)await pause(75);
    }
  }
  if(dragApplied)report.checks.push('CDP mouse drag from the indexed source browser to Pinned updated Vaultor metadata.');
  else report.limitations.push('CDP linked source-to-Pinned probe did not complete in this run.');
  if(dragProbe){
    assert(dragApplied,'Linked source pointer drop did not pin the resource');
    assert.equal(await readFile(join(sourcePath,'Entry.md'),'utf8'),first);
    return;
  }
  if(!dragApplied)await org({op:'pin',ids:[id],value:true});
  const editor='.next-linked-pane .tiptap';
  await time('open-large','renderer_ready_ms',async()=>{
    const point=await center('[data-browser=sources] [data-linked-path="Large.md"]');
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});
    await wait('document.querySelector('+JSON.stringify(editor)+')?.contentEditable==="true"','large editable Markdown');
  },'Large UTF-8 Markdown row to mounted editable Tiptap. Driver polls every 50 ms.');
  await evaluate('(()=>{const editor=document.querySelector('+JSON.stringify(editor)+').editor;editor.view.focus();editor.commands.setTextSelection(2);return true})()');

  for(let sample=1;sample<=5;sample++){
    await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(editor)+');window.inputSample=new Promise(resolve=>{e.addEventListener("beforeinput",()=>requestAnimationFrame(()=>resolve(performance.now()-window.inputStart)),{once:true});setTimeout(()=>resolve(null),2500);});window.inputStart=performance.now();return true})();');
    await cdp('Input.insertText',{text:'x'});
    const elapsed=await evaluate('window.inputSample');
    assert.equal(typeof elapsed,'number');
    record('m20-large-typing',sample,'input_to_raf',elapsed,'ms','CDP insertText to next animation frame; includes driver delivery.');
  }
  assert.equal(await readFile(join(sourcePath,'Large.md'),'utf8'),big);
  await time('save-large','renderer_receipt_ms',async()=>{
    await label('Save linked Markdown');
    await wait('document.querySelector(".next-linked-pane [role=status]")?.textContent==="source unchanged"','large linked Save receipt');
  },'Explicit pane Save to verified receipt, including candidate reparse and driver polling.');
  const saved=await readFile(join(sourcePath,'Large.md'),'utf8');
  assert.equal(saved,big.replace('# Large','# Lxxxxxarge'));
  assert.equal((await linked({op:'openId',id:largeId.slice(7)})).id,largeId);
  const denseDoc=await time('open-dense','ipc_roundtrip_ms',()=>linked({op:'openId',id:denseId.slice(7)}),'182 table rows including header, 8 columns. Rust/IPC only.');
  assert.equal(denseDoc.editable,true);

  const clean=saved+'\r\nClean change on disk.\r\n';
  await writeFile(join(sourcePath,'Large.md'),clean);
  await evaluate('window.dispatchEvent(new Event("focus"));true');
  await label('Reload source');
  await wait('document.querySelector('+JSON.stringify(editor)+')?.textContent.includes("Clean change on disk.")','clean linked reload');
  await writeFile(join(sourcePath,'Large.md'),clean+'\r\nChanged on disk.\r\n');
  await evaluate('document.querySelector('+JSON.stringify(editor)+').focus();true');
  await cdp('Input.insertText',{text:'protectedpending'});
  await label('Save linked Markdown');
  await wait('[...document.querySelectorAll("[role=alert]")].some(e=>e.textContent.includes("External revision conflict"))','dirty linked conflict');
  assert.equal(await readFile(join(sourcePath,'Large.md'),'utf8'),clean+'\r\nChanged on disk.\r\n');
  assert((await linked({op:'drafts'})).some(d=>d.id===largeId.slice(7)));
  report.checks.push('Native editor admitted larger Markdown, used explicit Save with byte-exact CRLF preservation, reloaded a clean external change, and protected a dirty external revision conflict.');

  await rename(join(sourcePath,'Entry.md'),join(sourcePath,'Nested','Moved.md'));
  const renamed=await time('rename-reconcile','receipt_ready_ms',()=>task(source),'Refresh of 2,053 Markdown documents after moving one file into a nested directory.');
  assert.equal(renamed.discovered,corpus+5);
  assert.equal((await linked({op:'openId',id:docId})).path,'Nested/Moved.md');
  assert.equal((await search('cinnabar',collection,tag)).items[0].id,id);
  await writeFile(join(sourcePath,'Nested','Moved.md'),first.replace('cinnabar','vermilion'));
  const refreshed=await time('external-change','receipt_ready_ms',()=>task(source),'Refresh of the same source after one file content change.');
  assert.equal(refreshed.discovered,corpus+5);
  assert.equal((await search('cinnabar')).total,0);
  assert.equal((await search('vermilion',collection,tag)).items[0].id,id);

  await restart();
  assert.equal((await search('vermilion',collection,tag)).items[0].id,id);
  assert((await org({op:'pins',kind:'all',query:'Moved',offset:0,limit:100})).items.some(row=>row.id===id));
  const unavailable=sourcePath+'-moved';
  await rename(sourcePath,unavailable);
  assert.equal((await linked({op:'sources'})).find(row=>row.id===source).available,false);
  await assert.rejects(linked({op:'openId',id:docId}));
  const authorized=await linked({op:'register',path:unavailable});
  assert.equal(authorized.id,source);
  await task(source);
  assert.equal((await linked({op:'openId',id:docId})).id,id);
  await linked({op:'remove',source});
  assert.equal((await search('vermilion')).total,0);
  assert.equal(await readFile(join(unavailable,'Nested','Moved.md'),'utf8'),first.replace('cinnabar','vermilion'));
  assert((await linked({op:'drafts'})).some(d=>d.id===largeId.slice(7)));
  report.checks.push('Rename/move and external changes indexed with stable metadata, organization survives process restart, moved-root reauthorization retains identity, revocation hides content and keeps originals and protected drafts.');
  report.limitations.push('WebView2 CDP and disposable NTFS fixture only. Registration and organization checks invoke the same native commands as the UI; no physical Windows picker, Explorer or accessibility acceptance.');
}
