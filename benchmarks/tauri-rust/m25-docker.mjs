import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {readFile, writeFile, mkdir, mkdtemp, unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes, randomUUID, createHash} from 'node:crypto';
import {request} from 'node:https';
import {setTimeout as delay} from 'node:timers/promises';
import {browserChecks} from './m25-browser.mjs';
const path=await mkdtemp(join(tmpdir(),'vaultor-m25-headless-'));
const openssl=process.env.VAULTOR_BENCH_OPENSSL;
assert(openssl,'Set VAULTOR_BENCH_OPENSSL to the local OpenSSL executable');
const image=process.env.VAULTOR_M25_TEST_IMAGE||'vaultor-next-m24d:local';
const samples=[];
const token='vaultor-m25-'+randomBytes(4).toString('hex');
const network=token+'-net';
const access=token+'-access';
const workspace=token+'-workspace';
const alternate=token+'-alternate';
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
const cert=(...args)=>execFileSync(openssl,args,{cwd:path,windowsHide:true,stdio:'ignore'});
const ip='172.30.245.2';
cert('req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-subj','/CN=Vaultor M25 Disposable CA','-days','2','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign','-keyout','ca.key','-out','ca.pem');
cert('req','-new','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-subj','/CN=Vaultor M25 Disposable','-keyout','server-key.pem','-out','leaf.csr');
await writeFile(join(path,'leaf.ext'),'subjectAltName=IP:127.0.0.1,IP:'+ip+'\nextendedKeyUsage=serverAuth\n');
cert('x509','-req','-in','leaf.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-days','1','-extfile','leaf.ext','-out','leaf.pem');
const ca=await readFile(join(path,'ca.pem'));
const tls=join(path,'listener');
await mkdir(tls);
await writeFile(join(tls,'chain.pem'),Buffer.concat([await readFile(join(path,'leaf.pem')),ca]));
await writeFile(join(tls,'server-key.pem'),await readFile(join(path,'server-key.pem')));
await writeFile(join(tls,'ca.pem'),ca);
const bind=['--mount','type=bind,source='+tls+',target=/tls,readonly'];
const accessMounted=['--mount','type=volume,source='+access+',target=/data/access'];
function owner(...args){return JSON.parse(docker('exec',token,'vaultor-next-host','owner','/data/access',...args));}
let port;
const json=(method,path,headers={},body,raw=false)=>new Promise((resolve,reject)=>{
  const data=body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body);
  const req=request({hostname:'127.0.0.1',port,path,method,ca,agent:false,headers:{...headers,...(data?{'Content-Type':headers['Content-Type']||'application/json','Content-Length':Buffer.byteLength(data)}:{})}},res=>{
    const chunks=[];
    res.on('data',chunk=>chunks.push(chunk));
    res.on('end',()=>{
      const bytes=Buffer.concat(chunks);
      const text=raw?'':bytes.toString('utf8');
      resolve({status:res.statusCode,body:raw?bytes:text&&res.headers['content-type']?.includes('json')?JSON.parse(text):text});
    });
  });
  req.setTimeout(2500,()=>req.destroy(Error('Timed out')));
  req.on('error',reject);req.end(data);
});
async function waitFor(){
  for(let i=0;i<50;i++){
    try{const r=await json('GET','/api/access/host');if(r.status===200)return r.body;}catch{}
    await delay(125);
  }
  throw Error('Linux candidate did not answer verified TLS.');
}
try{
  docker('network','create','--subnet','172.30.245.0/28',network);
  docker('volume','create',access);
  docker('volume','create',workspace);
  docker('run','--rm',...accessMounted,...bind,image,'init','/data/access','/tls/ca.pem');
  const startup = performance.now();
  docker('run','-d','--name',token,'--network',network,'--ip',ip,'-p','127.0.0.1::8443',...accessMounted,
    '--mount','type=volume,source='+workspace+',target=/data/workspace',...bind,'--cap-drop','ALL','--security-opt','no-new-privileges:true',
    image,'/data/workspace','/data/access','/tls/chain.pem','/tls/server-key.pem','/tls/ca.pem',ip+':8443');
  port=Number(docker('port',token,'8443/tcp').split(':').at(-1));
  const desc=await waitFor();
  assert.equal(desc.mobileProtocol,1);
  assert.equal(docker('image','inspect','--format','{{.Os}}/{{.Architecture}}',image),'linux/amd64');
  samples.push({metric:'container_to_verified_tls',value:performance.now()-startup,unit:'ms',notes:'Docker run through accepted TLS descriptor, including CLI and 125 ms polling.'});
  assert.equal(docker('inspect','--format','{{.Config.User}}',token),'10001:10001');
  const counters = () => {
    const [cpu, memory] = docker('exec',token,'sh','-ec','cat /sys/fs/cgroup/cpu.stat /sys/fs/cgroup/memory.current').split('\n').filter(line=>/^usage_usec |^\d+$/.test(line));
    assert(cpu && memory);
    return {cpu:Number(cpu.split(' ')[1]), memory:Number(memory), time:performance.now()};
  };
  await delay(5000);
  const initial = counters();
  await delay(60_000);
  const settled = counters();
  samples.push({metric:'container_idle_one_core',value:(settled.cpu-initial.cpu)/(settled.time-initial.time)/10,unit:'%',notes:'60 s cgroup usage delta. Two brief cgroup reads are included.'});
  samples.push({metric:'container_memory_current',value:settled.memory/1048576,unit:'MiB',notes:'Linux cgroup memory.current, includes cache and kernel accounting. Separate from Windows process memory.'});
  docker('volume','create',alternate);
  const alternateAccess=['--mount','type=volume,source='+alternate+',target=/data/access'];
  docker('run','--rm',...alternateAccess,...bind,image,'init','/data/access','/tls/ca.pem');
  assert.throws(()=>docker('run','--rm',...alternateAccess,...bind,'--mount','type=volume,source='+workspace+',target=/data/workspace',
    image,'/data/workspace','/data/access','/tls/chain.pem','/tls/server-key.pem','/tls/ca.pem','127.0.0.1:8443'),
    error=>error.status!==0&&/already open in another process|already owned|existing owner|lock|already in use/i.test(error.stderr));
  const pending=await json('POST','/api/pairings',{}, {name:'Disposable M25 Linux benchmark',kind:'desktop',nonce:randomBytes(32).toString('hex'),fingerprint:desc.fingerprint});
  assert.equal(pending.status,200);
  const projected='/api/next/mobile/v1';
  assert.equal((await json('GET',projected+'/workspaces')).status,401);
  const expected=owner('pending').find(p=>p.code===pending.body.code);
  assert.ok(expected);
  owner('approve',expected.id,expected.code);
  const paired=await json('POST','/api/pairings/'+expected.id+'/complete',{'X-Vaultor-Pairing':pending.body.secret},{});
  assert.equal(paired.status,200);
  const headers={Authorization:'Bearer '+paired.body.credential};
  assert.deepEqual((await json('GET',projected+'/workspaces',headers)).body,[]);
  owner('grant',paired.body.deviceId);
  const ws=await json('GET',projected+'/workspace/identity',headers);
  assert.equal(ws.status,200);
  assert.equal((await json('GET',projected+'/resources',headers)).status,200);
  const estimate=await json('POST',projected+'/companions/estimate',headers,{scope:'workspace',generation:ws.body.generation,ids:[],dependencies:'images',files:'readable'});
  assert.equal(estimate.status,200);

  const id=randomUUID(), scope=ws.body.generation, fileName='Imported browser fixture.txt';
  const noteBytes=Buffer.from('Session and transfer evidence from an Android import.');
  const check=bytes=>createHash('sha256').update(bytes).digest('hex');
  const intent={generation:scope,filename:fileName,mime:'text/plain',sha256:check(noteBytes),bytes:noteBytes.length,mode:'text',collectionId:null};
  const boundary='vaultor-fixture';
  const upload=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="intent"\r\n\r\n'+JSON.stringify(intent)+'\r\n--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="sample.txt"\r\n\r\n'),noteBytes,Buffer.from('\r\n--'+boundary+'--\r\n')]);
  const hdr={...headers,'Content-Type':'multipart/form-data; boundary='+boundary};
  const importPath=projected+'/resources/collected-imports/'+id;
  assert.equal((await json('PUT',importPath,{'Content-Type':hdr['Content-Type']},upload)).status,401);
  let began=performance.now();
  const accepted=await json('PUT',importPath,hdr,upload);
  assert.equal(accepted.status,200,JSON.stringify(accepted.body));
  samples.push({metric:'docker_companion_text_import_receipt',value:performance.now()-began,unit:'ms',notes:'Linux/amd64 Docker loopback, authenticated short text conversion through durable receipt. Node client only.'});
  assert.equal(accepted.body.resourceId,id);
  assert.equal(accepted.body.sha256,intent.sha256);
  assert.deepEqual((await json('PUT',importPath,hdr,upload)).body,accepted.body);
  assert.deepEqual((await json('GET',importPath,headers)).body,accepted.body);
  for (let i=0;i<22;i++) {
    const started=performance.now();
    const read=await json('GET',projected+'/resources/'+id,headers);
    assert.equal(read.status,200);
    assert(JSON.stringify(read.body).includes('Session and transfer evidence'));
    if(i>=2) samples.push({metric:'container_authenticated_note',value:performance.now()-started,unit:'ms',notes:'New verified TLS connection through fully received saved note.'});
  }
  const largeBytes=Buffer.alloc(8*1024*1024);
  for(let i=0;i<largeBytes.length;i++)largeBytes[i]=(i*97+(i>>>15))&255;
  const largeId=randomUUID();
  const largeIntent={...intent,filename:'M25 streamed fixture.bin',mime:'application/octet-stream',mode:'original',bytes:largeBytes.length,sha256:check(largeBytes)};
  const largeUpload=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="intent"\r\n\r\n'+JSON.stringify(largeIntent)+'\r\n--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="fixture.bin"\r\n\r\n'),largeBytes,Buffer.from('\r\n--'+boundary+'--\r\n')]);
  const imported=await json('PUT',projected+'/resources/collected-imports/'+largeId,hdr,largeUpload);
  assert.equal(imported.status,200);
  assert.equal(imported.body.sha256,largeIntent.sha256);
  const verifiedDownload=()=>new Promise((resolve,reject)=>{
    const started=performance.now();
    const req=request({hostname:'127.0.0.1',port,path:projected+'/resources/'+largeId+'/raw',method:'GET',ca,agent:false,headers},res=>{
      let bytes=0;const hash=createHash('sha256');
      res.on('data',chunk=>{bytes+=chunk.length;hash.update(chunk);});
      res.on('error',reject);
      res.on('end',()=>{
        try {assert.equal(res.statusCode,200);assert.equal(bytes,largeBytes.length);assert.equal(hash.digest('hex'),largeIntent.sha256);resolve(performance.now()-started);} catch(error) {reject(error);}
      });
    });
    req.setTimeout(8000,()=>req.destroy(Error('Verified file download timed out')));req.on('error',reject);req.end();
  });
  for(let i=0;i<8;i++){
    const start=performance.now();
    await Promise.all([verifiedDownload(),verifiedDownload()]);
    if(i<2)continue;
    const wall=performance.now()-start;
    samples.push({metric:'container_two_downloads_wall',value:wall,unit:'ms',notes:'Two concurrent 8 MiB originals, byte count and SHA-256 verified. New TLS connections, loopback only.'});
    samples.push({metric:'container_two_downloads_rate',value:16_000/wall,unit:'MiB/s',notes:'Aggregate verified bytes / wall time.'});
  }
  const exportPath=projected+'/companions/exports/'+randomUUID();
  const exportIntent={generation:scope,scope:'note',format:'md',depth:0,ids:[id]};
  assert.equal((await json('PUT',exportPath,{},exportIntent)).status,401);
  began=performance.now();
  assert.equal((await json('PUT',exportPath,headers,exportIntent)).status,200);
  let receipt;
  for(let i=0;i<50;i++){
    const result=await json('GET',exportPath+'?generation='+scope,headers);
    assert.equal(result.status,200,JSON.stringify(result.body));
    assert.notEqual(result.body.operation.status,'FAILED');
    if(result.body.operation.status==='SUCCEEDED'){receipt=result.body;break;}
    await delay(125);
  }
  assert(receipt);
  const exported=await json('GET',exportPath+'/download?generation='+scope,headers);
  assert.equal(exported.status,200);
  assert.equal(check(exported.body),receipt.sha256);
  samples.push({metric:'docker_companion_note_export_download',value:performance.now()-began,unit:'ms',notes:'Linux/amd64 Docker loopback Markdown export through verified download with 125 ms polling cadence. Node client only.'});
  if(process.argv.includes('--m26-closure-final')){
    const path=projected+'/companions/exports/'+randomUUID();
    const query='?generation='+scope;
    const start=performance.now();
    const accepted=await json('PUT',path,headers,{...exportIntent,format:'pdf'});
    assert.equal(accepted.status,200,JSON.stringify(accepted.body));
    let ready;
    for(let attempt=0;attempt<50;attempt++){
      const result=await json('GET',path+query,headers);
      assert.equal(result.status,200);
      assert.notEqual(result.body.operation.status,'FAILED',JSON.stringify(result.body));
      if(result.body.operation.status==='SUCCEEDED'){ready=result.body;break;}
      await delay(125);
    }
    assert(ready);
    const document=await json('GET',path+'/download'+query,headers,undefined,true);
    assert.equal(document.status,200);
    assert.equal(document.body.subarray(0,5).toString(),'%PDF-');
    assert.equal(check(document.body),ready.sha256);
    samples.push({metric:'docker_companion_pdf_export_download',value:performance.now()-start,unit:'ms',notes:'Selected saved-note PDF render and verified download, including 125 ms polling cadence.'});
  }
  if (process.argv.includes('--m26a3')) {
    const reviewId=randomUUID(), comment='Disposable captured Review evidence';
    const review=await json('PUT',projected+'/reviews/'+reviewId+'/'+id,headers,
      {generation:scope,resourceId:id,baseRevision:'1',comment,context:'',quote:'',locator:{kind:'resource'}});
    assert.equal(review.status,200,JSON.stringify(review.body));
    const path=projected+'/companions/exports/'+randomUUID();
    const query='?generation='+scope;
    const accepted=await json('PUT',path,headers,{generation:scope,scope:'resources',format:'partial',depth:0,ids:[id]});
    assert.equal(accepted.status,200,JSON.stringify(accepted.body));
    let ready;
    for(let i=0;i<50;i++){
      const result=await json('GET',path+query,headers);
      assert.equal(result.status,200);
      assert.notEqual(result.body.operation.status,'FAILED');
      if(result.body.operation.status==='SUCCEEDED'){ready=result.body;break;}
      await delay(125);
    }
    assert(ready);
    const result=await json('GET',path+'/download'+query,headers,undefined,true);
    assert.equal(result.status,200);
    assert.equal(check(result.body),ready.sha256);
    assert.equal(result.body.subarray(0,8).toString(),'VAULTOR1');
    const end=48+Number(result.body.readBigUInt64LE(8));
    const manifest=JSON.parse(result.body.subarray(48,end));
    assert.equal(manifest.reviews.length,1);
    assert.equal(manifest.reviews[0].evidence.id,reviewId);
    assert.equal(manifest.reviews[0].evidence.baseRevision,1);
    assert.equal(manifest.reviews[0].evidence.comment,comment);
    assert(!JSON.stringify(manifest).includes(paired.body.credential));
  }
  if(process.argv.includes('--browser')) samples.push(...await browserChecks(docker,network,token,bind,owner,ip,fileName));

  if (process.argv.includes('--android-zip')) {
    const serial=process.env.VAULTOR_BENCH_ANDROID_SERIAL;
    const adb=process.env.VAULTOR_BENCH_ADB;
    assert(adb && /^emulator-\d+$/.test(serial??''));
    const android=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:30000,windowsHide:true}).trim();
    const apk=process.env.VAULTOR_BENCH_ANDROID_APK;
    const instrument=process.env.VAULTOR_BENCH_ANDROID_TEST_APK;
    assert(apk&&instrument);
    android('install','-r',apk);
    android('install','-r',instrument);
    android('reverse','tcp:'+port,'tcp:'+port);
    const test=spawn(adb,['-s',serial,'shell','am','instrument','-w','-e','class','com.vaultorandroid.NextZipHostTest',
      '-e','fixtureAddress','https://127.0.0.1:'+port,'-e','fixtureFingerprint',desc.fingerprint,
      'com.vaultor.app.next.test/androidx.test.runner.AndroidJUnitRunner'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let transcript='';
    test.stdout.on('data',data=>{transcript+=data.toString();});
    test.stderr.on('data',data=>{transcript+=data.toString();});
    const finished=new Promise(resolve=>test.on('exit',resolve));
    let handledPair=false;
    const handledZips=new Set();
    try {
      for(let i=0;i<160&&test.exitCode===null;i++){
        const log=android('logcat','-d','-s','NextZipFixture:I');
        if (!handledPair) {
          const request=[...log.matchAll(/PAIR (\d{6})/g)].at(-1);
          if (request) {
            const pending=owner('pending').find(value=>value.code===request[1]);
            if (pending) {
              owner('approve',pending.id,pending.code);
              const target=owner('devices').find(value=>value.name===pending.name && !value.workspace);
              assert(target);
              owner('grant',target.id);
              handledPair=true;
            }
          }
        }
        for(const match of log.matchAll(/ZIP (approve|reject) ([a-f0-9-]{36})/g)){
          const [,decision,id]=match;
          if(handledZips.has(id))continue;
          const row=owner('zip','list').find(value=>value.id===id);
          if(!row)continue;
          assert.equal(row.state,'AWAITING_OWNER');
          if(decision==='approve'){
            const preview=owner('zip','preview',id);
            assert.equal(preview.state,'PREVIEWED');
            assert.equal(preview.preview.files,1);
            assert.equal(owner('zip','approve',id,'/tmp/vaultor-restored-'+id).state,'APPROVED');
          }else assert.equal(owner('zip','reject',id).state,'REJECTED');
          handledZips.add(id);
        }
        await delay(750);
      }
      if(test.exitCode===null)throw Error('Android ZIP instrumentation did not finish');
      assert.equal(await finished,0,transcript);
      assert.match(transcript,/OK \(1 test\)/);
      assert.equal(handledZips.size,2);
      const row=owner('zip','list').find(value=>handledZips.has(value.id)&&value.state==='SUCCEEDED');
      assert(row);
      assert.equal(row.destinationWorkspaceId,row.id);
      assert.equal(docker('exec',token,'sh','-ec','find "$1/managed" -type f -name "*.bin" -exec cat {} \\;','vaultor-verify',row.destination),'unchanged-original');
      console.log('API 36 Android verified signed-app ZIP delivery, approval, rejection and restored managed bytes.');
    } finally {
      if(test.exitCode===null)test.kill();
      android('reverse','--remove','tcp:'+port);
    }
  }

  docker('restart',token);
  port=Number(docker('port',token,'8443/tcp').split(':').at(-1));
  const restored=await waitFor();
  assert.equal(restored.hostId,desc.hostId);
  assert.equal(restored.fingerprint,desc.fingerprint);
  assert.deepEqual((await json('GET',projected+'/workspace/identity',headers)).body,ws.body);
  owner('withdraw',paired.body.deviceId);
  assert.equal((await json('GET',importPath,headers)).status,403);
  assert.equal((await json('GET',projected+'/resources',headers)).status,403);
  owner('revoke',paired.body.deviceId);
  assert.equal((await json('GET',projected+'/capabilities',headers)).status,401);
  docker('stop','-t','5',token);
  assert.equal(docker('inspect','--format','{{.State.ExitCode}}',token),'0');
  const output=process.argv.includes('--m26-qualified')?'m26b-qualified-docker.json':
    process.argv.includes('--m26-closure-final')?'m26b-closure-final-docker.json':
    process.argv.includes('--m26-closure')?'m26b-closure-docker.json':
    process.argv.includes('--m26b')?'m26b-docker.json':
    process.argv.includes('--m26a4')?'m26a4-docker.json':
    process.argv.includes('--m26a3')?'m26a3-docker.json':
    process.argv.includes('--m26a2')?'m26a2-docker.json':
    process.argv.includes('--check-note-creation')?'m26a-docker.json':'m25-docker.json';
  await writeFile('benchmarks/tauri-rust/raw/'+output,JSON.stringify({observedAt:new Date().toISOString(),image:docker('image','inspect','--format','{{.Id}}',image),source:docker('image','inspect','--format','{{index .Config.Labels "org.opencontainers.image.revision"}}',image),samples,success:true},null,2));
  console.log('Linux/amd64: verified TLS, matching-code approval, grants, isolated ownership, saved notes, exact downloads, restart, revocation and graceful stop passed.');
}finally{
  for(const [args] of [[['rm','-f',token]],[['network','rm',network]],[['volume','rm',access,workspace,alternate]]]){
    try{docker(...args);}catch{}
  }
  for (const key of [join(path,'ca.key'), join(path,'server-key.pem'), join(tls,'server-key.pem')]) {
    await unlink(key).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
