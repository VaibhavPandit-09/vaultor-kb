import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Plug, X } from 'lucide-react';
import DesktopChrome from './DesktopChrome';
import DesktopUpdates from './DesktopUpdates';
import { DesktopConnectionContext } from '../lib/desktopConnectionContext';
import { HostControls, NearbyConnections } from './DesktopNetwork';
import { activateDesktop, prepareConnectionSwitch, SwitchBlockedError, unwrap, requestLocalArchiveImport, type DesktopState, type DesktopCandidate, type LocalServerStatus } from '../lib/desktop';
import { store, clearSelectedTags, setCurrentResourceId, setSearchQuery, setTypeFilter } from '../state/store';
import { useEscapeLayer, ESCAPE_PRIORITIES } from '../lib/escape/escape';
import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';

export default function DesktopRoot({ children }: { children: ReactNode }) {
  const bridge = window.vaultorDesktop;
  const [state, setState] = useState<DesktopState | null>(null), [connected, setConnected] = useState(false), [picker, setPicker] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [online, setOnline] = useState(true);
  const [name, setName] = useState(''), [address, setAddress] = useState('http://127.0.0.1:8080'), [candidate, setCandidate] = useState<DesktopCandidate | null>(null), [keepAvailable, setKeepAvailable] = useState(false);
  const running = useRef(false), automatic = useRef(false);
  const [tab, setTab] = useState<'connections' | 'hosting'>('connections'), [filter, setFilter] = useState('');
  const [hosting,setHosting]=useState<{startAtLogin:boolean;registered:boolean;enabledByOS:boolean;supported:boolean;error:string}>();
  const [local, setLocal] = useState<LocalServerStatus | null>(null);
  const focus = useRestoreFocusOnClose(), dialog = useRef<HTMLElement>(null);
  function openConnections() { focus.captureFocus(); setPicker(true); setTab('connections'); setError(''); setCandidate(null); }
  useEffect(() => bridge?.onConnections?.(() => { focus.captureFocus(); setPicker(true); setError(''); setCandidate(null); }), [bridge, focus]);
  function dismiss() { if (connected && !running.current) { setPicker(false); focus.restoreFocus(); } }
  useEscapeLayer({ id: 'desktop-connections', active: Boolean(bridge) && connected && picker, priority: ESCAPE_PRIORITIES.modal, close: dismiss });
  useEffect(() => { if (bridge && (!connected || picker)) { const timer = setTimeout(() => dialog.current?.querySelector<HTMLElement>('button:not(:disabled),input')?.focus(), 0); return () => clearTimeout(timer); } }, [bridge, connected, picker, state?.profiles.length]);
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    bridge.bootstrap().then(result => { if (active) { const boot = unwrap(result); setState(boot); if (boot.error) setError(boot.error); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [bridge]);
  useEffect(() => {
    if (!bridge?.localStatus) return;
    let active = true;
    const refresh = () => { void bridge.localStatus!().then(unwrap).then(value => { if (active) { setLocal(value); if (state?.active === 'this-computer' && (value.status === 'restarting' || value.status === 'failed' || value.status === 'stopped' || value.error)) setOnline(false); if(state?.active === 'this-computer' && value.status==='ready' && !value.error) setOnline(true); if (value.address) setState(previous => previous ? { ...previous, profiles: previous.profiles.map(p => p.source === 'bundled' ? { ...p, address: value.address! } : p) } : previous); } }).catch(() => {}); };
    refresh();
    // Only watch during startup or interrupted local use; avoid polling healthy workspaces.
    const timer = busy || (!online && state?.active === 'this-computer') ? setInterval(refresh, 1000) : undefined;
    return () => { active = false; clearInterval(timer); };
  }, [bridge, busy, online, state?.active]);
  useEffect(() => bridge?.onLocalStatus?.(value => { setLocal(value); if (state?.active === 'this-computer') setOnline(value.status === 'ready' && !value.error); }), [bridge, state?.active]);
  useEffect(() => {
    if (!bridge) return;
    const listener = (event: Event) => setOnline((event as CustomEvent<boolean>).detail);
    window.addEventListener('vaultor:connection-health', listener);
    return () => window.removeEventListener('vaultor:connection-health', listener);
  }, [bridge]);
  useEffect(()=>{
    if(!bridge)return;
    const removeQuit=bridge.onQuitRequest?.(request=>{void prepareConnectionSwitch(request.keepDrafts).then(()=>bridge.quitReply?.({id:request.id,success:true})).catch(e=>bridge.quitReply?.({id:request.id,success:false,error:e.message,canKeepDrafts:e instanceof SwitchBlockedError && e.canKeepDrafts}));});
    const removeResume=bridge.onResume?.(()=>{if(state?.active)void bridge.probe(state.active).then(unwrap).then(()=>setOnline(true)).catch(()=>setOnline(false));});
    return()=>{removeQuit?.();removeResume?.();};
  },[bridge,state?.active]);
  useEffect(()=>{if(bridge?.hosting&&(!connected||picker))void bridge.hosting().then(unwrap).then(setHosting).catch(e=>setError(e.message));},[bridge,connected,picker]);
  async function hostAction(action:'browser'|'start'|'stop') {
    if(running.current||!bridge?.hostAction)return;running.current=true;setBusy(true);setError('');
    try{unwrap(await bridge.hostAction(action));if(bridge.localStatus)setLocal(unwrap(await bridge.localStatus()));}
    catch(e){setError(e instanceof Error?e.message:'Host action failed. Retry.');}finally{running.current=false;setBusy(false);}
  }
  async function commit(value: DesktopCandidate, keep = false) {
    await prepareConnectionSwitch(keep);
    const next = unwrap(await bridge!.activate(value.ticket));
    activateDesktop(next); store.dispatch(clearSelectedTags()); store.dispatch(setCurrentResourceId(null)); store.dispatch(setSearchQuery('')); store.dispatch(setTypeFilter('all'));
    setState(next); setConnected(true); setPicker(false); setCandidate(null); setKeepAvailable(false); setOnline(true);
  }
  async function connect(id: string, automaticAttempt = false) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(''); setKeepAvailable(false);
    try {
      const value = unwrap(await bridge!.probe(id)); setCandidate(value);
      if (value.differentWorkspace) { setError('This address now serves a different workspace. Your old sessions and drafts remain separate. Choose Connect to continue.'); if (automaticAttempt) setPicker(true); return; }
      await commit(value);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Cannot connect. Retry.'); setKeepAvailable(e instanceof SwitchBlockedError && e.canKeepDrafts); }
    finally { running.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (bridge && !connected && state?.active && !state.error && !automatic.current) { automatic.current = true; void connect(state.active, true); }
    // Bootstrap triggers one reconnect; user retries use the current controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.active, state?.error, bridge, connected]);
  async function retryCommit(keep: boolean) {
    if (!candidate || running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      const refreshed = unwrap(await bridge!.probe(candidate.profile.id)); setCandidate(refreshed);
      if (refreshed.identity.id !== candidate.identity.id || refreshed.identity.generation !== candidate.identity.generation) { setError('The destination workspace changed. Review it and choose Connect again.'); return; }
      await commit(refreshed, keep);
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection failed. Retry.'); setKeepAvailable(e instanceof SwitchBlockedError && e.canKeepDrafts); }
    finally { running.current = false; setBusy(false); }
  }
  if (!bridge) return children;
  const profile = state?.profiles.find(p => p.id === state.active);
  const choose = !connected || picker;
  return <DesktopConnectionContext.Provider value={{ name: profile?.name || 'Connections', online, open: openConnections }}><div className="desktop-shell h-screen flex flex-col bg-background text-foreground">
    <DesktopChrome/>
    <DesktopUpdates/>
    {connected && <div className="flex-1 min-h-0 overflow-hidden">{<div key={state?.token} className="h-full">{children}</div>}</div>}
    {choose && <div role="dialog" aria-modal="true" aria-labelledby="desktop-connection-title" className={connected ? 'fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-6' : 'flex-1 flex items-center justify-center p-6'} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) { event.preventDefault(); return; } if (event.key !== 'Tab') return; const controls = [...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary') ?? []].filter(element => !element.closest('details:not([open])') || element.tagName === 'SUMMARY'); const first = controls[0], last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }}>
      <section ref={dialog} className="w-full max-w-xl max-h-[85vh] overflow-auto rounded-2xl border border-border bg-[var(--surface-2)] p-6 shadow-xl"><div className="flex items-center justify-between mb-3"><h1 id="desktop-connection-title" className="text-xl font-semibold flex items-center gap-2"><Plug size={20}/>Connect to a workspace</h1>{connected && <button aria-label="Return to workspace" disabled={busy} onClick={dismiss}><X size={18}/></button>}</div>
        <div className="flex gap-2 mb-4"><button className="library-button" aria-pressed={tab === 'connections'} disabled={busy} onClick={() => setTab('connections')}>Connections</button><button className="library-button" aria-pressed={tab === 'hosting'} disabled={busy} onClick={() => setTab('hosting')}>Hosting</button></div>
        {error && <p role="alert" className="mb-3 text-sm text-red-400">{error}</p>}
        {!state && !error && <p role="status">Loading connections…</p>}
        {tab === 'connections' && <><input aria-label="Find remembered server" placeholder="Find remembered server…" className="w-full rounded-lg border border-border bg-background p-2 mb-3 text-sm" value={filter} onChange={e => setFilter(e.target.value)}/><div className="space-y-2">{state?.profiles.filter(p => p.source === 'bundled' || p.name.toLowerCase().includes(filter.toLowerCase())).map(p => <div key={p.id} className="flex gap-1"><button disabled={busy || Boolean(state.error)} className="library-button flex-1 flex items-center justify-between text-left min-w-0" onClick={() => void connect(p.id)}><span className="truncate">{p.name}<span className="block text-xs text-[var(--text-tertiary)]">{p.source === 'bundled' ? 'Managed local workspace' : p.address}</span></span><span className="text-xs ml-2">{busy ? 'Preparing…' : connected && p.id === state.active ? 'Reconnect' : 'Connect'}</span></button>{bridge.authorizeLocal && p.kind==='local' && p.source!=='bundled' && <button className="library-button" disabled={busy} onClick={()=>{if(running.current)return;running.current=true;setBusy(true);void bridge.authorizeLocal!(p.id).then(unwrap).then(setState).catch(e=>setError(e.message)).finally(()=>{running.current=false;setBusy(false);});}}>Authorize…</button>}{bridge.forget && p.source !== 'bundled' && p.id !== state?.active && <button title="Forget connection; keep workspace and drafts" aria-label={'Forget ' + p.name} disabled={busy} className="library-button" onClick={() => { if (running.current) return; running.current = true; setBusy(true); void bridge.forget!(p.id).then(unwrap).then(setState).catch(e => setError(e.message)).finally(() => { running.current = false; setBusy(false); }); }}><X size={14}/></button>}</div>)}</div>
        {bridge.pairInspect && <div className="mt-4 border-t border-border pt-4"><NearbyConnections disabled={busy} onPaired={id => { void bridge.bootstrap().then(unwrap).then(value => { setState(value); void connect(id); }).catch(e => setError(e.message)); }}/></div>}</>}
        {tab === 'hosting' && bridge.sharing && <HostControls disabled={busy}/>}

        {tab === 'hosting' && hosting && <div className="mt-4 border-t border-border pt-3 text-sm space-y-2"><div className="flex items-center gap-2"><span className="mr-auto">Local host · {local?.status || 'stopped'}</span><button className="library-button" disabled={busy || !local?.address} onClick={()=>void hostAction('browser')}>Open in browser</button><button className="library-button" disabled={busy} onClick={()=>void hostAction(local?.address?'stop':'start')}>{local?.address?'Stop host':'Start host'}</button></div><label className="flex items-center gap-2"><input type="checkbox" checked={hosting.startAtLogin} disabled={busy || !hosting.supported} onChange={event=>{const enabled=event.target.checked;if(!bridge.login||running.current)return;running.current=true;setBusy(true);void bridge.login(enabled).then(unwrap).then(setHosting).catch(e=>setError(e.message)).finally(()=>{running.current=false;setBusy(false);});}}/>Start Vaultor at login in the background</label><p className="text-xs text-[var(--text-secondary)]">Closing hides to the tray. Quit stops hosting. Sleep makes the host unavailable.</p>{hosting.error&&<p role="alert" className="text-red-400">{hosting.error}</p>}</div>}
        {tab === 'hosting' && local && <details className="mt-3 text-xs text-[var(--text-secondary)]"><summary className="cursor-pointer">Local server · {local.status}</summary>{local.address && <p>Browser address: {local.address}</p>}<p>Data: {local.dataDirectory}</p>{local.error && <p role="alert">{local.error}</p>}{local.logError && <p role="alert">{local.logError}</p>}<pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">{local.logs.map(line => `${line.timestamp} ${line.message}`).join('\n') || 'No startup logs yet.'}</pre></details>}
        {candidate && error && <div className="flex gap-2 mt-3"><button className="library-button" disabled={busy} onClick={() => void retryCommit(false)}>Retry / Connect</button>{keepAvailable && <button className="library-button" disabled={busy} onClick={() => void retryCommit(true)}>Keep drafts and switch</button>}</div>}
        {tab === 'connections' && state && !state.error && <details className="mt-4 text-xs"><summary className="cursor-pointer">Existing local server</summary><form className="mt-5 space-y-2" onSubmit={event => { event.preventDefault(); if (running.current || !name.trim()) return; running.current = true; setBusy(true); setError(''); void bridge.addProfile({ name, address }).then(result => { const added = unwrap(result); setState(previous => previous ? { ...previous, profiles: [...previous.profiles, added] } : previous); setName(''); }).catch(e => setError(e.message)).finally(() => { running.current = false; setBusy(false); }); }}><label className="block text-sm">Connection name<input autoFocus={!connected} className="block w-full rounded-lg border border-border bg-background p-2 mt-1" value={name} maxLength={100} onChange={event => setName(event.target.value)}/></label><label className="block text-sm">Server address<input className="block w-full rounded-lg border border-border bg-background p-2 mt-1" value={address} onChange={event => setAddress(event.target.value)}/></label><button className="library-button" disabled={busy || !name.trim()}>Remember local server</button></form></details>}
        {tab==='connections'&&state&&!state.error&&<details className="mt-4 text-sm"><summary className="cursor-pointer">Bring an existing workspace</summary><p className="mt-2 text-xs text-[var(--text-secondary)]">Connect to an upgraded server to keep using its storage. Existing local/Docker HTTP connections require its owner.key; network servers use device pairing. Or export a workspace ZIP in the browser and import it into This computer. No storage is copied automatically.</p><button className="library-button mt-3" disabled={busy} onClick={()=>{void connect('this-computer').then(success=>{if(success)requestLocalArchiveImport();});}}>Import workspace ZIP into This computer…</button></details>}
        {connected && <button className="mt-4 flex items-center gap-2 text-sm" disabled={busy} onClick={dismiss}><ArrowLeft size={14}/>Keep current workspace</button>}
      </section>
    </div>}
  </div></DesktopConnectionContext.Provider>;
}
