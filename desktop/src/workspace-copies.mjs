import {mkdir,readFile,writeFile,rename,rm,stat,readdir} from 'node:fs/promises';
import {createWriteStream,openAsBlob} from 'node:fs';
import {join} from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {connectionFetch} from './network.mjs';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const limit=512*1024*1024;
async function json(connection,path,method='GET',body,attempt=0){
 const response=await connectionFetch(connection,path,{method,headers:body instanceof FormData?{}:{'Content-Type':'application/json'},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(body instanceof FormData?120000:10000)});
 const reader=response.body?.getReader(),chunks=[];let size=0;try{if(reader)for(;;){const {done,value}=await reader.read();if(done)break;if((size+=value.length)>262144)throw Error('Workspace response exceeded limit');chunks.push(Buffer.from(value));}}finally{await reader?.cancel().catch(()=>{});}
 const data=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(response.status===409&&method==='GET'&&attempt<10){await new Promise(r=>setTimeout(r,200));return json(connection,path,method,body,attempt+1);}if(!response.ok){const error=Error(String(data.detail||'Workspace request failed ('+response.status+')').slice(0,500));error.status=response.status;throw error;}return data;
}
/** Main-only snapshot streaming. Journals contain identities/state, never credentials or raw filesystem input. */
export class WorkspaceCopies {
 constructor({directory,owned,source}){Object.assign(this,{directory,owned,source});this.active=false;}
 path(id){if(!uuid(id))throw Error('Invalid copy identity');return join(this.directory,id+'.json');}
 async save(job){const path=this.path(job.id);await mkdir(this.directory,{recursive:true});const temp=path+'.tmp';await writeFile(temp,JSON.stringify(job),{mode:0o600});await rename(temp,path);return job;}
 async list(){await mkdir(this.directory,{recursive:true});const rows=[];for(const name of await readdir(this.directory))if(/^[a-f0-9-]{36}\.json$/.test(name)){if(rows.length>=128)throw Error('Local copy receipt limit reached');const bytes=await readFile(join(this.directory,name));if(bytes.length>8192)throw Error('Copy journal damaged');rows.push(JSON.parse(bytes));}return rows;}
 async local(){await this.owned.start();return {profile:{kind:'local',address:this.owned.address},ownerKey:this.owned.accessKey};}
 current(token){const value=this.source();if(!value||value.token!==token)throw Error('Connection changed. Retry from the source workspace.');return value;}
 async preview({id,name,token}){
  if(this.active)throw Error('Another local copy is running');if(!uuid(id)||typeof name!=='string'||!name.trim()||name.length>100||Array.from(name).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127))throw Error('Choose a valid copy name');
  const source=this.current(token);if(source.profile.source==='bundled')throw Error('This workspace is already on this computer');this.active=true;let job;
  try{
   const jobs=await this.list();job=jobs.find(v=>v.id===id);if(!job&&jobs.some(v=>!['SUCCEEDED','CANCELLED'].includes(v.state)))throw Error('Finish or cancel the pending local copy before starting another');if(job&&(job.name!==name.trim()||job.sourceProfileId!==source.profile.id))throw Error('Retry must use the original name and source');if(!job&&(await this.list()).length>=128)throw Error('Copy receipt limit reached');
   if(job?.state==='SUCCEEDED')return await this.status({id});
   const identity=job?.snapshotVerified?{id:job.workspaceId,generation:job.generation}:await json(source,'/workspace/identity');
   if(job&&(identity.id!==job.workspaceId||identity.generation!==job.generation))throw Error('Source workspace was replaced. Start a new copy; previous data retained');
   if(job&&source.profile.selectedWorkspaceId&&source.profile.selectedWorkspaceId!==job.workspaceId)throw Error('Return to the source workspace before retrying its copy');
   if(!job){const host=await json(source,'/access/host');job=await this.save({version:1,id,name:name.trim(),sourceProfileId:source.profile.id,workspaceId:identity.id,generation:identity.generation,hostId:host.hostId,state:'PREPARING'});}
   const scoped={...source,profile:{...source.profile,selectedWorkspaceId:job.workspaceId}};
   const destination=await this.local();const caps=await json(destination,'/capabilities');if(caps.workspaceImports!==true)throw Error('Update This computer host before making a local copy');
   const archive=join(this.directory,id+'.zip');
   if(!job.snapshotVerified){
    let operation;if(job.exportId){try{operation=await json(scoped,'/operations/'+job.exportId);}catch{throw Error('Prepared snapshot unavailable. Start a new copy identity; retained source is unchanged');}}
    if(!operation||['FAILED','CANCELLED'].includes(operation.status)){operation=await json(scoped,'/exports','POST',{scope:'workspace',format:'zip'});job=await this.save({...job,exportId:operation.id,state:'PREPARING'});}
    for(let n=0;operation.status!=='SUCCEEDED';n++){if(['FAILED','CANCELLED'].includes(operation.status)||n>=1200)throw Error('Snapshot preparation failed or timed out. Retry');await new Promise(r=>setTimeout(r,500));operation=await json(scoped,'/operations/'+job.exportId);}
    job=await this.save({...job,state:'DOWNLOADING'});const response=await connectionFetch(scoped,'/exports/'+job.exportId+'/download',{signal:AbortSignal.timeout(120000)});if(!response.ok||!response.body)throw Error('Prepared ZIP download unavailable');if(Number(response.headers.get('content-length'))>limit){await response.body.cancel();throw Error('Workspace ZIP exceeds512MiB');}let size=0;const pending=archive+'.tmp';
    try{await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,_encoding,done){size+=chunk.length;done(size>limit?Error('Workspace ZIP exceeds512MiB'):null,chunk);}}),createWriteStream(pending,{mode:0o600}));const after=await json(scoped,'/workspace/identity');if(after.id!==job.workspaceId||after.generation!==job.generation)throw Error('Source was replaced during download. Start a new copy');await rename(pending,archive);job=await this.save({...job,state:'DOWNLOADED',snapshotVerified:true});}finally{await rm(pending,{force:true});}
   }
   if((await stat(archive)).size>limit)throw Error('Workspace ZIP exceeds limit');
   const form=new FormData();form.set('name',job.name);form.set('origin',JSON.stringify({hostId:job.hostId,workspaceId:job.workspaceId,generation:job.generation}));form.set('file',await openAsBlob(archive,{type:'application/zip'}),'workspace.zip');
   const receipt=await json(destination,'/workspace-imports/'+id,'PUT',form);await this.save({...job,state:receipt.state});return receipt;
  }catch(e){if(job)await this.save({...job,error:e.message}).catch(()=>{});throw e;}finally{this.active=false;}
 }
 async status({id}){this.path(id);const receipt=await json(await this.local(),'/workspace-imports/'+id);const job=(await this.list()).find(v=>v.id===id);if(job){await this.save({...job,state:receipt.state,error:undefined});if(receipt.state==='SUCCEEDED')await rm(join(this.directory,id+'.zip'),{force:true});}return receipt;}
 async commit({id}){this.path(id);return json(await this.local(),'/workspace-imports/'+id+'/commit','POST');}
 async cancel({id}){this.path(id);if(this.active)throw Error('Wait for copy preparation');let receipt;try{receipt=await json(await this.local(),'/workspace-imports/'+id,'DELETE');}catch(e){if(e.status!==404)throw e;receipt={id,state:'CANCELLED'};}const job=(await this.list()).find(v=>v.id===id);if(job)await this.save({...job,state:receipt.state});await rm(join(this.directory,id+'.zip'),{force:true});return receipt;}
}
