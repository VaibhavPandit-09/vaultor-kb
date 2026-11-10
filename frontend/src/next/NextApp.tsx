import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction, type MouseEvent, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { FolderOpen, Plus, Library, Moon, X, BookOpen, MoreHorizontal, PanelRight, CheckSquare, FolderPlus, FolderInput, FolderMinus, Pencil, RefreshCw, Tags, Pin, Trash2 } from 'lucide-react';
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
import NextActivity from './NextActivity';
import TransferControls,{WorkspaceActions} from './TransferControls';
import {showTransfer,transfer} from './transfers';
import {org} from './client';
import {TagBrowser,TagPicker,LifecycleReview,type Tag} from './Organization';
import CollectionTree from './CollectionTree';
import { collectionPaths } from './collections';
import { ResourceRow } from './LibraryList';
import RecoveryReview from './RecoveryReview';
import SearchBar from './SearchBar';
import {defaultCriteria,isFiltered,type Criteria} from './searchState';
import {useStableEvent} from './useStableEvent';
import type {ListCursor,SearchCursor} from './client';
import LinkedSources from './LinkedSources';
import LinkedPane from './LinkedPane';
import LinkedReview from './LinkedReview';
import {LinkedEditingSession,linkedCommand} from './linked';
import type {LinkedSource,LinkedDocument,LinkedDraftSummary,LinkedInspection,LinkedRequest} from './linkedTypes';
import SidebarFrame from '../components/SidebarFrame';
import LibraryPopover from '../components/LibraryPopover';
import DesktopToolbar from './DesktopToolbar';
import CompanionNavigator,{type CompanionView} from './CompanionNavigator';
import {initialHistory,visit,step,reconcilePaneViews,type PaneView} from './desktopNavigation';
import type {CSSProperties} from 'react';
import {Search,FileText} from 'lucide-react';
import helpText from '../../../docs/help/next-foundation.md?raw';

export default function NextApp() {
  const [criteria,setCriteria]=useState<Criteria>(defaultCriteria),[queryBusy,setQueryBusy]=useState(false),[queryError,setQueryError]=useState(''),[searchFocused,setSearchFocused]=useState(false),[showLoading,setShowLoading]=useState(false);
  const criteriaRef=useRef(criteria),loadEpoch=useRef(0),searchInput=useRef<HTMLInputElement>(null),firstSearch=useRef(true);
  const browseContext=useRef<{collection:string|null;trail:(Cursor|null)[]}|null>(null),restoring=useRef<(Cursor|null)[]|null>(null);
  useLayoutEffect(()=>{criteriaRef.current=criteria;},[criteria]);
  const requestPage=useCallback((collection:string|null,cursor:Cursor|null=null,filter=criteriaRef.current):Promise<Page>=>isFiltered(filter)?command({kind:'search',options:{query:filter.query,content:filter.content,order:filter.order,view:filter.view??'library',tag:filter.tag??null,collection},cursor:cursor as SearchCursor|null}):command({kind:'list',collection,cursor:cursor as ListCursor|null}),[]);
  const [snapshot,setSnapshot]=useState<Snapshot>();
  const [tagging,setTagging]=useState<string[]>(),[orgVersion,setOrgVersion]=useState(0),[recents,setRecents]=useState<{id:string;title:string;source?:string;path?:string}[]>([]),[pinnedItems,setPinnedItems]=useState<Page['items']>([]),[lifecycle,setLifecycle]=useState<{title:string;description:string;apply:()=>Promise<void>}>();
  const [page,setPage]=useState<Page>({items:[],next:null,total:0});
  const [collection,setCollection]=useState<string|null>(null);
  const [trail,setTrail]=useState<(Cursor|null)[]>([null]);
  const [paneViews,setPaneViews]=useState<PaneView[]>([]);
  const panes=useMemo(()=>paneViews.map(view=>view.id),[paneViews]);
  const setPanes=useCallback((value:SetStateAction<string[]>)=>setPaneViews(old=>reconcilePaneViews(old,typeof value==='function'?value(old.map(view=>view.id)):value)),[]);
  const [sidebarOpen,setSidebarOpen]=useState(true),[companion,setCompanion]=useState<CompanionView>('shortcuts'),[activePane,setActivePane]=useState(0),[paneRatio,setPaneRatio]=useState(50);
  const [history,setHistory]=useState(initialHistory),historyMove=useRef(false),previousWorkspace=useRef(false);
  const [openItems,setOpenItems]=useState<string[]>([]);
  const [noteMetadata,setNoteMetadata]=useState(()=>new Map<string,{title:string;source?:string;path?:string}>());
  const mainElement=useRef<HTMLElement>(null),headerElement=useRef<HTMLElement>(null),shown=useRef(false);
  useLayoutEffect(()=>{if(!snapshot||shown.current)return;const frame=requestAnimationFrame(()=>{shown.current=true;void getCurrentWindow().show?.().catch(e=>setError(String(e)));});return()=>cancelAnimationFrame(frame);},[snapshot]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[help,setHelp]=useState(false);
  const [form,setForm]=useState<{id?:string;name:string;parentId:string|null}|null>(null);
  const [organizing,setOrganizing]=useState<OrganizationRequest|null>(null);
  const [menu,setMenu]=useState<ContextRequest|null>(null),[notice,setNotice]=useState('');
  const [listOwnsFocus,setListOwnsFocus]=useState(false),[focusNote,setFocusNote]=useState<string|null>(null);
  const [drafts,setDrafts]=useState<DraftSummary[]>([]);
  const [review,setReview]=useState<{draft:Draft;saved:Note}>();
  const [,render]=useState(0);
  const [sources,setSources]=useState<LinkedSource[]>([]),[externalDrafts,setExternalDrafts]=useState<LinkedDraftSummary[]>([]);
  const [linkedReview,setLinkedReview]=useState<{doc:LinkedDocument;inspection:LinkedInspection;recovering:boolean;beside:boolean}>();
  const linkedRecoveryRefresh=useRef<()=>Promise<void>>(async()=>{});
  const [external]=useState(()=>new LinkedEditingSession(persisted=>{render(v=>v+1);if(persisted)void linkedRecoveryRefresh.current().catch(e=>setError(String(e)));}));
  useEffect(()=>{linkedRecoveryRefresh.current=async()=>{setExternalDrafts(await linkedCommand<LinkedDraftSummary[]>({op:'drafts'}));};},[]);

  const [documents]=useState(()=>new SharedNoteDocuments());
  const [theme]=useState(()=>createThemeTransitionController());
  const reviewHandler=useRef<(id:string)=>Promise<void>>(async()=>{});
  const [session]=useState(()=>new EditingSession(id=>{render(v=>v+1);if(id)setDrafts(old=>old.filter(d=>d.id!==id));},id=>void reviewHandler.current(id).catch(e=>setError(String(e)))));
  const currentCollection=useRef<string|null>(null),operating=useRef(false);
  useLayoutEffect(()=>{
    setNoteMetadata(old=>{const next=new Map(old);for(const id of panes){const linked=external.get(id),note=session.get(id);if(linked||note){next.delete(id);next.set(id,linked?{title:linked.title,source:linked.sourceId,path:linked.path}:{title:note!.title});}}while(next.size>64)next.delete(next.keys().next().value!);return next;});
    if(panes.length)setOpenItems(old=>[...new Set([...panes,...old])].slice(0,12));
    setActivePane(index=>Math.min(index,Math.max(0,panes.length-1)));
    if(historyMove.current)historyMove.current=false;else setHistory(old=>visit(old,panes.length?{kind:'notes',ids:[...panes]}:{kind:'library'}));
    const changedWorkspace=previousWorkspace.current!==Boolean(panes.length);previousWorkspace.current=Boolean(panes.length);const view=mainElement.current, duration=motionProfile().page;if(!changedWorkspace||!view||!duration||!view.animate)return;
    const animation=view.animate([{opacity:.65,transform:panes.length?'translateX(12px)':'translateX(-12px)'},{opacity:1,transform:'none'}],{duration,easing:'cubic-bezier(.2,.7,.2,1)'});return()=>animation.cancel();
  },[panes,session,external]);
  const listElement=useRef<HTMLElement>(null),scrolls=useRef(new Map<string,number>());
  const scopeKey=JSON.stringify([snapshot?.path,collection,trail.length,criteria]);
  const selectionScope=JSON.stringify([snapshot?.path,collection,trail.at(-1),criteria]);
  const order=useMemo(()=>page.items.map(item=>item.id),[page.items]);
  const selection=usePageSelection(selectionScope,order);
  const cursorRef=useRef<Cursor|null>(null);
  useLayoutEffect(()=>{cursorRef.current=trail.at(-1)??null;},[trail]);
  const selectPage=useRef<HTMLInputElement>(null);
  useLayoutEffect(()=>{if(selectPage.current)selectPage.current.indeterminate=selection.state.ids.length>0&&selection.state.ids.length<order.length;},[selection.state.ids.length,order.length]);
  useEscapeLayer({active:!panes.length&&listOwnsFocus&&selection.state.ids.length>0,priority:150,close:selection.clear,restoreFocusOnEscape:false});
  const focusRow=useCallback((id?:string)=>{
    const rows=[...document.querySelectorAll<HTMLButtonElement>('[data-row-open]')];
    const target=rows.find(row=>row.dataset.rowOpen===id)??rows[0]??document.querySelector<HTMLElement>('[data-list-focus]');target?.focus({preventScroll:true});
    target?.scrollIntoView?.({block:'nearest'});
  },[]);
  const focusLinked=useCallback((source:string,path:string)=>{const buttons=[...document.querySelectorAll<HTMLButtonElement>('[data-linked-navigation]')];(buttons.find(button=>button.dataset.linkedSource===source&&button.dataset.linkedPath===path)??buttons.find(button=>button.dataset.linkedSource===source)??document.querySelector<HTMLButtonElement>('[aria-label="Link external folder"]'))?.focus({preventScroll:true});},[]);
  const paths=useMemo(()=>collectionPaths(snapshot?.collections??[]),[snapshot?.collections]);
  useLayoutEffect(()=>{if(listElement.current)listElement.current.scrollTop=scrolls.current.get(scopeKey)??0;},[page,scopeKey,panes.length]);
  const refresh=useCallback(async(reset=true)=>{
    const epoch=++loadEpoch.current;setQueryBusy(false);
    const [state,list,recovery,linkedSources,linkedRecovery]=await Promise.all([command<Snapshot>({kind:'snapshot'}),requestPage(currentCollection.current,reset?null:cursorRef.current),command<DraftSummary[]>({kind:'drafts'}),linkedCommand<LinkedSource[]>({op:'sources'}),linkedCommand<LinkedDraftSummary[]>({op:'drafts'})]);
    setSnapshot(state);setOrgVersion(v=>v+1);setRecents(await org({op:'recents'}));setPinnedItems((await command<Page>({kind:'search',options:{query:'',content:false,collection:null,order:'created',view:'pinned'},limit:6})).items);setDrafts(recovery);setSources(linkedSources);setExternalDrafts(linkedRecovery);theme.apply(state.settings.theme??'light');
    if(epoch!==loadEpoch.current)return;
    setMenu(null);setPage(list);if(reset)setTrail([null]);
  },[theme,requestPage]);
  const run=useCallback(async(action:()=>Promise<void>,flush=true)=>{
    if(operating.current)return;operating.current=true;setBusy(true);setError('');
    try{if(flush){await session.flushAll();await external.protectAll();session.releaseViews();external.releaseViews();setNoteMetadata(old=>{const changed=[...session.ids()].map(id=>session.get(id)!).filter(note=>old.get(note.id)?.title!==note.title);if(!changed.length)return old;const next=new Map(old);for(const note of changed)next.set(note.id,{...next.get(note.id),title:note.title});while(next.size>64)next.delete(next.keys().next().value!);return next;});}await action();}catch(e){setError(String(e));}finally{operating.current=false;setBusy(false);}
  },[session,external]);
  const toggleHelp=useStableEvent(()=>void run(async()=>{setHelp(value=>!value);if(help){if(panes.length)setFocusNote(panes[activePane]);else requestAnimationFrame(()=>focusRow());}}));
  useEscapeLayer({active:help,priority:200,close:toggleHelp,restoreFocusOnEscape:false});
  const inspectDraft=useCallback(async(id:string)=>{
    if(session.dirty(id))await session.protect(id);
    const [draft,saved]=await Promise.all([command<Draft>({kind:'readDraft',id}),command<Note>({kind:'read',id})]);
    setReview({draft,saved});setDrafts(await command({kind:'drafts'}));
  },[session]);
  useEffect(()=>{reviewHandler.current=inspectDraft;},[inspectDraft]);
  useEffect(()=>{void refresh().catch(e=>{setError(String(e));shown.current=true;void getCurrentWindow().show?.().catch(()=>{});});return()=>theme.dispose();},[refresh,theme]);
  useEffect(()=>{session.releaseInactive(panes);external.releaseInactive(panes);},[panes,session,external]);
  useEffect(()=>{
    let disposed=false,remove:(()=>void)|undefined;
    void getCurrentWindow().onCloseRequested(event=>{event.preventDefault();void run(async()=>{await getCurrentWindow().destroy();});}).then(unlisten=>{if(disposed)unlisten();else remove=unlisten;});
    const keyboard=(event:globalThis.KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();const pane=event.target instanceof Element?event.target.closest<HTMLElement>('[data-note-id]')?.dataset.noteId:undefined;void run(async()=>{if(pane?.startsWith('linked:'))await external.save(pane);});}if(event.key==='F1'){event.preventDefault();toggleHelp();}};
    window.addEventListener('keydown',keyboard);return()=>{disposed=true;remove?.();window.removeEventListener('keydown',keyboard);};
  },[run,external,toggleHelp]);
  const selectCollection=useCallback((id:string|null)=>void run(async()=>{
    setHelp(false);setPanes([]);if(id)setCompanion('collections');const epoch=++loadEpoch.current;setQueryBusy(false);browseContext.current=null;currentCollection.current=id;setCollection(id);setQueryError('');let list:Page;try{list=await requestPage(id);}catch(e){setPage({items:[],next:null,total:0});setTrail([null]);if(isFiltered(criteriaRef.current)){setQueryError(String(e));return;}throw e;}if(epoch!==loadEpoch.current)return;setMenu(null);setNotice('');setPage(list);setTrail([null]);setOrganizing(null);
  }),[run,requestPage,setPanes]);
  const openNote=useCallback((id:string,beside=false,keyboard=false)=>void run(async()=>{setHelp(false);
    if(!session.get(id)){
      const recovery=await command<DraftSummary[]>({kind:'drafts'});
      if(recovery.some(d=>d.id===id)){await inspectDraft(id);return;}
      session.adopt(await command<Note>({kind:'read',id}));
    }
    setRecents(await org({op:'recent',id,title:session.get(id)!.title,source:null,path:null}));
    setPanes(old=>beside&&old.length?[old[0],id]:[id]);
    setFocusNote(keyboard?id:null);
  }),[run,session,inspectDraft,setPanes]);
  const acceptLinked=(doc:LinkedDocument,beside=false)=>{setHelp(false);void org<typeof recents>({op:'recent',id:doc.id,title:doc.title,source:doc.sourceId,path:doc.path}).then(setRecents).catch(e=>setError(String(e)));
    if(!external.get(doc.id)||!external.dirty(doc.id)){if(doc.base.length<=256*1024&&doc.content.content?.length)documents.acceptSaved(doc.id,doc.content);external.adopt(doc);}
    setPanes(old=>beside&&old.length?[old[0],doc.id]:[doc.id]);setFocusNote(doc.id);
  };
  const openLinked=(request:LinkedRequest,beside=false)=>void run(async()=>{
    const doc=await linkedCommand<LinkedDocument>(request);
    if(doc.draft&&(!external.get(doc.id)||!external.dirty(doc.id))){setLinkedReview({doc,inspection:doc.current??{current:{}},recovering:true,beside});return;}
    acceptLinked(doc,beside);
  });
  const reviewLinked=(id:string)=>void run(async()=>{
    await external.protect(id);const doc=external.get(id)!;const content=external.snapshot(id)??doc.content;
    const inspected=await linkedCommand<LinkedInspection>({op:'inspect',id:doc.documentId});
    setLinkedReview({doc:{...doc,content,draft:external.dirty(id)?{token:'protected',sequence:1}:null},inspection:inspected,recovering:false,beside:false});
  });
  const discardLinked=()=>void run(async()=>{
    if(!linkedReview)return;const {doc}=linkedReview;
    if(!external.get(doc.id))external.adopt(doc);
    if(external.dirty(doc.id))await external.discard(doc.id);else external.forget(doc.id);const latest=await linkedCommand<LinkedDocument>({op:'open',source:doc.sourceId,path:doc.path});
    if(latest.editable)documents.acceptSaved(doc.id,latest.content);external.adopt(latest);setPanes(old=>old.map(id=>id===doc.id?latest.id:id));if(!panes.includes(doc.id))setPanes([latest.id]);setLinkedReview(undefined);await linkedRecoveryRefresh.current();
  });
  const resolveLinked=()=>void run(async()=>{
    if(!linkedReview)return;const result=await linkedCommand<LinkedDocument>({op:'resolve',id:linkedReview.doc.documentId});
    documents.acceptSaved(result.id,result.content);external.adopt(result);setLinkedReview(undefined);setPanes(old=>old.includes(result.id)?old:[result.id]);await linkedRecoveryRefresh.current();
  });
  const refreshSources=useStableEvent(async()=>{setSources(await linkedCommand<LinkedSource[]>({op:'sources'}));await linkedRecoveryRefresh.current();});
  const returnToLibrary=()=>void run(async()=>{setHelp(false);const id=panes[activePane];setPanes([]);requestAnimationFrame(()=>focusRow(id));});
  const closePane=(index:number)=>void run(async()=>{const id=panes[index],next=panes.filter((_,position)=>position!==index);setPaneViews(old=>old.filter((_,position)=>position!==index));if(next.length)setFocusNote(next[Math.min(index,next.length-1)]);else{const linked=external.get(id);if(linked){setCompanion('sources');setSidebarOpen(true);requestAnimationFrame(()=>focusLinked(linked.sourceId,linked.path));}else requestAnimationFrame(()=>focusRow(id));}});
  const openRemembered=(id:string,beside=false)=>{const meta=noteMetadata.get(id);if(meta?.source)openLinked({op:'open',source:meta.source,path:meta.path!},beside);else openNote(id,beside,true);};
  const moveHistory=(direction:number)=>void run(async()=>{const next=step(history,direction);if(next.index===history.index)return;const route=next.entries[next.index];if(route.kind==='notes')for(const id of route.ids){if(session.get(id)||external.get(id))continue;const meta=noteMetadata.get(id);if(meta?.source){const doc=await linkedCommand<LinkedDocument>({op:'open',source:meta.source,path:meta.path!});if(doc.id!==id)throw Error('This source was replaced; reopen it from Linked sources.');external.adopt(doc);}else session.adopt(await command<Note>({kind:'read',id}));}setHelp(false);historyMove.current=true;setHistory(next);setPanes(route.kind==='notes'?[...route.ids]:[]);setFocusNote(route.kind==='notes'?route.ids.at(-1)!:null);if(route.kind==='library')requestAnimationFrame(()=>focusRow(panes[activePane]));});
  const historyKey=useStableEvent((direction:number)=>moveHistory(direction));
  useEffect(()=>{const listener=(event:globalThis.KeyboardEvent)=>{if(document.querySelector('[role=dialog],[role=alertdialog],[role=menu]'))return;if(!event.defaultPrevented&&event.altKey&&!event.ctrlKey&&!event.metaKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();historyKey(event.key==='ArrowLeft'?-1:1);}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[historyKey]);
  const focusSearch=()=>void run(async()=>{setHelp(false);setPanes([]);requestAnimationFrame(()=>searchInput.current?.focus());});
  const switchWorkspace=async(path:string,create=false)=>{setHelp(false);await command({kind:create?'new':'open',path});browseContext.current=null;restoring.current=null;criteriaRef.current=defaultCriteria;setCriteria(defaultCriteria);for(const id of session.ids())session.forget(id);for(const id of external.ids())external.forget(id);documents.clear();historyMove.current=true;setHistory(initialHistory);setOpenItems([]);setNoteMetadata(new Map());setPanes([]);currentCollection.current=null;setCollection(null);await refresh();};
  const setAppearance=(value:'light'|'dark'|'oled',element:HTMLElement)=>void run(async()=>{await command({kind:'setting',key:'theme',value});theme.apply(value,themeOriginAt(element));setSnapshot(state=>state&&({...state,settings:{...state.settings,theme:value}}));});
  const openExternalPath=useStableEvent((source:string,path:string,beside:boolean=false)=>openLinked({op:'open',source,path},beside));
  const sourceMenu=useStableEvent((label:string,element:HTMLElement,actions:ContextAction[])=>{const rect=element.getBoundingClientRect();setMenu({label,source:element,scope:selectionScope,x:rect.left,y:rect.bottom,actions});});
  const organize=useCallback((ids:string[],mode:OrganizationRequest['mode']='add')=>void run(async()=>{
    setOrganizing({ids:[...ids],source:currentCollection.current,mode});
  }),[run]);
  const changePage=(forward:boolean)=>void run(async()=>{
    const nextTrail=forward?[...trail,page.next]:trail.slice(0,-1);if(!nextTrail.length)return;
    const epoch=++loadEpoch.current;setQueryBusy(false);try{const list=await requestPage(collection,nextTrail.at(-1)??null);if(epoch!==loadEpoch.current)return;setMenu(null);setNotice('');setPage(list);setTrail(nextTrail);requestAnimationFrame(()=>focusRow());}catch(e){if(isFiltered(criteria)){setQueryError(String(e));return;}throw e;}
  });
  const changeCriteria=(next:Criteria)=>{
    if(!isFiltered(criteria)&&isFiltered(next))browseContext.current={collection,trail:[...trail]};
    if(isFiltered(criteria)&&!isFiltered(next)){restoring.current=browseContext.current?.collection===collection?browseContext.current.trail:null;browseContext.current=null;}
    ++loadEpoch.current;setQueryBusy(true);setQueryError('');setMenu(null);setCriteria(next);
  };
  useEffect(()=>{
    if(firstSearch.current){firstSearch.current=false;return;}
    let cancelled=false;const epoch=++loadEpoch.current,target=restoring.current??[null];restoring.current=null;
    const timer=setTimeout(()=>{void requestPage(currentCollection.current,target.at(-1)??null,criteria).then(result=>{if(cancelled||epoch!==loadEpoch.current)return;setPage(result);setTrail(target);setQueryBusy(false);setQueryError('');}).catch(e=>{if(!cancelled&&epoch===loadEpoch.current){setQueryBusy(false);setQueryError(String(e));setPage({items:[],total:0,next:null});setTrail([null]);}});},criteria.query?220:0);
    return()=>{clearTimeout(timer);cancelled=true;};
  },[criteria,requestPage]);
  useEffect(()=>{if(!queryBusy){setShowLoading(false);return;}const timer=setTimeout(()=>setShowLoading(true),180);return()=>clearTimeout(timer);},[queryBusy]);
  useEscapeLayer({active:!panes.length&&(searchFocused||(listOwnsFocus&&isFiltered(criteria))),priority:125,restoreFocusOnEscape:false,close:()=>{if(criteria.query.length||isFiltered(criteria))changeCriteria(defaultCriteria);else focusRow();}});
  const resolve=(choice:'restore'|'discard'|'park')=>void run(async()=>{
    await external.protectAll();
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
  const metadata=(request:Record<string,unknown>)=>void run(async()=>{await org(request);setOrgVersion(v=>v+1);await refresh();setNotice('Organization updated');});
  const forgetResources=(ids:string[])=>{const removed=new Set(ids);setPanes(old=>old.filter(id=>!removed.has(id)));setOpenItems(old=>old.filter(id=>!removed.has(id)));for(const id of ids){session.forget(id);}setHistory(initialHistory);};
  const lifecycleChange=(ids:string[]|null,action:'trash'|'restore'|'purge')=>{void run(async()=>{const count=ids?.length??(await command<Page>({kind:'search',options:{query:'',content:false,collection:null,order:'created',view:'trash'}})).total;setLifecycle({title:action==='purge'?'Permanently delete resources':action==='restore'?'Restore resources':'Move resources to Trash',description:action==='purge'?`Delete ${count} resources${ids?'':' across all Trash pages'}. This cannot be undone. Protected drafts are kept; Activity reports failures.`:action==='trash'?`Move ${count} managed resources to recoverable Trash. External linked files stay untouched.`:'Restore identity, content, tags, pins and surviving memberships. Deleted collections are not recreated.',apply:async()=>{await session.flushAll();await external.protectAll();if(action==='purge'){await transfer({op:'purge',ids});setNotice('Permanent deletion queued · see Activity');}else{await org({op:'trash',ids,restore:action==='restore'});if(action==='trash')forgetResources(ids!);selection.clear();await refresh();}}});});};
  const deleteCollection=(c:Collection,trash:boolean)=>void run(async()=>{const plan=await org<{collections:string[];exclusive:string[];generation:number}>({op:'collectionPlan',id:c.id});setLifecycle({title:'Delete collection hierarchy',description:`Remove ${plan.collections.length} collections. ${trash?`Trash ${plan.exclusive.length} exclusive managed resources; shared resources stay active.`:'Keep every resource accessible in Library.'} Collection hierarchy restoration is not supported.`,apply:async()=>{await session.flushAll();await org({op:'deleteCollection',id:c.id,plan:JSON.stringify(plan),trash});if(trash)forgetResources(plan.exclusive);currentCollection.current=null;setCollection(null);await refresh();}});});
  const browseOrganization=(view:string,tag?:Tag)=>void run(async()=>{setHelp(false);setPanes([]);currentCollection.current=null;setCollection(null);changeCriteria({...defaultCriteria,view,tag:tag?.id,tagName:tag?.name});requestAnimationFrame(()=>focusRow());});
  const activeCollection=snapshot?.collections.find(c=>c.id===collection);
  const manage=(c:Collection)=>{setCompanion('collections');setSidebarOpen(true);setForm({id:c.id,name:c.name,parentId:c.parentId});};
  const createNote=(target:string|null=collection)=>void run(async()=>{setHelp(false);const note=await command<Note>({kind:'createNote',title:'Untitled note',collection:target});currentCollection.current=target;setCollection(target);selection.clear();session.adopt(note);setPanes([note.id]);setFocusNote(note.id);await refresh();});
  const showMenu=useCallback((label:string,event:MouseEvent<HTMLElement>|KeyboardEvent<HTMLElement>,actions:ContextAction[],source?:HTMLElement)=>{
    const target=source??event.currentTarget;const rect=target.getBoundingClientRect();
    setMenu({label,scope:selectionScope,source:target,x:'clientX'in event&&event.clientX?event.clientX:rect.left,y:'clientY'in event&&event.clientY?event.clientY:rect.bottom,actions});
  },[selectionScope]);
  const resourceMenu=useStableEvent((id:string,event:MouseEvent<HTMLElement>|KeyboardEvent<HTMLElement>)=>{
    if(busy||queryBusy)return;
    const next=contextSelection(selection.state,order,id);selection.context(id);
    const source=[...document.querySelectorAll<HTMLButtonElement>('[data-row-open]')].find(row=>row.dataset.rowOpen===id);
    const actions:ContextAction[]=[];
    if(criteria.view==='trash'){showMenu(`${next.ids.length} trashed resources`,event,[{label:'Restore resources',run:()=>lifecycleChange(next.ids,'restore')},{label:'Permanently delete…',run:()=>lifecycleChange(next.ids,'purge')},{label:'Select this page',run:selection.all}],source);return;}
    if(next.ids.length===1)actions.push({label:'Open note',icon:BookOpen,run:()=>openNote(id,false,true)},{label:'Open beside',icon:PanelRight,run:()=>openNote(id,true,true)});
    actions.push({label:'Assign tags…',run:()=>setTagging([...next.ids])},{label:'Pin resources',run:()=>metadata({op:'pin',ids:next.ids,value:true})},{label:'Unpin resources',run:()=>metadata({op:'pin',ids:next.ids,value:false})},{label:'Move to Trash…',run:()=>lifecycleChange(next.ids,'trash')});
    actions.push({label:'Export selected resources…',run:()=>showTransfer({op:'export',ids:next.ids})});
    actions.push({label:`Add ${next.ids.length===1?'note':next.ids.length+' notes'} to collection…`,icon:FolderPlus,separator:true,run:()=>organize(next.ids,'add')});
    if(collection)actions.push({label:'Move to collection…',icon:FolderInput,run:()=>organize(next.ids,'move')},{label:'Remove from this collection…',icon:FolderMinus,run:()=>organize(next.ids,'remove')});
    actions.push({label:'Select this page',icon:CheckSquare,separator:true,hint:'Ctrl+A',run:selection.all},{label:'Clear selection',run:selection.clear});
    showMenu(`${next.ids.length} selected ${next.ids.length===1?'note':'notes'}`,event,actions,source);
  });
  const collectionMenu=(c:Collection,event:MouseEvent<HTMLElement>|KeyboardEvent<HTMLElement>)=>showMenu(c.name,event,[{label:'Open collection',icon:FolderOpen,run:()=>selectCollection(c.id)},{label:'New note here',icon:Plus,run:()=>createNote(c.id)},{label:'New child collection',icon:FolderPlus,run:()=>setForm({name:'',parentId:c.id})},{label:'Rename or move collection…',icon:Pencil,separator:true,run:()=>manage(c)},{label:'Delete hierarchy…',run:()=>deleteCollection(c,false)},{label:'Delete hierarchy and Trash exclusive resources…',run:()=>deleteCollection(c,true)}],event.currentTarget.closest('[data-collection-id]')?.querySelector<HTMLElement>('[data-collection-open]')??event.currentTarget);
  const backgroundMenu=(event:MouseEvent<HTMLElement>|KeyboardEvent<HTMLElement>)=>{if(queryBusy)return;showMenu(activeCollection?.name??criteria.tagName??(criteria.view==='trash'?'Trash':criteria.view==='pinned'?'Pinned':criteria.view==='recent'?'Recents':'Library'),event,[{label:'New note',icon:Plus,run:()=>createNote()},{label:collection?'New child collection':'New collection',icon:FolderPlus,run:()=>setForm({name:'',parentId:collection})},...(activeCollection?[{label:'Rename or move collection…',icon:Pencil,run:()=>manage(activeCollection)}]:[]),{label:'Select this page',icon:CheckSquare,disabled:!order.length,separator:true,run:selection.all},{label:'Refresh',icon:RefreshCw,run:()=>void run(()=>refresh(isFiltered(criteria)))}]);};
  const pickSelection=selection.pick;
  const activate=useStableEvent((id:string,event:PickModifiers)=>{if(busy||queryBusy)return;pickSelection(id,event,criteria.view==='trash');if(criteria.view==='trash')return;if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey)openNote(id);});
  const rowPick=useStableEvent((id:string,event:PickModifiers,checkbox:boolean=false)=>{if(!busy&&!queryBusy)selection.pick(id,event,checkbox);});
  const rowOpen=useStableEvent((id:string,beside:boolean=false)=>{if(!busy&&!queryBusy&&criteria.view!=='trash')openNote(id,beside);});
  const listKeys=(event:KeyboardEvent<HTMLElement>)=>{
    if(busy||queryBusy||event.defaultPrevented||event.nativeEvent.isComposing||event.altKey||!listShortcutTarget(event.target))return;
    const row=(event.target as Element).closest<HTMLElement>('[data-resource-id]');
    const id=row?.dataset.resourceId??selection.state.focus;
    if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();if(row&&id)resourceMenu(id,event);else backgroundMenu(event);return;}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();event.stopPropagation();selection.all();return;}
    if(event.ctrlKey||event.metaKey){if(!event.shiftKey)return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'||event.key==='Home'||event.key==='End'){
      event.preventDefault();event.stopPropagation();const index=order.indexOf(id??order[0]);const direction=event.key==='Home'?-order.length:event.key==='End'?order.length:event.key==='ArrowDown'?1:-1;
      selection.move(direction,event);requestAnimationFrame(()=>focusRow(order[Math.max(0,Math.min(order.length-1,index+direction))]));
    }else if(event.key===' '&&id){event.preventDefault();selection.pick(id,event,true);}
    else if(event.key==='Enter'&&id&&criteria.view!=='trash'){event.preventDefault();openNote(id,false,true);}
  };
  return <div className="next-shell" data-notes={panes.length>0} data-ready={!!snapshot} data-total={page.total}>
    <DesktopToolbar sidebar={sidebarOpen} toggle={()=>setSidebarOpen(v=>!v)} back={()=>moveHistory(-1)} forward={()=>moveHistory(1)} canBack={history.index>0} canForward={history.index<history.entries.length-1} title={panes.length?(external.get(panes[activePane])?.title??session.get(panes[activePane])?.title??'Note workspace'):(snapshot?.path.split(/[\\/]/).filter(Boolean).at(-1)??'Vaultor')} search={focusSearch} split={panes.length===1?()=>openRemembered(panes[0],true):undefined}>{panes.length>0&&<button aria-label="Return to Library" onClick={returnToLibrary}><Library size={16}/><span>Library</span></button>}<NextActivity/><LibraryPopover label="Appearance" trigger={<Moon size={16}/>} className="next-appearance-trigger">{close=><div className="next-appearance-options"><h2>Appearance</h2>{(['light','dark','oled'] as const).map(value=><button key={value} aria-pressed={(snapshot?.settings.theme??'light')===value} onClick={event=>{setAppearance(value,event.currentTarget);close();}}>{value==='oled'?'OLED black':value[0].toUpperCase()+value.slice(1)}</button>)}</div>}</LibraryPopover></DesktopToolbar>
    <div className="next-desktop-body"><SidebarFrame externalToggle floating={false} open={sidebarOpen} focusMode={false} pinned onReveal={()=>setSidebarOpen(true)} onHide={()=>setSidebarOpen(false)} onToggle={()=>setSidebarOpen(v=>!v)}><div className="next-sidebar">
      <div className="next-brand">Vaultor <span>Next · experimental</span></div><div className="sidebar-primary"><button onClick={focusSearch}><Search size={16}/>Search<span className="next-key-hint">Library</span></button>
      <button onClick={()=>{changeCriteria(defaultCriteria);selectCollection(null);}} aria-current={collection===null&&!criteria.tag&&(!criteria.view||criteria.view==='library')?'page':undefined}><Library size={17}/>Library</button><button onClick={()=>{setSidebarOpen(true);setCompanion('collections');}}><FolderOpen size={16}/>Collections</button><button onClick={()=>{setSidebarOpen(true);setCompanion('sources');}}><FolderInput size={16}/>Linked sources</button><button onClick={()=>{setCompanion('tags');setSidebarOpen(true);}} aria-current={criteria.tag?'page':undefined}><Tags size={16}/>Tags</button><button onClick={()=>browseOrganization('pinned')} aria-current={criteria.view==='pinned'?'page':undefined}><Pin size={16}/>Pinned</button><button onClick={()=>browseOrganization('trash')} aria-current={criteria.view==='trash'?'page':undefined}><Trash2 size={16}/>Trash</button><div className="next-primary-actions"><button className="next-sidebar-create" disabled={busy} onClick={()=>createNote()}><Plus size={16}/>New note</button><TransferControls collection={collection} collections={snapshot?.collections??[]} barrier={run} switchWorkspace={switchWorkspace} committed={()=>void refresh(false).catch(e=>setError(String(e)))}/></div>
      </div><CompanionNavigator view={companion} choose={setCompanion}><section id="next-category-panel-collections" role="tabpanel" aria-labelledby="next-category-collections" hidden={companion!=='collections'} className="next-sidebar-navigation"><div className="next-section"><span>Collections</span><button aria-label="New collection" disabled={busy} onClick={()=>setForm({name:'',parentId:collection})}><Plus size={16}/></button></div>
      <CollectionTree collections={snapshot?.collections??[]} selected={collection} select={selectCollection} menu={collectionMenu}/>
      {form&&<form className="next-collection-form" onSubmit={e=>{e.preventDefault();void run(async()=>{
        if(form.id)await command({kind:'updateCollection',id:form.id,name:form.name,parentId:form.parentId});else await command({kind:'createCollection',name:form.name,parentId:form.parentId});const id=form.id;setForm(null);await refresh(!id);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>(`[data-collection-open="${id}"]`)?.focus());
      });}}><input aria-label="Collection name" autoFocus value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><select aria-label="Parent collection" value={form.parentId??''} onChange={e=>setForm({...form,parentId:e.target.value||null})}><option value="">Top level</option>{snapshot?.collections.filter(c=>c.id!==form.id).map(c=><option key={c.id} value={c.id}>{paths.get(c.id)}</option>)}</select><div><button disabled={busy}>{form.id?'Save collection':'Create'}</button><button type="button" onClick={()=>setForm(null)}>Cancel</button></div></form>}
</section>
<section id="next-category-panel-tags" role="tabpanel" hidden={companion!=='tags'} className="next-sidebar-navigation">{companion==='tags'&&<TagBrowser choose={tag=>browseOrganization('library',tag)} revision={orgVersion} changed={updated=>{if(updated&&criteriaRef.current.tag===updated.id)changeCriteria({...criteriaRef.current,tag:updated.name?updated.id:undefined,tagName:updated.name||undefined});setOrgVersion(v=>v+1);void refresh();}}/>}</section><section id="next-category-panel-pins" role="tabpanel" hidden={companion!=='pins'} className="next-sidebar-navigation"><button onClick={()=>browseOrganization('pinned')}>Browse all pinned resources</button>{pinnedItems.map(item=><button key={item.id} onClick={()=>openNote(item.id)} title={item.title}>{item.title}</button>)}{!pinnedItems.length&&<p className="next-linked-hint">Pin a resource from its actions menu.</p>}</section><section id="next-category-panel-recent" role="tabpanel" hidden={companion!=='recent'} className="next-sidebar-navigation"><button onClick={()=>browseOrganization('recent')}>Browse recent managed resources</button>{recents.map(r=><button key={r.id} onClick={()=>r.source?openLinked({op:'open',source:r.source,path:r.path!}):openNote(r.id)} title={r.path??r.title}>{r.title}</button>)}</section><section id="next-category-panel-sources" role="tabpanel" aria-labelledby="next-category-sources" hidden={companion!=='sources'} className="next-sidebar-navigation">      <LinkedSources sources={sources} active={external.get(panes.at(-1)??'')?external.get(panes.at(-1)!)!.sourceId+':'+external.get(panes.at(-1)!)!.path:''} changed={refreshSources} openDocument={openExternalPath} menu={sourceMenu}/>
</section><section id="next-category-panel-sessions" role="tabpanel" aria-labelledby="next-category-sessions" hidden={companion!=='sessions'} className="next-sidebar-navigation next-session-list">{openItems.length?openItems.map(id=><div key={id} className="navigator-session"><button className="sidebar-nav" aria-current={panes.includes(id)?'page':undefined} onClick={()=>openRemembered(id)}><FileText size={15}/><span>{external.get(id)?.title??session.get(id)?.title??noteMetadata.get(id)?.title}</span></button><button aria-label="Close open note" title="Close this note" onClick={()=>void run(async()=>{setPanes(old=>old.filter(item=>item!==id));setOpenItems(old=>old.filter(item=>item!==id));})}><X size={12}/></button></div>):<p className="next-linked-hint">Open notes from Library or Linked sources to resume them here.</p>}</section><section id="next-category-panel-shortcuts" role="tabpanel" aria-labelledby="next-category-shortcuts" hidden={companion!=='shortcuts'} className="next-sidebar-navigation"><button onClick={()=>createNote()}><Plus size={15}/>New note</button><button onClick={()=>{setCompanion('collections');setForm({name:'',parentId:collection});}}><FolderPlus size={15}/>New collection</button><button onClick={()=>setCompanion('sources')}><FolderOpen size={15}/>Browse linked folders</button><button onClick={()=>{setCompanion('pins');browseOrganization('pinned');}}>Pinned resources</button><button onClick={()=>setCompanion('tags')}>Browse tags</button><div className="next-section">Recently opened</div>{recents.slice(0,6).map(r=><button key={r.id} title={r.path??r.title} onClick={()=>r.source?openLinked({op:'open',source:r.source,path:r.path!}):openNote(r.id)}><FileText size={14}/><span className="truncate">{r.title}</span></button>)}{!recents.length&&<p className="next-linked-hint">Recently opened resources appear here.</p>}</section></CompanionNavigator>
      <div className="next-sidebar-bottom">{(drafts.length+externalDrafts.length)>0&&<LibraryPopover label={`Recovery (${drafts.length+externalDrafts.length})`} trigger={<><RefreshCw size={15}/><span>Recovery · {drafts.length+externalDrafts.length}</span></>}>{close=><div className="next-recovery-list">{drafts.map(d=><button key={d.id} onClick={()=>{close();void run(()=>inspectDraft(d.id),false);}}>{d.title||'Untitled draft'}</button>)}{externalDrafts.map(d=><button key={d.id} title={d.path} onClick={()=>{close();openLinked({op:'recover',id:d.id});}}>{d.path}</button>)}</div>}</LibraryPopover>}
        <div className="next-workspace-actions"><button disabled={busy} onClick={()=>void run(async()=>{const path=await open({directory:true,multiple:false,title:'Open Vaultor Next workspace'});if(path&&!Array.isArray(path))await switchWorkspace(path);})}><FolderOpen size={17}/>Open workspace</button><WorkspaceActions/></div>
        <button onClick={toggleHelp}><BookOpen size={17}/>Milestone Help</button><small title={snapshot?.path}>{snapshot?.path??'Workspace unavailable'}</small>
      </div>
    </div></SidebarFrame>
    <main ref={mainElement} className="next-main" onFocusCapture={event=>{const pane=(event.target as Element).closest<HTMLElement>('[data-note-id]');if(pane){const index=[...event.currentTarget.querySelectorAll('[data-note-id]')].indexOf(pane);if(index>=0)setActivePane(index);}}}><header ref={headerElement} className="next-header" data-selecting={selection.state.ids.length>0}><div><p className="next-browse-eyebrow">{collection?'Collection':criteria.tag?'Tag':criteria.view==='trash'?'Resource lifecycle':'Your workspace'}</p><h1 title={collection?paths.get(collection):undefined}>{panes.length?'Note workspace':activeCollection?.name??criteria.tagName??(criteria.view==='trash'?'Trash':criteria.view==='pinned'?'Pinned':criteria.view==='recent'?'Recents':'Library')}</h1><small aria-live="polite">{selection.state.ids.length?`${selection.state.ids.length} selected · this page only`:notice||`${page.total} ${isFiltered(criteria)?'matches · committed resources':'resources · newest created first'}`}</small></div><div className="next-header-actions">{criteria.view==='trash'&&<button onClick={()=>lifecycleChange(null,'purge')}>Empty Trash…</button>}<div className="next-selection-actions" data-active={selection.state.ids.length>0} inert={!selection.state.ids.length}><div><button disabled={busy} onClick={e=>resourceMenu(selection.state.ids[0],e)}>Organize {selection.state.ids.length}</button><button onClick={selection.clear} aria-label="Clear resource selection"><X size={16}/><span>Clear</span></button></div></div>{activeCollection&&<button aria-label="Manage current collection" onClick={e=>collectionMenu(activeCollection,e)}><MoreHorizontal size={17}/></button>}<button aria-label="New note" disabled={busy||!snapshot} onClick={()=>createNote()}><Plus size={17}/><span className="next-create-label">New note</span></button></div></header>
      {(error||session.failed())&&<div role="alert" className="next-error">{error||'A save failed. Your draft is retained; review conflicts or retry.'}<button onClick={()=>void run(refresh)}>Retry saves</button>{panes.some(id=>session.status(id)==='conflict')&&<button onClick={()=>void run(()=>inspectDraft(panes.find(id=>session.status(id)==='conflict')!),false)}>Review versions</button>}</div>}
      {help?<section className="next-help"><button onClick={toggleHelp}>Close Help</button><ReactMarkdown>{helpText}</ReactMarkdown></section>:<div className={`next-workspace ${panes.length?'has-editor':''}`}>
        {!panes.length&&<div className="next-library-region"><SearchBar value={criteria} change={changeCriteria} input={searchInput} focused={setSearchFocused} down={()=>{if(!queryBusy)focusRow();}} refresh={()=>{selection.clear();changeCriteria({...criteria});}} pending={showLoading}/>{showLoading&&<div className="sr-only" role="status">Searching saved notes…</div>}{queryError&&<div className="next-search-feedback next-error" role="alert">{queryError}<button onClick={()=>{selection.clear();changeCriteria({...criteria});}}>Refresh results</button></div>}<nav ref={listElement} data-list-focus tabIndex={page.items.length?-1:0} className="next-library" aria-label="Notes" aria-busy={busy||queryBusy} onFocusCapture={()=>setListOwnsFocus(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setListOwnsFocus(false);}} onKeyDown={listKeys} onContextMenu={e=>{if(!(e.target as Element).closest('.next-resource,input,button')){e.preventDefault();backgroundMenu(e);}}} onScroll={e=>{scrolls.current.set(scopeKey,e.currentTarget.scrollTop);mainElement.current?.style.setProperty('--browse-progress',String(Math.min(1,e.currentTarget.scrollTop/160)));if(scrolls.current.size>64)scrolls.current.delete(scrolls.current.keys().next().value!);}}><div className="next-list-heading"><input ref={selectPage} data-select-resource="page" type="checkbox" aria-label="Select current resource page" checked={!!order.length&&selection.state.ids.length===order.length} disabled={busy||queryBusy||!order.length} onChange={()=>selection.state.ids.length===order.length?selection.clear():selection.all()}/><span>Notes</span><small>Ctrl+A · page</small></div><div role="grid" aria-label="Resource page" aria-multiselectable="true" aria-rowcount={page.items.length}>{page.items.map(item=><ResourceRow key={item.id} item={item} selected={selection.state.ids.includes(item.id)} opened={panes.includes(item.id)} focused={selection.state.focus===item.id} activate={activate} pick={rowPick} focus={selection.focus} open={rowOpen} menu={resourceMenu}/>)}</div>{!page.items.length&&!queryBusy&&!queryError&&<p>{criteria.view==='trash'?'Trash is empty. Resources remain recoverable here until permanently deleted.':isFiltered(criteria)?"No matching resources. Try fewer words or another filter.":"Create a note to start writing."}{!isFiltered(criteria)&&<button onClick={()=>createNote()}>New note</button>}</p>}</nav><div className="next-pagination"><button disabled={busy||queryBusy||trail.length<=1} onClick={()=>changePage(false)}>Previous</button><span>Page {trail.length}</span><button disabled={busy||queryBusy||!page.next} onClick={()=>changePage(true)}>Next</button></div></div>}
        <div className="next-panes" data-active-pane={activePane} data-count={panes.length} style={{'--pane-ratio':paneRatio+'%','--pane-left':paneRatio+'fr','--pane-right':(100-paneRatio)+'fr'} as CSSProperties}>{panes.map((id,index)=>{const linked=external.get(id);if(linked)return <LinkedPane key={`${paneViews[index].key}:${id}`} doc={linked} index={index} documents={documents} status={external.status(id)} error={external.error(id)} busy={busy||!!linkedReview} locked={external.locked(id)||!sources.some(source=>source.id===linked.sourceId)} changed={capture=>external.edit(id,capture)} save={()=>void run(async()=>{await external.save(id);})} review={()=>reviewLinked(id)} close={()=>closePane(index)} beside={()=>openLinked({op:'open',source:linked.sourceId,path:linked.path},true)} follow={href=>{if(/^https?:/i.test(href))void run(async()=>{await linkedCommand({op:'web',url:href});},false);else openLinked({op:'follow',id:linked.documentId,href});}} focusWhenReady={focusNote===id&&index===panes.length-1} focusHandled={()=>setFocusNote(null)} leaveFocus={()=>focusLinked(linked.sourceId,linked.path)}/>;const note=session.get(id);if(!note)return null;return <section key={`${paneViews[index].key}:${id}`} className="next-pane" data-note-id={id} aria-label={`Editor pane ${index+1}`}><div className="next-note-bar"><input aria-label={`Note title ${index+1}`} value={note.title} maxLength={240} disabled={note.kind==='file'||busy||!!review||!!organizing||!!linkedReview} onChange={e=>{session.edit(id,{title:e.target.value});if(!isFiltered(criteria))setPage(p=>({...p,items:p.items.map(item=>item.id===id?{...item,title:e.target.value}:item)}));}}/><span role="status">{session.status(id)}</span><button aria-label="Assign note tags" onClick={()=>setTagging([id])}>Tags</button><button aria-label="Pin note" onClick={()=>metadata({op:'pin',ids:[id],value:true})}>Pin</button><button aria-label="Unpin note" onClick={()=>metadata({op:'pin',ids:[id],value:false})}>Unpin</button><button aria-label="Organize note" onClick={()=>organize([id])}><MoreHorizontal size={16}/></button><button aria-label="Close note" onClick={()=>closePane(index)}><X size={16}/></button></div><div className="next-document" onScroll={event=>event.currentTarget.closest<HTMLElement>('.next-pane')?.style.setProperty('--note-progress',String(Math.min(1,event.currentTarget.scrollTop/140)))}><>{note.kind==='file'?<div className="next-file-resource"><h2>{note.title}</h2><p>Managed original file · preserved bytes. Rich previews are planned for M9.</p><button onClick={()=>showTransfer({op:'export',ids:[id]})}>Export original file…</button></div>:<NextEditor note={note} pane={index} documents={documents} locked={busy||!!review||!!organizing||!!linkedReview} focusWhenReady={focusNote===id&&index===panes.length-1} focusHandled={()=>setFocusNote(null)} leaveFocus={returnToLibrary} changed={capture=>session.edit(id,{capture})}/>}</></div></section>;})}{panes.length===2&&<div role="separator" aria-label="Resize note panes" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={paneRatio} tabIndex={0} className="next-pane-divider" style={{left:paneRatio+'%'}} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setPaneRatio(value=>Math.max(30,Math.min(70,value+(event.key==='ArrowRight'?2:-2))));}}} onPointerDown={event=>{event.preventDefault();event.currentTarget.parentElement!.dataset.resizing='true';event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{if(!event.currentTarget.hasPointerCapture(event.pointerId))return;const rect=event.currentTarget.parentElement!.getBoundingClientRect();const ratio=Math.max(30,Math.min(70,(event.clientX-rect.x)/rect.width*100));event.currentTarget.parentElement!.style.setProperty('--pane-ratio',ratio+'%');event.currentTarget.parentElement!.style.setProperty('--pane-left',ratio+'fr');event.currentTarget.parentElement!.style.setProperty('--pane-right',(100-ratio)+'fr');event.currentTarget.style.left=ratio+'%';event.currentTarget.setAttribute('aria-valuenow',String(Math.round(ratio)));}} onPointerUp={event=>{setPaneRatio(parseFloat(event.currentTarget.style.left));event.currentTarget.releasePointerCapture(event.pointerId);}} onLostPointerCapture={event=>{delete event.currentTarget.parentElement!.dataset.resizing;setPaneRatio(parseFloat(event.currentTarget.style.left));}}/>}</div>
      </div>}
    </main></div>{tagging&&<TagPicker ids={tagging} close={()=>setTagging(undefined)} changed={()=>{setOrgVersion(v=>v+1);void refresh();}}/>}{lifecycle&&<LifecycleReview {...lifecycle} close={()=>setLifecycle(undefined)}/>} {linkedReview&&<LinkedReview {...linkedReview} busy={busy} error={error} close={()=>{setLinkedReview(undefined);}} restore={()=>{acceptLinked(linkedReview.doc,linkedReview.beside);setLinkedReview(undefined);}} discard={discardLinked} resolve={resolveLinked}/>} {organizing&&<OrganizeDialog request={organizing} collections={snapshot?.collections??[]} busy={busy} error={error} close={()=>{setOrganizing(null);requestAnimationFrame(()=>focusRow(selection.state.focus??organizing.ids[0]));}} apply={membership}/>} {review&&<RecoveryReview {...review} busy={busy} close={()=>setReview(undefined)} resolve={resolve}/>} {menu&&menu.scope===selectionScope&&<ContextMenu request={menu} dismiss={()=>setMenu(null)}/>}</div>;
}
