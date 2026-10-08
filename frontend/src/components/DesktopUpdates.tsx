import {useEffect,useRef,useState} from 'react';
import {Download,RefreshCw,Upload} from 'lucide-react';
import AppModal from './modals/AppModal';
import {unwrap,type UpdateStatus} from '../lib/desktop';
import {useRestoreFocusOnClose} from '../lib/useRestoreFocusOnClose';
import {useFormKeyboard} from '../lib/useFormKeyboard';
export default function DesktopUpdates(){
 const bridge=window.vaultorDesktop,{captureFocus,restoreFocus}=useRestoreFocusOnClose();
 const [open,setOpen]=useState(false),[status,setStatus]=useState<UpdateStatus>(),[feed,setFeed]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const running=useRef(false);
 async function run(action:'check'|'apply'|'import'|'configure'|'restore'|'install'){
  if(running.current)return;running.current=true;setBusy(true);setError('');
  try{const result=action==='configure'?await bridge!.updatesConfigure!(feed.trim()):action==='check'?await bridge!.updatesCheck!():action==='apply'?await bridge!.updatesApply!():action==='import'?await bridge!.updatesImport!():action==='install'?await bridge!.updatesInstall!():await bridge!.updatesRestore!();const value=unwrap(result);if(value)setStatus(current=>({...current,...value}));}
  catch(e){setError(e instanceof Error?e.message:'Update failed. Retry.');}finally{running.current=false;setBusy(false);}
 }
 const checkRef=useRef(()=>void run('check'));checkRef.current=()=>void run('check');
 useEffect(()=>{if(!bridge?.updatesStatus)return;void bridge.updatesStatus().then(unwrap).then(value=>{setStatus(value);setFeed(value.feed);}).catch(e=>setError(e.message));
  const remove=bridge.onUpdates?.(value=>setStatus(current=>({...current,...value})));const show=bridge.onUpdatesOpen?.(()=>{captureFocus();setOpen(true);checkRef.current();});return()=>{remove?.();show?.();};
 },[bridge,captureFocus]);
 const frozen=busy&&['preparing','awaiting-start'].includes(status?.phase??'');
 const form=useFormKeyboard(()=>run('configure'));
 if(!bridge?.updatesStatus)return null;
 const target=status?.availableVersion??status?.candidateVersion??(status?.phase==='available'?status.version:undefined);
 const updateAvailable=Boolean(target&&target!==status?.currentVersion);
 const phase=status?.phase;
 return <>{frozen&&<div role="status" className="fixed inset-0 z-[5000] flex items-center justify-center bg-background/95 text-foreground">Saving work and preparing the recovery backup…</div>}
 <AppModal open={open} title="Vaultor updates" onClose={()=>{if(!frozen){setOpen(false);restoreFocus();}}}>
 <div className="space-y-4"><p className="text-sm text-[var(--text-secondary)]">Installed {status?.currentVersion||'…'} · {status?.source==='custom'?'Custom source':'GitHub releases'}</p>
 {updateAvailable&&<p className="text-lg font-semibold">Vaultor {target} is available</p>}
 {(error||status?.error)&&<p role="alert" className="text-sm text-red-500">{error||status?.error}</p>}
 {['checking','downloading','staging','preparing'].includes(phase??'')&&<p role="status" className="text-sm">{phase==='checking'?'Checking for updates…':phase==='downloading'?'Downloading · '+status?.progress+'%':phase==='staging'?'Verifying update…':'Saving and backing up…'}{phase==='downloading'&&<button className="library-button ml-3" onClick={()=>void bridge.updatesCancel?.()}>Cancel download</button>}</p>}
 {phase==='current'&&!updateAvailable&&<p role="status" className="text-sm">You’re up to date for this device.</p>}
 {updateAvailable&&<><p className="text-sm text-[var(--text-secondary)]">{status?.automaticInstall?'Saves your work, backs up the local workspace, then installs and reopens Vaultor. Local hosting briefly disconnects paired devices.':'Downloads and verifies the update, then opens the installer after saving and backup. This installation still requires manual app replacement.'}</p><button className="library-button bg-primary text-white" autoFocus disabled={busy} onClick={()=>void run('apply')}><Download size={15}/>{busy?'Updating…':status?.automaticInstall?'Update and restart': 'Download and install'}</button></>}
 {!updateAvailable&&<button className="library-button" disabled={busy} onClick={()=>void run('check')}><RefreshCw size={15}/>{error||status?.error?'Retry check':'Check again'}</button>}
 <details className="text-sm"><summary className="cursor-pointer">Advanced</summary><div className="mt-3 space-y-3"><button className="library-button" disabled={busy} onClick={()=>void run('import')}><Upload size={15}/>Import update manually</button>
 {status?.candidateVersion&&status.candidateVersion===status.currentVersion&&<button className="library-button" disabled={busy} onClick={()=>void run('install')}>Reinstall verified package…</button>}
 <form {...form} className="space-y-3"><label className="block text-xs">Custom HTTPS manifest URL (blank uses GitHub)<input aria-label="Update feed URL" className="organization-input w-full mt-1" value={feed} maxLength={2048} onChange={e=>setFeed(e.target.value)}/></label><button className="library-button" disabled={busy}>Save source</button></form>
 <p className="text-xs text-[var(--text-secondary)]">Updates affect this device. Remote hosts update separately. Recovery retains the pre-update local workspace.</p>
 {status?.recoveryAvailable&&<div className="space-y-2"><p className="text-xs break-all">Backup: {status.backupDirectory}</p><button className="library-button" disabled={busy} onClick={()=>void run('restore')}>Restore pre-update workspace…</button></div>}</div></details>
 </div></AppModal></>;
}
