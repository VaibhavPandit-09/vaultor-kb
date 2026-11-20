import {invoke} from '@tauri-apps/api/core';
import {useEffect, useState} from 'react';
import {SettingsRow} from '../components/SettingsPresentation';

type Status = {running: boolean; accessPath: string; address?: string; fingerprint?: string};
type Pairing = {id: string; name: string; code: string; expiresAt: string};
type Device = {id: string; name: string; workspace: string | null};
type Command =
  | {op: 'status' | 'stop' | 'pending' | 'devices'}
  | {op: 'start'; address: string}
  | {op: 'decide'; id: string; code: string; approve: boolean}
  | {op: 'grant'; id: string; allow: boolean}
  | {op: 'revoke'; id: string};

const call = <T,>(command: Command) => invoke<T>('hosting', {command});

export default function HostingSettings() {
  const [status, setStatus] = useState<Status>();
  const [address, setAddress] = useState('127.0.0.1:8443');
  const [pending, setPending] = useState<Pairing[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [matched, setMatched] = useState<string>();
  const [revoking, setRevoking] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh(operation?: Command) {
    setBusy(true);
    setError('');
    try {
      if (operation) await call(operation);
      const next = await call<Status>({op: 'status'});
      setStatus(next);
      const [requests, approved] = next.running
        ? await Promise.all([call<Pairing[]>({op: 'pending'}), call<Device[]>({op: 'devices'})])
        : [[], []];
      setPending(requests);
      setDevices(approved);
      setMatched(undefined);
      setRevoking(undefined);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return <section className="settings-section">
    <div className="settings-section-heading"><h3>Hosting</h3><span>This computer</span></div>
    {error && <p role="alert" className="settings-error">{error}</p>}
    <SettingsRow label="HTTPS sharing" description={status?.running
      ? `Listening at https://${status.address}. Closing to the tray keeps hosting active.`
      : 'Sharing is off. Start hosting explicitly after setting up a host certificate.'}>
      <button type="button" className="settings-text-action" disabled={busy || !status}
        onClick={() => void refresh(status?.running ? {op: 'stop'} : {op: 'start', address})}>
        {status?.running ? 'Stop hosting' : 'Start hosting'}
      </button>
    </SettingsRow>
    {!status?.running && <SettingsRow label="Listening address" description="Use this computer’s private IP address for LAN access.">
      <label className="settings-search"><input aria-label="Listening address" value={address}
        onChange={event => setAddress(event.target.value)} /></label>
    </SettingsRow>}
    {status && <SettingsRow label="Certificate directory" description={status.accessPath}>{null}</SettingsRow>}
    {status?.running && <>
      <SettingsRow label="CA fingerprint (SHA-256)" description={status.fingerprint}>{null}</SettingsRow>
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
