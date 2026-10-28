import { useEffect, useMemo, useRef,useState } from 'react';
import AppModal from './AppModal';
import InlineImportModal from './InlineImportModal';
import CollectionDestination from '../CollectionDestination';
import { type ImportSession, type ImportRow, convertText } from '../../lib/fileImports';
import { folderJournal, folderPaths, referenceResolver, restoreFolderRows, type FolderJournal } from '../../lib/folderImports';
import type { OrganizationItem } from '../../lib/organization';
import type { Resource } from '../../types';
import { dispatchImport } from '../../lib/importActivity';
import { startActivity } from '../../lib/activity';
import { getConnection } from '../../lib/platform';

type Props={session:ImportSession;onClose:()=>void;onResource:(resource:Resource)=>void;onDestination?:(item:OrganizationItem|null)=>void};
export default function FileImportModal(props:Props){return props.session.target?<InlineImportModal {...props}/>:<BatchImportModal {...props}/>;}
function BatchImportModal({session,onClose}:Props){
 const [rows,setRows]=useState(session.rows),[destination,setDestination]=useState<OrganizationItem|null>(session.collection?{...session.collection,count:0}:null);
 const [includeRoot,setIncludeRoot]=useState(true),[merge,setMerge]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[page,setPage]=useState(0);
 const [context,setContext]=useState<Awaited<ReturnType<typeof folderJournal>>>(),[previous,setPrevious]=useState<FolderJournal>();
 const running=useRef(false);
 const [reviewAttempt,setReviewAttempt]=useState(0);
 const [repeat,setRepeat]=useState<'skip'|'copy'|''>('');
 useEffect(()=>{let active=true;void folderJournal(session).then(value=>{if(active){setContext(value);setPrevious(value.previous);if(value.previous){setRows(restoreFolderRows(value.previous,session.rows));setDestination(value.previous.destination?{...value.previous.destination,count:0}:null);setIncludeRoot(value.previous.includeRoot);setMerge(value.previous.merge);}setRepeat(value.completed?'skip':'');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[session,reviewAttempt]);
 const locked=pending||Boolean(previous),complete=false;
 const updateRow=(id:string,patch:Partial<ImportRow>)=>setRows(current=>current.map(row=>row.id===id?{...row,...patch}:row));
 async function apply(){if(running.current||!context||previous&&context.resumeBlocked)return;running.current=true;setPending(true);setError('');
   try{
     if(context.epoch!==undefined&&context.epoch!==getConnection().epoch)throw Error('Connection changed since review. Reselect in the original source.');
     if(context.completed&&repeat==='skip'){const current=await folderJournal(session);if(current.identity.id!==context.identity.id||current.identity.generation!==context.identity.generation)throw Error('Workspace changed. Close this review and reselect the source.');if(!current.completed){setContext(current);setRepeat('copy');throw Error('Earlier items changed. Review the current options before continuing.');}await startActivity({id:crypto.randomUUID(),kind:'file-import-skip',title:'Review '+(session.folder?.name??'selected files'),workspace:context.identity,phase:rows.length+' already imported · 0 new items',done:rows.length,total:rows.length,detail:'Files match the earlier import. Existing notes are unchanged.'},async()=>true);onClose();return;}
     const working=previous?restoreFolderRows(previous,rows):rows;
     const journal:FolderJournal=previous??{key:context.key,identity:context.identity,signature:context.signature,rows:[],directories:{},destination:destination??undefined,includeRoot,merge,complete:false};
     if(journal.legacyVerification){journal.legacySignature??=journal.signature;journal.signature=context.signature;journal.legacyVerification=false;}
     await dispatchImport(session,working,journal,context.store);onClose();
   }catch(e){setError(e instanceof Error?e.message:String(e));}finally{running.current=false;setPending(false);}
 }
 const skipSelected=Boolean(context?.completed&&repeat==='skip'&&!previous);
 const notes=rows.filter(r=>r.asNote).length;
 const directories=session.folder?folderPaths(session):[];
 const referenceKey=rows.map(r=>r.id+':'+r.asNote+':'+r.imageValid).join(',');
 const {warnings,resolved}=useMemo(()=>{
  const warnings=new Map<string,number>();let resolved=0;
 for(const row of rows){let issues=row.asNote?row.warnings:[];if(session.folder&&row.asNote&&row.kind==='markdown'&&row.sourceText){const result=convertText('markdown',row.sourceText,referenceResolver(rows,row.path!));issues=result.warnings;const count=(node:{type?:string;content?:unknown[]})=>{if(node.type==='resourceLink'||node.type==='image')resolved++;node.content?.forEach(child=>count(child as typeof node));};count(result.doc);}
   for(const issue of issues){const group=issue.split(':')[0];warnings.set(group,(warnings.get(group)??0)+1);}
 }
 return {warnings,resolved};
 // Status updates retain the same source documents and choices.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[referenceKey,session,complete]);
 return <AppModal open title={session.folder?'Import folder':'Import files'} widthClassName="max-w-2xl" onClose={()=>{if(!pending)onClose();}} footer={<div className="flex justify-between gap-2">
   <button className="library-button" disabled={pending} onClick={onClose}>Cancel</button>
   <button className="rounded-lg bg-primary px-3 py-2 text-white disabled:opacity-50" disabled={pending||!context||Boolean(previous&&context.resumeBlocked)} onClick={()=>void apply()}>{pending?'Starting…':previous?'Resume import':context?.completed&&repeat==='skip'?(rows.length?'Skip imported files':'Skip folder'):context?.related?'Import another copy':session.folder?'Import folder':'Import files'}</button>
 </div>}>
 <div className="space-y-3">
   <p className="font-medium truncate" title={session.folder?.name}>{session.folder?.name??`${rows.length} selected files`}</p>
   <p className="text-sm">{rows.length} {rows.length===1?'file':'files'}{session.folder?` in ${directories.length} ${directories.length===1?'folder':'folders'}`:''}{!skipSelected&&<> · {notes} as notes · {rows.length-notes} kept as files</>}</p>
   {!skipSelected&&(resolved>0||warnings.size>0)&&<p className="text-sm text-[var(--text-secondary)]">{resolved>0&&<>{resolved} links can connect to imported items</>}{warnings.size>0&&<>{resolved>0?' · ':''}{[...warnings.values()].reduce((a,b)=>a+b,0)} link {[...warnings.values()].reduce((a,b)=>a+b,0)===1?'issue':'issues'}</>}</p>}
   {!context&&!error&&<p role="status" className="text-sm">Checking earlier imports…</p>}
   {!previous&&context?.related&&<fieldset className="space-y-2"><legend className="text-sm font-medium">{context.completed?'Already imported':context.live?.unknown?'Check earlier import':context.exact?'Earlier imported items':'Similar filenames found'}</legend>
    {context.live?.unknown&&context.lookupProblem&&<p className="text-sm">{context.lookupProblem}</p>}
    {context.live?.unknown&&<button className="library-button" onClick={()=>{setContext(undefined);setReviewAttempt(value=>value+1);}}>Check again</button>}
    <p className="text-sm">{context.live?.unknown?"Earlier items could not be checked. Importing again creates new copies; it does not update existing notes.":context.completed?'The selection matches your earlier import. Skip it or import another copy.':'Importing again creates new copies; it does not update existing notes.'}</p>
    {context.live&&!context.live.unknown&&<p className="text-sm text-[var(--text-secondary)]">{context.live.missingCollections>0&&context.live.collections===0&&context.live.active>0&&context.live.trash===0&&context.live.missing===0?<>The collections were removed, but {context.live.active} {context.live.active===1?'item remains':'items remain'} in Library.</>:rows.length?[context.live.active?context.live.active+' in Library':null,context.live.trash?context.live.trash+' in Trash':null,context.live.missing?context.live.missing+' removed':null].filter(Boolean).join(' · '):context.live.collections+' existing collections'}</p>}
    {context.live?.active? <button className="library-button" onClick={()=>{onClose();window.dispatchEvent(new CustomEvent('vaultor:import-browse',{detail:{section:'library',identity:context.identity,epoch:context.epoch}}));}}>Open Library</button>:null}
    {context.live?.trash? <button className="library-button" onClick={()=>{onClose();window.dispatchEvent(new CustomEvent('vaultor:import-browse',{detail:{section:'trash',identity:context.identity,epoch:context.epoch}}));}}>Review Trash</button>:null}
    {context.completed&&<><label className="flex gap-2 text-sm"><input type="radio" name="repeat-import" checked={repeat==='skip'} onChange={()=>setRepeat('skip')}/>{rows.length?'Skip imported files':'Skip folder'} (recommended)</label><label className="flex gap-2 text-sm"><input type="radio" name="repeat-import" checked={repeat==='copy'} onChange={()=>setRepeat('copy')}/>Import another copy</label></>}
   </fieldset>}
   {previous&&<p className="text-sm">{context?.resumeBlocked?'Earlier items or collections were removed. Start a new copy to import these files again.':'An import was interrupted. Resume with these files to finish the remaining work.'} <button className="text-primary" onClick={()=>{setPrevious(undefined);setRepeat('copy');}}>Import a new copy</button></p>}
   {previous?.legacyVerification&&<p className="text-sm">These files will be checked before the import resumes. Changed files cannot replace existing notes.</p>}
   {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
   <div hidden={skipSelected}>
   {<CollectionDestination label="Import into" value={destination} onChange={setDestination} disabled={locked}/>}
   {session.folder&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={includeRoot} disabled={locked} onChange={e=>setIncludeRoot(e.target.checked)}/>Create a collection for “{session.folder.name}”</label>}
   {session.folder?.emptyFoldersUnavailable&&<p className="text-sm">This browser includes folders containing files. Use desktop import to retain empty folders.</p>}
   <p className="text-xs text-[var(--text-secondary)]">{merge?'Matching collections will be used; notes and files are still new copies.':'If a collection name is taken, the new collection gets a numbered name.'} Existing notes and files stay unchanged.</p>
   <details><summary className="cursor-pointer text-sm">File options</summary><div className="space-y-3 pt-2">
     {session.folder&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={merge} disabled={locked} onChange={e=>setMerge(e.target.checked)}/>Use existing collections with matching names</label>}
     <label className="text-sm">Text conversion <select className="organization-input" disabled={locked} onChange={e=>setRows(current=>current.map(row=>({...row,asNote:e.target.value==='all'?row.kind!=='binary':e.target.value==='defaults'?(row.kind==='markdown'||row.kind==='text'):false})))} defaultValue="defaults"><option value="defaults">Markdown and plain text as notes</option><option value="all">All supported text as notes</option><option value="originals">Keep all originals</option></select></label>
     {rows.slice(page*30,page*30+30).map(row=><div key={row.id} className="border-b border-border py-2 text-sm"><div className="flex gap-2 items-center"><span className="truncate flex-1" title={row.path}>{row.path??row.file.name}</span><select aria-label={`Import ${row.file.name} as`} className="organization-input" disabled={pending||row.started||row.status==='done'||Boolean(previous)} value={row.asNote?'note':'file'} onChange={e=>updateRow(row.id,{asNote:e.target.value==='note',error:undefined,status:'ready'})}><option value="file">Keep as file</option>{row.kind!=='binary'&&<option value="note">Convert to note</option>}</select><small>{row.status}</small></div>{(row.error||(row.asNote&&row.parseError))&&<p className="text-red-500">{row.error??row.parseError}</p>}</div>)}
     {rows.length>30&&<div className="flex justify-between"><button disabled={!page} onClick={()=>setPage(page-1)}>Previous</button><span>{page+1}/{Math.ceil(rows.length/30)}</span><button disabled={(page+1)*30>=rows.length} onClick={()=>setPage(page+1)}>Next</button></div>}
   </div></details>
   {session.folder&&<details><summary className="cursor-pointer text-sm">Folder structure</summary><FolderPreview paths={directories} rows={rows} parent=""/></details>}
   {warnings.size>0&&<details><summary className="cursor-pointer text-sm">Link issues</summary>{[...warnings].map(([cause,count])=><p className="text-sm py-1" key={cause}>{count} · {cause}</p>)}<p className="text-xs">Unresolved links stay as text. File import errors appear separately.</p></details>}
   </div>
 </div></AppModal>;
}
function FolderPreview({paths,rows,parent}:{paths:string[];rows:ImportRow[];parent:string}){
 const [limit,setLimit]=useState(30);const children=paths.filter(p=>(p.includes('/')?p.slice(0,p.lastIndexOf('/')):'')===parent);
 const files=rows.filter(r=>(r.path??'').split('/').slice(0,-1).join('/')===parent);
 return <div className="pl-3 text-sm">{children.slice(0,limit).map(path=><FolderBranch key={path} path={path} paths={paths} rows={rows}/>)}{files.slice(0,limit).map(row=><p key={row.id} className="py-1 truncate">{row.file.name}</p>)}{Math.max(children.length,files.length)>limit&&<button onClick={()=>setLimit(limit+30)}>Show 30 more</button>}</div>;
}

function FolderBranch({path,paths,rows}:{path:string;paths:string[];rows:ImportRow[]}){const [open,setOpen]=useState(false);return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary className="py-1 cursor-pointer truncate" title={path}>{path.split('/').at(-1)}</summary>{open&&<FolderPreview paths={paths} rows={rows} parent={path}/>}</details>;}
