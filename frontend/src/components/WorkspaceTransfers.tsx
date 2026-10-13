import {useEffect,useRef,useState} from 'react';
import api from '../lib/api';
import {getConnection,saveApiFile} from '../lib/platform';
import {blockConnectionSwitch,prepareConnectionSwitch,unwrap} from '../lib/desktop';
import {pickFiles} from '../lib/filePicker';
import type {WorkspaceTransferReceipt} from '../lib/workspaceTransfers';
type Intent={id:string;name:string;kind:'import'|'copy'};
export default function WorkspaceTransfers({owner,supported,workspaceName,onBusy,onReady,onOpen}:{owner:boolean;supported:boolean;workspaceName:string;onBusy(value:boolean):void;onReady():Promise<unknown>;onOpen(id:string,name:string,local:boolean):void}){
 const [name,setName]=useState(workspaceName+' copy'),[receipt,setReceipt]=useState<WorkspaceTransferReceipt>(),[intent,setIntent]=useState<Intent>(),[error,setError]=useState(''),[working,setWorking]=useState(false),[exportId,setExportId]=useState(''),[exportReady,setExportReady]=useState(false);
 const picking=useRef(false);
 const running=useRef(false),release=useRef<(()=>void)|undefined>(undefined),file=useRef<File|undefined>(undefined),epoch=useRef(getConnection().epoch).current,completed=useRef(''),awaiting=useRef(false);
 const key='vaultor-workspace-transfer:'+getConnection().profileId+':'+getConnection().workspaceId;
 const callbacks=useRef({onBusy,onReady,onOpen});callbacks.current={onBusy,onReady,onOpen};
 const bridge=window.vaultorDesktop,canCopy=!!bridge?.copyPreview&&getConnection().profileId!=='this-computer';
 const config={connectionEpoch:epoch,backgroundDiagnostic:true};
 function active(value:boolean){setWorking(value);callbacks.current.onBusy(value);if(value&&!release.current)release.current=blockConnectionSwitch('workspace transfer');if(!value){release.current?.();release.current=undefined;}}
 function adopt(value:WorkspaceTransferReceipt){awaiting.current=['COMMITTING','VALIDATING','READY','MOVED'].includes(value.state);setReceipt(value);}
 async function status(value:Intent){return value.kind==='copy'?unwrap(await bridge!.copyStatus!({id:value.id})):(await api.get<WorkspaceTransferReceipt>('/workspace-imports/'+value.id,config)).data;}
 function remember(value:Intent){sessionStorage.setItem(key,JSON.stringify(value));setIntent(value);}
 useEffect(()=>{let valid=true;void(async()=>{
  try{const saved=sessionStorage.getItem(key);if(saved){const value=JSON.parse(saved) as Intent;setIntent(value);setName(value.name);try{const r=await status(value);if(valid)adopt(r);}catch{if(valid)setError('Pending request retained. Retry with the original name and ZIP.');}return;}
   const jobs=bridge?.copiesList?unwrap(await bridge.copiesList()):[];if(!valid)return;
   if(owner&&supported){const rows=(await api.get<WorkspaceTransferReceipt[]>('/workspace-imports',config)).data;if(!valid)return;const r=rows.find(v=>!['SUCCEEDED','CANCELLED'].includes(v.state));if(r){remember({id:r.id,name:r.name,kind:jobs.some(j=>j.id===r.id)?'copy':'import'});setName(r.name);adopt(r);return;}}
   const pending=jobs.find(v=>!['SUCCEEDED','CANCELLED'].includes(v.state));if(pending){const value={id:pending.id,name:pending.name,kind:'copy' as const};remember(value);setName(value.name);try{const r=await status(value);if(valid)adopt(r);}catch{if(valid)setError('Local copy retained. Retry from its original server, or cancel this transfer.');}}

  }catch(e){if(valid)setError((e as Error).message);}
 })();return()=>{valid=false;if(release.current){release.current();release.current=undefined;callbacks.current.onBusy(false);}};
 // Captured source stays fixed until this picker unmounts.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useEffect(()=>{
  if(!receipt||!['COMMITTING','VALIDATING','READY','MOVED'].includes(receipt.state)||!intent)return;
  let valid=true;active(true);const timer=setInterval(()=>{void status(intent).then(r=>{if(valid){adopt(r);setError('');}}).catch(()=>{if(valid)setError('Connection interrupted. Status will retry; do not start another import.');});},1000);
  return()=>{valid=false;clearInterval(timer);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[receipt?.state,intent?.id]);
 useEffect(()=>{if(receipt&&['SUCCEEDED','FAILED','PREVIEW','CANCELLED'].includes(receipt.state)&&!running.current)active(false);if(receipt?.state==='SUCCEEDED'&&completed.current!==receipt.id){completed.current=receipt.id;void callbacks.current.onReady().catch(e=>setError(String(e)));}},[receipt]);
 async function run(task:()=>Promise<void>,saveFirst=false){if(running.current)return;running.current=true;setError('');try{if(saveFirst)await prepareConnectionSwitch();active(true);await task();}catch(e){setError((e as Error).message);}finally{running.current=false;if(!awaiting.current)active(false);}}
 async function prepare(kind:'import'|'copy'){
  if(running.current||picking.current)return;let chosen=file.current;if(kind==='import'&&!chosen){picking.current=true;try{chosen=(await pickFiles('.zip'))[0];if(!chosen)return;file.current=chosen;}catch(e){setError((e as Error).message);return;}finally{picking.current=false;}}
  await run(async()=>{const value=intent??{id:crypto.randomUUID(),name:name.trim(),kind};if(value.kind!==kind)throw Error('Finish the current transfer first');remember(value);
   if(kind==='copy')adopt(unwrap(await bridge!.copyPreview!({...value,token:(await bridge!.bootstrap().then(unwrap)).token})));
   else{const body=new FormData();body.set('name',value.name);body.set('file',chosen!);adopt((await api.put<WorkspaceTransferReceipt>('/workspace-imports/'+value.id,body,{...config,timeout:120000})).data);}
  },kind==='copy');
 }
 async function commit(){if(!intent)return;await run(async()=>{const r=intent.kind==='copy'?unwrap(await bridge!.copyCommit!({id:intent.id})):(await api.post<WorkspaceTransferReceipt>('/workspace-imports/'+intent.id+'/commit',undefined,config)).data;adopt(r);});}
 async function cancel(){if(!intent)return;await run(async()=>{try{if(intent.kind==='copy')unwrap(await bridge!.copyCancel!({id:intent.id}));else await api.delete('/workspace-imports/'+intent.id,config);}catch(e){if((e as {response?:{status:number}}).response?.status!==404)throw e;}sessionStorage.removeItem(key);setIntent(undefined);setReceipt(undefined);file.current=undefined;});}
 async function exportZip(){await run(async()=>{let id=exportId;if(!id){id=(await api.post<{id:string}>('/exports',{scope:'workspace',format:'zip'},config)).data.id;setExportId(id);}for(let n=0;n<600;n++){let op:{status:string};try{op=(await api.get<{status:string}>('/operations/'+id,config)).data;}catch(e){if((e as {response?:{status:number}}).response?.status!==409)throw e;await new Promise(r=>setTimeout(r,500));continue;}if(op.status==='SUCCEEDED'){setExportReady(true);const outcome=await saveApiFile('/exports/'+id+'/download','workspace.zip');if(outcome==='cancelled')throw Error('Save cancelled. The same ZIP is ready to download again.');return;}if(op.status==='FAILED'){setExportId('');throw Error('Export preparation failed. Start a new export.');}await new Promise(r=>setTimeout(r,500));}throw Error('Preparation is still pending. Retry status.');},!exportId);}
 return <div className="space-y-3 border-t border-border pt-3" aria-label="Workspace transfers">
  <h2 className="text-sm font-semibold">Workspace transfers</h2>
  {error&&<p role="alert" className="text-sm text-red-400">{error}</p>}
  {!intent&&<><button className="library-button" disabled={working} onClick={()=>void exportZip()}>{exportReady?'Download ZIP again':exportId?'Check export and download':'Export this workspace'}</button>{(owner&&supported||canCopy)&&<label className="block text-sm">New workspace name<input aria-label="Imported workspace name" className="organization-input w-full mt-1" maxLength={100} value={name} disabled={working} onChange={e=>setName(e.target.value)}/></label>}
   <div className="flex flex-wrap gap-2">{owner&&supported&&<button className="library-button" disabled={working||!name.trim()} onClick={()=>void prepare('import')}>Import ZIP as new workspace</button>}{canCopy&&<button className="library-button" disabled={working||!name.trim()} onClick={()=>void prepare('copy')}>Make local copy</button>}</div></>}
  {working&&<p role="status" className="text-sm">Preparing workspace… Your source remains intact.</p>}
  {intent&&<><p className="font-medium truncate">{intent.name}</p><p className="text-sm text-[var(--text-secondary)]">{intent.kind==='copy'?'Destination: This computer. Independent copy; no synchronization.':'Creates a separate workspace. Existing workspaces stay intact.'}</p>
   {receipt?.preview&&<p className="text-sm">{receipt.preview.notes} notes · {receipt.preview.files} files · {receipt.preview.tags} tags</p>}
   {receipt&&<p role="status" className="text-sm">{receipt.detail}</p>}
   {receipt?.preview?.warnings.length? <details><summary>Archive details</summary>{receipt.preview.warnings.map((w,i)=><p key={i} className="text-sm">{w}</p>)}</details>:null}
   <div className="flex flex-wrap gap-2">{receipt?.state==='PREVIEW'&&<button className="library-button" disabled={working} onClick={()=>void commit()}>Create separate workspace</button>}
    {(!receipt||receipt.state==='FAILED')&&<button className="library-button" disabled={working} onClick={()=>void (receipt?commit():prepare(intent.kind))}>Retry same transfer</button>}
    {receipt?.state==='SUCCEEDED'&&<button className="library-button" onClick={()=>callbacks.current.onOpen(intent.id,intent.name,intent.kind==='copy')}>Open workspace</button>}
    {!receipt||['PREVIEW','FAILED','SUCCEEDED','CANCELLED'].includes(receipt.state)?<button className="library-button" disabled={working} onClick={()=>void (receipt?.state==='SUCCEEDED'?run(async()=>{sessionStorage.removeItem(key);setIntent(undefined);setReceipt(undefined);file.current=undefined;}):cancel())}>{receipt?.state==='SUCCEEDED'?'Done':'Cancel transfer'}</button>:null}</div>
  </>}
 </div>;
}
