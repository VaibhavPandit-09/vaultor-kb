import {useEffect,useRef,useState} from 'react';
import {Download,RefreshCw,Upload} from 'lucide-react';
import AppModal from './modals/AppModal';
import {unwrap,type UpdateStatus} from '../lib/desktop';
import {useRestoreFocusOnClose} from '../lib/useRestoreFocusOnClose';
import {useFormKeyboard} from '../lib/useFormKeyboard';
export default function DesktopUpdates(){
 const bridge=window.vaultorDesktop,{captureFocus,restoreFocus}=useRestoreFocusOnClose();
 const [open,setOpen]=useState(false),[status,setStatus]=useState<UpdateStatus>(),[feed,setFeed]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const running=useRef(false);
 useEffect(()=>{if(!bridge?.updatesStatus)return;void bridge.updatesStatus().then(unwrap).then(value=>{setStatus(value);setFeed(value.feed);}).catch(e=>setError(e.message));
  const remove=bridge.onUpdates?.(value=>setStatus(value));const show=bridge.onUpdatesOpen?.(()=>{captureFocus();setOpen(true);});return()=>{remove?.();show?.();};
 },[bridge,captureFocus]);
 const frozen=status?.phase==='preparing'||status?.phase==='awaiting-start'&&busy;
 async function run(action:'check'|'download'|'import'|'configure'|'install'|'restore'){
  if(running.current)return;running.current=true;setBusy(true);setError('');
  try{const result=action==='configure'?await bridge!.updatesConfigure!(feed.trim()):action==='check'?await bridge!.updatesCheck!():action==='download'?await bridge!.updatesDownload!():action==='import'?await bridge!.updatesImport!():action==='install'?await bridge!.updatesInstall!():await bridge!.updatesRestore!();const value=unwrap(result);if(value)setStatus(value);}
  catch(e){setError(e instanceof Error?e.message:'Update failed. Retry.');}finally{running.current=false;setBusy(false);}
 }
 const form=useFormKeyboard(()=>run('configure'));
 if(!bridge?.updatesStatus)return null;
 return <>{frozen&&<div role="status" className="fixed inset-0 z-[5000] flex items-center justify-center bg-background/95 text-foreground">Preparing update and recovery backup…</div>}
 <AppModal open={open} title="Vaultor updates" onClose={()=>{if(!frozen){setOpen(false);restoreFocus();}}}>
 <div className="space-y-4"><p className="text-sm text-[var(--text-secondary)]">Installed {status?.currentVersion||'…'}{status?.version?' · Package '+status.version:''}</p>
 {(error||status?.error)&&<p role="alert" className="text-sm text-red-500">{error||status?.error}</p>}
 {['checking','downloading','staging','preparing'].includes(status?.phase||'')&&<p role="status" className="text-sm">{status?.phase==='downloading'?'Downloading · '+status.progress+'%':'Preparing…'}{status?.phase==='downloading'&&<button className="library-button ml-3" onClick={()=>void bridge.updatesCancel?.()}>Cancel</button>}</p>}
 {status?.phase==='current'&&<p role="status" className="text-sm">No newer release on this feed.</p>}
 <div className="flex flex-wrap gap-2"><button className="library-button" disabled={busy||!status?.feed} onClick={()=>void run('check')}><RefreshCw size={15}/>Check for updates</button><button className="library-button" autoFocus disabled={busy} onClick={()=>void run('import')}><Upload size={15}/>Import update</button>
 {status?.phase==='available'&&<button className="library-button" disabled={busy} onClick={()=>void run('download')}><Download size={15}/>Download update</button>}
 {['ready','awaiting-start'].includes(status?.phase||'')&&<button className="library-button" disabled={busy} onClick={()=>void run('install')}>Install update…</button>}</div>
 {!status?.feed&&<p className="text-xs text-[var(--text-secondary)]">Import the signed .vaultor.json beside its installer, or configure a release feed below.</p>}
 <details className="text-sm"><summary className="cursor-pointer">Update source and recovery</summary><form {...form} className="mt-3 space-y-3"><label className="block text-xs">HTTPS release manifest URL<input aria-label="Update feed URL" className="organization-input w-full mt-1" value={feed} maxLength={2048} onChange={e=>setFeed(e.target.value)}/></label><button className="library-button" disabled={busy}>Save source</button></form>
 <p className="mt-3 text-xs text-[var(--text-secondary)]">Installation saves drafts, stops local hosting and backs up the managed workspace. Remote servers stay unchanged. Mac installation opens a disk image for manual app replacement.</p>
 {status?.recoveryAvailable&&<div className="mt-3 space-y-2"><p className="text-xs break-all">Backup: {status.backupDirectory}</p><button className="library-button" disabled={busy} onClick={()=>void run('restore')}>Restore pre-update workspace…</button></div>}</details>
 </div></AppModal></>;
}
