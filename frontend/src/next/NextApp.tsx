import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { FolderOpen, Plus, Library, Moon, X, BookOpen, MoreHorizontal, PanelRight, CheckSquare, FolderPlus, FolderInput, FolderMinus, Pencil, RefreshCw } from 'lucide-react';
import { SharedNoteDocuments } from '../lib/sharedNoteDocuments';
import { createThemeTransitionController, themeOriginAt } from '../lib/themeTransition';
import { motionProfile } from '../lib/motion';
import { command, type Note, type Snapshot, type Page, type Cursor, type Draft, type DraftSummary, type Collection, type MembershipReceipt } from './client';
import { useEscapeLayer } from '../lib/escape/escape';
import { contextSelection, listShortcutTarget, usePageSelection, type PickModifiers } from './selection';
import ContextMenu, { type ContextRequest, type ContextAction } from './ContextMenu';
import OrganizeDialog, { type OrganizationRequest } from './OrganizeDialog';
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
  const [organizing,setOrganizing]=useState<OrganizationRequest|null>(null);
  const [menu,setMenu]=useState<ContextRequest|null>(null),[notice,setNotice]=useState('');
  const [listOwnsFocus,setListOwnsFocus]=useState(false),[focusNote,setFocusNote]=useState<string|null>(null);
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
  const selectionScope=JSON.stringify([collection,trail.at(-1)]);
  const order=useMemo(()=>page.items.map(item=>item.id),[page.items]);
  const selection=usePageSelection(selectionScope,order);
  const cursorRef=useRef<Cursor|null>(null);
  useLayoutEffect(()=>{cursorRef.current=trail.at(-1)??null;},[trail]);
  const selectPage=useRef<HTMLInputElement>(null);
  useLayoutEffect(()=>{if(selectPage.current)selectPage.current.indeterminate=selection.state.ids.length>0&&selection.state.ids.length<order.length;},[selection.state.ids.length,order.length]);
  useEscapeLayer({active:listOwnsFocus&&selection.state.ids.length>0,priority:150,close:selection.clear,restoreFocusOnEscape:false});
  const focusRow=useCallback((id?:string)=>{
    const rows=[...document.querySelectorAll<HTMLButtonElement>('[data-row-open]')];
    const target=rows.find(row=>row.dataset.rowOpen===id)??rows[0]??document.querySelector<HTMLElement>('[data-list-focus]');target?.focus({preventScroll:true});
    target?.scrollIntoView?.({block:'nearest'});
  },[]);
  const paths=useMemo(()=>collectionPaths(snapshot?.collections??[]),[snapshot?.collections]);
  const previousPanes=useRef(new Map<Element,DOMRect>());
  useLayoutEffect(()=>{
    const next=new Map<Element,DOMRect>(),animations:Animation[]=[];
    for(const element of document.querySelectorAll<HTMLElement>('.next-pane')){const before=previousPanes.current.get(element),after=element.getBoundingClientRect();next.set(element,after);if(before&&after.width&&motionProfile().panel&&before.width!==after.width)animations.push(element.animate([{transform:`translateX(${before.x-after.x}px) scaleX(${before.width/after.width})`},{transform:'none'}],{duration:motionProfile().panel,easing:'ease-out'}));}
    previousPanes.current=next;return()=>animations.forEach(a=>a.cancel());
  },[panes]);
  useLayoutEffect(()=>{if(listElement.current)listElement.current.scrollTop=scrolls.current.get(scopeKey)??0;},[page,scopeKey]);
  const refresh=useCallback(async(reset=true)=>{
    const [state,list,recovery]=await Promise.all([command<Snapshot>({kind:'snapshot'}),command<Page>({kind:'list',collection:currentCollection.current,cursor:reset?null:cursorRef.current}),command<DraftSummary[]>({kind:'drafts'})]);
    setMenu(null);setSnapshot(state);setPage(list);if(reset)setTrail([null]);setDrafts(recovery);theme.apply(state.settings.theme??'light');
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
    const keyboard=(event:globalThis.KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void run(async()=>{});}if(event.key==='F1'){event.preventDefault();setHelp(v=>!v);}};
    window.addEventListener('keydown',keyboard);return()=>{disposed=true;remove?.();window.removeEventListener('keydown',keyboard);};
  },[run]);
  const selectCollection=useCallback((id:string|null)=>void run(async()=>{
    const list=await command<Page>({kind:'list',collection:id});currentCollection.current=id;setCollection(id);setMenu(null);setNotice('');setPage(list);setTrail([null]);setOrganizing(null);
  }),[run]);
  const openNote=useCallback((id:string,beside=false,keyboard=false)=>void run(async()=>{
    if(!session.get(id)){
      const recovery=await command<DraftSummary[]>({kind:'drafts'});
      if(recovery.some(d=>d.id===id)){await inspectDraft(id);return;}
      session.adopt(await command<Note>({kind:'read',id}));
    }
    setPanes(old=>beside&&old.length?[old[0],id]:[id]);
    setFocusNote(keyboard?id:null);
  }),[run,session,inspectDraft]);
  const organize=useCallback((ids:string[],mode:OrganizationRequest['mode']='add')=>void run(async()=>{
    setOrganizing({ids:[...ids],source:currentCollection.current,mode});
  }),[run]);
  const changePage=(forward:boolean)=>void run(async()=>{
    const nextTrail=forward?[...trail,page.next]:trail.slice(0,-1);if(!nextTrail.length)return;
    const list=await command<Page>({kind:'list',collection,cursor:nextTrail.at(-1)});setMenu(null);setNotice('');setPage(list);setTrail(nextTrail);requestAnimationFrame(()=>focusRow());
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
  const membership=(add:string|null,remove:string|null)=>void run(async()=>{
    if(!organizing)return;
    const result=await command<MembershipReceipt>({kind:'bulkMembership',ids:organizing.ids,add,remove});
    selection.clear();setOrganizing(null);await refresh();
    setNotice(`${result.requested} notes organized · ${result.added} added, ${result.removed} removed, ${result.unchanged} unchanged`);requestAnimationFrame(()=>focusRow());
  });
  const activeCollection=snapshot?.collections.find(c=>c.id===collection);
  const manage=(c:Collection)=>setForm({id:c.id,name:c.name,parentId:c.parentId});
  const createNote=(target:string|null=collection)=>void run(async()=>{const note=await command<Note>({kind:'createNote',title:'Untitled note',collection:target});currentCollection.current=target;setCollection(target);selection.clear();session.adopt(note);setPanes([note.id]);setFocusNote(note.id);await refresh();});
  const showMenu=useCallback((label:string,event:MouseEvent<HTMLElement>|KeyboardEvent<HTMLElement>,actions:ContextAction[],source?:HTMLElement)=>{
    const target=source??event.currentTarget;const rect=target.getBoundingClientRect();
    setMenu({label,scope:selectionScope,source:target,x:'clientX'in event&&event.clientX?event.clientX:rect.left,y:'clientY'in event&&event.clientY?event.clientY:rect.bottom,actions});
  },[selectionScope]);
  const resourceMenu=useCallback((id:string,event:MouseEvent<HTMLElement>|KeyboardEvent<HTMLElement>)=>{
    if(busy)return;
    const next=contextSelection(selection.state,order,id);selection.context(id);
    const source=[...document.querySelectorAll<HTMLButtonElement>('[data-row-open]')].find(row=>row.dataset.rowOpen===id);
    const actions:ContextAction[]=[];
    if(next.ids.length===1)actions.push({label:'Open note',icon:BookOpen,run:()=>openNote(id,false,true)},{label:'Open beside',icon:PanelRight,run:()=>openNote(id,true,true)});
    actions.push({label:`Add ${next.ids.length===1?'note':next.ids.length+' notes'} to collection…`,icon:FolderPlus,separator:true,run:()=>organize(next.ids,'add')});
    if(collection)actions.push({label:'Move to collection…',icon:FolderInput,run:()=>organize(next.ids,'move')},{label:'Remove from this collection…',icon:FolderMinus,run:()=>organize(next.ids,'remove')});
    actions.push({label:'Select this page',icon:CheckSquare,separator:true,hint:'Ctrl+A',run:selection.all},{label:'Clear selection',run:selection.clear});
    showMenu(`${next.ids.length} selected ${next.ids.length===1?'note':'notes'}`,event,actions,source);
  },[busy,selection,order,collection,showMenu,organize,openNote]);
  const collectionMenu=(c:Collection,event:MouseEvent<HTMLElement>|KeyboardEvent<HTMLElement>)=>showMenu(c.name,event,[{label:'Open collection',icon:FolderOpen,run:()=>selectCollection(c.id)},{label:'New note here',icon:Plus,run:()=>createNote(c.id)},{label:'New child collection',icon:FolderPlus,run:()=>setForm({name:'',parentId:c.id})},{label:'Rename or move collection…',icon:Pencil,separator:true,run:()=>manage(c)}],event.currentTarget.closest('[data-collection-id]')?.querySelector<HTMLElement>('[data-collection-open]')??event.currentTarget);
  const backgroundMenu=(event:MouseEvent<HTMLElement>|KeyboardEvent<HTMLElement>)=>showMenu(activeCollection?.name??'Library',event,[{label:'New note',icon:Plus,run:()=>createNote()},{label:collection?'New child collection':'New collection',icon:FolderPlus,run:()=>setForm({name:'',parentId:collection})},...(activeCollection?[{label:'Rename or move collection…',icon:Pencil,run:()=>manage(activeCollection)}]:[]),{label:'Select this page',icon:CheckSquare,disabled:!order.length,separator:true,run:selection.all},{label:'Refresh',icon:RefreshCw,run:()=>void run(()=>refresh(false))}]);
  const pickSelection=selection.pick;
  const activate=useCallback((id:string,event:PickModifiers)=>{if(busy)return;pickSelection(id,event);if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey)openNote(id);},[busy,pickSelection,openNote]);
  const listKeys=(event:KeyboardEvent<HTMLElement>)=>{
    if(busy||event.defaultPrevented||event.nativeEvent.isComposing||event.altKey||!listShortcutTarget(event.target))return;
    const row=(event.target as Element).closest<HTMLElement>('[data-resource-id]');
    const id=row?.dataset.resourceId??selection.state.focus;
    if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();if(row&&id)resourceMenu(id,event);else backgroundMenu(event);return;}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();event.stopPropagation();selection.all();return;}
    if(event.ctrlKey||event.metaKey){if(!event.shiftKey)return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'||event.key==='Home'||event.key==='End'){
      event.preventDefault();event.stopPropagation();const index=order.indexOf(id??order[0]);const direction=event.key==='Home'?-order.length:event.key==='End'?order.length:event.key==='ArrowDown'?1:-1;
      selection.move(direction,event);requestAnimationFrame(()=>focusRow(order[Math.max(0,Math.min(order.length-1,index+direction))]));
    }else if(event.key===' '&&id){event.preventDefault();selection.pick(id,event,true);}
    else if(event.key==='Enter'&&id){event.preventDefault();openNote(id,false,true);}
  };
  return <div className="next-shell" data-ready={!!snapshot} data-total={page.total}>
    <aside className="next-sidebar">
      <div className="next-brand">Vaultor <span>Next · M3</span></div>
      <button onClick={()=>selectCollection(null)} aria-current={collection===null?'page':undefined}><Library size={17}/>Library</button>
      <div className="next-section"><span>Collections</span><button aria-label="New collection" disabled={busy} onClick={()=>setForm({name:'',parentId:collection})}><Plus size={16}/></button></div>
      <CollectionTree collections={snapshot?.collections??[]} selected={collection} select={selectCollection} menu={collectionMenu}/>
      {form&&<form className="next-collection-form" onSubmit={e=>{e.preventDefault();void run(async()=>{
        if(form.id)await command({kind:'updateCollection',id:form.id,name:form.name,parentId:form.parentId});else await command({kind:'createCollection',name:form.name,parentId:form.parentId});const id=form.id;setForm(null);await refresh(!id);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>(`[data-collection-open="${id}"]`)?.focus());
      });}}><input aria-label="Collection name" autoFocus value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><select aria-label="Parent collection" value={form.parentId??''} onChange={e=>setForm({...form,parentId:e.target.value||null})}><option value="">Top level</option>{snapshot?.collections.filter(c=>c.id!==form.id).map(c=><option key={c.id} value={c.id}>{paths.get(c.id)}</option>)}</select><div><button disabled={busy}>{form.id?'Save collection':'Create'}</button><button type="button" onClick={()=>setForm(null)}>Cancel</button></div></form>}
      {drafts.length>0&&<div className="next-recovery-list"><small>Recovery · {drafts.length}</small>{drafts.map(d=><button key={d.id} onClick={()=>void run(()=>inspectDraft(d.id),false)}>{d.title||'Untitled draft'}</button>)}</div>}
      <div className="next-sidebar-bottom">
        <button disabled={busy} onClick={()=>void run(async()=>{const path=await open({directory:true,multiple:false,title:'Choose an empty folder or Vaultor Next workspace'});if(!path)return;await command({kind:'open',path});for(const id of session.ids())session.forget(id);documents.clear();setPanes([]);currentCollection.current=null;setCollection(null);await refresh();})}><FolderOpen size={17}/>Open workspace</button>
        <button onClick={e=>{const origin=themeOriginAt(e.currentTarget);void run(async()=>{const value=snapshot?.settings.theme==='dark'?'light':'dark';await command({kind:'setting',key:'theme',value});theme.apply(value,origin);setSnapshot(s=>s&&({...s,settings:{...s.settings,theme:value}}));});}}><Moon size={17}/>Appearance</button>
        <button onClick={()=>setHelp(v=>!v)}><BookOpen size={17}/>Milestone Help</button><small title={snapshot?.path}>{snapshot?.path??'Workspace unavailable'}</small>
      </div>
    </aside>
    <main className="next-main"><header className="next-header" data-selecting={selection.state.ids.length>0}><div><h1 title={collection?paths.get(collection):undefined}>{activeCollection?.name??'Library'}</h1><small aria-live="polite">{selection.state.ids.length?`${selection.state.ids.length} selected · this page only`:notice||`${page.total} notes · newest created first`}</small></div><div className="next-header-actions"><div className="next-selection-actions" data-active={selection.state.ids.length>0} inert={!selection.state.ids.length}><div><button disabled={busy} onClick={e=>resourceMenu(selection.state.ids[0],e)}>Organize {selection.state.ids.length}</button><button onClick={selection.clear} aria-label="Clear resource selection"><X size={16}/><span>Clear</span></button></div></div>{activeCollection&&<button aria-label="Manage current collection" onClick={e=>collectionMenu(activeCollection,e)}><MoreHorizontal size={17}/></button>}<button disabled={busy||!snapshot} onClick={()=>createNote()}><Plus size={17}/><span className="next-create-label">New note</span></button></div></header>
      {(error||session.failed())&&<div role="alert" className="next-error">{error||'A save failed. Your draft is retained; review conflicts or retry.'}<button onClick={()=>void run(refresh)}>Retry saves</button>{panes.some(id=>session.status(id)==='conflict')&&<button onClick={()=>void run(()=>inspectDraft(panes.find(id=>session.status(id)==='conflict')!),false)}>Review versions</button>}</div>}
      {help?<section className="next-help"><button onClick={()=>setHelp(false)}>Close Help</button><ReactMarkdown>{helpText}</ReactMarkdown></section>:<div className={`next-workspace ${panes.length?'has-editor':''}`}>
        <div className="next-library-region"><nav ref={listElement} data-list-focus tabIndex={page.items.length?-1:0} className="next-library" aria-label="Notes" aria-busy={busy} onFocusCapture={()=>setListOwnsFocus(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setListOwnsFocus(false);}} onKeyDown={listKeys} onContextMenu={e=>{if(!(e.target as Element).closest('.next-resource,input,button')){e.preventDefault();backgroundMenu(e);}}} onScroll={e=>scrolls.current.set(scopeKey,e.currentTarget.scrollTop)}><div className="next-list-heading"><input ref={selectPage} data-select-resource="page" type="checkbox" aria-label="Select current resource page" checked={!!order.length&&selection.state.ids.length===order.length} disabled={busy||!order.length} onChange={()=>selection.state.ids.length===order.length?selection.clear():selection.all()}/><span>Notes</span><small>Ctrl+A · page</small></div><div role="grid" aria-label="Resource page" aria-multiselectable="true" aria-rowcount={page.items.length}>{page.items.map(item=><ResourceRow key={item.id} item={item} selected={selection.state.ids.includes(item.id)} opened={panes.includes(item.id)} focused={selection.state.focus===item.id} busy={busy} activate={activate} pick={selection.pick} focus={selection.focus} open={openNote} menu={resourceMenu}/>)}</div>{!page.items.length&&<p>Create a note to start writing.<button onClick={()=>createNote()}>New note</button></p>}</nav><div className="next-pagination"><button disabled={busy||trail.length<=1} onClick={()=>changePage(false)}>Previous</button><span>Page {trail.length}</span><button disabled={busy||!page.next} onClick={()=>changePage(true)}>Next</button></div></div>
        <div className="next-panes">{panes.map((id,index)=>{const note=session.get(id);if(!note)return null;return <section key={`${index}-${id}`} className="next-pane" aria-label={`Editor pane ${index+1}`}><div className="next-note-bar"><input aria-label={`Note title ${index+1}`} value={note.title} maxLength={240} disabled={busy||!!review||!!organizing} onChange={e=>{session.edit(id,{title:e.target.value});setPage(p=>({...p,items:p.items.map(item=>item.id===id?{...item,title:e.target.value}:item)}));}}/><span role="status">{session.status(id)}</span><button aria-label="Organize note" onClick={()=>organize([id])}><MoreHorizontal size={16}/></button><button aria-label="Close note" onClick={()=>void run(async()=>{setPanes(old=>old.filter((_,i)=>i!==index));requestAnimationFrame(()=>focusRow(id));})}><X size={16}/></button></div><div className="next-document"><NextEditor note={note} pane={index} documents={documents} locked={busy||!!review||!!organizing} focusWhenReady={focusNote===id&&index===panes.length-1} focusHandled={()=>setFocusNote(null)} leaveFocus={()=>focusRow(id)} changed={capture=>session.edit(id,{capture})}/></div></section>;})}</div>
      </div>}
    </main>{organizing&&<OrganizeDialog request={organizing} collections={snapshot?.collections??[]} busy={busy} error={error} close={()=>{setOrganizing(null);requestAnimationFrame(()=>focusRow(selection.state.focus??organizing.ids[0]));}} apply={membership}/>} {review&&<RecoveryReview {...review} busy={busy} close={()=>setReview(undefined)} resolve={resolve}/>} {menu&&menu.scope===selectionScope&&<ContextMenu request={menu} dismiss={()=>setMenu(null)}/>}</div>;
}
