import WorkspaceTransfers from './WorkspaceTransfers';
import Activity from './Activity';
import {DialogFocusContext,useDialogFocus} from '../lib/dialogFocus';
import { useContext,useEffect,useRef,useState,type ReactNode } from 'react';
import { DesktopConnectionContext } from '../lib/desktopConnectionContext';
import api from '../lib/api';
import { ensureCompatible } from '../lib/connection';
import { configureConnection,getConnection,getPlatform,transport } from '../lib/platform';
import { blockConnectionSwitch,prepareConnectionSwitch,SwitchBlockedError,unwrap,type DesktopCandidate } from '../lib/desktop';
import { store,clearSelectedTags,setCurrentResourceId,setSearchQuery,setTypeFilter } from '../state/store';
import { WorkspaceSelectionContext,validateWorkspaceList,workspaceId,type WorkspaceSummary } from '../lib/workspaceSelection';
import { useEscapeLayer,ESCAPE_PRIORITIES } from '../lib/escape/escape';
import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';

type Grant={deviceId:string;name:string;allowed:boolean};
export default function WorkspaceRoot({children}:{children:ReactNode}){
  const [transfers,setTransfers]=useState(false);
  const [ready,setReady]=useState(false),[supported,setSupported]=useState(false),[open,setOpen]=useState(false),[owner,setOwner]=useState(false);
  const [items,setItems]=useState<WorkspaceSummary[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[epoch,setEpoch]=useState(0);
  const [filter,setFilter]=useState(''),[name,setName]=useState(''),[manage,setManage]=useState<WorkspaceSummary>(),[grants,setGrants]=useState<Grant[]>([]),[pending,setPending]=useState<WorkspaceSummary>(),[keep,setKeep]=useState(false);
  const running=useRef(false),creation=useRef<{id:string;name:string}|undefined>(undefined),panel=useRef<HTMLElement>(null),focus=useRestoreFocusOnClose();
  const workspaceDialog=useDialogFocus(panel,false,open);
  const desktopConnection=useContext(DesktopConnectionContext);
  const server=desktopConnection?.name??location.host;
  const createKey='vaultor-workspace-create:'+getConnection().profileId;
  async function list(){const value=validateWorkspaceList((await api.get('/workspaces',{backgroundDiagnostic:true})).data);setItems(value);if(creation.current&&value.some(v=>v.id===creation.current?.id)){creation.current=undefined;sessionStorage.removeItem(createKey);setName('');}return value;}
  async function browserProbe(id:string){
    if(!workspaceId(id))throw Error('Invalid workspace identity.');
    const version=getConnection().epoch;
    const response=await fetch('/api/workspace/identity',{credentials:'same-origin',redirect:'error',headers:{'X-Vaultor-Workspace':id},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('Destination unavailable or access revoked. Your current workspace is retained.');
    const value=await response.json() as {id:string;generation:string};if(version!==getConnection().epoch||value.id!==id||!workspaceId(value.generation))throw Error('Workspace changed while connecting. Retry.');return value;
  }
  useEffect(()=>{let active=true;void (async()=>{
    try{
      const capabilities=await ensureCompatible();if(!active)return;
      if(!capabilities.multiWorkspace){setReady(true);return;}setSupported(true);setTransfers(capabilities.workspaceImports===true);
      const [rows,role]=await Promise.all([api.get('/workspaces'),api.get('/access/session')]);if(!active)return;
      const values=validateWorkspaceList(rows.data);setItems(values);
      try{const saved=sessionStorage.getItem(createKey);if(saved){const operation=JSON.parse(saved) as WorkspaceSummary;if(workspaceId(operation.id)&&typeof operation.name==='string'&&!values.some(v=>v.id===operation.id)){creation.current=operation;setName(operation.name);}else sessionStorage.removeItem(createKey);}}catch{/* Pending creation is never reconstructed from a display name. */}
      setOwner(role.data.role==='OWNER');
      let restored:string|null=null;try{if(getPlatform().kind==='browser')restored=sessionStorage.getItem('vaultor-selected-workspace');}catch{/* A blocked preference store must not prevent reading the fixed default. */}
      if(restored){const target=await browserProbe(restored);if(!active)return;configureConnection({...getConnection(),workspaceId:target.id,generation:target.generation},getPlatform());setSelected(target.id);}
      else{const identity=(await transport.get('/workspace/identity')).data;if(!active)return;setSelected(identity.id);}
      setReady(true);
    }catch(e){if(active){setError(e instanceof Error?e.message:'Workspace unavailable.');setOpen(true);}}
  })();return()=>{active=false;};},[createKey]);
  function show(){focus.captureFocus();setOpen(true);setError('');void list().catch(e=>setError(e.message));}
  useEffect(()=>window.vaultorDesktop?.onAppCommand?.(command=>{if(command==='workspaces')show();}));
  useEffect(()=>{const requested=()=>show();window.addEventListener('vaultor:workspace-import',requested);return()=>window.removeEventListener('vaultor:workspace-import',requested);});
  function dismiss(){if(ready&&!running.current&&!busy){if(manage){setManage(undefined);setGrants([]);setName(creation.current?.name??'');}else{setOpen(false);setPending(undefined);focus.restoreFocus();}}}
  useEscapeLayer({id:'workspace-picker',active:open,priority:ESCAPE_PRIORITIES.modal,close:dismiss});
  useEffect(()=>{if(open)setTimeout(()=>panel.current?.querySelector<HTMLElement>('input,button')?.focus(),0);},[open,manage]);
  async function choose(item:WorkspaceSummary,keepDrafts=false,profileId=getConnection().profileId){
    if(running.current)return;if(item.id===selected&&ready&&profileId===getConnection().profileId){setOpen(false);focus.restoreFocus();return;}running.current=true;setBusy(true);setError('');setPending(item);setKeep(false);
    try{
      const bridge=window.vaultorDesktop;let candidate:DesktopCandidate|undefined;
      const before=bridge?((candidate=unwrap(await bridge.probe({id:profileId,workspaceId:item.id}))).identity):await browserProbe(item.id);
      if(ready)await prepareConnectionSwitch(keepDrafts);
      if(bridge){const next=unwrap(await bridge.activate(candidate!.ticket));window.dispatchEvent(new CustomEvent('vaultor:desktop-workspace',{detail:next}));}
      else{
        const after=await browserProbe(item.id);if(after.generation!==before.generation)throw Error('Destination was replaced. Review it and retry.');
        sessionStorage.setItem('vaultor-selected-workspace',item.id);
        configureConnection({...getConnection(),workspaceId:item.id,generation:after.generation},getPlatform());
        store.dispatch(clearSelectedTags());store.dispatch(setCurrentResourceId(null));store.dispatch(setSearchQuery(''));store.dispatch(setTypeFilter('all'));setEpoch(v=>v+1);
      }
      setSelected(item.id);setReady(true);setOpen(false);setPending(undefined);focus.restoreFocus();
    }catch(e){setError(e instanceof Error?e.message:'Switch failed.');setKeep(e instanceof SwitchBlockedError&&e.canKeepDrafts);}
    finally{running.current=false;setBusy(false);}
  }
  async function create(){
    if(running.current||!name.trim()||Array.from(name).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)||name.trim().length>100)return;running.current=true;setBusy(true);setError('');
    const release=blockConnectionSwitch('workspace management');
    const request=creation.current??{id:crypto.randomUUID(),name:name.trim()};creation.current=request;
    try{sessionStorage.setItem(createKey,JSON.stringify(request));await api.put('/owner/workspaces/'+request.id,{name:request.name});creation.current=undefined;sessionStorage.removeItem(createKey);setName('');await list();}catch(e){setError(e instanceof Error?e.message:'Creation failed. Retry the same name.');}finally{release();running.current=false;setBusy(false);}
  }
  async function edit(item:WorkspaceSummary){
    if(running.current)return;running.current=true;setBusy(true);setManage(item);setGrants([]);setName(item.name);setError('');
    const release=blockConnectionSwitch('workspace management');
    try{setGrants((await api.get<Grant[]>('/owner/workspaces/'+item.id+'/grants')).data);}
    catch(e){setError((e as Error).message);}finally{release();running.current=false;setBusy(false);}
  }
  async function rename(){
    if(!manage||running.current||!name.trim()||Array.from(name).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127))return;
    running.current=true;setBusy(true);setError('');const release=blockConnectionSwitch('workspace management');
    try{await api.patch('/owner/workspaces/'+manage.id,{name:name.trim()});await list();setManage({...manage,name:name.trim()});}
    catch(e){setError((e as Error).message);}finally{release();running.current=false;setBusy(false);}
  }
  async function grant(value:Grant){
    if(!manage||running.current)return;running.current=true;setBusy(true);setError('');const release=blockConnectionSwitch('workspace management');
    try{await api.put('/owner/workspaces/'+manage.id+'/grants',{deviceId:value.deviceId,allowed:!value.allowed});setGrants(rows=>rows.map(v=>v.deviceId===value.deviceId?{...v,allowed:!v.allowed}:v));}
    catch(e){setError((e as Error).message);}finally{release();running.current=false;setBusy(false);}
  }
  useEffect(()=>{const changed=()=>{void list().catch(e=>setError(e.message));};window.addEventListener('vaultor:workspaces-changed',changed);return()=>window.removeEventListener('vaultor:workspaces-changed',changed);});
  if(!supported&&ready)return <>{children}<Activity/></>;
  return <WorkspaceSelectionContext.Provider value={{name:items.find(v=>v.id===selected)?.name||'Workspace',server,imports:transfers&&owner,open:show}}>
    {ready&&<Activity key={'activity:'+epoch}/>}
    {ready?<div key={epoch} className="h-full" inert={open}>{children}</div>:<div className="p-6" role="status">Choose a workspace to continue.</div>}
    {open&&<DialogFocusContext.Provider value={workspaceDialog.scope}><div role="dialog" aria-modal="true" aria-label="Workspaces" className="fixed inset-0 z-[3100] flex items-center justify-center bg-black/50 p-4" onKeyDown={workspaceDialog.onKeyDown}>
      <section ref={panel} className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-background p-5 space-y-3">
        <div className="flex items-center justify-between gap-3"><h1 className="font-semibold">{manage?'Manage workspace':'Workspaces'}</h1><button className="library-button" disabled={busy||!ready} onClick={dismiss}>{manage?'Back':'Close'}</button></div>
        <p className="text-sm text-[var(--text-secondary)]">{server} · {owner?'Owner access':'Approved workspaces'}</p>
        {error&&<p role="alert" className="text-sm text-red-400">{error}</p>}
        {!manage?<><input className="organization-input w-full" aria-label="Find workspace" placeholder="Find workspace…" value={filter} onChange={e=>setFilter(e.target.value)}/>
          {items.filter(v=>v.name.toLowerCase().includes(filter.toLowerCase())).map(item=><div key={item.id} className="flex items-center gap-2 border-b border-border py-2"><button className="flex-1 text-left min-w-0 rounded-lg p-2 hover:bg-card focus-visible:ring-2 focus-visible:ring-primary" disabled={busy} onClick={()=>void choose(item)} aria-current={item.id===selected?'true':undefined}><span className="block truncate">{item.name}</span><span className="text-xs text-[var(--text-secondary)]">{item.id===selected?'Current workspace':'Open workspace'}</span></button>{owner&&<button className="library-button" disabled={busy} onClick={()=>void edit(item)} aria-label={'Manage '+item.name}>Manage</button>}</div>)}
          <button className="library-button" disabled={busy} onClick={()=>void list().catch(e=>setError(e.message))}>Refresh</button>
          {owner&&(items.length<8||creation.current)&&<form className="flex gap-2 border-t border-border pt-3" onSubmit={e=>{e.preventDefault();void create();}}><input className="organization-input min-w-0 flex-1" aria-label="New workspace name" placeholder="New workspace name" value={name} disabled={busy||!!creation.current} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&e.nativeEvent.isComposing)e.preventDefault();}} maxLength={100}/><button className="library-button" disabled={busy||!name.trim()} type="submit">{creation.current?'Retry':'Create'}</button></form>}
          <WorkspaceTransfers onBackground={()=>{setOpen(false);focus.restoreFocus();}} owner={owner} supported={transfers} workspaceName={items.find(v=>v.id===selected)?.name||'Workspace'} onBusy={setBusy} onReady={list} onOpen={(id,label,local)=>void choose({id,name:label},false,local?'this-computer':getConnection().profileId)}/>
        </>:<><form className="flex gap-2" onSubmit={e=>{e.preventDefault();void rename();}}><input className="organization-input min-w-0 flex-1" aria-label="Workspace name" maxLength={100} value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&e.nativeEvent.isComposing)e.preventDefault();}}/><button className="library-button" disabled={busy||!name.trim()}>Rename</button></form><h2 className="text-sm font-semibold">Device access</h2>{grants.length?grants.map(v=><label key={v.deviceId} className="flex gap-3 items-center border-b border-border py-2"><span className="flex-1 truncate">{v.name}</span><input type="checkbox" aria-label={'Allow '+v.name} checked={v.allowed} disabled={busy} onChange={()=>void grant(v)}/></label>):<p className="text-sm text-[var(--text-secondary)]">No paired devices.</p>}</>}
        {keep&&pending&&<button className="library-button" disabled={busy} onClick={()=>void choose(pending,true)}>Keep drafts and switch</button>}
      </section>
    </div></DialogFocusContext.Provider>}
  </WorkspaceSelectionContext.Provider>;
}
