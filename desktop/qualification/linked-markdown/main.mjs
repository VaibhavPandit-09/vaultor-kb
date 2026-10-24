import {app,BrowserWindow,dialog,ipcMain,protocol,net} from 'electron';
import {readFile,mkdir,readdir,realpath,lstat,writeFile} from 'node:fs/promises';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Controller} from './controller.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repository=resolve(here,'../../..');
if(app.isPackaged||process.platform!=='win32'||process.env.VAULTOR_LINKED_G3!=='1')throw new Error('Development-only Gate 3 harness');
const directory=resolve(process.env.VAULTOR_G3_DIRECTORY??'');
if(!directory.startsWith(join(repository,'native','linked-markdown','.scratch')+sep)||(await lstat(directory)).isSymbolicLink()||(await realpath(directory))!==directory||(await readFile(join(directory,'gate3-disposable.marker'),'utf8'))!=='VAULTOR_G3_DISPOSABLE')throw new Error('Disposable Gate 3 directory required');
app.setPath('userData',join(directory,'app-profile'));app.setAppUserModelId('Vaultor.Gate3.Qualification');
protocol.registerSchemesAsPrivileged([{scheme:'vaultor-g3',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const origin='vaultor-g3://app',entry=origin+'/markdown-g3.html',ui=join(repository,'frontend','node_modules','.cache','markdown-g3-build');
let window,controller,workspace='qualification-a',generation='generation-one';
const privateRoot=join(directory,'app-private');await mkdir(privateRoot,{recursive:true});
async function start(){
await app.whenReady();
protocol.handle('vaultor-g3',async request=>{
  const url=new URL(request.url),path=resolve(ui,'.'+decodeURIComponent(url.pathname));
  if(url.host!=='app'||!path.startsWith(ui+sep)||request.method!=='GET')return new Response('',{status:403});
  const response=await net.fetch(pathToFileURL(path).href);response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; worker-src 'self' blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'");return response;
});
async function activate(){
  await controller?.close();const ownerDirectory=join(privateRoot,workspace);await mkdir(ownerDirectory,{recursive:true});
  const assets=join(ui,'assets'),worker=(await readdir(assets)).find(file=>/^markdown\.worker-.*\.js$/.test(file));if(!worker)throw new Error('Build isolated worker first');
  controller=new Controller({java:join(repository,'desktop','bundle','runtime','bin','java.exe'),classes:join(repository,'native','linked-markdown','build'),worker:join(assets,worker),workspace,generation,privateRoot:join(ownerDirectory,'journal'),protectedRoot:privateRoot,applicationRoot:join(repository,'desktop'),disposableRoot:directory,defaultRoot:join(directory,'source'),dialog,window:()=>window});
  await controller.native.ready;
}
await activate();
function trusted(event){return window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&event.senderFrame.url===entry;}
const publicContext=()=>{const {token,epoch,workspace,generation}=controller.context;return {token,epoch,workspace,generation,sequence:controller.sequence};};
ipcMain.handle('linked-g3-context',event=>{if(!trusted(event))throw new Error('Unauthorized renderer');return publicContext();});
ipcMain.handle('linked-g3-request',async(event,request)=>{
  if(!trusted(event))throw new Error('Unauthorized renderer');
  if(request?.operation==='switch-workspace'){
    controller.check(request);if(!['qualification-a','qualification-b'].includes(request.payload?.workspace))throw new Error('Harness workspace required');
    workspace=request.payload.workspace;await activate();return publicContext();
  }
  try{return await controller.dispatch(request);}catch(error){throw new Error(/^[A-Z_0-9: -]{1,120}$/.test(error.message)?error.message:'LINKED_OPERATION_REFUSED');}
});
window=new BrowserWindow({width:1180,height:860,minWidth:640,minHeight:480,title:'Vaultor — Gate 3 disposable qualification',webPreferences:{preload:join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(url!==entry)event.preventDefault();});
window.webContents.on('will-attach-webview',event=>event.preventDefault());
window.on('closed',()=>{void controller.close().finally(()=>app.quit());});
app.on('before-quit',()=>{void controller?.close();});
await window.loadURL(entry);
window.show();window.focus();
await writeFile(join(directory,'harness-ready.json'),JSON.stringify({pid:process.pid,workspace,runtime:(await controller.native.ready)[0],url:entry}));
}
// Do not await readiness in the entry module's evaluation promise: observed
// Electron44 startup deadlocked before the ready event with that pattern.
void start().catch(error=>{console.error('Gate3 startup failed: '+error.message);app.exit(1);});
