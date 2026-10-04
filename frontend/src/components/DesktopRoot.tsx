import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Monitor, Plug, X } from 'lucide-react';
import { activateDesktop, prepareConnectionSwitch, SwitchBlockedError, unwrap, type DesktopState, type DesktopCandidate, type LocalServerStatus } from '../lib/desktop';
import { store, clearSelectedTags, setCurrentResourceId, setSearchQuery, setTypeFilter } from '../state/store';
import { useEscapeLayer, ESCAPE_PRIORITIES } from '../lib/escape/escape';
import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';

export default function DesktopRoot({ children }: { children: ReactNode }) {
  const bridge = window.vaultorDesktop;
  const [state, setState] = useState<DesktopState | null>(null), [connected, setConnected] = useState(false), [picker, setPicker] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [online, setOnline] = useState(true);
  const [name, setName] = useState(''), [address, setAddress] = useState('http://127.0.0.1:8080'), [candidate, setCandidate] = useState<DesktopCandidate | null>(null), [keepAvailable, setKeepAvailable] = useState(false);
  const running = useRef(false), automatic = useRef(false);
  const [hosting,setHosting]=useState<{startAtLogin:boolean;registered:boolean;enabledByOS:boolean;supported:boolean;error:string}>();
  const [local, setLocal] = useState<LocalServerStatus | null>(null);
  const focus = useRestoreFocusOnClose(), dialog = useRef<HTMLElement>(null);
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
  return <div className="h-screen flex flex-col bg-background text-foreground">
    {connected && <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-[var(--surface-2)] px-4 py-1.5 text-xs"><button className="flex items-center gap-2 rounded px-2 py-1 hover:bg-[var(--surface-3)] focus-visible:outline focus-visible:outline-primary" disabled={busy} onClick={() => { focus.captureFocus(); setPicker(true); setError(''); setCandidate(null); }}><Monitor size={14}/>{profile?.name}<span className="text-[var(--text-tertiary)]">{profile?.address}</span></button><span>{online ? 'Local connection' : 'Connection interrupted · editing stays local'} {!online && <button className="underline" onClick={() => { if (profile) void bridge.probe(profile.id).then(result => { unwrap(result); setOnline(true); }).catch(e => { setError(e.message); setPicker(true); }); }}>Retry</button>}</span></div>}
    {connected && <div className="flex-1 min-h-0 overflow-hidden">{<div key={state?.token} className="h-full">{children}</div>}</div>}
    {choose && <div role="dialog" aria-modal="true" aria-labelledby="desktop-connection-title" className={connected ? 'fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-6' : 'flex-1 flex items-center justify-center p-6'} onKeyDown={event => { if (event.key !== 'Tab') return; const controls = [...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') ?? []]; const first = controls[0], last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }}>
      <section ref={dialog} className="w-full max-w-xl rounded-2xl border border-border bg-[var(--surface-2)] p-6 shadow-xl"><div className="flex items-center justify-between mb-3"><h1 id="desktop-connection-title" className="text-xl font-semibold flex items-center gap-2"><Plug size={20}/>Connect to a workspace</h1>{connected && <button aria-label="Return to workspace" disabled={busy} onClick={dismiss}><X size={18}/></button>}</div>
        <p className="text-sm text-[var(--text-secondary)] mb-4">Use this computer’s workspace or connect to an existing local server.</p>
        {error && <p role="alert" className="mb-3 text-sm text-red-400">{error}</p>}
        {!state && !error && <p role="status">Loading connections…</p>}
        <div className="space-y-2">{state?.profiles.map(p => <button key={p.id} disabled={busy || Boolean(state.error)} className="library-button w-full flex items-center justify-between text-left" onClick={() => void connect(p.id)}><span>{p.name}<span className="block text-xs text-[var(--text-tertiary)]">{p.source === 'bundled' ? 'Managed local workspace' : p.address}</span></span><span>{busy ? 'Preparing…' : connected && p.id === state.active ? 'Reconnect' : 'Connect'}</span></button>)}</div>
        {hosting && <div className="mt-4 border-t border-border pt-3 text-sm space-y-2"><div className="flex items-center gap-2"><span className="mr-auto">Local host · {local?.status || 'stopped'}</span><button className="library-button" disabled={busy || !local?.address} onClick={()=>void hostAction('browser')}>Open in browser</button><button className="library-button" disabled={busy} onClick={()=>void hostAction(local?.address?'stop':'start')}>{local?.address?'Stop host':'Start host'}</button></div><label className="flex items-center gap-2"><input type="checkbox" checked={hosting.startAtLogin} disabled={busy || !hosting.supported} onChange={event=>{const enabled=event.target.checked;if(!bridge.login||running.current)return;running.current=true;setBusy(true);void bridge.login(enabled).then(unwrap).then(setHosting).catch(e=>setError(e.message)).finally(()=>{running.current=false;setBusy(false);});}}/>Start Vaultor at login in the background</label><p className="text-xs text-[var(--text-secondary)]">Closing hides to the tray. Quit stops hosting. Sleep makes the host unavailable.</p>{hosting.error&&<p role="alert" className="text-red-400">{hosting.error}</p>}</div>}
        {local && <details className="mt-3 text-xs text-[var(--text-secondary)]"><summary className="cursor-pointer">Local server · {local.status}</summary>{local.address && <p>Browser address: {local.address}</p>}<p>Data: {local.dataDirectory}</p>{local.error && <p role="alert">{local.error}</p>}{local.logError && <p role="alert">{local.logError}</p>}<pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">{local.logs.map(line => `${line.timestamp} ${line.message}`).join('\n') || 'No startup logs yet.'}</pre></details>}
        {candidate && error && <div className="flex gap-2 mt-3"><button className="library-button" disabled={busy} onClick={() => void retryCommit(false)}>Retry / Connect</button>{keepAvailable && <button className="library-button" disabled={busy} onClick={() => void retryCommit(true)}>Keep drafts and switch</button>}</div>}
        {state && !state.error && <form className="mt-5 space-y-2" onSubmit={event => { event.preventDefault(); if (running.current || !name.trim()) return; running.current = true; setBusy(true); setError(''); void bridge.addProfile({ name, address }).then(result => { const added = unwrap(result); setState(previous => previous ? { ...previous, profiles: [...previous.profiles, added] } : previous); setName(''); }).catch(e => setError(e.message)).finally(() => { running.current = false; setBusy(false); }); }}><label className="block text-sm">Connection name<input autoFocus={!connected} className="block w-full rounded-lg border border-border bg-background p-2 mt-1" value={name} maxLength={100} onChange={event => setName(event.target.value)}/></label><label className="block text-sm">Server address<input className="block w-full rounded-lg border border-border bg-background p-2 mt-1" value={address} onChange={event => setAddress(event.target.value)}/></label><button className="library-button" disabled={busy || !name.trim()}>Remember server</button></form>}
        {connected && <button className="mt-4 flex items-center gap-2 text-sm" disabled={busy} onClick={dismiss}><ArrowLeft size={14}/>Keep current workspace</button>}
      </section>
    </div>}
  </div>;
}
