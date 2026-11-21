import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {useEffect, useRef, useState} from 'react';
import {SettingsRow} from '../components/SettingsPresentation';

type Status = {
  running: boolean;
  accessPath: string;
  address?: string;
  fingerprint?: string;
  hostId?: string;
  discoverable?: boolean;
  managementRevision?: number;
  addresses: string[];
  startup: boolean;
  startupError?: string;
  certificate?: {expiresAt: number; renewalFailed: boolean};
};
type Pairing = {id: string; name: string; code: string; expiresAt: string};
type Device = {id: string; name: string; workspace: string | null};
type Command =
  | {op: 'status' | 'stop' | 'pending' | 'devices' | 'pairingQr'}
  | {op: 'start'; address: string; recover?: boolean}
  | {op: 'startup' | 'discoverable'; enabled: boolean}
  | {op: 'watch'; host: string; revision: number}
  | {op: 'decide'; id: string; code: string; approve: boolean}
  | {op: 'grant'; id: string; allow: boolean}
  | {op: 'revoke'; id: string};

const call = <T,>(command: Command) => invoke<T>('hosting', {command});

export default function HostingSettings() {
  const [status, setStatus] = useState<Status>();
  const [address, setAddress] = useState('127.0.0.1');
  const [customAddress, setCustomAddress] = useState('');
  const [recover, setRecover] = useState(true);
  const [pending, setPending] = useState<Pairing[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [matched, setMatched] = useState<string>();
  const [revoking, setRevoking] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qr, setQr] = useState<{width: number; path: string; expires: number}>();
  const managementRevision = useRef(0);

  async function refresh(operation?: Command) {
    setBusy(true);
    setError('');
    try {
      if (operation) await call(operation);
      const next = await call<Status>({op: 'status'});
      managementRevision.current = next.managementRevision ?? 0;
      setStatus(next);
      const [requests, approved] = next.running
        ? await Promise.all([call<Pairing[]>({op: 'pending'}), call<Device[]>({op: 'devices'})])
        : [[], []];
      setPending(requests);
      setDevices(approved);
      setQr(undefined);
      setMatched(undefined);
      setRevoking(undefined);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const subscription = listen('next-host-status', () => void refresh());
    void refresh();
    return () => { void subscription.then(unlisten => unlisten()); };
  }, []);
  const host = status?.hostId;
  const listeningAddress = status?.address;
  useEffect(() => {
    if (!host || !listeningAddress) return;
    let active = true;
    void (async () => {
      while (active) {
        try {
          if (!await call<boolean>({op: 'watch', host, revision: managementRevision.current}) || !active) break;
          const next = await call<Status>({op: 'status'});
          if (!active) break;
          if (!next.running || next.hostId !== host) {
            setStatus(next);
            break;
          }
          const [requests, approved] = await Promise.all([call<Pairing[]>({op: 'pending'}), call<Device[]>({op: 'devices'})]);
          if (!active) break;
          managementRevision.current = next.managementRevision ?? managementRevision.current;
          setStatus(next);
          setPending(requests);
          setDevices(approved);
        } catch {
          break;
        }
      }
    })();
    return () => { active = false; };
  }, [host, listeningAddress]);
  useEffect(() => {
    if (!qr) return;
    const timer = setTimeout(() => setQr(undefined), Math.max(0, qr.expires * 1000 - Date.now()));
    return () => clearTimeout(timer);
  }, [qr]);

  return <section className="settings-section">
    <div className="settings-section-heading"><h3>Hosting</h3><span>This computer</span></div>
    {error && <p role="alert" className="settings-error">{error}</p>}
    {status?.startupError && <p role="alert" className="settings-error">{status.startupError}</p>}
    <SettingsRow label="HTTPS sharing" description={status?.running
      ? `Listening at https://${status.address}. Closing to the tray keeps hosting active.`
      : 'Sharing is off. On Windows, Vaultor sets up the host certificate when you start sharing.'}>
      <button type="button" className="settings-text-action" disabled={busy || !status}
        onClick={() => void refresh(status?.running ? {op: 'stop'} : {op: 'start', address: customAddress || `${address}:8443`, recover: recover && !customAddress && address !== '127.0.0.1'})}>
        {status?.running ? 'Stop hosting' : 'Start hosting'}
      </button>
    </SettingsRow>
    {!status?.running && <SettingsRow label="Listening address" description="Choose the private address your device can reach. This computer only keeps access local.">
      <select aria-label="Listening address" value={address} onChange={event => {
        setAddress(event.target.value);
        setCustomAddress('');
      }}>
        <option value="127.0.0.1">This computer only</option>
        {status?.addresses.map(ip => <option key={ip} value={ip}>{ip}</option>)}
      </select>
    </SettingsRow>}
    {!status?.running && address !== '127.0.0.1' && !customAddress &&
      <SettingsRow label="Recover address changes" description="Follow a single new address on the selected interface and subnet.">
        <input type="checkbox" aria-label="Recover address changes" checked={recover} onChange={event => setRecover(event.target.checked)} />
      </SettingsRow>}
    <SettingsRow label="Start hosting on launch" description="Resume sharing this workspace and address when Vaultor opens.">
      <button type="button" role="switch" className="settings-switch" aria-label="Start hosting on launch"
        aria-checked={status?.startup ?? false} disabled={busy || (!status?.running && !status?.startup)}
        onClick={() => void refresh({op: 'startup', enabled: !status?.startup})}><span /></button>
    </SettingsRow>
    {status && <details>
      <summary>Advanced hosting settings</summary>
      {!status.running && <SettingsRow label="Custom listening address" description="Specify an IP and port to override the address above.">
        <label className="settings-search"><input aria-label="Custom listening address" value={customAddress}
          onChange={event => setCustomAddress(event.target.value)} /></label>
      </SettingsRow>}
      <SettingsRow label="Certificate directory" description={status.accessPath}>{null}</SettingsRow>
    </details>}
    {status?.running && <>
      <SettingsRow label="Nearby discovery" description="Advertise this address on the selected private network.">
        <button type="button" role="switch" aria-label="Nearby discovery" className="settings-switch"
          aria-checked={status.discoverable ?? false} disabled={busy || status.address?.startsWith('127.')}
          onClick={() => void refresh({op: 'discoverable', enabled: !status.discoverable})}><span /></button>
      </SettingsRow>
      <SettingsRow label="Pair Android" description="Scan the code from Android Source management. Compare the separate approval code on both devices.">
        <button type="button" className="settings-text-action" onClick={() => {
          if (qr) setQr(undefined);
          else void call<NonNullable<typeof qr>>({op: 'pairingQr'}).then(setQr).catch(cause => setError(String(cause)));
        }}>{qr ? 'Hide QR' : 'Show QR'}</button>
      </SettingsRow>
      {qr && <svg role="img" aria-label="Android pairing QR code. Manual address and CA fingerprint are also available." viewBox={`0 0 ${qr.width} ${qr.width}`} width="224" height="224" shapeRendering="crispEdges">
        <rect width={qr.width} height={qr.width} fill="white" /><path d={qr.path} fill="black" />
      </svg>}
      <SettingsRow label="CA fingerprint (SHA-256)" description={status.fingerprint}>{null}</SettingsRow>
      {status.certificate && <SettingsRow label="Server certificate" description={status.certificate.renewalFailed
        ? 'Automatic renewal failed. Vaultor will retry while hosting is active.'
        : `Renews automatically before ${new Date(status.certificate.expiresAt * 1000).toLocaleDateString()}.`}>{null}</SettingsRow>}
      <SettingsRow label="Devices" description="Compare codes before approving a request, then grant access to this workspace.">
        <button type="button" className="settings-text-action" disabled={busy} onClick={() => void refresh()}>Refresh devices</button>
      </SettingsRow>
      {pending.map(request => <SettingsRow key={request.id} label={request.name} description={`Pairing code ${request.code}`}>
        <div className="next-recovery-actions">
          <label><input type="checkbox" checked={matched === request.id}
            onChange={event => setMatched(event.target.checked ? request.id : undefined)} /> Codes match</label>
          <button type="button" disabled={busy || matched !== request.id}
            onClick={() => void refresh({op: 'decide', id: request.id, code: request.code, approve: true})}>Approve</button>
          <button type="button" disabled={busy}
            onClick={() => void refresh({op: 'decide', id: request.id, code: request.code, approve: false})}>Reject</button>
        </div>
      </SettingsRow>)}
      {devices.map(device => <SettingsRow key={device.id} label={device.name}
        description={device.workspace ? 'Workspace grant recorded' : 'No workspace grant'}>
        <div className="next-recovery-actions">
          <button type="button" disabled={busy}
            onClick={() => void refresh({op: 'grant', id: device.id, allow: !device.workspace})}>
            {device.workspace ? 'Withdraw grant' : 'Grant access'}
          </button>
          {revoking === device.id ? <>
            <button type="button" disabled={busy} onClick={() => void refresh({op: 'revoke', id: device.id})}>Confirm revoke</button>
            <button type="button" onClick={() => setRevoking(undefined)}>Cancel</button>
          </> : <button type="button" disabled={busy} onClick={() => setRevoking(device.id)}>Revoke device</button>}
        </div>
      </SettingsRow>)}
    </>}
  </section>;
}
