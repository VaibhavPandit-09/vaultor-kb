import assert from 'node:assert/strict';
import { dialog, nativeTheme } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

/** Real renderer/native-file/host workflow; only the OS picker result is supplied by the fixture. */
export async function runFolderCheck(window,directory,owned){
 assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
 const wc=window.webContents,evaluate=code=>wc.executeJavaScript(code);
 const wait=async(code,label)=>{for(let i=0;i<900;i++){if(await evaluate(code).catch(()=>false))return;await new Promise(r=>setTimeout(r,100));}throw new Error(label+': '+await evaluate('document.body.innerText'));};
 const click=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled);if(!b)throw Error('Button unavailable: '+${JSON.stringify(label)});b.click()})()`);
 const request=async(path,method='GET',body)=>{const r=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,'X-Vaultor-Protocol':'3',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,path+' '+r.status);const text=await r.text();return text?JSON.parse(text):undefined;};
 const capture=async name=>{await new Promise(r=>setTimeout(r,250));await writeFile(join(directory,name),(await wc.capturePage()).toPNG());};
 const marker=await readFile(join(directory,'folder-success.json'),'utf8').then(JSON.parse).catch(()=>null);if(marker){assert.equal((await request('/collections/'+marker.id)).childCount,3);assert.equal((await request('/resources?size=1')).totalItems,204);console.log('Folder hierarchy and 204 resources survived a complete owned-host restart.');return;}
 const root=join(directory,'docs');for(const name of ['nested','empty','bulk'])await mkdir(join(root,name),{recursive:true});
 await writeFile(join(root,'README.md'),'# Documentation\n\n[Target](nested/target.md#part)\n\n![Alt text](nested/picture.png)\n\n[Attachment](nested/data.bin)\n\n[Missing](outside.md)\n\n```md\n[Literal](nested/target.md)\n```');
 await writeFile(join(root,'nested','target.md'),'# Target\n\n[Home](../README.md)\n\n## Part');
 await writeFile(join(root,'nested','data.bin'),Buffer.from([0,1,2,3]));
 await writeFile(join(root,'nested','picture.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0V8AAAAASUVORK5CYII=','base64'));
 for(let i=0;i<200;i++)await writeFile(join(root,'bulk',`Note-${i}.md`),'# Bulk '+i+'\n\n[Home](../README.md)');
 const previous=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});
 window.setSize(1320,900);window.showInactive();nativeTheme.themeSource='dark';
 try{
  await evaluate("document.querySelector('[aria-label=\"Import options\"]').click()");await click('Import folder');
  await wait("document.querySelector('[role=dialog]')?.textContent.includes('204 files')",'Folder review');
  assert.ok(await evaluate("document.querySelector('[role=dialog]').querySelectorAll('select').length<=31"));
  assert.ok(await evaluate("[...document.querySelectorAll('details')].filter(d=>d.open).length===0"));
  await capture('folder-review-dark.png');
  await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Import'&&!b.disabled)",'Ready');await click('Import');
  await wait("document.querySelector('[role=dialog]')?.textContent.includes('Import complete')",'Folder completion');await capture('folder-complete.png');
  const roots=await request('/collections?parent=&size=100');const docs=roots.items.find(c=>c.name==='docs');assert.ok(docs);assert.equal(docs.childCount,3);assert.equal(docs.count,1);
  const children=(await request('/collections?parent='+docs.id+'&size=100')).items;assert.equal(children.find(c=>c.name==='empty').count,0);assert.equal(children.find(c=>c.name==='bulk').count,200);
  const readme=(await request('/resources?collection='+docs.id)).items[0];const content=(await request('/resources/'+readme.id)).content;assert.ok(JSON.stringify(content).includes('resourceLink'));assert.ok(JSON.stringify(content).includes('heading: #part'));assert.ok(JSON.stringify(content).includes('Alt text'));const document=typeof content==='string'?JSON.parse(content):content;assert.ok(document.content.some(node=>node.type==='image'&&node.attrs.resourceId),'Managed inline image');assert.ok(JSON.stringify(content).includes('[Literal](nested/target.md)'));
  const nested=children.find(c=>c.name==='nested');const target=(await request('/resources?collection='+nested.id)).items.find(r=>r.title==='target');assert.ok((await request('/resources/'+target.id+'/references?direction=incoming')).items.some(r=>r.id===readme.id));
  await click('View destination');await wait("document.querySelector('.collection-breadcrumb')",'Collection view');nativeTheme.themeSource='light';await capture('folder-library-light.png');window.setSize(680,760);await capture('folder-narrow.png');
  assert.ok(await evaluate("document.querySelector('.library-view:not([hidden])').scrollWidth<=document.querySelector('.library-view:not([hidden])').clientWidth"));
  const exported=await request('/exports','POST',{scope:'workspace',format:'zip'});let operation;
  for(let i=0;i<300;i++){operation=await request('/operations/'+exported.id);if(operation.status==='SUCCEEDED'||operation.status==='FAILED')break;await new Promise(r=>setTimeout(r,100));}assert.equal(operation.status,'SUCCEEDED');
  const response=await fetch(owned.address+'/api/exports/'+exported.id+'/download',{headers:{'X-Vaultor-Owner':owned.accessKey}});assert.ok(response.ok);await writeFile(join(directory,'hierarchy.zip'),new Uint8Array(await response.arrayBuffer()));
  await wc.reload();await wait("document.querySelector('.collection-breadcrumb')",'Hierarchy restored after reload');assert.equal((await request('/collections/'+docs.id)).childCount,3);
  await writeFile(join(directory,'folder-success.json'),JSON.stringify({id:docs.id}));
  console.log('Folder native check passed: 204 files, empty directory, managed links, backlinks, code preservation, bounded review, themes/narrow layout, export and renderer restart.');
 }finally{dialog.showOpenDialog=previous;}
}
