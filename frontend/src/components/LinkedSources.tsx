import {linkedError} from '../lib/linked/errors';
import {useEffect,useState,useRef} from 'react';
import {ChevronDown,FileText,Folder,FolderPlus} from 'lucide-react';
import LibraryPopover from './LibraryPopover';
import LinkedRecovery from './LinkedRecovery';
import type {LinkedWorkspace} from '../lib/linked/workspace';
import type {Entry,Source} from '../lib/linked/types';

export default function LinkedSources({workspace,onOpen}:{workspace:LinkedWorkspace;onOpen:(entry:Entry)=>void}){
  const [sources,setSources]=useState<Source[]>([]),[error,setError]=useState(''),[pending,setPending]=useState(false),[expanded,setExpanded]=useState(true),[revision,setRevision]=useState(0);
  const [recovery,setRecovery]=useState(false);
  const refresh=async()=>{setSources((await workspace.sources()).sources);};
  useEffect(()=>{let active=true;if(workspace.supported())void workspace.sources().then(value=>{if(active)setSources(value.sources);}).catch(failure=>{if(active)setError(linkedError(failure));});return()=>{active=false;};},[workspace]);
  if(!workspace.supported())return null;
  const add=async()=>{setPending(true);setError('');try{const result=await workspace.request<{root?:string}>('add');if(result.root&&sources.some(source=>source.id===result.root&&!source.enabled))await workspace.reopen(result.root);await refresh();setExpanded(true);setRevision(value=>value+1);}catch(failure){setError(linkedError(failure));}finally{setPending(false);}};
  return <section className="sidebar-section" aria-label="Linked sources">
    <header className="sidebar-section-heading"><button aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}><ChevronDown size={13} className={expanded?'':'sidebar-disclosure-closed'}/>Linked sources</button><div className="sidebar-section-tools"><button onClick={()=>setRecovery(true)}>Recovery</button><button className="browse-icon-button" aria-label="Link folder" title="Link folder" disabled={pending} onClick={()=>void add()}><FolderPlus size={15}/></button></div></header>
    <div className="sidebar-disclosure" data-expanded={expanded} aria-hidden={!expanded} inert={!expanded}><div className="sidebar-disclosure-content">
      {!sources.length&&<p className="browse-feedback">Link a local Markdown folder. Files stay in their original location.</p>}
      {sources.map(source=><div key={source.id}><div className="flex items-start gap-1"><div className="min-w-0 flex-1"><Directory key={source.id+revision} workspace={workspace} source={source.id} label={source.name+(source.enabled?'':' (disconnected)')} onOpen={onOpen}/></div><LibraryPopover label={'Manage '+source.name} trigger="…" className="browse-icon-button">{close=><><p className="browse-feedback">Files remain externally owned.</p><button className="library-button" onClick={()=>{void workspace.flush().then(()=>workspace.request('disconnect',{source:source.id})).then(refresh).then(()=>setRevision(value=>value+1)).catch(failure=>setError(linkedError(failure)));close();}}>Disconnect</button><button className="library-button" onClick={()=>{close();void add();}}>Link or reconnect folder</button><button className="library-button" onClick={()=>{close();void workspace.flush().then(()=>workspace.request('remove',{source:source.id})).then(refresh).catch(failure=>setError(linkedError(failure)));}}>Remove source · keep files</button></>}</LibraryPopover></div></div>)}
      {error&&<p role="alert" className="browse-feedback">{error.replace(/^Error: /,'')}<button onClick={()=>void refresh().then(()=>setError('')).catch(failure=>setError(linkedError(failure)))}>Retry</button></p>}
    </div></div>
    {recovery&&<LinkedRecovery workspace={workspace} onClose={()=>setRecovery(false)}/>}
  </section>;
}
function Directory({workspace,source,id,label,onOpen,depth=0}:{workspace:LinkedWorkspace;source:string;id?:string;label:string;onOpen:(entry:Entry)=>void;depth?:number}){
  const [open,setOpen]=useState(false),[items,setItems]=useState<Entry[]>([]),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const listing=useRef({busy:false,count:0});
  useEffect(()=>{listing.current.count=items.length;},[items]);
  const load=async(offset=0)=>{if(listing.current.busy)return;listing.current.busy=true;setBusy(true);setError('');try{const page=await workspace.request<{items:Entry[];more:boolean}>('list',{source,directory:id,offset,limit:200});setItems(previous=>offset?[...previous,...page.items]:page.items);setMore(page.more);}catch(failure){setError(linkedError(failure));}finally{listing.current.busy=false;setBusy(false);}};
  const toggle=()=>{setOpen(value=>!value);if(!open&&!items.length)void load();};
  useEffect(()=>{
    if(!open)return;
    return workspace.observeDirectory(source+':'+(id??''),async()=>{
      if(listing.current.busy||listing.current.count>200)return;listing.current.busy=true;
      try{const page=await workspace.request<{items:Entry[];more:boolean}>('list',{source,directory:id,offset:0,limit:200});setItems(previous=>JSON.stringify(previous)===JSON.stringify(page.items)?previous:page.items);setMore(page.more);setError('');}catch(failure){setError(linkedError(failure));}finally{listing.current.busy=false;}
    });
  },[open,source,id,workspace]);
  return <div><button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-card" aria-expanded={open} onClick={toggle}><ChevronDown size={12} className={open?'':'sidebar-disclosure-closed'}/><Folder size={14}/><span className="truncate">{label}</span></button>
    {open&&<div className="pl-3">{items.map(entry=>entry.directory&&!entry.unsupported&&depth<31?<Directory key={entry.id} workspace={workspace} source={source} id={entry.id} label={entry.name} onOpen={onOpen} depth={depth+1}/>:<button key={entry.id} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-card disabled:opacity-50" disabled={!entry.markdown||entry.unsupported} title={entry.unsupported?'This special file is outside the supported folder contract.':entry.name} onClick={()=>{workspace.remember(entry);onOpen(entry);}}><FileText size={14}/><span className="truncate">{entry.name}</span></button>)}{busy&&<p role="status" className="browse-feedback">Loading…</p>}{error&&<p role="alert" className="browse-feedback">{error}<button onClick={()=>void load()}>Retry</button></p>}{more&&<button className="library-button" disabled={busy} onClick={()=>void load(items.length)}>Show more</button>}</div>}
  </div>;
}
