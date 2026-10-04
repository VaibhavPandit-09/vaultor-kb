import { useEffect, useRef, useState } from 'react';
import { Copy, FileDown, Globe, RefreshCw, ShieldCheck, Wifi } from 'lucide-react';
import { unwrap, type PairInspection, type NearbyHosts, type HostDevices, type SharingStatus } from '../lib/desktop';

export function NearbyConnections({ disabled, onPaired }: { disabled: boolean; onPaired: (id: string) => void }) {
  const bridge = window.vaultorDesktop!;
  const [nearby, setNearby] = useState<NearbyHosts>({ items: [], error: '' });
  const [name, setName] = useState(''), [address, setAddress] = useState('https://'), [inspection, setInspection] = useState<PairInspection | null>(null);
  const [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [waiting, setWaiting] = useState(false);
  const alive = useRef(true), running = useRef(false), serial = useRef(0);
  useEffect(() => {
    alive.current = true; let active = true;
    const refresh = () => { void bridge.nearby?.(true).then(unwrap).then(value => { if (active) setNearby(value); }).catch(e => { if (active) setNearby({ items: [], error: e.message }); }); };
    refresh(); const timer = setInterval(refresh, 3000);
    return () => { active = false; alive.current = false; clearInterval(timer); void bridge.nearby?.(false); void bridge.pairCancel?.(); };
  }, [bridge]);
  async function work(task: () => Promise<void>) {
    if (running.current || disabled) return; running.current = true; setBusy(true); setError('');
    try { await task(); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Connection failed. Retry.'); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => {
    if (!waiting || !inspection || !bridge.pairStatus) return;
    let active = true, polling = false;
    const poll = async () => {
      if (polling || running.current) return; polling = true;
      try {
        const result = unwrap(await bridge.pairStatus!(inspection.id));
        if (!active || !alive.current) return;
        if (result.state === 'APPROVED' && result.profileId) { setWaiting(false); setInspection(null); setCode(''); onPaired(result.profileId); }
        else if (result.state === 'REJECTED') { setWaiting(false); setError('The host declined this request. Start again after checking both devices.'); }
      } catch (e) { if (active) { setWaiting(false); setError(e instanceof Error ? e.message : 'Cannot check approval. Retry.'); } }
      finally { polling = false; }
    };
    void poll(); const timer = setInterval(() => void poll(), 2000);
    return () => { active = false; clearInterval(timer); };
  }, [waiting, inspection, bridge, onPaired]);
  return <div className="space-y-3">
    {!inspection && <>
      <div className="flex items-center gap-2 text-sm"><Wifi size={15}/><h2 className="font-medium">Nearby</h2></div>
      {nearby.items.length === 0 && <p className="text-xs text-[var(--text-secondary)]">No hosts found yet. Enable sharing on the other computer, or enter its address below.</p>}
      {nearby.error && <p role="status" className="text-xs">{nearby.error}</p>}
      <div className="space-y-1">{nearby.items.map(item => <button className="library-button w-full text-left text-sm" disabled={disabled || busy} key={item.hostId + item.address} onClick={() => { setName(item.name); setAddress(item.address); }}><span>{item.name}</span><small className="block text-[var(--text-tertiary)]">{item.address}</small></button>)}</div>
      <form className="space-y-2" onSubmit={event => { event.preventDefault(); if ((event.nativeEvent as SubmitEvent & { isComposing?: boolean }).isComposing) return; const attempt = ++serial.current; void work(async () => { const value = unwrap(await bridge.pairInspect!({ name, address })); if (alive.current && attempt === serial.current) setInspection(value); }); }}>
        <label className="block text-xs">Connection name<input className="block w-full rounded-lg border border-border bg-background p-2 mt-1" value={name} maxLength={100} required onChange={e => setName(e.target.value)}/></label>
        <label className="block text-xs">Private HTTPS address<input className="block w-full rounded-lg border border-border bg-background p-2 mt-1" value={address} required placeholder="https://192.168.1.20:8443" onChange={e => setAddress(e.target.value)}/></label>
        <button className="library-button" disabled={disabled || busy || !name.trim()}>{busy ? 'Checking…' : 'Connect & pair'}</button>
      </form>
    </>}
    {inspection && <section className="rounded-xl border border-border bg-background p-3 space-y-3">
      <h2 className="font-medium flex gap-2 items-center"><ShieldCheck size={17}/>{inspection.name}</h2>
      <p className="text-xs text-[var(--text-secondary)]">{inspection.address}</p>
      {!code ? <><p className="text-sm">Request access, then compare the six-digit code on both computers before the host approves.</p><button className="library-button" disabled={busy || disabled} onClick={() => void work(async () => { const value = unwrap(await bridge.pairEnroll!(inspection.id)); setCode(value.code); setWaiting(true); })}>{busy ? 'Requesting…' : 'Request approval'}</button></> : <><p className="text-xs">Compare with the host’s Hosting → Devices request:</p><p className="text-3xl font-semibold tracking-[.35em]" aria-label={'Verification code ' + code}>{code}</p><p role="status" className="text-sm">{waiting ? 'Waiting for host approval…' : 'Approval check paused.'}</p>{!waiting && <button className="library-button" disabled={busy || disabled} onClick={() => { setError(''); setWaiting(true); }}>Retry approval check</button>}</>}
      <details className="text-xs"><summary>Host identity</summary><p className="break-all mt-2">{inspection.hostId}<br/>SHA-256 {inspection.fingerprint}</p><p className="mt-1">Do not approve a code you cannot compare on the host. A changed certificate requires a new explicit pairing.</p></details>
      <button className="text-sm underline" disabled={busy || disabled} onClick={() => { serial.current++; setWaiting(false); setCode(''); setInspection(null); void bridge.pairCancel?.(); }}>Cancel / start again</button>
    </section>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
  </div>;
}

export function HostControls({ disabled }: { disabled: boolean }) {
  const bridge = window.vaultorDesktop!;
  const [sharing, setSharing] = useState<SharingStatus>(), [devices, setDevices] = useState<HostDevices>();
  const [error, setError] = useState(''), [feedback, setFeedback] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState('');
  const running = useRef(false);
  async function refresh() { setSharing(unwrap(await bridge.sharing!())); setDevices(unwrap(await bridge.devices!())); }
  useEffect(() => { let active = true; const refresh = () => { void bridge.sharing!().then(unwrap).then(value => { if (active) setSharing(value); }).catch(e => { if (active) setError(e.message); }); void bridge.devices!().then(unwrap).then(value => { if (active) setDevices(value); }).catch(e => { if (active) setError(e.message); }); }; refresh(); const timer = setInterval(refresh, 10000); return () => { active = false; clearInterval(timer); }; }, [bridge]);
  async function work(task: () => Promise<void>) {
    if (running.current || disabled) return; running.current = true; setBusy(true); setError(''); setFeedback('');
    try { await task(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Host action failed. Retry.'); } finally { running.current = false; setBusy(false); }
  }
  return <div className="space-y-4 text-sm">
    <label className="flex items-center gap-2"><input type="checkbox" disabled={disabled || busy || !sharing} checked={sharing?.enabled ?? false} onChange={e => { const enabled = e.target.checked; void work(async () => { setSharing(unwrap(await bridge.sharing!(enabled))); }); }}/><span>Share this computer on the private network</span></label>
    <p className="text-xs text-[var(--text-secondary)]">Only approved devices can open the workspace. Hosting continues while you use another server.</p>
    {sharing?.listening && <div className="space-y-2">{sharing.addresses.length === 0 && <p>No private IPv4 address found. Check Wi-Fi or Ethernet.</p>}{sharing.addresses.map(address => <div className="flex items-center gap-2" key={address}><code className="text-xs truncate flex-1">{address}</code><button title="Copy browser address" aria-label="Copy browser address" disabled={busy || disabled} onClick={() => void work(async () => { unwrap(await bridge.writeClipboard(address)); setFeedback('Address copied.'); })}><Copy size={15}/></button><button title="Open browser access" aria-label="Open browser access" disabled={busy || disabled} onClick={() => void work(async () => { unwrap(await bridge.openSharedBrowser!(address)); })}><Globe size={15}/></button></div>)}</div>}
    <details><summary className="cursor-pointer">Browser trust & connection help</summary><div className="mt-2 space-y-2 text-xs text-[var(--text-secondary)]"><p className="break-all">Host {sharing?.hostId}<br/>SHA-256 {sharing?.fingerprint}</p><p>Export this host’s public certificate and transfer it to each browser client over a channel you trust. Compare its SHA-256 fingerprint with the host identity before installing it.</p><p>Windows: open certmgr.msc → Trusted Root Certification Authorities → Certificates → Import. macOS: Keychain Access → login keychain → import certificate → Trust → Always Trust for SSL. Restart the browser, open the shared address, and request device approval.</p><p>To remove trust, delete only this Vaultor host certificate from that same certificate store. Revoke the device below separately. Never bypass browser certificate warnings.</p><button className="library-button flex items-center gap-2" disabled={busy || disabled} onClick={() => void work(async () => { const outcome = unwrap(await bridge.certificate!()); setFeedback(outcome === 'saved' ? 'Public certificate saved.' : 'Save cancelled.'); })}><FileDown size={14}/>Export public certificate</button><p>Allow Vaultor’s bundled Java on Private networks in Windows Firewall, or allow incoming connections on macOS. HTTPS uses port {sharing?.port || 8443}; Nearby uses UDP 5353. Guest Wi-Fi/client isolation can block both. Manual addresses work when multicast discovery is unavailable.</p><button className="library-button" disabled={busy || disabled} onClick={() => void work(async () => { unwrap(await bridge.renewTrust!()); setFeedback('Address certificate refreshed; existing approvals retained.'); })}>Refresh address certificate</button></div></details>
    <section><div className="flex items-center justify-between"><h2 className="font-medium">Devices</h2><button aria-label="Refresh devices" title="Refresh devices" disabled={busy || disabled} onClick={() => void work(async () => {})}><RefreshCw size={15}/></button></div>
      {devices?.requests.map(request => <form key={request.id} className="mt-2 rounded-lg border border-border p-3 space-y-2" onSubmit={event => { event.preventDefault(); const input = event.currentTarget.elements.namedItem('match') as HTMLInputElement; if (!input.checked || (event.nativeEvent as SubmitEvent & { isComposing?: boolean }).isComposing) return; void work(async () => { unwrap(await bridge.decision!({ id: request.id, code: request.code, approve: true })); }); }}><p>{request.name} · {request.kind}</p><p className="text-xl tracking-widest">{request.code}</p><label className="flex gap-2 items-center text-xs"><input name="match" type="checkbox" required/>I compared the codes on both devices; they match</label><div className="flex gap-2"><button className="library-button" disabled={busy || disabled}>Approve</button><button type="button" className="library-button" disabled={busy || disabled} onClick={() => void work(async () => { unwrap(await bridge.decision!({ id: request.id, code: request.code, approve: false })); })}>Reject</button></div></form>)}
      {devices?.devices.map(device => <div key={device.id} className="mt-2 flex items-center gap-3 rounded-lg border border-border p-2"><span className="min-w-0 flex-1 truncate">{device.name}<small className="block text-[var(--text-secondary)]">{device.kind}</small></span>{confirm === device.id ? <><button disabled={busy || disabled} className="text-red-400" onClick={() => void work(async () => { unwrap(await bridge.revoke!(device.id)); setConfirm(''); })}>Confirm revoke</button><button disabled={busy || disabled} onClick={() => setConfirm('')}>Cancel</button></> : <button disabled={busy || disabled} className="text-xs underline" onClick={() => setConfirm(device.id)}>Revoke</button>}</div>)}
      {devices?.stopped ? <p className="mt-2 text-xs text-[var(--text-secondary)]">Start the local host to view approved devices.</p> : devices?.devices.length === 0 && devices.requests.length === 0 && <p className="mt-2 text-xs text-[var(--text-secondary)]">No paired devices.</p>}
    </section>
    {feedback && <p role="status" className="text-xs">{feedback}</p>}{error && <p role="alert" className="text-red-400">{error}</p>}
  </div>;
}
