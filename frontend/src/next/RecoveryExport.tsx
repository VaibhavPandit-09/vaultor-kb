import {useState} from 'react';
import {save} from '@tauri-apps/plugin-dialog';
import {transfer} from './transfers';

export default function RecoveryExport({id,linked=false,disabled=false}:{id:string;linked?:boolean;disabled?:boolean}){
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const exportCopy=async()=>{
    setBusy(true);
    setMessage('');
    try{
      const destination=await save({title:'Export protected draft copy',defaultPath:'Vaultor protected draft.json',filters:[{name:'Recovery copy',extensions:['json']}]});
      if(destination){
        await transfer({op:'exportRecovery',id,linked,destination});
        setMessage('Recovery copy queued in Activity.');
      }
    }catch(error){
      setMessage(String(error));
    }finally{
      setBusy(false);
    }
  };
  return <><button disabled={disabled||busy} onClick={()=>void exportCopy()}>Export protected draft…</button>{message&&<small role="status">{message}</small>}</>;
}
