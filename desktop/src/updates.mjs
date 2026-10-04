import {createHash,verify,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdir,rename,stat,cp,readdir,lstat,rm,statfs} from 'node:fs/promises';
import {join,resolve,sep,dirname} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
export const MAX_UPDATE_BYTES=1024*1024*1024;
const MAX_MANIFEST=16*1024;
export function version(value){if(typeof value!=='string'||!/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value))throw new Error('Invalid stable release version.');return value.split('.').map(Number);}
export function newer(a,b){const aa=version(a),bb=version(b);for(let i=0;i<3;i++)if(aa[i]!==bb[i])return aa[i]>bb[i];return false;}
export function feedAddress(value){if(value==='')return '';if(typeof value!=='string'||value.length>2048)throw new Error('Invalid update feed.');const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new Error('Use an HTTPS manifest URL without credentials.');return url.href;}
export function validateRelease(envelope,publicKey,platform=process.platform,arch=process.arch){
 const m=envelope?.manifest;version(m?.appVersion);
 if(m.format!==1||m.platform!==platform||m.arch!==arch||!['win32','darwin'].includes(platform)||m.minimumProtocol!==1)throw new Error('Update does not match this platform or supported protocol.');
 const extension=platform==='win32'?'.exe':'.dmg';
 if(typeof m.filename!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{1,180}$/.test(m.filename)||!m.filename.endsWith(extension)||!Number.isSafeInteger(m.size)||m.size<1||m.size>MAX_UPDATE_BYTES||!/^([a-f0-9]{64})$/.test(m.sha256))throw new Error('Invalid update filename, size or checksum (limit 1 GiB).');
 if(typeof envelope.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)||!verify(null,Buffer.from(JSON.stringify(m)),publicKey,Buffer.from(envelope.signature,'base64')))throw new Error('Update release signature is invalid. Use a package signed by your original release key.');
 return m;
}
async function hash(path){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');}
async function atomic(path,data){await mkdir(dirname(path),{recursive:true,mode:0o700});const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(data,null,2)+'\n',{mode:0o600});await rename(temp,path);}
function inside(root,path){const p=resolve(path);if(!p.startsWith(resolve(root)+sep))throw new Error('Update path escaped its storage directory.');return p;}
/** Update files never come from a workspace host. Only signed publisher manifests are trusted. */
export class Updates {
 constructor({directory,workspace,publicKey,currentVersion,platform=process.platform,arch=process.arch,fetcher=fetch,onState=()=>{}}){Object.assign(this,{directory:resolve(directory),workspace:resolve(workspace),publicKey,currentVersion,platform,arch,fetcher,onState});this.state={phase:'idle',feed:'',currentVersion,progress:0,error:''};this.records=[];}
 snapshot(){return {...this.state,backupDirectory:this.journal?.backup??'',recoveryAvailable:Boolean(this.journal?.backup),previousPackageAvailable:Boolean(this.journal?.previous)};}
 publish(values){this.state={...this.state,...values};this.onState(this.snapshot());}
 async load(){
  await mkdir(this.directory,{recursive:true,mode:0o700});
  try{const saved=JSON.parse(await readFile(join(this.directory,'settings.json'),'utf8'));this.state.feed=feedAddress(saved.feed);}catch(e){if(e.code!=='ENOENT')this.state.error='Update preferences are damaged. Configure the feed again; workspace data is untouched.';}
  try{this.records=JSON.parse(await readFile(join(this.directory,'packages.json'),'utf8'));if(!Array.isArray(this.records)||this.records.length>2)throw new Error();for(const r of this.records){inside(this.directory,r.file);validateRelease(r.envelope,this.publicKey,this.platform,this.arch);}}catch(e){this.records=[];if(e.code!=='ENOENT')this.state.error='Retained update packages could not be read. Import a signed package again.';}
  try{this.journal=JSON.parse(await readFile(join(this.directory,'journal.json'),'utf8'));inside(join(this.directory,'backups'),this.journal.backup);if(this.journal.previous)inside(this.directory,this.journal.previous);this.publish({phase:this.journal.status==='awaiting-start'?'awaiting-start':'idle',version:this.journal.targetVersion});}catch(e){if(e.code!=='ENOENT'){this.journal=null;this.state.error='Update recovery journal is damaged. Keep backup files and use the documented manual recovery procedure.';}}
  const candidate=this.records.find(r=>r.envelope.manifest.appVersion===this.journal?.targetVersion)||this.records[0];
  if(candidate){this.candidate=candidate;this.publish({phase:this.journal?.status==='awaiting-start'?'awaiting-start':'ready',version:candidate.envelope.manifest.appVersion});}
 }
 async configure(feed){if(this.running)throw new Error('Finish the current update action first.');feed=feedAddress(feed);await atomic(join(this.directory,'settings.json'),{feed});this.available=null;this.publish({feed,error:'',phase:this.candidate?'ready':'idle'});return this.snapshot();}
 async exclusive(task){if(this.running)throw new Error('An update action is already running.');this.running=true;try{return await task();}catch(e){this.publish({phase:this.candidate?'ready':'error',error:e.message});throw e;}finally{this.running=false;}}
 async check(){return this.exclusive(async()=>{
  if(!this.state.feed)throw new Error('No update feed configured. Import a local signed update package, or configure an HTTPS manifest URL.');
  this.publish({phase:'checking',error:'',progress:0});
  const response=await this.fetcher(this.state.feed,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Update check failed ('+response.status+'). Retry.');
  let bytes=0;const chunks=[];try{for await(const chunk of response.body){bytes+=chunk.length;if(bytes>MAX_MANIFEST)throw new Error('Release manifest exceeds 16 KiB.');chunks.push(chunk);}}finally{await response.body?.cancel?.().catch(()=>{});}
  const envelope=JSON.parse(Buffer.concat(chunks).toString('utf8'));const m=validateRelease(envelope,this.publicKey,this.platform,this.arch);
  if(!newer(m.appVersion,this.currentVersion)){this.publish({phase:this.candidate?'ready':'current',error:''});return this.snapshot();}
  this.available={envelope,url:new URL(m.filename,this.state.feed).href};this.publish({phase:'available',version:m.appVersion});return this.snapshot();
 });}
 async verifyFile(file,envelope){const m=validateRelease(envelope,this.publicKey,this.platform,this.arch);const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size!==m.size||await hash(file)!==m.sha256)throw new Error('Update package size/checksum mismatch. Nothing will be installed.');return m;}
 async space(bytes){const info=await statfs(this.directory);if(Number(info.bavail)*Number(info.bsize)<bytes+256*1024*1024)throw new Error('Not enough disk space to stage the update and recovery backup. Free space and retry.');}
 async retain(file,envelope){await this.verifyFile(file,envelope);const next=[{file,envelope},...this.records.filter(r=>r.envelope.manifest.appVersion!==envelope.manifest.appVersion)].slice(0,2);await atomic(join(this.directory,'packages.json'),next);const old=this.records;this.records=next;this.candidate=next[0];this.publish({phase:'ready',version:envelope.manifest.appVersion,progress:100,error:''});for(const r of old)if(!next.some(n=>n.file===r.file)&&r.file!==this.journal?.previous)await rm(inside(this.directory,r.file),{force:true});return this.snapshot();}
 async importPackage(manifestFile){return this.exclusive(async()=>{
  if((await stat(manifestFile)).size>MAX_MANIFEST)throw new Error('Release manifest exceeds 16 KiB.');
  const envelope=JSON.parse(await readFile(manifestFile,'utf8'));const m=validateRelease(envelope,this.publicKey,this.platform,this.arch);
  if(newer(this.currentVersion,m.appVersion))throw new Error('Older releases are available only through explicit recovery, not ordinary updating.');
  const source=join(dirname(manifestFile),m.filename);await this.verifyFile(source,envelope);await this.space(m.size);
  const file=inside(this.directory,join(this.directory,'package-'+randomUUID()+ (this.platform==='win32'?'.exe':'.dmg')));
  this.publish({phase:'staging',progress:0,error:''});try{await cp(source,file,{errorOnExist:true,force:false});return await this.retain(file,envelope);}catch(e){await rm(file,{force:true});throw e;}
 });}
 async download(){return this.exclusive(async()=>{
  if(!this.available)throw new Error('Check for an update first.');const {envelope,url}=this.available;const m=validateRelease(envelope,this.publicKey,this.platform,this.arch);await this.space(m.size);
  const file=inside(this.directory,join(this.directory,'package-'+randomUUID()+(this.platform==='win32'?'.exe':'.dmg')));this.controller=new AbortController();let count=0;
  this.publish({phase:'downloading',progress:0,error:''});
  const timeout=setTimeout(()=>this.controller.abort(),600000);
  try{const response=await this.fetcher(url,{redirect:'error',signal:this.controller.signal});if(!response.ok)throw new Error('Update download failed ('+response.status+').');
   if(Number(response.headers.get('content-length'))>m.size)throw new Error('Update exceeds signed size.');
   const bound=new Transform({transform:(chunk,_encoding,done)=>{count+=chunk.length;if(count>m.size)done(new Error('Update exceeds signed size.'));else{const progress=Math.floor(count/m.size*100);if(progress!==this.state.progress)this.publish({progress});done(null,chunk);}}});
   await pipeline(Readable.fromWeb(response.body),bound,createWriteStream(file,{flags:'wx',mode:0o600}),{signal:this.controller.signal});return await this.retain(file,envelope);
  }catch(e){await rm(file,{force:true});throw e;}finally{clearTimeout(timeout);this.controller=null;}
 });}
 cancel(){this.controller?.abort();}
 async inventory(root){let bytes=0;const files=[];const visit=async dir=>{for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isSymbolicLink())throw new Error('Workspace backup contains a symbolic link; review storage before updating.');if(item.isDirectory())await visit(path);else if(item.isFile()){const info=await stat(path);bytes+=info.size;if(files.length>=100000)throw new Error('Workspace backup exceeds 100,000 files.');files.push({path:path.slice(root.length+1),size:info.size,sha256:await hash(path)});}else throw new Error('Workspace backup has unsupported special files.');}};await visit(root);return {bytes,files};}
 async prepare({stop,barrier}){
  return this.exclusive(async()=>{
   if(!this.candidate)throw new Error('Download/import a signed update first.');await this.verifyFile(this.candidate.file,this.candidate.envelope);
   // The main process barrier freezes new mutations after flushing this client's drafts.
   await barrier();this.publish({phase:'preparing',error:''});await stop();
   const backup=inside(join(this.directory,'backups'),join(this.directory,'backups',randomUUID()));
   await mkdir(backup,{recursive:true,mode:0o700});
   const exists=await stat(this.workspace).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
   const inventory=exists?await this.inventory(this.workspace):{bytes:0,files:[]};await this.space(inventory.bytes);
   if(exists)await cp(this.workspace,join(backup,'workspace'),{recursive:true,verbatimSymlinks:true});else await mkdir(join(backup,'workspace'));
   const copied=await this.inventory(join(backup,'workspace'));const expected=new Map(inventory.files.map(f=>[f.path,f]));if(copied.files.length!==expected.size||copied.files.some(f=>f.size!==expected.get(f.path)?.size||f.sha256!==expected.get(f.path)?.sha256))throw new Error('Workspace backup verification failed; nothing will be installed.');
   await atomic(join(backup,'manifest.json'),{version:1,files:inventory.files});
   const previous=this.records.find(r=>r.envelope.manifest.appVersion===this.currentVersion&&r.file!==this.candidate.file);
   this.journal={version:1,status:'awaiting-start',targetVersion:this.candidate.envelope.manifest.appVersion,previousVersion:this.currentVersion,backup,previous:previous?.file??'',previousEnvelope:previous?.envelope??null,createdAt:Date.now()};
   await atomic(join(this.directory,'journal.json'),this.journal);
   const backups=await Promise.all((await readdir(join(this.directory,'backups'))).filter(name=>/^[a-f0-9-]{36}$/.test(name)).map(async name=>{const path=inside(join(this.directory,'backups'),join(this.directory,'backups',name));return {path,at:(await stat(path)).mtimeMs};}));
   for(const old of backups.sort((a,b)=>b.at-a.at).slice(2))if(old.path!==backup)await rm(old.path,{recursive:true,force:true});
   this.publish({phase:'awaiting-start'});return {file:this.candidate.file,platform:this.platform};
  });
 }
 async confirmStart(){if(this.journal?.status==='awaiting-start'&&this.currentVersion===this.journal.targetVersion){this.journal.status='confirmed';await atomic(join(this.directory,'journal.json'),this.journal);this.publish({phase:'ready',error:''});}}
 async restore({stop,barrier}){return this.exclusive(async()=>{
  if(!this.journal?.backup)throw new Error('No update recovery backup available.');await barrier();await stop();
  const backup=inside(join(this.directory,'backups'),this.journal.backup),source=join(backup,'workspace');
  const manifest=JSON.parse(await readFile(join(backup,'manifest.json'),'utf8'));if(manifest.version!==1||!Array.isArray(manifest.files)||manifest.files.length>100000)throw new Error('Recovery backup manifest is invalid.');
  for(const entry of manifest.files){const path=inside(source,join(source,entry.path));const info=await lstat(path);if(info.isSymbolicLink()||info.size!==entry.size||await hash(path)!==entry.sha256)throw new Error('Recovery backup is damaged; current workspace remains intact.');}
  const actual=await this.inventory(source);if(actual.files.length!==manifest.files.length)throw new Error('Recovery backup has unexpected files.');await this.space(actual.bytes);
  // Copy fully before the rename: a copy/disk failure must leave current data intact.
  const staged=this.workspace+'.recover-'+randomUUID();await cp(source,staged,{recursive:true,verbatimSymlinks:true});
  const preserved=this.workspace+'.before-recovery-'+randomUUID();let renamed=false;
  try{await rename(this.workspace,preserved);renamed=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  try{await rename(staged,this.workspace);}catch(e){if(renamed)await rename(preserved,this.workspace);throw e;}
  this.journal.status='restored';this.journal.preserved=preserved;await atomic(join(this.directory,'journal.json'),this.journal);this.publish({phase:'restored',error:''});let previous=this.journal.previous; if(previous){try{await this.verifyFile(previous,this.journal.previousEnvelope);}catch{previous='';}} return {previous,preserved};
 });}
}
