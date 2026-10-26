import {readdir,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const run=(command,args)=>new Promise((done,reject)=>{const child=spawn(command,args,{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?done():reject(Error(command+' failed: '+code)));});
export async function buildLinkedNative(output){
  const platform=process.platform==='darwin'?'macos':process.platform==='win32'?'windows':null;if(!platform)throw Error('Unsupported native linked platform');
  await mkdir(output,{recursive:true});const root=join(repository,'native/linked-markdown'),sources=[];
  for(const dir of [join(root,'src/vaultor/linked'),join(root,'platform',platform,'vaultor/linked')])for(const name of await readdir(dir))if(name.endsWith('.java'))sources.push(join(dir,name));
  await run('javac',['--release','25','-d',output,...sources]);
  if(platform==='macos')await run('clang',['-std=c11','-Wall','-Wextra','-Werror','-dynamiclib','-arch','arm64','-O2','-o',join(output,'libvaultor-files.dylib'),join(root,'platform/macos/files.c')]);
}
if(process.argv[1]===fileURLToPath(import.meta.url))await buildLinkedNative(resolve(process.argv[2]??join(repository,'native/linked-markdown/build-mac')));
