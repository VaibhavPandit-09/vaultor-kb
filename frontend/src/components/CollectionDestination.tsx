import { useState } from 'react';
import { collectionPath, useOrganizationPage, type OrganizationItem } from '../lib/organization';

/** Bounded destination search shared by move and import. */
export default function CollectionDestination({value,onChange,exclude,disabled=false}:{value:OrganizationItem|null;onChange:(item:OrganizationItem|null)=>void;exclude?:string;disabled?:boolean}) {
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState(''),[page,setPage]=useState(0);
  const result=useOrganizationPage('collection',query,page,open,false,20);
  return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary className="cursor-pointer text-sm">Destination: {value?collectionPath(value):'Collection root'}</summary>{open&&<div className="space-y-2 py-2">
    <input className="organization-input w-full" aria-label="Find destination collection" placeholder="Find destination…" value={query} disabled={disabled} onChange={e=>{setQuery(e.target.value);setPage(0);}}/>
    <button type="button" className="library-button" disabled={disabled} onClick={()=>onChange(null)}>Collection root</button>
    {result.data?.items.filter(item=>item.id!==exclude&&!item.ancestors?.some(a=>a.id===exclude)).map(item=><button type="button" key={item.id} aria-pressed={value?.id===item.id} className="library-button w-full text-left" disabled={disabled} onClick={()=>onChange(item)}>{collectionPath(item)}</button>)}
    {result.error&&<p role="alert">{result.error}<button type="button" onClick={result.retry}>Retry</button></p>}
    {(result.data?.totalPages??0)>1&&<div><button type="button" disabled={!page} onClick={()=>setPage(page-1)}>Previous</button><button type="button" disabled={page+1>=(result.data?.totalPages??0)} onClick={()=>setPage(page+1)}>Next</button></div>}
  </div>}</details>;
}
