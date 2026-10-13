import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {OwnedServer} from '../src/owned-server.mjs';

// Explicit disposable owned host; never resolves installed personal storage or prints its credentials.
const data=await mkdtemp(join(tmpdir(),'vaultor-workspace-package-'));
const bundle=resolve(process.argv[2]||fileURLToPath(new URL('../bundle',import.meta.url)));
const host=new OwnedServer({bundle,data,timeout:90000});
async function call(method,path,workspace,body,status=200){
  const response=await fetch(host.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':host.accessKey,...(workspace?{'X-Vaultor-Workspace':workspace}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  assert.equal(response.status,status,method+' '+path);return response.status===204?null:response.json();
}
try {
  await host.start();
  assert.equal((await call('GET','/capabilities')).multiWorkspace,true);
  const legacy=await call('GET','/workspace/identity');
  const note=await call('POST','/resources',null,{title:'Legacy survives',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Original default content'}]}]}});
  const other=randomUUID();await call('PUT','/owner/workspaces/'+other,null,{name:'Isolated packaged workspace'});
  const second=await call('POST','/resources',other,{title:'Secondary survives',content:{type:'doc',content:[]}});
  await call('GET','/resources/'+second.id,null,null,404);
  assert.equal((await call('GET','/resources/'+note.id)).title,'Legacy survives');
  const operation=await call('POST','/exports',other,{scope:'workspace',format:'zip'});
  for(let i=0;i<100;i++){const state=await call('GET','/operations/'+operation.id,other);if(state.status==='SUCCEEDED')break;assert.notEqual(state.status,'FAILED');await new Promise(r=>setTimeout(r,100));}
  assert.equal((await call('GET','/operations/'+operation.id,other)).status,'SUCCEEDED');
  await call('GET','/operations/'+operation.id,null,null,404);
  await host.stop();assert.equal(host.status,'stopped','All workspace gates/transfers must drain before private stop');
  await host.start();
  assert.deepEqual(await call('GET','/workspace/identity'),legacy);
  assert.equal((await call('GET','/resources/'+note.id)).title,'Legacy survives');
  assert.equal((await call('GET','/resources/'+second.id,other)).title,'Secondary survives');
  assert.equal((await call('GET','/workspaces')).length,2);
  assert.equal(JSON.parse(await readFile(join(data,'workspaces','catalog.json'),'utf8')).version,1);
  await host.stop();assert.equal(host.status,'stopped','Restarted contexts must close safely');
  console.log('Packaged workspace isolation/export/private-stop/restart passed. Disposable data: '+data);
} finally {if(host.child)await host.stop();}
