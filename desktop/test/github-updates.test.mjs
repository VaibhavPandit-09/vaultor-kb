import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Updates} from '../src/updates.mjs';
import {githubAsset,releaseAssetAddress,githubRelease} from '../src/github-updates.mjs';
const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({format:'pem',type:'spki'}),repo='https://github.com/VaibhavPandit-09/vaultor-kb/releases/download/';
const bytes=Buffer.from('installer fixture');
function fixture(v='0.4.2',platform='win32'){
 const filename='Vaultor-'+v+'-'+(platform==='win32'?'windows-x64.exe':'mac-arm64.dmg');
 const manifest={format:1,appVersion:v,platform,arch:platform==='win32'?'x64':'arm64',filename,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),minimumProtocol:1};
 const envelope={manifest,signature:sign(null,Buffer.from(JSON.stringify(manifest)),keys.privateKey).toString('base64')};
 const assets=[{name:filename,size:bytes.length,state:'uploaded',browser_download_url:repo+'v'+v+'/'+filename},{name:filename+'.vaultor.json',size:400,state:'uploaded',browser_download_url:repo+'v'+v+'/'+filename+'.vaultor.json'}];
 return {envelope,release:{tag_name:'v'+v,draft:false,prerelease:false,assets}};
}
test('default GitHub check selects highest complete platform pair regardless of latest flag, validates and stages once',async()=>{
 const old=fixture('0.4.1'),next=fixture(),mac=fixture('0.5.0','darwin'),draft=fixture('0.6.0');draft.release.draft=true;const incomplete=fixture('0.7.0');incomplete.release.assets.pop();const calls=[];
 const dir=await mkdtemp(join(tmpdir(),'vaultor-github-update-'));
 const fetcher=async(url,options)=>{calls.push({url,options});if(url.startsWith('https://api.github.com/'))return new Response(JSON.stringify([old.release,mac.release,draft.release,incomplete.release,next.release]));if(url.endsWith('.json'))return new Response(JSON.stringify(next.envelope));if(url.startsWith('https://github.com/'))return new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/fixture'}});return new Response(bytes);};
 const updates=new Updates({directory:dir,workspace:join(dir,'workspace'),publicKey,currentVersion:'0.4.0',fetcher,platform:'win32',arch:'x64'});await updates.load();await updates.check();assert.equal(updates.snapshot().availableVersion,'0.4.2');await updates.stageLatest();assert.equal(updates.snapshot().candidateVersion,'0.4.2');assert.deepEqual(await readFile(updates.candidate.file),bytes);const n=calls.length;await updates.stageLatest();assert.equal(calls.length,n);
 assert.ok(calls.every(c=>!Object.keys(c.options.headers??{}).some(h=>/authorization|cookie|owner|device/i.test(h))));
});
test('missing Mac pair reports current without downloading another platform and ignores prereleases',async()=>{
 const v=fixture();const pre=fixture('0.8.0','darwin');pre.release.prerelease=true;let calls=0;
 const result=await githubRelease(async()=>{calls++;return new Response(JSON.stringify([v.release,pre.release]));},'darwin','arm64',()=>true,'0.4.0');assert.equal(result,null);assert.equal(calls,1);
});
test('rejects hostile asset sources, redirect downgrade/credentials/excess hops and oversized metadata',async()=>{
 for(const url of ['http://github.com/a','https://evil.test/a','https://user:secret@github.com/a','https://github.com:444/a'])assert.throws(()=>releaseAssetAddress(url));assert.throws(()=>releaseAssetAddress('https://github.com/other/project/releases/download/v1/a',true));
 const address=repo+'v0.4.2/a.exe';for(const location of ['http://github.com/a','https://evil.test/a','https://user:secret@github.com/a'])await assert.rejects(githubAsset(async()=>new Response(null,{status:302,headers:{location}}),address),/Unexpected/);
 await assert.rejects(githubAsset(async()=>new Response(null,{status:302,headers:{location:address}}),address),/redirects/);
 await assert.rejects(githubRelease(async()=>new Response('x'.repeat(2*1024*1024+1)),'win32','x64',()=>true,'0.4.0'),/metadata/);
});
test('signature or asset metadata mismatch fails without selecting an older release or installing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaultor-github-reject-'));const next=fixture();next.envelope.manifest.sha256='a'.repeat(64);
 const updates=new Updates({directory:dir,workspace:join(dir,'workspace'),publicKey,currentVersion:'0.4.0',platform:'win32',arch:'x64',fetcher:async url=>new Response(JSON.stringify(url.startsWith('https://api.github.com/')?[next.release]:next.envelope))});await updates.load();await assert.rejects(updates.check(),/signature/);assert.equal(updates.available,null);assert.equal(updates.candidate,undefined);
});

test('concurrent download is refused, failed downloads keep the target and retry verifies complete bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaultor-github-retry-'));const next=fixture();let finish,attempt=0;
 const updates=new Updates({directory:dir,workspace:join(dir,'workspace'),publicKey,currentVersion:'0.4.0',platform:'win32',arch:'x64',fetcher:async url=>{if(url.startsWith('https://api.github.com/'))return new Response(JSON.stringify([next.release]));if(url.endsWith('.json'))return new Response(JSON.stringify(next.envelope));attempt++;if(attempt===1)return new Promise(resolve=>finish=()=>resolve(new Response('failed',{status:503})));return new Response(bytes);}});await updates.load();await updates.check();const downloading=updates.stageLatest();while(!finish)await new Promise(resolve=>setTimeout(resolve,1));await assert.rejects(updates.stageLatest(),/already running/);finish();await assert.rejects(downloading,/503/);assert.equal(updates.snapshot().availableVersion,'0.4.2');assert.equal(updates.candidate,undefined);await updates.stageLatest();assert.equal(updates.snapshot().candidateVersion,'0.4.2');
});
