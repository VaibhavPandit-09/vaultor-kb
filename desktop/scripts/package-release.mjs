import {build,Platform,Arch} from 'electron-builder';
import {readFile,writeFile,stat,access} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,sign,verify} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,basename} from 'node:path';
import {verifyBundle} from '../src/owned-server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!((process.platform==='win32'&&process.arch==='x64')||(process.platform==='darwin'&&process.arch==='arm64')))throw new Error('Build Windows x64 or Mac Apple Silicon on that OS.');
await verifyBundle(join(root,'bundle'));await access(join(root,'ui','index.html'));
const trust=JSON.parse(await readFile(join(root,'release-trust.json'),'utf8'));
const key=await readFile(process.env.VAULTOR_RELEASE_KEY||join(root,'cache','release-signing','private.pem'));
const proof=Buffer.from('Vaultor release identity');if(!verify(null,proof,trust.publicKey,sign(null,proof,key)))throw new Error('Private release key does not match the bundled public key.');
process.env.CSC_IDENTITY_AUTO_DISCOVERY='false';
const target=process.platform==='win32'?Platform.WINDOWS:Platform.MAC;
const artifacts=await build({projectDir:root,config:join(root,'electron-builder.cjs'),targets:target.createTarget(process.argv.includes('--dir')?'dir':undefined,process.platform==='win32'?Arch.x64:Arch.arm64),publish:'never'});
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
for(const file of artifacts.filter(path=>path.endsWith('.exe')||path.endsWith('.dmg'))){
 const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
 const manifest={format:1,appVersion:pkg.version,platform:process.platform,arch:process.arch,filename:basename(file),size:(await stat(file)).size,sha256:hash.digest('hex'),minimumProtocol:1};
 const signature=sign(null,Buffer.from(JSON.stringify(manifest)),key).toString('base64');
 await writeFile(file+'.vaultor.json',JSON.stringify({manifest,signature},null,2)+'\n');
 console.log('Verified update manifest: '+file+'.vaultor.json');
}
console.log('Built personal artifacts locally. Nothing published; no paid signing/notarization.');
