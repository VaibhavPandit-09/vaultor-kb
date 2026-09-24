import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Command, FileText, Folder, MoreHorizontal, Paperclip, Search, X } from 'lucide-react';
import type { Resource } from '../../types';
import { createRootStep, buildRenameStep, buildDeleteConfirmStep, type CommandContext, type CommandItem, type CommandStep } from '../../lib/commandPalette';
import { useResourcePage } from '../../lib/useResourcePage';
import { useOrganizationPage } from '../../lib/organization';
import { usePins } from '../../lib/organizationControls';
import { setResourceFavorite } from '../../lib/resourceBrowse';
import { ESCAPE_PRIORITIES, useEscapeLayer } from '../../lib/escape/escape';
import { useSettings } from '../../lib/settings';
import { getGlassPanelStyle, getOverlayStyle } from '../../lib/transparency';
import SearchExcerpt from '../SearchExcerpt';
import { CollectionPicker } from '../ResourceCollections';
import OrganizationManager from '../OrganizationManager';
import api from '../../lib/api';

type Entry={step:CommandStep;query:string};
type Result=CommandItem & {resource?:Resource;kind?:string};
interface Props {open:boolean;onClose:(options?:{restorePreview?:boolean;restoreFocus?:boolean})=>void;context:CommandContext;}
export default function CommandPaletteModal({open,onClose,context}:Props) {
 const [wasOpen,setWasOpen]=useState(false),[captured,setCaptured]=useState(context);
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[mode,setMode]=useState<'search'|'commands'>('search'),[stack,setStack]=useState<Entry[]>([]);
 const [selectedId,setSelectedId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [organization,setOrganization]=useState<{kind:'collection'|'tag';ids:string[]}|null>(null);
 const input=useRef<HTMLInputElement>(null),running=useRef(false);
 if(open!==wasOpen){setWasOpen(open);if(open){setCaptured(context);setQuery('');setSearch('');setMode('search');setStack([]);setSelectedId('');setError('');}}
 const entry=stack.at(-1),currentQuery=entry?.query??query;
 useEffect(()=>{const timer=setTimeout(()=>setSearch(currentQuery),150);return()=>clearTimeout(timer);},[currentQuery]);
 useEffect(()=>{if(open){const frame=requestAnimationFrame(()=>input.current?.focus());return()=>cancelAnimationFrame(frame);}},[open,stack.length,mode]);
 const selecting=entry?.step.id==='delete-select';
 const resources=useResourcePage({q:search,size:50,sort:'recent'},open&&((mode==='search'&&!entry)||selecting));
 const collections=useOrganizationPage('collection',search,0,open&&mode==='search'&&!entry&&Boolean(search.trim()),false,20);
 const pins=usePins('',0,30,open&&mode==='search'&&!search.trim()&&!entry);
 const scope={...captured,resources:resources.data?.items??[]};
 function close(){if(running.current)return;if(stack.length){setStack(v=>v.slice(0,-1));setError('');}else if(mode==='commands'){setMode('search');setQuery('');setError('');}else onClose();}
 useEscapeLayer({id:'vaultor-command-palette',active:open,priority:ESCAPE_PRIORITIES.commandPalette,restoreFocusOnEscape:false,close});
 function handoff(kind:'collection'|'tag',ids:string[]){setOrganization({kind,ids});onClose({restoreFocus:false,restorePreview:false});}
 const action=(id:string,title:string,work:()=>void|Promise<void>,subtitle?:string):Result=>({id,title,subtitle,section:'Commands',onSelect:()=>({type:'execute',action:work})});
 function actionStep(resource:Resource):CommandStep {return {id:'actions-'+resource.id,type:'select',title:'Actions · '+resource.title,placeholder:'Filter actions…',getItems:filter=>[
   action('membership','Add to collection',()=>handoff('collection',[resource.id]),resource.title),
   action('pin',resource.favorite?'Unpin':'Pin',()=>setResourceFavorite(resource.id,!resource.favorite),resource.title),
   action('tags','Manage tags',()=>handoff('tag',[resource.id]),resource.title),
   ...(resource.type==='note'?[{id:'rename',title:'Rename',subtitle:resource.title,onSelect:()=>({type:'push' as const,step:buildRenameStep(resource),query:resource.title})},action('export','Export note',()=>captured.exportResource?.(resource),resource.title)]:[action('preview','Preview file',()=>captured.openResource(resource.id),resource.title),action('download','Download file',()=>{const link=document.createElement('a');link.href='/api/resources/'+resource.id+'/raw';link.download=resource.title;link.click();},resource.title)]),
   {id:'delete',title:'Delete…',subtitle:resource.title,onSelect:()=>({type:'push' as const,step:buildDeleteConfirmStep(scope,resource)})}
 ].filter(item=>item.title.toLowerCase().includes(filter.toLowerCase()))};}
 const extra:Result[]=[
  action('library','Open Library',()=>captured.openLibrary?.('library')),
  action('collections','Browse collections',()=>captured.openLibrary?.('collections')),
  action('new-collection','Create collection',()=>handoff('collection',[])),
  action('pinned','View pinned shortcuts',()=>captured.openLibrary?.('favorites')),
  action('diagnostics','Open Diagnostics',()=>captured.openDiagnostics?.()),
 ];
 const targets=captured.selectedResources?.length?captured.selectedResources:captured.targetResource?[captured.targetResource]:[];
 if(targets.length){extra.push(action('organize','Add target to collection',()=>handoff('collection',targets.map(r=>r.id)),targets.map(r=>r.title).join(', ')),action('target-tags','Manage target tags',()=>handoff('tag',targets.map(r=>r.id)),targets.map(r=>r.title).join(', ')));}
 if(targets.length===1)extra.push({id:'target-actions',title:'Actions for '+targets[0].title,subtitle:'Explicit target',onSelect:async()=>({type:'push',step:actionStep((await api.get<Resource>('/resources/'+targets[0].id+'/summary',{backgroundDiagnostic:true})).data)})});
 function resourceItem(resource:Resource,section:string):Result {return {id:'resource-'+resource.id,title:resource.title,subtitle:resource.type==='note'?'Note':'File',resource,kind:resource.type,section,onSelect:()=>({type:'execute',action:()=>captured.openResource(resource.id)})};}
 let items:Result[]=[];
 if(entry)items=entry.step.getItems(entry.step.type==='input'?currentQuery:search,scope);
 else if(mode==='commands')items=[...createRootStep({...scope,resources:[]},null,{}).getItems(search,{...scope,resources:[]}),...extra.filter(item=>!search||((item.title+' '+(item.subtitle??'')).toLowerCase().includes(search.toLowerCase())))];
 else if(search.trim())items=[...(resources.data?.items??[]).map(r=>resourceItem(r,'Resources')),...(collections.data?.items??[]).map(c=>({...action('collection-'+c.id,c.name,()=>captured.openCollection?.(c),`${c.count} resources`),kind:'collection',section:'Collections'}))];
 else {
  const seen=new Set<string>();const add=(item:Result)=>{if(!seen.has(item.id)){seen.add(item.id);items.push(item);}};
  captured.openNotes.forEach(r=>add(resourceItem(r,'Open')));
  if(captured.previewResource)add(resourceItem(captured.previewResource,'Open'));
  (pins.data?.items??[]).forEach(p=>{if(p.kind==='collection')add({...action('collection-'+p.id,p.name,async()=>{const {data}=await api.get('/collections/'+p.id,{backgroundDiagnostic:true});captured.openCollection?.(data);},'Collection'),kind:'collection',section:'Pinned'});else add(resourceItem({id:p.id,type:p.kind as 'note'|'file',title:p.name,favorite:true,tags:[],createdAt:'',updatedAt:''},'Pinned'));});
  (resources.data?.items??[]).slice(0,20).forEach(r=>add(resourceItem(r,'Recent')));
 }
 const searchPending=((mode==='search'&&!entry)||selecting)&&currentQuery.trim()!==search.trim();
 if(searchPending)items=[];
 const selected=items.find(item=>item.id===selectedId)??items[0];
 const highlightedId=selected?.id;
 useEffect(()=>{if(open&&highlightedId)document.getElementById('palette-option-'+highlightedId)?.scrollIntoView?.({block:'nearest'});},[highlightedId,open]);
 async function execute(item:Result){if(running.current)return;running.current=true;setBusy(true);setError('');try{
 const result=await item.onSelect();if(result.type==='push'){setStack(v=>[...v,{step:result.step,query:result.query??result.step.initialQuery??''}]);setSelectedId('');}
 else if(result.type==='execute'){await result.action();onClose({restorePreview:item.id==='pin',restoreFocus:item.id==='pin'||item.id==='toggle_sidebar'});}
 }catch(e){setError((e as {response?:{data?:{detail?:string}}})?.response?.data?.detail??(e instanceof Error?e.message:'Action failed. Retry.'));}finally{running.current=false;setBusy(false);}}
 function change(value:string){setError('');if(entry)setStack(v=>v.map((e,i)=>i===v.length-1?{...e,query:value}:e));else if(value.startsWith('>')){setMode('commands');setQuery(value.slice(1).trimStart());}else setQuery(value);}
 const {settings}=useSettings();const transparency=settings.local.uiTransparency;
 const failure=((mode==='search'&&!entry)||selecting)?resources.error||collections.error||pins.error:'';
 const dialog=organization?.kind==='collection'?<CollectionPicker resourceIds={organization.ids} onClose={()=>setOrganization(null)}/>:organization?<OrganizationManager initialKind="tag" resourceIds={organization.ids} onClose={()=>setOrganization(null)} onApplied={()=>setOrganization(null)} tags={[]} onTag={()=>{}} onTagRenamed={()=>{}} onCollection={()=>{}}/>:null;
 return <>{dialog}{open&&createPortal(<div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]" style={getOverlayStyle(transparency,.3)} onClick={()=>{if(!running.current)onClose();}}>
 <div role="dialog" aria-modal="true" aria-label="Search and commands" className="w-full max-w-2xl rounded-2xl border border-[var(--border-strong)] shadow-xl overflow-hidden" style={getGlassPanelStyle(transparency,20)} onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
 <header className="flex items-center gap-2 px-4 pt-3 text-sm">{(entry||mode==='commands')&&<button className="library-button" disabled={busy} onClick={close}><ArrowLeft size={14}/>Back</button>}<strong className="truncate flex-1">{entry?.step.title??(mode==='commands'?'Commands':'Search workspace')}</strong>{!entry&&<button className="library-button" disabled={busy} onClick={()=>{setMode(mode==='search'?'commands':'search');setQuery('');}}><Command size={14}/>{mode==='search'?'Commands':'Search'}</button>}<button aria-label="Close palette" disabled={busy} onClick={()=>onClose()}><X size={18}/></button></header>
 <div className="flex items-center gap-2 px-4 py-3"><Search size={18}/><input ref={input} role="combobox" aria-label={entry?.step.placeholder??'Search titles and saved notes'} aria-expanded="true" aria-controls="palette-results" aria-autocomplete="list" aria-activedescendant={selected?'palette-option-'+selected.id:undefined} className="w-full bg-transparent outline-none" value={currentQuery} disabled={busy} placeholder={entry?.step.placeholder??(mode==='commands'?'Find a command…':'Search titles and saved note text…')} onChange={e=>change(e.target.value)} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const index=items.findIndex(i=>i.id===selected?.id);setSelectedId(items[Math.max(0,Math.min(items.length-1,index+(e.key==='ArrowDown'?1:-1)))]?.id??'');}else if(e.key==='Enter'&&selected){e.preventDefault();void execute(selected);}}}/></div>
 <div className="px-4 pb-2 text-xs text-[var(--text-secondary)]">{context.hasUnsavedChanges?'Search uses saved content; unsaved edits are excluded.':'Searches saved note text and file titles.'}{mode==='commands'&&<p>Target: {targets.length?targets.map(r=>r.title).join(', '):'None — choose a resource explicitly'}</p>}</div>
 {!entry&&mode==='search'&&search.trim()&&((resources.data?.totalItems??0)>50||(collections.data?.totalItems??0)>20)&&<p className="px-4 pb-2 text-xs text-[var(--text-secondary)]">Showing the first matches. Refine your search or open Library for all results.</p>}
 {error&&<p role="alert" className="px-4 py-2 text-sm text-red-500">{error} Your input is retained; retry the action.</p>}
 {failure&&<p role="alert" className="px-4 py-2 text-sm">{failure}<button className="library-button" onClick={()=>{resources.retry();collections.retry();pins.retry();}}>Retry search</button></p>}
 <div id="palette-results" role="listbox" aria-label="Results" aria-busy={busy} className="max-h-[48vh] overflow-auto p-2">{items.map((item,index)=>{const Icon=item.kind==='collection'?Folder:item.kind==='file'?Paperclip:item.kind==='note'?FileText:Command;return <div key={item.id}>{item.section!==items[index-1]?.section&&<p className="px-3 py-1 text-xs text-[var(--text-tertiary)]">{item.section}</p>}<div role="option" id={'palette-option-'+item.id} aria-selected={item.id===selected?.id} className="palette-result flex gap-3 rounded-lg px-3 py-2 cursor-pointer" onMouseEnter={()=>setSelectedId(item.id)} onClick={()=>void execute(item)}><Icon className="shrink-0 mt-1" size={17}/><div className="min-w-0"><p className="truncate text-sm font-medium">{item.title}</p><p className="text-xs text-[var(--text-secondary)] truncate">{item.resource?.searchSnippet?.text?<SearchExcerpt snippet={item.resource.searchSnippet}/>:item.subtitle}</p></div></div></div>;})}{!items.length&&<p className="p-4 text-sm">{(searchPending||resources.loading)&&mode==='search'?'Searching…':'No matches. Try different words.'}</p>}</div>
 <footer className="flex flex-wrap gap-2 items-center justify-between border-t border-border p-3 text-xs text-[var(--text-secondary)]"><span>{busy?'Working…':'Enter opens · ↑ ↓ select · Esc back'}</span>{selected?.resource&&<button className="library-button max-w-full min-w-0" disabled={busy} onClick={()=>void execute({id:'resource-actions',title:'Actions',onSelect:async()=>({type:'push',step:actionStep((await api.get<Resource>('/resources/'+selected.resource!.id+'/summary',{backgroundDiagnostic:true})).data)})})}><MoreHorizontal className="shrink-0" size={16}/><span className="truncate">Actions for {selected.title}</span></button>}</footer>
 </div></div>,document.body)}</>;
}
