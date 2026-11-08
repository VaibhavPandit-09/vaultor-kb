import {commandScope,requireCommandScope} from '../lib/resourceBatchCommands';
import ResourceActions from './ResourceActions';
import {MenuAction,MenuSeparator} from './MenuAction';
import {resourceCommandEnabled} from '../lib/resourceActions';
import {useCallback,useEffect,useId,useMemo,useRef,useState,useSyncExternalStore,type KeyboardEvent} from 'react';
import {ChevronRight,FileText,Folder,FolderPlus,MoreHorizontal} from 'lucide-react';
import {canDragResource,useDragItems,useDesktopInteraction,useDropTarget} from '../lib/desktopInteraction';
import {useLinkedSearch} from '../lib/linked/search';
import {linkedError} from '../lib/linked/errors';
import type {LinkedWorkspace} from '../lib/linked/workspace';
import type {Entry,Source} from '../lib/linked/types';
import type {Resource} from '../types';
import {executeResourceCommand} from '../lib/resourceActions';
import {BrowsePagination,BrowseResourceRow} from './BrowseLayout';
import LibraryPopover from './LibraryPopover';
import LinkedRecovery from './LinkedRecovery';

/** Keyboard movement follows the painted hierarchy, including cached collapsed branches. */
function treeKeys(event:KeyboardEvent<HTMLElement>){
 const target=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-linked-tree-item]');
 if(!target||!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const rows=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-linked-tree-item]')].filter(row=>!row.disabled&&!row.closest('[hidden]'));
 const index=rows.indexOf(target);let next:HTMLElement|undefined;
 if(event.key==='ArrowDown')next=rows[Math.min(rows.length-1,index+1)];
 else if(event.key==='ArrowUp')next=rows[Math.max(0,index-1)];
 else if(event.key==='Home')next=rows[0];
 else if(event.key==='End')next=rows.at(-1);
 else if(event.key==='ArrowRight'){
  if(target.getAttribute('aria-expanded')==='false')target.click();
  else if(target.hasAttribute('aria-expanded'))next=rows[index+1];
 }else if(target.getAttribute('aria-expanded')==='true')target.click();
 else {const owner=target.closest('[data-linked-directory]');next=(target.hasAttribute('aria-expanded')?owner?.parentElement?.closest('[data-linked-directory]'):owner)?.querySelector<HTMLElement>(':scope > button')??undefined;}
 event.preventDefault();event.stopPropagation();next?.focus();
}

type Props={workspace:LinkedWorkspace;onOpen:(entry:Entry|Resource)=>void;compact?:boolean;active?:boolean;onBrowse?:()=>void};
export default function LinkedSources({workspace,onOpen,compact=false,active=true,onBrowse}:Props){
 const [sources,setSources]=useState<Source[]>([]),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),[pending,setPending]=useState(false),[recovery,setRecovery]=useState(false);
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[scope,setScope]=useState<'documents'|'folders'>('documents'),[page,setPage]=useState(0);
 const expansion=useRef(new Set<string>());
 const drag=useDesktopInteraction(),dragging=Boolean(drag?.payload);
 const lifetime=useSyncExternalStore(workspace.subscribe,workspace.getContextVersion),sourceVersion=useSyncExternalStore(workspace.subscribe,workspace.getSourcesVersion);
 useEffect(()=>{expansion.current.clear();setSources([]);setLoaded(false);setError('');setRecovery(false);setQuery('');setSearch('');setPage(0);},[workspace,lifetime]);
 useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),180);return()=>clearTimeout(timer);},[query]);
 useEffect(()=>{if(!active||!workspace.supported())return;let live=true;void workspace.sources().then(value=>{if(live){setSources(value.sources);setLoaded(true);setError('');}}).catch(failure=>{if(live)setError(linkedError(failure));});return()=>{live=false;};},[workspace,lifetime,sourceVersion,active]);
 const criteria=useDragItems([{search,scope,page}],false)[0],roots=useDragItems(sources),size=compact?8:20;
 const filtered=useMemo(()=>criteria.scope==='folders'&&criteria.search?roots.filter(source=>source.name.toLocaleLowerCase().includes(criteria.search.toLocaleLowerCase())):roots,[roots,criteria.scope,criteria.search]);
 const status=useDragItems([{loaded,error}],false)[0];
 const shown=filtered.slice(criteria.page*size,criteria.page*size+size),finding=Boolean(criteria.search&&criteria.scope==='documents');
 const result=useLinkedSearch(workspace.supported()?workspace.search:undefined,criteria.search,'title',active&&finding),results=useDragItems(result.data.items),searchState=useDragItems([{loading:result.loading,error:result.error,indexing:result.data.indexing,limited:result.data.limited}],false)[0];
 if(!workspace.supported())return <p className="browse-feedback">Linked folders are available in the desktop application.</p>;
 const refresh=async()=>{setSources((await workspace.sources()).sources);setLoaded(true);setError('');};
 const add=async()=>{setPending(true);setError('');try{await workspace.flush();const result=await workspace.request<{root?:string}>('add');if(result.root&&sources.some(source=>source.id===result.root))await workspace.reopen(result.root);await refresh();}catch(failure){setError(linkedError(failure));}finally{setPending(false);}};
 return <section className="linked-browser" aria-label="Linked sources">
  <header className="linked-tools"><span>{compact?'Folders':'Registered folders'}</span><div>
   <button className="browse-icon-button" aria-label="Link folder" title="Link folder" disabled={pending||dragging} onClick={()=>void add()}><FolderPlus size={14}/></button>
   <LibraryPopover label="Source tools" trigger={<MoreHorizontal size={14}/>} className="browse-icon-button">{close=><>
    {onBrowse&&<button className="library-button" disabled={dragging} onClick={()=>{close();onBrowse();}}>Manage sources…</button>}
    <button className="library-button" disabled={dragging} onClick={()=>{close();setRecovery(true);}}>Linked file recovery…</button>
   </>}</LibraryPopover>
  </div></header>
  {roots.length>0&&<div className="linked-search"><input disabled={dragging} aria-label="Search linked sources" placeholder={scope==='documents'?'Find Markdown…':'Filter folders…'} value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/><select disabled={dragging} aria-label="Search linked sources in" value={scope} onChange={event=>{setScope(event.target.value as typeof scope);setPage(0);}}><option value="documents">Documents</option><option value="folders">Folders</option></select></div>}
  {status.error&&<p role="alert" className="browse-feedback">{status.error}<button onClick={()=>void refresh().catch(failure=>setError(linkedError(failure)))}>Retry</button></p>}
  {!status.loaded&&!status.error&&<p role="status" className="browse-feedback">Loading linked folders…</p>}
  {status.loaded&&!roots.length&&!status.error&&<p className="browse-feedback">Link a Markdown folder to browse its files here. Files stay in their original location.</p>}
  <div hidden={finding} onKeyDown={treeKeys}>
   {shown.map(source=><div key={source.id} data-linked-source={source.id} className="linked-root-row"><div className="linked-root-tree"><Directory expansion={expansion.current} active={active&&!finding} workspace={workspace} source={source.id} label={source.name+(source.enabled?'':' (disconnected)')} onOpen={onOpen}/></div><LibraryPopover contextTarget="[data-linked-source]" label={'Manage '+source.name} trigger="…" className="browse-icon-button">{close=><>
    <p className="browse-feedback">Files remain externally owned.</p>
    <button className="library-button" disabled={dragging} onClick={()=>{close();void workspace.flush().then(()=>workspace.request('disconnect',{source:source.id})).then(refresh).catch(failure=>setError(linkedError(failure)));}}>Disconnect</button>
    <button className="library-button" disabled={dragging} onClick={()=>{close();void add();}}>Link or reconnect folder</button>
    <button className="library-button" disabled={dragging} onClick={()=>{close();void workspace.flush().then(()=>workspace.request('remove',{source:source.id})).then(refresh).catch(failure=>setError(linkedError(failure)));}}>Remove source · keep files</button>
   </>}</LibraryPopover></div>)}
   {criteria.search&&!filtered.length&&<p className="browse-feedback">No folder names match. Try Documents to search Markdown titles.</p>}
   <BrowsePagination compact={compact} page={criteria.page} totalPages={Math.ceil(filtered.length/size)} loading={dragging} onPage={setPage}/>
  </div>
  {finding&&<div className="linked-search-results">
   <p className="browse-feedback">Markdown titles in registered folders{searchState.indexing?' · Indexing…':searchState.limited?' · First 50 results; refine your search.':''}</p>
   {searchState.loading&&<p role="status" className="browse-feedback">Searching Markdown…</p>}
   {searchState.error&&<p role="alert" className="browse-feedback">{searchState.error}</p>}
   {!searchState.loading&&!searchState.error&&!results.length&&<p className="browse-feedback">{searchState.indexing?'More results may appear as indexing continues.':'No Markdown titles match.'}</p>}
   {results.map(resource=>compact?<LinkedResult key={resource.id} resource={resource} onOpen={()=>onOpen(resource)}/>:<BrowseResourceRow key={resource.id} resource={resource} onOpen={()=>onOpen(resource)}/>)}
  </div>}
  {recovery&&<LinkedRecovery workspace={workspace} onClose={()=>setRecovery(false)}/>}
 </section>;
}

function Directory({workspace,source,id,label,onOpen,depth=0,active=true,expansion}:{workspace:LinkedWorkspace;source:string;id?:string;label:string;onOpen:Props['onOpen'];depth?:number;active?:boolean;expansion:Set<string>}){
 const nodeKey=source+':'+(id??'');
 const [open,setOpen]=useState(()=>expansion.has(nodeKey)),[items,setItems]=useState<Entry[]>([]),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[offset,setOffset]=useState(0);
 const displayed=useDragItems(items,false),feedback=useDragItems([{busy,error,more,offset}],false)[0],drag=useDesktopInteraction(),observer=useId(),listing=useRef({busy:false,offset:0}),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const load=useCallback(async(start=0)=>{if(listing.current.busy)return;listing.current.busy=true;setBusy(true);setError('');try{const page=await workspace.request<{items:Entry[];more:boolean}>('list',{source,directory:id,offset:start,limit:200});if(!alive.current)return;listing.current.offset=start;setOffset(start);setItems(page.items);setMore(page.more);}catch(failure){if(alive.current)setError(linkedError(failure));}finally{listing.current.busy=false;if(alive.current)setBusy(false);}},[workspace,source,id]);
 const requested=useRef(false);
 useEffect(()=>{if(open&&!requested.current){requested.current=true;void load();}},[open,load]);
 useEffect(()=>{
  if(!open||!active)return;
  // Each mounted browser owns its subscription; the shared scheduler keeps its four-refresh budget.
  return workspace.observeDirectory(observer+':'+source+':'+(id??''),async()=>{
   if(listing.current.busy)return;listing.current.busy=true;
   try{const page=await workspace.request<{items:Entry[];more:boolean}>('list',{source,directory:id,offset:listing.current.offset,limit:200});if(!alive.current)return;setItems(previous=>JSON.stringify(previous)===JSON.stringify(page.items)?previous:page.items);setMore(page.more);setError('');}catch(failure){if(alive.current&&!String(failure).includes('LINKED_SOURCE_BUSY'))setError(linkedError(failure));}finally{listing.current.busy=false;}
  });
 },[open,source,id,workspace,active,observer]);
 return <div data-linked-directory><button className="linked-tree-item" data-linked-tree-item aria-expanded={open} title={label} disabled={Boolean(drag?.payload)} onClick={()=>{if(open)expansion.delete(nodeKey);else expansion.add(nodeKey);setOpen(!open);}}><ChevronRight size={12} style={{transform:open?'rotate(90deg)':undefined}}/><Folder size={14}/><span>{label}</span></button>
  <LibraryPopover contextOnly contextTarget="[data-linked-directory]" label={'Folder actions for '+label}>{close=><><MenuAction disabled={Boolean(drag?.payload)} onClick={()=>{close();if(open)expansion.delete(nodeKey);else expansion.add(nodeKey);setOpen(!open);}}>{open?'Collapse folder':'Expand folder'}</MenuAction><MenuAction disabled={busy||Boolean(drag?.payload)} onClick={()=>{close();void load(offset);}}>Refresh folder</MenuAction></>}</LibraryPopover>
  <div hidden={!open} className="linked-branch" style={{paddingLeft:Math.max(2,12-Math.min(depth,5)*2)}}>
   {displayed.map(entry=>entry.directory&&!entry.unsupported&&depth<31?<Directory expansion={expansion} active={active&&open} key={entry.id} workspace={workspace} source={source} id={entry.id} label={entry.name} onOpen={onOpen} depth={depth+1}/>:<LinkedEntry key={entry.id} workspace={workspace} entry={entry} onOpen={onOpen}/>)}
   {feedback.busy&&<p role="status" className="browse-feedback">Loading…</p>}{feedback.error&&<p role="alert" className="browse-feedback">{feedback.error}<button onClick={()=>void load(offset)}>Retry</button></p>}
   {(feedback.offset>0||feedback.more)&&<div className="linked-paging"><button className="library-button" disabled={busy||Boolean(drag?.payload)||offset===0} onClick={()=>void load(Math.max(0,offset-200))}>Previous</button><span>{feedback.offset+1}–{feedback.offset+displayed.length}</span><button className="library-button" disabled={busy||Boolean(drag?.payload)||!more} onClick={()=>void load(offset+200)}>Next</button></div>}
  </div>
 </div>;
}
function LinkedResult({resource,onOpen}:{resource:Resource;onOpen:()=>void}){
 const drag=useDesktopInteraction(),drop=useDropTarget({kind:'resource',resource});
 return <div data-linked-result className="linked-result"><button {...drop} className="linked-tree-item" title={resource.title} draggable={canDragResource(resource)} onClick={onOpen} onDragStart={event=>drag?.start(event,{kind:'resources',resources:[resource]})} onDragEnd={()=>drag?.cancel()}><FileText size={14}/><span>{resource.title}</span></button><ResourceActions resource={resource}/></div>;
}
function LinkedEntry({workspace,entry,onOpen}:{workspace:LinkedWorkspace;entry:Entry;onOpen:Props['onOpen']}){
 const drag=useDesktopInteraction(),resource:Resource={id:entry.id,title:entry.name,type:'linked',tags:[],createdAt:'',updatedAt:''},drop=useDropTarget({kind:'resource',resource}),available=entry.markdown&&!entry.directory&&!entry.unsupported;
 return <div data-linked-file><button {...drop} className="linked-tree-item" data-linked-tree-item data-linked-entry={entry.id} disabled={!available} draggable={available&&canDragResource(resource)} title={entry.unsupported?'This special file is outside the supported folder contract.':entry.directory?'Folders beyond 32 levels are not supported.':!entry.markdown?'Only Markdown files can be opened from linked folders.':entry.name} onClick={()=>{workspace.remember(entry);onOpen(entry);}} onDragStart={event=>{workspace.remember(entry);drag?.start(event,{kind:'resources',resources:[resource]});}} onDragEnd={()=>drag?.cancel()}><FileText size={14}/><span>{entry.name}</span></button>{available&&<LibraryPopover contextOnly contextTarget="[data-linked-file]" label={'Actions for '+entry.name}>{close=><><button className="library-button" onClick={()=>{close();workspace.remember(entry);onOpen(entry);}}>Open Markdown</button><button className="library-button" onClick={()=>{close();void executeResourceCommand('copy-title',resource).catch(error=>drag?.report(error instanceof Error?error.message:'Could not copy title.',true));}}>Copy title</button>{resourceCommandEnabled('copy-links',resource)&&<><MenuSeparator/>{(['copy-links','copy-resources'] as const).map(command=><MenuAction key={command} onClick={()=>{const scope=commandScope();close();workspace.remember(entry);void workspace.describe(entry.id,true).then(()=>{requireCommandScope(scope);return executeResourceCommand(command,resource);}).catch(error=>drag?.report(String(error),true));}}>{command==='copy-links'?'Copy resource link':'Copy resource'}</MenuAction>)}</>}</>}</LibraryPopover>}</div>;
}
