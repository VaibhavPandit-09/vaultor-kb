import {cp,mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {brandWindows} from './brand-windows.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
let executable=require('electron');
if(process.platform==='win32'){
 const pkg=JSON.parse(await readFile(join(root,'node_modules','electron','package.json'),'utf8'));
 const icon=join(root,'assets','vaultor.ico'),digest=createHash('sha256').update(await readFile(icon)).digest('hex').slice(0,12);
 const destination=join(root,'cache','dev-shell-'+pkg.version+'-'+digest);executable=join(destination,'Vaultor.exe');
 if(!(await readFile(join(destination,'branded.json')).catch(()=>null))){
  const staging=destination+'.stage-'+Date.now();await mkdir(staging,{recursive:true});await cp(join(root,'node_modules','electron','dist'),staging,{recursive:true});
  await rename(join(staging,'electron.exe'),join(staging,'Vaultor.exe'));await brandWindows(join(staging,'Vaultor.exe'),icon);
  await writeFile(join(staging,'branded.json'),JSON.stringify({electron:pkg.version,digest}));await rename(staging,destination);
 }
}
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(executable,[root,...process.argv.slice(2)],{env,windowsHide:true,stdio:'inherit'});child.once('error',error=>{console.error(error.message);process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});
