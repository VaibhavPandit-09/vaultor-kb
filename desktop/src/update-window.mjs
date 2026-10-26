import {readFile,lstat,rm} from 'node:fs/promises';
import {join} from 'node:path';

// Older installed helpers start Windows processes hidden without a launch flag.
// Consume their existing completion receipt once; it is version/time bounded.
// This affects visibility only and grants no installation or download authority.
export async function consumeUpdateReopen(directory,version,{now=Date.now(),platform=process.platform,packaged=false}={}){
  if(platform!=='win32'||!packaged)return false;
  const file=join(directory,'handoff-status.json');
  try{
    const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>4096)return false;
    const status=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
    if(status.phase!=='complete')return false; // Preserve failure diagnostics.
    await rm(file); // Failure to consume must not create recurring forced opens.
    return status.version===version&&now-info.mtimeMs>=-60000&&now-info.mtimeMs<=10*60*1000;
  }catch{return false;}
}

// New helpers supply process-local intent only after the explicit update action.
export function restoreUpdateWindow(window, args) {
  if (!args.includes('--reopen-after-update')) return;
  window.once('ready-to-show', () => {
    if (window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
}
