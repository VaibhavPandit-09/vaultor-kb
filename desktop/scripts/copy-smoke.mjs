import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {OwnedServer} from '../src/owned-server.mjs';
import {WorkspaceCopies} from '../src/workspace-copies.mjs';
const root=await mkdtemp(join(tmpdir(),'vaultor-w3-copy-')),bundle=resolve(process.argv[2]||'desktop/bundle');
const source=new OwnedServer({bundle,data:join(root,'source')}),destination=new OwnedServer({bundle,data:join(root,'local')});
async function api(host,path,method='GET',body,scope){const r=await fetch(host.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':host.accessKey,...(scope?{'X-Vaultor-Workspace':scope}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,method+' '+path+' '+r.status);return r.json();}
try{
 await source.start();const identity=await api(source,'/workspace/identity');const note=await api(source,'/resources','POST',{title:'Remote original',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Source remains independent'}]}]}});
 let current={token:'test',ownerKey:source.accessKey,profile:{id:'external-source',kind:'local',address:source.address,selectedWorkspaceId:identity.id}};
 const copies=new WorkspaceCopies({directory:join(root,'copies'),owned:destination,source:()=>current}),id=randomUUID();
 const preview=await copies.preview({id,name:'Independent local copy',token:'test'});assert.equal(preview.state,'PREVIEW');assert.equal((await api(destination,'/workspaces')).length,1);assert.equal((await copies.preview({id,name:'Independent local copy',token:'test'})).id,id);
 await copies.commit({id});let receipt;for(let n=0;n<200;n++){receipt=await copies.status({id});if(['FAILED','SUCCEEDED'].includes(receipt.state))break;await new Promise(r=>setTimeout(r,100));}assert.equal(receipt.state,'SUCCEEDED',receipt.detail);assert.equal((await api(destination,'/workspaces')).length,2);
 const copy=await api(destination,'/resources/'+note.id,'GET',undefined,id);assert.equal(copy.title,note.title);const localIdentity=await api(destination,'/workspace/identity','GET',undefined,id);assert.notEqual(localIdentity.id,identity.id);
 const changed=await fetch(destination.address+'/api/resources/'+note.id+'/note',{method:'PUT',headers:{'X-Vaultor-Owner':destination.accessKey,'X-Vaultor-Workspace':id,'If-Match':'"'+copy.revision+'"','Content-Type':'application/json'},body:JSON.stringify({title:'Local edited copy',content:copy.content})});assert.equal(changed.status,200);assert.equal((await api(source,'/resources/'+note.id)).title,'Remote original');
 const restarted=new WorkspaceCopies({directory:join(root,'copies'),owned:destination,source:()=>current});assert.equal((await restarted.status({id})).state,'SUCCEEDED');assert.equal((await readFile(join(root,'copies',id+'.json'),'utf8')).includes(source.accessKey),false);
 await destination.stop();await destination.start();assert.equal((await api(destination,'/resources/'+note.id,'GET',undefined,id)).title,'Local edited copy');
 console.log('Disposable native copy preview/commit/identical retry, preserved IDs, independent edits, private journal and restart passed. '+root);
}finally{await source.stop();await destination.stop();}
