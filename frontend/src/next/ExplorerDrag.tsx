import {invoke} from '@tauri-apps/api/core';
import {useEffect,useRef,useState} from 'react';
import AppModal from '../components/modals/AppModal';
import {showTransfer} from './transfers';

type Copies={receipt:string;names:string[]};
const release=(copy:Copies)=>void invoke('release_drag',{receipt:copy.receipt}).catch(()=>{});

export default function ExplorerDrag({ids,workspace,close}:{ids:string[];workspace:string;close:()=>void}) {
  const [copies,setCopies]=useState<Copies>();
  const [working,setWorking]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const held=useRef<Copies>(undefined),alive=useRef(false),busy=useRef(false);
  const pointer=useRef<{id:number;x:number;y:number}>(undefined);
  useEffect(()=>{
    alive.current=true;
    return ()=>{alive.current=false;if(held.current)release(held.current);};
  },[]);
  useEffect(()=>{
    if(!copies)return;
    const timeout=setTimeout(()=>{
      held.current=undefined;
      release(copies);
      setCopies(undefined);
      setMessage('The prepared copies expired.');
    },300_000);
    return ()=>clearTimeout(timeout);
  },[copies]);
  const run=async(operation:()=>Promise<void>)=>{
    if(busy.current)return;
    busy.current=true;
    setWorking(true);
    setError('');
    setMessage('');
    try{await operation();}
    catch(error){if(alive.current)setError(String(error));}
    finally{busy.current=false;if(alive.current)setWorking(false);}
  };
  const prepare=()=>void run(async()=>{
    const result=await invoke<Copies>('prepare_drag',{path:workspace,ids});
    if(!alive.current){release(result);return;}
    held.current=result;
    setCopies(result);
  });
  const start=(copy:Copies)=>void run(async()=>{
    held.current=undefined;
    setCopies(undefined);
    const dropped=await invoke<boolean>('start_drag',{receipt:copy.receipt});
    if(alive.current)setMessage(dropped?'Copies handed to Windows.':'Drag cancelled.');
  });
  return <AppModal open title="Export copies for Explorer" onClose={close}>
    <p className="browse-feedback">Drag prepared copies of {ids.length===1?'this file':`${ids.length} files`}. Vaultor keeps the managed originals and collection memberships.</p>
    {copies?<div className="native-export-actions">
      <ul className="text-sm break-words">{copies.names.map(name=><li key={name}>{name}</li>)}</ul>
      <button type="button" className="library-button library-button-primary" style={{touchAction:'none'}}
        onPointerDown={event=>{
          if(event.pointerType!=='mouse'||event.button!==0||!event.isPrimary)return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY};
        }}
        onPointerMove={event=>{
          const origin=pointer.current;
          if(!origin||origin.id!==event.pointerId||!(event.buttons&1)||Math.hypot(event.clientX-origin.x,event.clientY-origin.y)<6)return;
          pointer.current=undefined;
          event.currentTarget.releasePointerCapture(event.pointerId);
          start(copies);
        }}
        onLostPointerCapture={()=>{pointer.current=undefined;}}>
        Drag copies to Explorer
      </button>
    </div>:<button type="button" className="library-button library-button-primary" disabled={working} onClick={prepare}>Prepare copies</button>}
    <button type="button" className="library-button" disabled={working} onClick={()=>{close();showTransfer({op:'export',ids,format:'original'});}}>Export originals to a folder…</button>
    {working&&<p role="status">Preparing or handing off copies…</p>}
    {message&&<p role="status">{message}</p>}
    {error&&<p role="alert">{error}</p>}
  </AppModal>;
}
