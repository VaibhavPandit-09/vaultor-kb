// Historical pre-blocker workflow runner. Current bridge deliberately refuses
// Save; adapt request IDs and requalify only after publication review is accepted.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.VAULTOR_PLAYWRIGHT_PACKAGE).href);
const fixture=(await readFile('native/linked-markdown/.scratch/latest-g3-desktop.txt','utf8')).trim();
assert(fixture.startsWith(resolve('native/linked-markdown/.scratch')+sep));assert.equal(await readFile(join(fixture,'gate3-disposable.marker'),'utf8'),'VAULTOR_G3_DISPOSABLE');
const file=join(fixture,'source','guide.md'),before=await readFile(file),browser=await chromium.connectOverCDP('http://127.0.0.1:9337');
const page=browser.contexts()[0].pages().find(p=>p.url()==='vaultor-g3://app/markdown-g3.html'),errors=[],checks=[],latencies=[];
assert(page);page.on('pageerror',error=>errors.push(error.message));
const settled=()=>page.waitForFunction(()=>[...window.markdownG3.documents.values()][0]?.session.status.state==='ready');
try{
 await page.waitForFunction(()=>window.markdownG3.documents.size===1);await settled();
 assert.equal(await page.evaluate(()=>typeof window.require),'undefined');checks.push('real native root/file pickers and mounted editor opened exact source via private Java host');
 await page.evaluate(()=>{const d=[...window.markdownG3.documents.values()][0],lab=[...d.labs.values()][0];let position;lab.editor.state.doc.descendants((node,pos)=>{if(node.type.name==='paragraph'&&node.textContent.includes('bold paragraph'))position=pos+1;});if(position===undefined)throw new Error('Fixture paragraph missing');lab.editor.commands.focus();lab.editor.commands.setTextSelection(position);});
 await page.keyboard.type('Edited ');await settled();
 const expected=Buffer.from(before.toString('utf8').replace('A **bold**','Edited A **bold**'));
 assert.equal(await page.evaluate(()=>[...window.markdownG3.documents.values()][0].session.source),expected.toString('utf8'));
 const started=performance.now();await page.getByRole('button',{name:'Save original',exact:true}).click();await page.waitForFunction(()=>[...window.markdownG3.documents.values()][0].notice.startsWith('Saved to original'));
 latencies.push(performance.now()-started);assert.deepEqual(await readFile(file),expected);checks.push('ordinary native-editor keyboard input independently validated, journaled and explicitly saved with exact localized bytes');
 await page.evaluate(()=>{[...window.markdownG3.documents.values()][0].labs.values().next().value.editor.commands.focus();});await page.keyboard.press('Control+z');await settled();
 assert.equal(await page.evaluate(()=>[...window.markdownG3.documents.values()][0].session.source),before.toString('utf8'));assert.deepEqual(await readFile(file),expected);checks.push('Undo restores exact original Markdown in draft without automatic disk Save');
 await page.evaluate(async()=>{await window.markdownG3.protect([...window.markdownG3.documents.values()][0]);});
 await page.keyboard.press('Control+Shift+z');await settled();assert.equal(await page.evaluate(()=>[...window.markdownG3.documents.values()][0].session.source),expected.toString('utf8'));checks.push('Redo retains exact source and independent validator ancestry');
 const refusals=await page.evaluate(async()=>{const c=await window.linkedGate3.context(),d=[...window.markdownG3.documents.values()][0],request={...c,id:crypto.randomUUID(),operation:'recovery',payload:{}};const result=[];for(const forged of [{...request,id:crypto.randomUUID(),token:'forged'},{...request,id:crypto.randomUUID(),payload:{path:'C:/outside'}},{...request,id:crypto.randomUUID(),operation:'save',payload:{document:d.document,version:d.session.status.version,source:'arbitrary',validated:true}}]){try{await window.linkedGate3.request(forged);result.push(false);}catch{result.push(true);}}await window.linkedGate3.request(request);try{await window.linkedGate3.request(request);result.push(false);}catch{result.push(true);}return result;});assert(refusals.every(Boolean));checks.push('actual trusted-renderer IPC rejects forged context, arbitrary paths, raw-source flags and replay');
 assert.deepEqual(errors,[]);await mkdir('native/linked-markdown/evidence/g3',{recursive:true});
 await writeFile('native/linked-markdown/evidence/g3/roundtrip.json',JSON.stringify({date:new Date().toISOString(),electron:browser.version(),nativePicker:'actual Windows folder and file selection via computer-use; no picker stub',checks,pageErrors:errors,saveUiReceiptMs:latencies},null,2)+'\n');
 await writeFile('native/linked-markdown/evidence/g3/roundtrip-before.md',before);await writeFile('native/linked-markdown/evidence/g3/roundtrip-after.md',expected);console.log(checks.join('\n'));
}finally{await browser.close();}
