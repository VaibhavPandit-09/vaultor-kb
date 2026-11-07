import {useEffect,useState} from 'react';
import LinkedSources from './LinkedSources';
import {BrowseHeading,BrowseResourceRow} from './BrowseLayout';
import {useLinkedSearch} from '../lib/linked/search';
import type {LinkedWorkspace} from '../lib/linked/workspace';
export default function SourcesBrowser({workspace,visible,onOpen,onReturn}:{workspace:LinkedWorkspace;visible:boolean;onOpen:(id:string)=>void;onReturn:()=>void}){
 const [query,setQuery]=useState(''),[search,setSearch]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),180);return()=>clearTimeout(timer);},[query]);
 const result=useLinkedSearch(workspace.supported()?workspace.search:undefined,search,'title',visible);
 return <section hidden={!visible} className="library-view tags-browser" aria-label="Linked source browser"><BrowseHeading title="Linked sources" actions={<button className="library-button" onClick={onReturn}>Library</button>}/>{workspace.supported()?<><input aria-label="Find linked documents" className="organization-input" placeholder="Find indexed Markdown…" value={query} onChange={event=>setQuery(event.target.value)}/>{search&&<div><p className="browse-feedback">{result.data.indexing?'Indexing registered folders…':result.data.limited?'Showing up to 50 results. Refine your search.':'Indexed title search'} · Files remain externally owned.</p>{result.error&&<p role="alert">{result.error}</p>}{result.data.items.map(resource=><BrowseResourceRow key={resource.id} resource={resource} onOpen={onOpen}/>)}</div>}<LinkedSources active={visible&&!search} workspace={workspace} onOpen={entry=>onOpen(entry.id)}/></>:<p className="browse-feedback">Linked folders are available in the desktop application.</p>}</section>;
}
