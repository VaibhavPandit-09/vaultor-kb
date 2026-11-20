import {memo,useCallback,useEffect,useRef,useState,type KeyboardEvent,type PointerEvent} from 'react';
import {ChevronRight,ChevronDown,FolderOpen,FileText,Plus,MoreHorizontal,RefreshCw} from 'lucide-react';
import {open} from '@tauri-apps/plugin-dialog';
import {motionProfile} from '../lib/motion';
import {linkedCommand} from './linked';
import {transfer} from './transfers';
import type {LinkedSource,LinkedPage} from './linkedTypes';
import type {ContextAction} from './ContextMenu';
type FileActions={
 drag?:(id:string,event:PointerEvent<HTMLElement>)=>void;
 searchSource?:(source:string)=>void;
 fileMenu?:(source:string,path:string,label:string,element:HTMLElement)=>void;
};
export default memo(function LinkedSources({sources,changed,openDocument,menu,active,query='',drag,searchSource,fileMenu}:{query?:string;sources:LinkedSource[];active:string;changed:()=>Promise<void>;openDocument:(source:string,path:string,beside?:boolean)=>void;menu:(label:string,element:HTMLElement,actions:ContextAction[])=>void}&FileActions){
 const expansion=useRef(new Set<string>());
 const [error,setError]=useState(''),[tick,setTick]=useState(0),[busy,setBusy]=useState(false);
 const index=async(source:string)=>{await transfer({op:'indexLinked',source});};
 const register=async()=>{try{setBusy(true);setError('');const path=await open({directory:true,multiple:false,title:'Link an existing local NTFS Markdown folder (files stay external)'});if(!path)return;const source=await linkedCommand<LinkedSource>({op:'register',path});await changed();await index(source.id);}catch(e){setError(String(e));}finally{setBusy(false);}};
 const actionsFor=(source:LinkedSource):ContextAction[]=>[
  {label:'Refresh folders and search index',icon:RefreshCw,run:()=>{setTick(t=>t+1);void index(source.id).catch(e=>setError(String(e)));}},
  ...(searchSource?[{label:'Search this source',run:()=>searchSource(source.id)}]:[]),
  {label:'Authorize folder again…',run:()=>void register()},
  {label:'Remove registration (keep files)',run:()=>{void linkedCommand({op:'remove',source:source.id}).then(async()=>{await changed();requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('[aria-label="Link external folder"]')?.focus());}).catch(e=>setError(String(e)));}},
 ];
 return <div className="next-linked-sources"><div className="next-section"><span>Linked Sources</span><button aria-label="Link external folder" disabled={busy} title="Link folder without importing" onClick={()=>void register()}><Plus size={16}/></button></div>{error&&<p className="next-error" role="alert">{error}</p>}{sources.map(source=><Directory query={query} key={source.id} source={source} path="" active={active} name={source.path.split(/[\\/]/).filter(Boolean).at(-1)??source.path} depth={0} tick={tick} revision={sources} openDocument={openDocument} rootActions={element=>menu(source.path,element,actionsFor(source))} menu={menu} drag={drag} fileMenu={fileMenu} expansion={expansion.current}/>)}{!sources.length&&<p className="next-linked-hint">Link local Markdown folders. Files stay yours.</p>}</div>;

});
const Directory=memo(function Directory({source,path,name,depth,tick,revision,openDocument,rootActions,menu,active,query='',expansion,drag,fileMenu}:{expansion:Set<string>;query?:string;source:LinkedSource;active:string;path:string;name:string;depth:number;tick:number;revision:LinkedSource[];openDocument:(source:string,path:string,beside?:boolean)=>void;rootActions:(element:HTMLElement)=>void;menu:(label:string,element:HTMLElement,actions:ContextAction[])=>void}&FileActions){
 const expansionKey=source.id+':'+path;
 const initial=()=>expansion.has(expansionKey);
 const [expanded,setExpanded]=useState(initial),[present,setPresent]=useState(initial),[page,setPage]=useState<LinkedPage>(),[trail,setTrail]=useState<(string|null)[]>([null]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const epoch=useRef(0),row=useRef<HTMLButtonElement>(null);
 const load=useCallback(async(after:string|null,reset=false)=>{const current=++epoch.current;setBusy(true);setError('');try{const next=await linkedCommand<LinkedPage>({op:'directory',source:source.id,path,after});if(current!==epoch.current)return;setPage(next);if(reset)setTrail([null]);}catch(e){if(current===epoch.current){setError(String(e));setPage(undefined);}}finally{if(current===epoch.current)setBusy(false);}},[source.id,path]);
 // eslint-disable-next-line react-hooks/exhaustive-deps -- epoch is a request counter, not a DOM ref; cleanup invalidates late replies.
 useEffect(()=>{if(expanded)void load(null,true);return()=>{++epoch.current;};},[expanded,tick,revision,load]); // Only expanded directories are queried; no watcher/polling.
 useEffect(()=>{if(expanded||!present)return;const timer=setTimeout(()=>{setPresent(false);setPage(undefined);setTrail([null]);},motionProfile().panel);return()=>clearTimeout(timer);},[expanded,present]);
 const expand=(value:boolean)=>{
  if(value){setPresent(true);if(expansion.size<256)expansion.add(expansionKey);}
  else expansion.delete(expansionKey);
  setExpanded(value);
 };
 const toggle=()=>expand(!expanded);
 const fileActions=(entry:LinkedPage['entries'][number],element:HTMLElement)=>{
  if(!entry.blocked&&fileMenu){fileMenu(source.id,entry.path,entry.name,element);return;}
  menu(entry.name,element,[{label:'Open Markdown',run:()=>openDocument(source.id,entry.path),disabled:entry.blocked},{label:'Open beside',run:()=>openDocument(source.id,entry.path,true),disabled:entry.blocked}]);
 };
 const keys=(event:KeyboardEvent<HTMLElement>)=>{if(event.key==='ArrowRight'&&!expanded){event.preventDefault();expand(true);}else if(event.key==='ArrowLeft'&&expanded){event.preventDefault();expand(false);}else if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();if(!path)rootActions(row.current!);else menu(name,row.current!,[{label:'Refresh this folder',run:()=>void load(null,true)}]);}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const rows=[...event.currentTarget.closest('.next-linked-sources')!.querySelectorAll<HTMLButtonElement>('[data-linked-navigation]')].filter(r=>!r.disabled&&!r.closest('[inert]')),index=rows.indexOf(document.activeElement as HTMLButtonElement);rows[event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,index+(event.key==='ArrowDown'?1:-1)))]?.focus();}};
 return <div className="next-linked-directory"><div className="next-collection-row" style={{paddingLeft:Math.min(depth,8)*10}} onKeyDown={keys} onContextMenu={e=>{e.preventDefault();if(!path)rootActions(row.current!);else menu(name,row.current!,[{label:'Refresh this folder',run:()=>void load(null,true)}]);}}><button tabIndex={-1} aria-label={`${expanded?'Collapse':'Expand'} ${name}`} onClick={toggle}>{expanded?<ChevronDown size={13}/>:<ChevronRight size={13}/>}</button><button data-linked-navigation data-linked-source={source.id} ref={row} aria-expanded={expanded} title={source.path+(path?' / '+path:'')} onClick={toggle}><FolderOpen size={14}/><span>{name}{!path&&source.available===false?" · Unavailable":""}</span></button>{!path&&<button aria-label={`Actions for linked source ${name}`} onClick={()=>rootActions(row.current!)}><MoreHorizontal size={13}/></button>}</div><div className="next-tree-branch" data-collapsed={!expanded} inert={!expanded}><div>{present&&<>{busy&&!page&&<small className="next-linked-hint">Reading folder…</small>}{error&&<div role="alert" className="next-linked-hint next-error">{error}<button onClick={()=>void load(null,true)}>Retry folder</button></div>}{page?.entries.filter(entry=>entry.directory||entry.name.toLowerCase().includes(query.toLowerCase())).map(entry=>entry.directory&&!entry.blocked?<Directory query={query} key={entry.path} source={source} path={entry.path} active={active} name={entry.name} depth={depth+1} tick={tick} revision={revision} openDocument={openDocument} rootActions={rootActions} menu={menu} drag={drag} fileMenu={fileMenu} expansion={expansion}/>:<div className="next-linked-file" key={entry.path} style={{paddingLeft:Math.min(depth+1,8)*10}} onKeyDown={e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();fileActions(entry,e.currentTarget.querySelector('button')!);}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key))keys(e);}} onContextMenu={e=>{e.preventDefault();fileActions(entry,e.currentTarget.querySelector('button')!);}}><button data-internal-drag-source={!!entry.id&&!!drag||undefined} onPointerDown={event=>{if(entry.id&&!entry.blocked)drag?.(entry.id,event);}} data-linked-navigation data-linked-source={source.id} data-linked-path={entry.path} aria-current={active===source.id+':'+entry.path?'page':undefined} title={entry.blocked?'Reparse entries are not traversed':entry.path} disabled={entry.blocked} onClick={()=>openDocument(source.id,entry.path)}><FileText size={14}/><span>{entry.name}</span></button></div>)}{page&&!page.entries.length&&<small className="next-linked-hint">No Markdown documents or folders.</small>}{page&&(page.next||trail.length>1)&&<div className="next-linked-paging"><button disabled={busy||trail.length===1} onClick={()=>{const next=trail.slice(0,-1);setTrail(next);void load(next.at(-1)??null);}}>Previous</button><span>{trail.length}</span><button disabled={busy||!page.next} onClick={()=>{setTrail([...trail,page.next]);void load(page.next);}}>Next</button></div>}{page&&page.hidden>0&&<small className="next-linked-hint">Other file types hidden.</small>}</>}</div></div></div>;
});
