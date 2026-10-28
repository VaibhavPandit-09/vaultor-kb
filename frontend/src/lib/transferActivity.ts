import api from './api';
import {requireBackgroundOperations} from './connection';
import { activityTasks,approveActivityPreview,registerActivityAdapter,startActivity,type ActivityTask,type TaskContext } from './activity';
import { getConnection,saveApiFile } from './platform';
import { unwrap } from './desktop';
import type { Identity } from './sessionStore';
import type { WorkspaceTransferReceipt } from './workspaceTransfers';
import { notifyResourceChange } from './resourceEvents';
type Operation={id:string;status:string;phase:string;detail?:string;requestId?:string;warnings?:string[]};
const wait=()=>new Promise(resolve=>setTimeout(resolve,1000));
function runner(task:Pick<ActivityTask,'kind'|'receipt'|'epoch'|'workspace'|'exportSelection'>){return async(context:TaskContext)=>{
 const config={connectionEpoch:task.epoch,headers:{'X-Vaultor-Generation':task.workspace.generation},onWorkspaceBusy:()=>context.update({phase:'Waiting for workspace access'})};
 const id=task.receipt!;
 if(task.kind==='workspace-export'){
  const intent={generation:task.workspace.generation,scope:task.exportSelection?'resources':'workspace',ids:task.exportSelection??[],depth:0,format:task.exportSelection?'partial':'zip'};
  let operation=(await api.put<{operation:Operation}>('/exports/requests/'+id,intent,config)).data.operation;
  for(let attempts=0;attempts<600;attempts++){
   context.update({phase:operation.phase,detail:operation.detail,warnings:operation.warnings?.length});
   if(operation.status==='FAILED')throw Error(operation.detail||'Export preparation failed. Create a new export after reviewing the failure.');
   if(operation.status==='SUCCEEDED'){
    const {data:verified}=await api.put<{bytes:number;sha256:string}>('/exports/requests/'+id,intent,config);
    if(verified.bytes<=0||!/^[a-f0-9]{64}$/.test(verified.sha256))throw Error('Export receipt does not prove a prepared artifact. Retry the same receipt.');
    context.update({phase:'ZIP ready to save',detail:`${verified.bytes} bytes · SHA-256 ${verified.sha256}`,output:{path:'/exports/'+id+'/download',filename:task.exportSelection?'vaultor-partial.zip':'workspace.zip'}});return true;
   }
   if(context.paused()){context.update({phase:'Status monitoring paused — host preparation may continue'});return false;}
   await wait();operation=(await api.get<Operation>('/operations/'+id,config)).data;
  }
 }else if(task.kind==='workspace-merge'){
  let operation=(await api.post<Operation>('/imports/'+id+'/commit',{mode:'merge',confirmation:''},config)).data;
  for(let attempts=0;attempts<600;attempts++){
   context.update({phase:operation.phase,detail:operation.detail,warnings:operation.warnings?.length});
   if(operation.status==='FAILED')throw Error(operation.detail||'Import failed; review host receipt before starting another import.');
   if(operation.status==='SUCCEEDED'){notifyResourceChange({kind:'workspace'});context.update({phase:'Workspace import complete'});return true;}
   if(context.paused()){context.update({phase:'Status monitoring paused — host import may continue'});return false;}
   await wait();operation=(await api.get<Operation>('/operations/'+id,config)).data;
  }
 }else{
  const copy=task.kind==='workspace-copy',bridge=window.vaultorDesktop;
  if(copy)unwrap(await bridge!.copyCommit!({id}));else await api.post('/workspace-imports/'+id+'/commit',undefined,config);
  for(let attempts=0;attempts<600;attempts++){
   const receipt=copy?unwrap(await bridge!.copyStatus!({id})):(await api.get<WorkspaceTransferReceipt>('/workspace-imports/'+id,config)).data;
   context.update({phase:receipt.state,detail:receipt.detail,warnings:receipt.preview?.warnings.length});
   if(receipt.state==='FAILED')throw Error(receipt.detail||'Workspace creation failed. Retry retains its original identity.');
   if(receipt.state==='SUCCEEDED'){window.dispatchEvent(new Event('vaultor:workspaces-changed'));context.update({phase:'Workspace created — open it from Workspaces'});return true;}
   if(context.paused()){context.update({phase:'Status monitoring paused — host publication may continue'});return false;}
   await wait();await context.check();
  }
 }
 throw Error('Status monitoring reached its time limit. Retry checks the same host receipt; no duplicate job is created.');
};}
for(const kind of ['workspace-export','workspace-merge','workspace-new','workspace-copy'])registerActivityAdapter(kind,runner);
export async function dispatchTransfer(kind:'workspace-export'|'workspace-merge'|'workspace-new'|'workspace-copy',receipt?:string,title?:string,exportSelection?:string[],expectedSource?:{workspace:Identity;epoch:number}){
 const admission=getConnection();if(expectedSource&&expectedSource.epoch!==admission.epoch)throw Error('Connection changed since review. Reopen the operation in its original source.');
 if(kind==='workspace-export'||kind==='workspace-merge')await requireBackgroundOperations();
 const workspace=(await api.get<Identity>('/workspace/identity',{connectionEpoch:admission.epoch})).data,id=receipt??crypto.randomUUID(),epoch=admission.epoch;
 if(expectedSource&&(workspace.id!==expectedSource.workspace.id||workspace.generation!==expectedSource.workspace.generation))throw Error('Workspace changed since review. No operation was dispatched.');
 const previous=activityTasks().find(task=>task.kind===kind&&task.receipt===id&&task.source===admission.profileId&&task.workspace.id===workspace.id&&task.workspace.generation===workspace.generation);
 const input={id:previous?.id??crypto.randomUUID(),kind,title:title??(kind==='workspace-export'?'Export workspace':'Import workspace'),workspace,receipt:id,phase:'Preparing',...(exportSelection?{exportSelection}:{} )};
 await startActivity(input,runner({...input,epoch}));
 if(kind==='workspace-new'||kind==='workspace-copy')approveActivityPreview(id);
}
export async function dispatchWorkspacePreview(intent:{id:string;name:string;kind:'import'|'copy'},file?:File){
 const workspace=(await api.get<Identity>('/workspace/identity')).data,epoch=getConnection().epoch;
 const previous=activityTasks().find(task=>task.kind==='workspace-preview'&&task.receipt===intent.id&&task.source===getConnection().profileId&&task.state!=='complete');
 let attempted=false;
 await startActivity({id:previous?.id??crypto.randomUUID(),kind:'workspace-preview',title:'Review '+intent.name,workspace,receipt:intent.id,phase:'Preparing workspace review'},async context=>{
  await context.check();const bridge=window.vaultorDesktop,config={connectionEpoch:epoch,timeout:120000,onWorkspaceBusy:()=>context.update({phase:'Waiting for workspace access'})};
  let receipt:WorkspaceTransferReceipt|undefined;
  if(attempted){if(intent.kind==='copy')receipt=unwrap(await bridge!.copyStatus!({id:intent.id}));else try{receipt=(await api.get<WorkspaceTransferReceipt>('/workspace-imports/'+intent.id,{...config,backgroundDiagnostic:true})).data;}catch(error){if((error as {response?:{status:number}}).response?.status!==404)throw error;}}
  if(!receipt){attempted=true;if(intent.kind==='copy')receipt=unwrap(await bridge!.copyPreview!({...intent,token:unwrap(await bridge!.bootstrap()).token}));else{if(!file)throw Error('Reselect the original ZIP to continue this review.');const body=new FormData();body.set('name',intent.name);body.set('file',file);receipt=(await api.put<WorkspaceTransferReceipt>('/workspace-imports/'+intent.id,body,config)).data;}}
  for(let n=0;['VALIDATING','COMMITTING','READY','MOVED'].includes(receipt.state)&&n<600;n++){context.update({phase:receipt.state,detail:receipt.detail});if(context.paused())return false;await wait();receipt=intent.kind==='copy'?unwrap(await bridge!.copyStatus!({id:intent.id})):(await api.get<WorkspaceTransferReceipt>('/workspace-imports/'+intent.id,config)).data;}
  if(receipt.state==='FAILED')throw Error(receipt.detail||'Workspace preparation failed. Retry retains the original receipt.');
  if(receipt.state==='SUCCEEDED'||receipt.state==='CANCELLED'){context.update({phase:receipt.state,detail:receipt.detail});return true;}
  if(receipt.state!=='PREVIEW')throw Error('Workspace review is still pending. Retry its retained receipt.');
  context.update({phase:'Ready to review',detail:[receipt.detail,receipt.preview?`${receipt.preview.notes} notes · ${receipt.preview.files} files · ${receipt.preview.tags} tags`:'',...(receipt.preview?.warnings??[])].join('\n'),warnings:receipt.preview?.warnings.length});return false;
 });
}
export async function saveActivityOutput(task:ActivityTask){
 if(task.epoch!==getConnection().epoch)throw Error('Return to the original workspace to save this output.');
 const workspace=(await api.get<Identity>('/workspace/identity')).data;
 if(workspace.id!==task.workspace.id||workspace.generation!==task.workspace.generation)throw Error('Output belongs to another workspace generation.');
 if(!task.output||!/^\/exports\/[0-9a-f-]{36}\/download$/.test(task.output.path))throw Error('No verified export output is available.');
 return saveApiFile(task.output.path,task.output.filename);
}
