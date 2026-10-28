import { readFile,writeFile,rename } from 'node:fs/promises';
import { join } from 'node:path';
export const normalizeTheme=value=>['light','dark','oled'].includes(value)?value:'os';
export const windowBackground=(preference,osDark)=>preference==='oled'?'#000000':preference==='dark'||preference==='os'&&osDark?'#020617':'#f6f7f9';
export async function deviceAppearance(directory){
 const path=join(directory,'appearance.json');let theme='os';
 try{theme=normalizeTheme(JSON.parse(await readFile(path,'utf8')).theme);}catch{/* Fresh/corrupt cache follows OS. */}
 let writes=Promise.resolve();
 return {get theme(){return theme;},async set(value){theme=normalizeTheme(value);const data=JSON.stringify({theme});writes=writes.catch(()=>{}).then(async()=>{await writeFile(path+'.tmp',data,{mode:0o600});await rename(path+'.tmp',path);});await writes;}};
}
