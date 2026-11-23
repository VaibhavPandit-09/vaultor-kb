import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';

export default function WindowsUpdates({install}:{install?:(version:string)=>Promise<void>}) {
  const [application,setApplication]=useState('Vaultor Next · Tauri / Rust / SQLite');
  const [available,setAvailable]=useState(false);
  const [busy,setBusy]=useState(false);
  const [version,setVersion]=useState<string>();
  const [status,setStatus]=useState('');

  useEffect(()=>{
    void invoke<[string,boolean]>('next_update_info').then(([current,installed])=>{
      setApplication(`Vaultor Next ${current}${installed?'':' · development'}`);
      setAvailable(installed);
    }).catch(()=>{});
  },[]);

  async function check() {
    setBusy(true);
    setVersion(undefined);
    setStatus('Checking for a signed Windows update…');
    try {
      const next=await invoke<string|null>('stage_next_update');
      if(next) setVersion(next);
      setStatus(next?`Vaultor Next ${next} is verified and ready.`:'No newer Windows update is available.');
    } catch(error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function apply(next:string) {
    setBusy(true);
    try { await install?.(next); }
    finally { setBusy(false); }
  }

  return <div>
    <div>{application}</div>
    {available&&install&&<>
      <button type="button" className="settings-action" disabled={busy} onClick={()=>void check()}>Check for updates</button>
      {version&&<button type="button" className="settings-action" disabled={busy} onClick={()=>void apply(version)}>Update and restart</button>}
      {status&&<div role="status">{status}</div>}
    </>}
  </div>;
}
