import {cp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {resolve,dirname,basename,join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export async function supportsAutomaticInstall(executable=process.execPath,packaged=false,platform=process.platform){
 if(platform!=='win32'||!packaged||basename(executable)!=='Vaultor.exe')return false;
 return stat(join(dirname(executable),'Uninstall Vaultor.exe')).then(info=>info.isFile(),()=>false);
}
export async function startUpdateHandoff({directory,executable=process.execPath,manifest,file,parentPid=process.pid,parentStartedAt=new Date(Date.now()-process.uptime()*1000).toISOString()}){
 if(process.platform!=='win32')throw new Error('Automatic installation is not available on this platform yet.');
 const root=resolve(directory),helper=join(root,'install-update.ps1'),config=join(root,'install-update.json'),status=join(root,'handoff-status.json');
 await rm(status,{force:true});await cp(fileURLToPath(new URL('./update-handoff.ps1',import.meta.url)),helper);
 await writeFile(config,JSON.stringify({parentPid,parentStartedAt,executable:resolve(executable),installer:resolve(file),version:manifest.appVersion,size:manifest.size,sha256:manifest.sha256}),{mode:0o600});
 const literal=value=>"'"+value.replaceAll("'","''")+"'";
 const command='& '+literal(helper)+' -Config '+literal(config);
 const powershell=join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const encoded=Buffer.from(command,'utf16le').toString('base64');
 // Start-Process gives the helper its own Windows process lifetime. Directly
 // spawning PowerShell can tie it to the exiting parent's console lifetime.
 const launcher='Start-Process -FilePath '+literal(powershell)+" -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',"+literal(encoded)+')';
 const child=spawn(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(launcher,'utf16le').toString('base64')],{windowsHide:true,stdio:'ignore'});
 let failure;child.once('error',error=>failure=error);child.once('exit',code=>{if(code)failure=new Error('Installer helper failed before handoff. Review Updates and retry.');});child.unref();
 for(let i=0;i<150;i++){
  try{const result=JSON.parse((await readFile(status,'utf8')).replace(/^\uFEFF/,''));if(result.phase==='error')throw new Error(result.error);if(result.phase==='ready')return;}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
  if(failure)throw failure;
  await new Promise(done=>setTimeout(done,100));
 }
 throw new Error('The installer helper did not become ready. Vaultor remains open; retry.');
}
