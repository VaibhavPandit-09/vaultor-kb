import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {readFile,readdir,writeFile} from 'node:fs/promises';

const paragraph = value => ({type:'paragraph',content:[{type:'text',text:value}]});
const table = {
  type:'table',
  content:Array.from({length:181},(_,row)=>({type:'tableRow',content:Array.from({length:12},(_,col)=>({
    type:row?'tableCell':'tableHeader',
    content:[paragraph(row ? `${row%2?'keep':'hide'} ${row}-${col} “quoted” 雪` : `Column ${col+1}`)],
  }))})),
};
const prose = Array.from({length:110},(_,i)=>paragraph(`${i} `+'Vaultor notes preserve editable structure and shared history. '.repeat(10)));
const code = Array.from({length:8},(_,i)=>({type:'codeBlock',attrs:{language:'javascript'},content:[{type:'text',text:Array.from({length:100},(_,n)=>`const v${n} = ${i+n};`).join('\n')}]}));

export async function qualifyEditor({evaluate,cdp,wait,report,folder,record,restart}) {
  const api=request=>evaluate(`benchRequest(${JSON.stringify(request)})`);
  const root=(await api({kind:'snapshot'})).path;
  assert.equal(resolve(root.replace(/^\\\\\?\\/,'')),resolve(join(folder,'workspace')));
  const evalEditor=code=>evaluate(`(()=>{const dom=document.querySelector('.tiptap'),editor=dom.editor;${code}})()`);
  const observe=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>resolve(true)))');
  const click=async selector=>{
    const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});
  };
  const pixel=Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pP1sAAAAASUVORK5CYII=','base64'));
  const asset=await evaluate(`window.__TAURI_INTERNALS__.invoke('attachment',new Uint8Array(${JSON.stringify(pixel)}).buffer,{headers:{'x-file-name':'m18-fixture.png'}})`);
  const placements=Array.from({length:18},(_,i)=>({type:'image',attrs:{resourceId:asset.id,width:20,alt:'Fixture '+i,alignment:'center'}}));
  const cases=[['prose',prose],['dense-table',[paragraph('Table fixture'),table]],['code',code],['image-placements',[...placements,paragraph('Image fixture end')]],['mixed',[...prose.slice(0,25),table,...code.slice(0,3),placements[0],paragraph('End marker')]]];
  report.dataset=createHash('sha256').update(JSON.stringify(cases).replaceAll(asset.id,'fixture-image')).update(Buffer.from(pixel)).digest('hex');
  const notes=[];
  for(const [scenario,content] of cases){
    const note=await api({kind:'createNote',title:`M18 ${scenario}`,collection:null});
    const saved=await api({kind:'save',id:note.id,revision:note.revision,title:note.title,content:{type:'doc',content}});
    notes.push({...note,revision:saved.revision});
  }
  await cdp('Page.reload');
  await wait('!!document.querySelector("[data-row-open]")','fixture Library ready');
  assert.equal((await evaluate("window.__TAURI_INTERNALS__.invoke('workspace',{request:{kind:'snapshot'}})")).path,root);
  await evaluate("window.benchRequest=request=>window.__TAURI_INTERNALS__.invoke('workspace',{request})");
  for(let i=0;i<notes.length;i++){
    const note=notes[i],scenario='m18-'+cases[i][0];
    await wait(`!!document.querySelector('[data-row-open="${note.id}"]')?.getClientRects().length && document.querySelector('[data-list-focus]')?.getAttribute('aria-busy')==='false'`,'Library ready for the next note');
    const start=performance.now();
    await click(`[data-row-open="${note.id}"]`);
    await wait(`!!document.querySelector('[data-note-id="${note.id}"] .tiptap')?.editor?.isInitialized`,'editor ready');
    record(scenario,1,'open_usable',performance.now()-start,'ms','CDP click to initialized editor, includes driver polling.');
    await evalEditor('editor.commands.focus("end");return true');
    await observe();
    for(let j=1;j<=5;j++){
      const marker=' λ'+j;
      await evalEditor(`window.m18Input=new Promise(resolve=>dom.addEventListener("beforeinput",()=>{const t=performance.now();requestAnimationFrame(()=>resolve(performance.now()-t));},{once:true}));return true`);
      await cdp('Input.insertText',{text:marker});
      record(scenario,j,'input_to_raf',await evaluate('window.m18Input'),'ms','CDP beforeinput to animation frame.');
    }
    assert(await evalEditor('return editor.getText().includes("λ5")'));
    if(scenario==='m18-dense-table'){
      const result=await evalEditor(`
        const original=editor.getJSON();
        let tablePos,cell;
        editor.state.doc.descendants((node,pos)=>{
          if(node.type.name==="table")tablePos=pos;
          if(cell===undefined&&node.type.name==="tableCell")cell=pos+2;
        });
        editor.commands.setTextSelection(cell);
        const plugin=editor.state.plugins.find(p=>p.key.startsWith("tableView"));
        const attrs=editor.state.doc.nodeAt(tablePos).attrs;
        if(!attrs.tableId)throw Error("Table identity missing");
        const t=performance.now();
        editor.view.dispatch(editor.state.tr.setMeta(plugin.key,{tableId:attrs.tableId,filters:{[attrs.columnIds[0]]:{mode:"contains",query:"keep",values:[]}}}));
        const filterMs=performance.now()-t, hidden=dom.querySelectorAll(".table-filter-hidden").length;
        editor.view.dispatch(editor.state.tr.setMeta(plugin.key,{tableId:attrs.tableId,filters:{}}));
        if(JSON.stringify(original)!==JSON.stringify(editor.getJSON()))throw Error("Filter changed document");
        const start=performance.now(),clipboardData=new DataTransfer();
        clipboardData.setData('text/plain','roundtrip\tquoted "value"');
        dom.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}));
        const pasteMs=performance.now()-start;
        if(!editor.getText().includes('quoted "value"'))throw Error('TSV paste did not update cells');
        editor.commands.undo();
        return {filterMs,hidden,pasteMs};
      `);
      assert.equal(result.hidden,90);
      record(scenario,1,'apply_filter_transaction',result.filterMs,'ms','Explicit view-state transaction and DOM decorations for 2,172 cells. No compositor measurement.');
      record(scenario,1,'tsv_paste_dispatch',result.pasteMs,'ms','Two-cell synthetic clipboard event in the mounted WebView2 editor.');
    }
    if(i<notes.length-1)await click('[aria-label="Return to Library"]');
  }
  const current=notes.at(-1), marker=' M18 persisted ';
  const workerAsset=(await readdir(resolve(import.meta.dirname,'../../frontend/dist-next/assets'))).find(name=>/^editorImport.worker-.*\.js$/.test(name));
  assert(workerAsset,'Build the Next UI with its editor import worker');
  const csvSource=table.content.map(row=>row.content.map(cell=>'"'+cell.content[0].content[0].text.replaceAll('"','""')+'"').join(',')).join('\r\n');
  const csvTiming=await evaluate(`(async()=>{
    const workerAssetForLog="editorImport.worker";const start=performance.now(),worker=new Worker(${JSON.stringify('/assets/'+workerAsset)},{type:'module'});
    const {content,error}=await new Promise((resolve,reject)=>{worker.onmessage=event=>resolve(event.data);worker.onerror=event=>reject(new Error(JSON.stringify({message:event.message,filename:event.filename,location:location.href,asset:workerAssetForLog})));worker.postMessage({format:'table',source:${JSON.stringify(csvSource)}});});
    worker.terminate();if(error)throw Error(error);
    const converted=performance.now(),editor=document.querySelector('.tiptap').editor;
    editor.commands.insertContentAt(editor.state.doc.content.size,content,{errorOnInvalidContent:true});
    const insertMs=performance.now()-converted;
    if(document.querySelectorAll('.tiptap table').length!==2)throw Error('CSV insertion produced no table');
    editor.commands.undo();
    return {parseMs:converted-start,insertMs};
  })()`);
  record('m18-csv',1,'worker_start_and_convert',csvTiming.parseMs,'ms','181×12 UTF-8 table. Worker startup, conversion and message delivery.');
  record('m18-csv',1,'insert_table_dispatch',csvTiming.insertMs,'ms','Approved fixture simulated by dispatching parsed content to the live editor. Native review and dialog are separate.');
  const snapshot=await api({kind:'snapshot'});
  const baseReceipt=snapshot.settings.session;
  const sessions=Array.from({length:3},(_,i)=>({
    paneId:'m18-shared-'+i,id:current.id,cursor:0,
    history:[{visitId:'m18-visit-'+i,resourceId:current.id,title:current.title}],
  }));
  await api({kind:'behavior',path:root,value:{maxVisiblePanes:3}});
  await api({kind:'session',path:root,value:{...baseReceipt,documents:sessions.map(()=>({id:current.id})),activePane:0,journeys:{sessions,panes:sessions,activePaneId:sessions[0].paneId,positions:{}}}});
  await cdp('Emulation.setDeviceMetricsOverride',{width:1800,height:900,deviceScaleFactor:1,mobile:false});
  await cdp('Page.reload');
  await wait('document.querySelectorAll(".tiptap").length===3 && [...document.querySelectorAll(".tiptap")].every(e=>e.editor?.isInitialized)','three mixed-note editors');
  await evaluate("window.benchRequest=request=>window.__TAURI_INTERNALS__.invoke('workspace',{request})");
  assert.equal((await api({kind:'snapshot'})).path,root);
  const timing=await evalEditor(`
    editor.commands.focus("end");editor.commands.insertContent(${JSON.stringify(marker)});
    const start=performance.now();editor.commands.undo();const undo=performance.now()-start;
    const removed=!editor.getText().includes("M18 persisted");
    const redoStart=performance.now();editor.commands.redo();const redo=performance.now()-redoStart;
    return {undo,redo,removed,restored:editor.getText().includes("M18 persisted")};
  `);
  assert(timing.removed&&timing.restored);
  assert(await evaluate('[...document.querySelectorAll(".tiptap")].every(e=>e.editor.getText().includes("M18 persisted"))'));
  record('m18-mixed',1,'undo_dispatch',timing.undo,'ms');
  record('m18-mixed',1,'redo_dispatch',timing.redo,'ms');
  const save=performance.now();
  await wait(`benchRequest({kind:'read',id:${JSON.stringify(current.id)}}).then(note=>JSON.stringify(note.content).includes("M18 persisted"))`,'autosave readback');
  record('m18-mixed',1,'autosave_readback',performance.now()-save,'ms','Includes autosave delay and IPC read polling.');
  await restart();
  assert(JSON.stringify((await api({kind:'read',id:current.id})).content).includes('M18 persisted'));
  report.checks.push('Optimized WebView2 opened prose, 181×12 table, code, repeated image placements and mixed fixtures; received typed input, filtered and cleared without content mutation, pasted TSV, undid/redid edits across three views and read back persisted content after process restart.');
  if(process.argv.includes('--hold-m18')){
    const csv=join(folder,'editor-import.csv'),md=join(folder,'editor-import.md'),done=join(folder,'m18-native.done');
    await writeFile(csv,'Name,Description\r\n雪,"Value, with comma"\r\nSecond,"two\r\nlines"\r\n');
    await writeFile(md,'# M18 native Markdown\n\n- [x] Source preserved\n\n> **Reviewed**\n');
    console.log('M18 native fixture '+JSON.stringify({csv,md,done}));
    for(let i=0;i<240;i++){
      try{await readFile(done);break;}catch{}
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
  }
}
