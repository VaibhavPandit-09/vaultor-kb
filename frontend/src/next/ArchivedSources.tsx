import {useState} from 'react';
import {open} from '@tauri-apps/plugin-dialog';
import AppModal from '../components/modals/AppModal';
import {useRetainedQuery} from '../lib/useRetainedQuery';
import {linkedCommand} from './linked';

type Archived={id:string;title:string;label:string;path:string};
type Page={items:Archived[];next:string|null};
async function load(key:string,signal:AbortSignal){
  const [workspace,after]=JSON.parse(key) as [string,string|null];
  signal.throwIfAborted();
  try{return await linkedCommand<Page>({op:'archived',workspace,after});}
  catch(error){throw new Error(String(error));}
}

export default function ArchivedSources({workspace,close,changed}:{workspace:string;close:()=>void;changed:()=>Promise<void>}){
  const [trail,setTrail]=useState<(string|null)[]>([null]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const query=useRetainedQuery(JSON.stringify([workspace,trail.at(-1)]),true,'resources',load);
  const locate=async(item:Archived)=>{
    setBusy(true);
    setError('');
    setNotice('');
    try{
      const path=await open({directory:true,multiple:false,title:'Locate the parent source root for '+item.path});
      if(!path||Array.isArray(path))return;
      await linkedCommand({op:'rebindDescriptor',workspace,id:item.id,path});
      query.retry();
      setNotice(`Linked ${item.title} to its archived identity.`);
      await changed();
    }catch(error){setError(String(error));}
    finally{setBusy(false);}
  };
  return <AppModal open title="Archived linked references" widthClassName="max-w-xl" onClose={()=>{if(!busy)close();}}>
    <p className="browse-feedback">Choose the local source root that contains the displayed relative path. Vaultor checks the archived saved revision before binding that file.</p>
    {query.loading&&<p role="status">Loading archived references…</p>}
    {query.error&&<p role="alert">{query.error} <button onClick={query.retry}>Retry</button></p>}
    {query.data&&!query.data.items.length&&<p className="browse-feedback">No archived references on this page.</p>}
    <ul className="divide-y divide-[var(--border-subtle)]">{query.data?.items.map(item=><li className="flex flex-wrap items-center justify-between gap-2 py-2" key={item.id}>
      <div className="min-w-0 break-words"><strong>{item.title}</strong><p>{item.path}</p></div>
      <button type="button" className="library-button shrink-0" aria-label={`Locate source for ${item.title}`} disabled={busy} onClick={()=>void locate(item)}>Locate source…</button>
    </li>)}</ul>
    {(trail.length>1||query.data?.next)&&<div className="flex gap-2">
      <button disabled={busy||trail.length<2} onClick={()=>setTrail(t=>t.slice(0,-1))}>Previous</button>
      <button disabled={busy||!query.data?.next} onClick={()=>setTrail(t=>[...t,query.data!.next])}>Next</button>
    </div>}
    {notice&&<p role="status">{notice}</p>}
    {error&&<p role="alert">{error}</p>}
  </AppModal>;
}
