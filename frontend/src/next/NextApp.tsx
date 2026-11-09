import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { FolderOpen, Plus, Library, Moon, X, BookOpen, MoreHorizontal } from 'lucide-react';
import { SharedNoteDocuments } from '../lib/sharedNoteDocuments';
import { createThemeTransitionController, themeOriginAt } from '../lib/themeTransition';
import { motionProfile } from '../lib/motion';
import { command, type Note, type Snapshot, type Page, type Cursor, type Draft, type DraftSummary, type Collection } from './client';
import { EditingSession } from './editing';
import NextEditor from './NextEditor';
import CollectionTree from './CollectionTree';
import { collectionPaths } from './collections';
import { ResourceRow } from './LibraryList';
import RecoveryReview from './RecoveryReview';
import helpText from '../../../docs/help/next-foundation.md?raw';

export default function NextApp() {
  const [snapshot,setSnapshot]=useState<Snapshot>();
  const [page,setPage]=useState<Page>({items:[],next:null,total:0});
  const [collection,setCollection]=useState<string|null>(null);
  const [trail,setTrail]=useState<(Cursor|null)[]>([null]);
  const [panes,setPanes]=useState<string[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[help,setHelp]=useState(false);
  const [form,setForm]=useState<{id?:string;name:string;parentId:string|null}|null>(null);
  const [organizing,setOrganizing]=useState<{id:string;title:string;members:string[];target:string}|null>(null);
  const [drafts,setDrafts]=useState<DraftSummary[]>([]);
  const [review,setReview]=useState<{draft:Draft;saved:Note}>();
  const [,render]=useState(0);
  const [documents]=useState(()=>new SharedNoteDocuments());
  const [theme]=useState(()=>createThemeTransitionController());
  const reviewHandler=useRef<(id:string)=>Promise<void>>(async()=>{});
  const [session]=useState(()=>new EditingSession(id=>{render(v=>v+1);if(id)setDrafts(old=>old.filter(d=>d.id!==id));},id=>void reviewHandler.current(id).catch(e=>setError(String(e)))));
  const currentCollection=useRef<string|null>(null),operating=useRef(false);
  const listElement=useRef<HTMLElement>(null),scrolls=useRef(new Map<string,number>());
  const scopeKey=`${collection??'library'}:${trail.length}`;
  const paths=useMemo(()=>collectionPaths(snapshot?.collections??[]),[snapshot?.collections]);
  const previousPanes=useRef(new Map<Element,DOMRect>());
  useLayoutEffect(()=>{
    const next=new Map<Element,DOMRect>(),animations:Animation[]=[];
    for(const element of document.querySelectorAll<HTMLElement>('.next-pane')){const before=previousPanes.current.get(element),after=element.getBoundingClientRect();next.set(element,after);if(before&&after.width&&motionProfile().panel&&before.width!==after.width)animations.push(element.animate([{transform:`translateX(${before.x-after.x}px) scaleX(${before.width/after.width})`},{transform:'none'}],{duration:motionProfile().panel,easing:'ease-out'}));}
    previousPanes.current=next;return()=>animations.forEach(a=>a.cancel());
  },[panes]);
  useLayoutEffect(()=>{if(listElement.current)listElement.current.scrollTop=scrolls.current.get(scopeKey)??0;},[page,scopeKey]);
  const refresh=useCallback(async()=>{
    const [state,list,recovery]=await Promise.all([command<Snapshot>({kind:'snapshot'}),command<Page>({kind:'list',collection:currentCollection.current}),command<DraftSummary[]>({kind:'drafts'})]);
    setSnapshot(state);setPage(list);setTrail([null]);setDrafts(recovery);theme.apply(state.settings.theme??'light');
  },[theme]);
  const run=useCallback(async(action:()=>Promise<void>,flush=true)=>{
    if(operating.current)return;operating.current=true;setBusy(true);setError('');
    try{if(flush)await session.flushAll();await action();}catch(e){setError(String(e));}finally{operating.current=false;setBusy(false);}
  },[session]);
  const inspectDraft=useCallback(async(id:string)=>{
    if(session.dirty(id))await session.protect(id);
    const [draft,saved]=await Promise.all([command<Draft>({kind:'readDraft',id}),command<Note>({kind:'read',id})]);
    setReview({draft,saved});setDrafts(await command({kind:'drafts'}));
  },[session]);
  useEffect(()=>{reviewHandler.current=inspectDraft;},[inspectDraft]);
  useEffect(()=>{void refresh().catch(e=>setError(String(e)));return()=>theme.dispose();},[refresh,theme]);
  useEffect(()=>{for(const id of session.ids())if(!panes.includes(id)&&!session.dirty(id))session.forget(id);},[panes,session]);
  useEffect(()=>{
    let disposed=false,remove:(()=>void)|undefined;
    void getCurrentWindow().onCloseRequested(event=>{event.preventDefault();void run(async()=>{await getCurrentWindow().destroy();});}).then(unlisten=>{if(disposed)unlisten();else remove=unlisten;});
    const keyboard=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void run(async()=>{});}if(event.key==='F1'){event.preventDefault();setHelp(v=>!v);}};
    window.addEventListener('keydown',keyboard);return()=>{disposed=true;remove?.();window.removeEventListener('keydown',keyboard);};
  },[run]);
  const selectCollection=useCallback((id:string|null)=>void run(async()=>{
    const list=await command<Page>({kind:'list',collection:id});currentCollection.current=id;setCollection(id);setPage(list);setTrail([null]);setOrganizing(null);
  }),[run]);
  const openNote=useCallback((id:string,beside=false)=>void run(async()=>{
    if(!session.get(id)){
      const recovery=await command<DraftSummary[]>({kind:'drafts'});
      if(recovery.some(d=>d.id===id)){await inspectDraft(id);return;}
      session.adopt(await command<Note>({kind:'read',id}));
    }
    setPanes(old=>beside&&old.length?[old[0],id]:[id]);
  }),[run,session,inspectDraft]);
  const organize=useCallback((id:string)=>void run(async()=>{
    const info=await command<{title:string;members:string[]}>({kind:'memberships',id});setOrganizing({id,title:info.title,members:info.members,target:''});
  }),[run]);
  const changePage=(forward:boolean)=>void run(async()=>{
    const nextTrail=forward?[...trail,page.next]:trail.slice(0,-1);if(!nextTrail.length)return;
    const list=await command<Page>({kind:'list',collection,cursor:nextTrail.at(-1)});setPage(list);setTrail(nextTrail);
  });
  const resolve=(choice:'restore'|'discard'|'park')=>void run(async()=>{
    if(!review)return;const {draft,saved}=review;
    const alreadyOpen=panes.includes(draft.id);
    if(choice!=='park'&&(alreadyOpen||choice==='restore'))for(const id of session.ids())if(id!==draft.id)await session.flush(id);
    await session.park(draft.id);
    if(choice==='park'){setPanes(old=>old.filter(id=>id!==draft.id));}
    else{
      let note=saved;
      if(choice==='discard'){
        await command({kind:'discardDraft',id:draft.id,token:draft.token,sequence:draft.sequence});
        if(!alreadyOpen){setReview(undefined);await refresh();return;}
        note=await command<Note>({kind:'read',id:draft.id});
      }
      else{const rebased=await command<Draft>({kind:'rebaseDraft',id:draft.id,token:draft.token,sequence:draft.sequence,revision:saved.revision});note={...saved,title:rebased.title,content:rebased.content};session.adopt(note,rebased);}
      if(choice==='discard')session.adopt(note);
      documents.acceptSaved(draft.id,note.content);if(!alreadyOpen)setPanes([draft.id]);
    }
    setReview(undefined);setError('');setDrafts(await command({kind:'drafts'}));await refresh();
  },false);
  const membership=(mode:'add'|'move'|'remove')=>void run(async()=>{
    if(!organizing)return;
    await command({kind:'membership',id:organizing.id,add:mode==='remove'?null:organizing.target,remove:mode==='add'?null:collection});
    setOrganizing(null);await refresh();
  });
  const activeCollection=snapshot?.collections.find(c=>c.id===collection);
  const manage=(c:Collection)=>setForm({id:c.id,name:c.name,parentId:c.parentId});
  return <div className="next-shell" data-ready={!!snapshot} data-total={page.total}>
    <aside className="next-sidebar">
      <div className="next-brand">Vaultor <span>Next · M2</span></div>
      <button onClick={()=>selectCollection(null)} aria-current={collection===null?'page':undefined}><Library size={17}/>Library</button>
      <div className="next-section"><span>Collections</span><button aria-label="New collection" disabled={busy} onClick={()=>setForm({name:'',parentId:collection})}><Plus size={16}/></button></div>
      <CollectionTree collections={snapshot?.collections??[]} selected={collection} select={selectCollection} manage={manage}/>
      {form&&<form className="next-collection-form" onSubmit={e=>{e.preventDefault();void run(async()=>{
        if(form.id)await command({kind:'updateCollection',id:form.id,name:form.name,parentId:form.parentId});else await command({kind:'createCollection',name:form.name,parentId:form.parentId});setForm(null);await refresh();
      });}}><input aria-label="Collection name" autoFocus value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><select aria-label="Parent collection" value={form.parentId??''} onChange={e=>setForm({...form,parentId:e.target.value||null})}><option value="">Top level</option>{snapshot?.collections.filter(c=>c.id!==form.id).map(c=><option key={c.id} value={c.id}>{paths.get(c.id)}</option>)}</select><div><button disabled={busy}>{form.id?'Save collection':'Create'}</button><button type="button" onClick={()=>setForm(null)}>Cancel</button></div></form>}
      {drafts.length>0&&<div className="next-recovery-list"><small>Recovery · {drafts.length}</small>{drafts.map(d=><button key={d.id} onClick={()=>void run(()=>inspectDraft(d.id),false)}>{d.title||'Untitled draft'}</button>)}</div>}
      <div className="next-sidebar-bottom">
        <button disabled={busy} onClick={()=>void run(async()=>{const path=await open({directory:true,multiple:false,title:'Choose an empty folder or M2 workspace'});if(!path)return;await command({kind:'open',path});for(const id of session.ids())session.forget(id);documents.clear();setPanes([]);currentCollection.current=null;setCollection(null);await refresh();})}><FolderOpen size={17}/>Open workspace</button>
        <button onClick={e=>{const origin=themeOriginAt(e.currentTarget);void run(async()=>{const value=snapshot?.settings.theme==='dark'?'light':'dark';await command({kind:'setting',key:'theme',value});theme.apply(value,origin);setSnapshot(s=>s&&({...s,settings:{...s.settings,theme:value}}));});}}><Moon size={17}/>Appearance</button>
        <button onClick={()=>setHelp(v=>!v)}><BookOpen size={17}/>Milestone Help</button><small title={snapshot?.path}>{snapshot?.path??'Workspace unavailable'}</small>
      </div>
    </aside>
    <main className="next-main"><header className="next-header"><div><h1 title={collection?paths.get(collection):undefined}>{activeCollection?.name??'Library'}</h1><small>{page.total} notes · newest created first</small></div><div className="next-header-actions">{activeCollection&&<button aria-label="Manage current collection" onClick={()=>manage(activeCollection)}><MoreHorizontal size={17}/></button>}<button disabled={busy||!snapshot} onClick={()=>void run(async()=>{const note=await command<Note>({kind:'createNote',title:'Untitled note',collection});session.adopt(note);setPanes([note.id]);await refresh();})}><Plus size={17}/>New note</button></div></header>
      {(error||session.failed())&&<div role="alert" className="next-error">{error||'A save failed. Your draft is retained; review conflicts or retry.'}<button onClick={()=>void run(refresh)}>Retry saves</button>{panes.some(id=>session.status(id)==='conflict')&&<button onClick={()=>void run(()=>inspectDraft(panes.find(id=>session.status(id)==='conflict')!),false)}>Review versions</button>}</div>}
      {organizing&&<div className="next-organize"><strong>{organizing.title}</strong><span>{organizing.members.map(id=>paths.get(id)).join(', ')||'No collections'}</span><select aria-label="Destination collection" value={organizing.target} onChange={e=>setOrganizing({...organizing,target:e.target.value})}><option value="">Choose collection</option>{snapshot?.collections.map(c=><option key={c.id} value={c.id}>{paths.get(c.id)}</option>)}</select><button disabled={busy||!organizing.target} onClick={()=>membership('add')}>Add membership</button><button disabled={busy||!collection||!organizing.target||organizing.target===collection||!organizing.members.includes(collection)} onClick={()=>membership('move')}>Move membership</button><button disabled={busy||!collection||!organizing.members.includes(collection)} onClick={()=>membership('remove')}>Remove from this collection</button><button aria-label="Close organization" onClick={()=>setOrganizing(null)}><X size={16}/></button></div>}
      {help?<section className="next-help"><button onClick={()=>setHelp(false)}>Close Help</button><ReactMarkdown>{helpText}</ReactMarkdown></section>:<div className={`next-workspace ${panes.length?'has-editor':''}`}>
        <div className="next-library-region"><nav ref={listElement} className="next-library" aria-label="Notes" aria-busy={busy} onScroll={e=>scrolls.current.set(scopeKey,e.currentTarget.scrollTop)}>{page.items.map(item=><ResourceRow key={item.id} item={item} selected={panes.includes(item.id)} open={openNote} organize={organize}/>)}{!page.items.length&&<p>Create a note to start writing.</p>}</nav><div className="next-pagination"><button disabled={busy||trail.length<=1} onClick={()=>changePage(false)}>Previous</button><span>Page {trail.length}</span><button disabled={busy||!page.next} onClick={()=>changePage(true)}>Next</button></div></div>
        <div className="next-panes">{panes.map((id,index)=>{const note=session.get(id);if(!note)return null;return <section key={`${index}-${id}`} className="next-pane" aria-label={`Editor pane ${index+1}`}><div className="next-note-bar"><input aria-label={`Note title ${index+1}`} value={note.title} maxLength={240} disabled={busy||!!review} onChange={e=>{session.edit(id,{title:e.target.value});setPage(p=>({...p,items:p.items.map(item=>item.id===id?{...item,title:e.target.value}:item)}));}}/><span role="status">{session.status(id)}</span><button aria-label="Organize note" onClick={()=>organize(id)}><MoreHorizontal size={16}/></button><button aria-label="Close note" onClick={()=>void run(async()=>{setPanes(old=>old.filter((_,i)=>i!==index));})}><X size={16}/></button></div><div className="next-document"><NextEditor note={note} pane={index} documents={documents} locked={busy||!!review} changed={capture=>session.edit(id,{capture})}/></div></section>;})}</div>
      </div>}
    </main>{review&&<RecoveryReview {...review} busy={busy} close={()=>setReview(undefined)} resolve={resolve}/>}</div>;
}
