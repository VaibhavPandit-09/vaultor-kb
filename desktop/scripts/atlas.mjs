import {mkdir,readFile,writeFile,rename,realpath,stat} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {spawn} from 'node:child_process';
import {OwnedServer} from '../src/owned-server.mjs';
import {Profiles} from '../src/profiles.mjs';

export const SEED='atlas-2026-10-v1';
export const defaultRoot=fileURLToPath(new URL('../cache/atlas/',import.meta.url));
const bundle=fileURLToPath(new URL('../bundle/',import.meta.url));
export const id=(kind,index)=>{const h=createHash('sha256').update(`${SEED}:${kind}:${index}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export async function atomic(path,value){const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2));await rename(temp,path);}
export async function prepareProfile(root){const profiles=new Profiles(join(root,'profile'));await profiles.load();await profiles.ensureManaged();await profiles.update('this-computer',{name:'Vaultor Lab — Atlas'});}
export async function rootGuard(root,initialize=false,small=false){
 root=resolve(root);const allowed=resolve(defaultRoot);if(root!==allowed&&!root.startsWith(allowed+sep))throw new Error('Atlas must stay inside desktop/cache/atlas.');
 if(initialize)await mkdir(root,{recursive:true});
 if(await realpath(root)!==root)throw new Error('Atlas root cannot be a symlink.');
 const marker=join(root,'atlas-owner.json');
 try{const value=JSON.parse(await readFile(marker,'utf8'));if(value.seed!==SEED||value.root!==root||value.small!==small)throw new Error('Atlas marker/profile mismatch. Refusing to adopt data.');}
 catch(e){if(e.code!=='ENOENT'||!initialize)throw e;const profile=join(root,'profile');if(await stat(profile).then(()=>true,()=>false))throw new Error('Unmarked profile exists. Refusing adoption.');await writeFile(marker,JSON.stringify({seed:SEED,root,small,version:1}),{flag:'wx'});}
 for(const relative of ['profile','profile/local-workspace','media']){const path=join(root,relative);if(await stat(path).then(()=>true,()=>false)&&await realpath(path)!==path)throw new Error('Atlas child path cannot be a symlink.');}
 return root;
}
const topics=['Astronomy','Ecology','Architecture','Music','Computing','History','Oceanography','Energy'];
const text=s=>({type:'text',text:s});const paragraph=s=>({type:'paragraph',content:[text(s)]});
export function note(index,small=false){
 const topic=topics[index%topics.length],num=String(index).padStart(4,'0');
 let title=`${topic} field journal ${num}`;
 if(index===0)title='Atlas — Start here';if(index===1)title='Atlas API observatory';if(index===2)title='Atlas Operations';
 if(index>=10&&index<20)title='Shared research title';if(index===20)title='Unicode café 東京 مرحبا 🌌';if(index===21)title='Literal 100% under_score [brackets]';if(index===22)title='Long descriptive title '+('interdisciplinary observation and careful reasoning '.repeat(8));
 const content=[{type:'heading',attrs:{level:1},content:[text(title)]},paragraph(`Study ${num} examines ${topic.toLowerCase()} through reproducible measurements. Body marker atlasbeacon${num} appears only in saved content. Compare habitat, energy and instrument design before drawing conclusions.`),{type:'bulletList',content:[{type:'listItem',content:[paragraph('Record observations and uncertainty.')]},{type:'listItem',content:[paragraph('Compare the measurements with neighbouring research.')] }]},{type:'codeBlock',attrs:{language:'python'},content:[text(`station = ${index}\nconfidence = 0.95\n# Synthetic experiment, never executed`)]}];
 if(index%9===0)content.push({type:'table',content:[{type:'tableRow',content:['Station','Reading'].map(s=>({type:'tableHeader',attrs:{colspan:1,rowspan:1,colwidth:null},content:[paragraph(s)]}))},{type:'tableRow',content:[num,String(index*3)].map(s=>({type:'tableCell',attrs:{colspan:1,rowspan:1,colwidth:null},content:[paragraph(s)]}))}]});
 const links=index<3?[(index+1)%3]:index<250?[index+1]:[];
 for(const target of links)content.push({type:'paragraph',content:[{type:'resourceLink',attrs:{resourceId:id('note',target),label:`Atlas visit ${target}`,type:'note'}}]});
 if(index<(small?8:200))for(const n of [0,index%(small?12:600),0])content.push({type:'image',attrs:{resourceId:id('image',n),alt:`Spectral survey ${n}`,caption:`Atlas observation ${index}, shared original ${n}`,width: n===0?60:100,alignment:'center'}});
 if(index<(small?4:50))for(let j=0;j<180;j++)content.push(paragraph(`Long-form analysis ${j}: ${topic} station ${num} compares seasonal observations, energy balance and instrument uncertainty across several regions.`));
 return {title,content:{type:'doc',content}};
}
export async function request(owned,path,method='GET',body){
 const multipart=body instanceof FormData;
 for(let retry=0;retry<60;retry++){
  const response=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,'X-Request-ID':randomUUID(),...(body&&!multipart?{'Content-Type':'application/json'}:{})},body:body?(multipart?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(120000)});
  if(response.status===409){const problem=await response.clone().json().catch(()=>({}));if(problem.code==='WORKSPACE_BUSY'){await new Promise(r=>setTimeout(r,500));continue;}}
  if(response.status===503&&method==='GET'){await new Promise(r=>setTimeout(r,500));continue;}
  if(!response.ok)throw new Error(`Atlas ${method} ${path} failed (${response.status}): ${(await response.text()).slice(0,250)}`);
  if(path.endsWith('/raw')||path.endsWith('/download'))return Buffer.from(await response.arrayBuffer());
  const value=await response.text();return value?JSON.parse(value):undefined;
 }throw new Error('Atlas host remained busy. Retry this command.');
}
async function runChild(command,args,env){await new Promise((done,fail)=>{const child=spawn(command,args,{env,windowsHide:true,stdio:'inherit'});child.once('error',fail);child.once('exit',code=>code===0?done():fail(new Error('Atlas child failed: '+code)));});}
async function operation(owned,op){for(let i=0;i<1200;i++){const value=await request(owned,'/operations/'+op.id);if(value.status==='SUCCEEDED')return value;if(['FAILED','CANCELLED'].includes(value.status))throw new Error('Atlas operation failed: '+JSON.stringify(value));await new Promise(r=>setTimeout(r,250));}throw new Error('Atlas operation timed out');}
async function generate(root,small){
 const python=process.env.ATLAS_PYTHON;if(!python)throw new Error('Set ATLAS_PYTHON to Python with Pillow and ReportLab.');
 await runChild(python,[fileURLToPath(new URL('./atlas-media.py',import.meta.url)),join(root,'media'),...(small?['--small']:[])],process.env);
 const owned=new OwnedServer({bundle,data:join(root,'profile','local-workspace')});
 const started=performance.now();await owned.start();console.log('Atlas isolated bundled host ready.');
 try{
  const manifestPath=join(root,'manifest.json');let manifest;
  try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));if(manifest.seed!==SEED)throw new Error('Manifest seed mismatch');}catch(e){if(e.code!=='ENOENT')throw e;manifest={seed:SEED,version:1,small,done:[],resources:[],collections:[],createdAt:new Date().toISOString()};}
  const done=new Set(manifest.done);const save=()=>atomic(manifestPath,{...manifest,done:[...done]});
  const media=JSON.parse(await readFile(join(root,'media','media.json'),'utf8'));
  const fileEntries=media.flatMap(r=>r.category==='pdf'&&!small?[r,{...r,index:r.index+100}]:[r]);
  const entries=[...fileEntries.map(r=>({...r,id:id(r.category,r.index),title:`Atlas ${r.category} ${String(r.index).padStart(4,'0')} — ${r.path}`})),...Array.from({length:small?40:4000},(_,index)=>({...note(index,small),id:id('note',index),category:'note',index}))];
  for(const [i,entry] of entries.entries()){
   if(!done.has(entry.id)){
    const data=new FormData();data.set('title',entry.title);
    if(entry.category==='note')data.set('content',JSON.stringify(entry.content));
    else{const bytes=await readFile(join(root,'media',entry.path));if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error('Fixture bytes changed');data.set('file',new Blob([bytes],{type:entry.mime}),entry.path);}
    const result=await request(owned,'/resources/imports/'+entry.id,'PUT',data);if(result.id!==entry.id)throw new Error('Import identity mismatch');done.add(entry.id);
   }
   if(i%100===0){await save();console.log(`Atlas resources ${i+1}/${entries.length}`);}
  }
  manifest.resources=entries.map(({content,...r})=>r);await save();
  const count=small?8:80;
  for(let c=0;c<count;c++){
   const key='collection:'+c,collectionId=id('collection',c);const name=`${topics[c%8]} / ${String(c).padStart(2,'0')}${c>=count-4?' — Empty':''}`;
   if(!done.has(key)){
    await request(owned,'/collections/creations/'+collectionId,'PUT',{name,resourceIds:[]});
    const members=c>=count-4?[]:entries.filter((_,i)=>i%(count-4)===c || (c===0&&i<500)).map(r=>r.id);
    for(let j=0;j<members.length;j+=100)await request(owned,'/organization/memberships','POST',{resourceIds:members.slice(j,j+100),kind:'collection',targetId:collectionId,action:'add'});
    if(c<20)await request(owned,'/collections/'+collectionId+'/favorite','PUT',{favorite:true});done.add(key);
   }
   manifest.collections[c]={id:collectionId,name};await save();
  }
  for(let t=0;t<(small?12:250);t++){
   const key='tag:'+t;if(done.has(key))continue;const name=`atlas-${String(t).padStart(3,'0')}${t===249?'-long-interdisciplinary-research-observations':''}`;
   const members=entries.filter((_,i)=>i%(small?12:250)===t);await request(owned,'/resources/'+members[0].id+'/tags/'+encodeURIComponent(name),'POST');
   const tags=await request(owned,'/tags/browse?q='+encodeURIComponent(name)+'&size=100');const tag=tags.items.find(r=>r.name===name);if(!tag)throw new Error('Tag not found');
   for(let j=0;j<members.length;j+=100)await request(owned,'/organization/memberships','POST',{resourceIds:members.slice(j,j+100).map(r=>r.id),kind:'tag',targetId:tag.id,action:'add'});done.add(key);await save();
  }
  for(let p=0;p<(small?12:280);p++){const key='pin:'+p;if(!done.has(key)){await request(owned,'/resources/'+entries[(p*17)%entries.length].id+'/favorite','PUT',{favorite:true});done.add(key);}}
  // Public open calls produce a deterministic order, not fabricated timestamps.
  const recent=[];for(let n=0;n<24;n++){const r=n%2?entries.find(e=>e.category==='note'&&e.index===n):entries[n];await request(owned,'/resources/'+r.id+'/open','POST');recent.push(r.id);await new Promise(r=>setTimeout(r,8));}
  manifest.recent=recent.reverse();manifest.expected={bodyPhrase:'atlasbeacon0317',bodyResource:id('note',317),sharedImage:id('image',0),sharedSources:small?8:200,futureFilePhrase:'filecompass021',cycle:[0,1,2].map(i=>id('note',i))};manifest.generationSeconds??=(performance.now()-started)/1000;manifest.lastAttemptSeconds=(performance.now()-started)/1000;await save();
  await verify(owned,manifest);
  const exportKey='baseline-export';let op;
  if(manifest.exportOperation)op=await request(owned,'/operations/'+manifest.exportOperation);else{op=await request(owned,'/exports','POST',{scope:'workspace',format:'zip'});manifest.exportOperation=op.id;await save();}
  await operation(owned,op);const bytes=await request(owned,'/exports/'+op.id+'/download');await writeFile(join(root,'baseline.zip'),bytes);manifest.archive={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};done.add(exportKey);await save();
  const preview=new FormData();preview.set('file',new Blob([bytes],{type:'application/zip'}),'atlas-baseline.zip');const review=await request(owned,'/imports/preview','POST',preview);await atomic(join(root,'archive-preview.json'),review);
  await benchmark(owned,root);console.log(`Atlas complete: ${entries.length} resources. Baseline and manifest: ${root}`);
 }finally{await owned.stop();}
}
async function verify(owned,m){
 const all=await request(owned,'/resources?size=100');if(all.totalItems!==m.resources.length)throw new Error(`Resource count ${all.totalItems} differs`);
 const notes=await request(owned,'/resources?type=note&size=100');if(notes.totalItems!==(m.small?40:4000))throw new Error('Note count differs');
 const cols=await request(owned,'/collections?size=100');if(cols.totalItems!==m.collections.length)throw new Error('Collections differ');
 const tags=await request(owned,'/tags/browse?size=100');if(tags.totalItems!==(m.small?12:250))throw new Error('Tags differ');
 const pins=await request(owned,'/organization/pins?size=100');if(pins.totalItems!==(m.small?20:300))throw new Error('Pins differ');
 const expectedPins=[...Array.from({length:m.small?12:280},(_,p)=>m.resources[(p*17)%m.resources.length]).map(r=>({id:r.id,kind:r.category==='note'?'note':'file',name:r.title})),...m.collections.slice(0,20).map(c=>({id:c.id,kind:'collection',name:c.name}))];
 const compare=(a,b)=>a<b?-1:a>b?1:0;expectedPins.sort((a,b)=>compare(a.name.toLowerCase(),b.name.toLowerCase())||compare(a.kind,b.kind)||compare(a.id,b.id));
 if(pins.items.map(r=>r.id).join()!==expectedPins.slice(0,100).map(r=>r.id).join())throw new Error('Mixed alphabetical pins differ');
 const dense=await request(owned,'/resources?collection='+m.collections[0].id+'&size=100');
 const denseCount=m.resources.filter((_,i)=>i%(m.collections.length-4)===0||i<500).length;if(dense.totalItems!==denseCount)throw new Error('Dense collection membership differs');
 if((await request(owned,'/resources?collection='+m.collections.at(-1).id+'&size=100')).totalItems!==0)throw new Error('Empty collection differs');
 const recent=await request(owned,'/resources?size=24&sort=recent');if(recent.items.map(r=>r.id).join()!==m.recent.join())throw new Error('Interleaved recent order differs');
 const phrase=m.small?'atlasbeacon0031':m.expected.bodyPhrase,target=m.small?id('note',31):m.expected.bodyResource;
 const hits=await request(owned,'/resources/query?q='+phrase);if(!hits.items.some(r=>r.resource?.id===target||r.id===target))throw new Error('Body marker not found');
 if((await request(owned,'/resources?q='+phrase)).totalItems!==0)throw new Error('Title search incorrectly found body-only phrase');
 const backlinks=await request(owned,'/resources/'+m.expected.sharedImage+'/backlinks');if(backlinks.length!==m.expected.sharedSources)throw new Error('Shared image sources differ');
 for(const kind of ['image','pdf','text','other']){const r=m.resources.find(r=>r.category===kind);const raw=await request(owned,'/resources/'+r.id+'/raw');if(createHash('sha256').update(raw).digest('hex')!==r.sha256)throw new Error('Original file hash differs');}
 console.log('Atlas counts, title/body search, interleaved recency, shared references and original hashes verified.');
}
async function benchmark(owned,root){
 const cases={library:'/resources?size=100',recent:'/resources?sort=recent&size=100',pins:'/organization/pins?size=100',notes:'/resources?type=note&size=100',collection:'/resources?collection='+id('collection',0)+'&size=100',title:'/resources?q=field&size=100',content:'/resources/query?q=observations&size=100',tags:'/tags/browse?size=100',allTags:'/tags',usage:'/resources/'+id('image',0)+'/backlinks'};const results={};
 for(const [name,path]of Object.entries(cases)){const times=[];for(let n=0;n<7;n++){const at=performance.now();await request(owned,path);times.push(performance.now()-at);}const warm=times.slice(1).sort((a,b)=>a-b);results[name]={firstMs:times[0],warmMedianMs:(warm[2]+warm[3])/2,warmMaxMs:warm.at(-1),requests:7};}
 const os=await import('node:os'),caps=await request(owned,'/capabilities');await atomic(join(root,'baseline-report.json'),{seed:SEED,created:new Date().toISOString(),hardware:{cpu:os.cpus()[0].model,ram:os.totalmem(),os:os.platform(),release:os.release(),storageRoot:root},hostBuild:caps.serverBuild??caps.build,results,limits:'First request is not a cold OS/disk cache measurement. Native UI/shared panes/journeys measured separately; six warm samples give median/max, not a statistically reliable p95. No speedup claim.'});
}
export async function main(){
 const mode=process.argv[2]??'generate',small=process.argv.includes('--small'),root=await rootGuard(process.env.ATLAS_ROOT??defaultRoot,mode==='generate',small);
 if(mode==='generate')return generate(root,small);
 if(mode==='open'){await prepareProfile(root);const env={...process.env,VAULTOR_DESKTOP_TEST_DIRECTORY:join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.VAULTOR_UPDATE_RELAUNCH_CHECK;await runChild(process.env.ATLAS_APP??fileURLToPath(new URL('../releases/win-unpacked/Vaultor.exe',import.meta.url)),[],env);return;}
 const owned=new OwnedServer({bundle,data:join(root,'profile','local-workspace')});await owned.start();
 try{const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
  if(mode==='verify')return await verify(owned,manifest);
  if(mode==='benchmark')return await benchmark(owned,root);
  if(mode==='reset'){
   if(!process.argv.includes('--discard-lab-changes'))throw new Error('Reset needs --discard-lab-changes; this discards only marked Atlas edits.');
   const bytes=await readFile(join(root,'baseline.zip'));if(createHash('sha256').update(bytes).digest('hex')!==manifest.archive.sha256)throw new Error('Baseline checksum differs');
   const form=new FormData();form.set('file',new Blob([bytes],{type:'application/zip'}),'atlas-baseline.zip');const preview=await request(owned,'/imports/preview','POST',form);await atomic(join(root,'last-reset-preview.json'),preview);
   await operation(owned,await request(owned,'/imports/'+preview.operation.id+'/commit','POST',{mode:'replace',confirmation:'replace'}));
   for(const id of [...manifest.recent].reverse()){await request(owned,'/resources/'+id+'/open','POST');await new Promise(r=>setTimeout(r,8));}
   await verify(owned,manifest);console.log('Atlas restored and verified from baseline; seeded Recent order restored. Session data is not deleted.');return;
  }throw new Error('Use generate, open, verify, benchmark or reset.');
 }finally{await owned.stop();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
