import { useMemo, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import AppModal from '../components/modals/AppModal';
import type { Collection } from './client';
import { collectionPaths } from './collections';
export type OrganizationRequest = { ids: string[]; source: string | null; mode: 'add' | 'move' | 'remove' };
export default function OrganizeDialog({request,collections,busy,error,close,apply}:{request:OrganizationRequest;collections:Collection[];busy:boolean;error:string;close:()=>void;apply:(add:string|null,remove:string|null)=>void}){
  const [query,setQuery]=useState(''),[destination,setDestination]=useState('');
  const paths=useMemo(()=>collectionPaths(collections),[collections]);
  const candidates=collections.filter(c=>(request.mode!=='move'||c.id!==request.source)&&(paths.get(c.id)??'').toLowerCase().includes(query.toLowerCase()));
  const verb=request.mode==='add'?'Add to collection':request.mode==='move'?'Move from this collection':'Remove from this collection';
  return <AppModal open title={verb} description={`${request.ids.length} ${request.ids.length===1?'note':'notes'} · current page only. Other memberships and note content stay intact.`} onClose={()=>{if(!busy)close();}} footer={<div className="next-recovery-actions"><button disabled={busy} onClick={close}>Cancel</button><button disabled={busy||(request.mode!=='remove'&&!destination)} onClick={()=>apply(request.mode==='remove'?null:destination,request.mode==='add'?null:request.source)}>{busy?'Applying…':verb}</button></div>}>
    {request.source&&<p className="next-source-label">From {paths.get(request.source)}</p>}
    {request.mode!=='remove'&&<><input autoFocus type="search" aria-label="Find destination collection" placeholder="Find a collection…" className="organization-input" value={query} onChange={e=>{setQuery(e.target.value);setDestination('');}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();document.querySelector<HTMLButtonElement>('.next-destinations button')?.focus();}}}/><div className="next-destinations" role="listbox" aria-label="Destination collection" onKeyDown={e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}}>{candidates.slice(0,50).map(c=><button type="button" role="option" aria-selected={destination===c.id} key={c.id} onClick={()=>setDestination(c.id)}><FolderOpen size={16}/><span>{paths.get(c.id)}</span></button>)}{!candidates.length&&<p>No matching collections. Create one from the sidebar.</p>}{candidates.length>50&&<p>Type more to narrow the first 50 matches.</p>}</div></>}
    {error&&<p role="alert" className="next-error">{error}</p>}
  </AppModal>;
}
