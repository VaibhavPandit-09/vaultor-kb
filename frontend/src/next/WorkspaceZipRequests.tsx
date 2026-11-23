import {useEffect, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {open} from '@tauri-apps/plugin-dialog';
import AppModal from '../components/modals/AppModal';
import {formatBytes, showTransfer} from './transfers';

type Request = {
  id: string;
  deviceName: string;
  createdAt: string;
  input: {name: string; filename: string; bytes: number};
  state: string;
  destination?: string;
  preview?: {resources: number; collections: number; files: number; linkedDescriptors: number; partial: boolean};
};

const labels: Record<string, string> = {
  AWAITING_OWNER: 'Ready for review',
  PREVIEWED: 'Verified and awaiting your decision',
  APPROVED: 'Authorized · restore pending',
  SUCCEEDED: 'New workspace available',
  FAILED: 'Could not verify or restore the backup',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled by the device',
  EXPIRED: 'Review window expired',
};

const owner = (action: string, id?: string, destination?: string) =>
  invoke('hosting', {command: {op: 'workspaceZip', action, id, destination}});

export default function WorkspaceZipRequests({close}: {close: () => void}) {
  const [rows, setRows] = useState<Request[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const result = await owner('list') as Request[];
        if (live) {setRows(result); setLoaded(true);}
      } catch (error) {
        if (live) {setProblem(String(error)); setLoaded(true);}
      } finally {running = false;}
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 2500);
    return () => {live = false; clearInterval(interval);};
  }, []);

  async function act(action: string, row: Request) {
    setBusy(true);
    setProblem('');
    try {
      let destination: string | undefined;
      if (action === 'approve' && row.state === 'PREVIEWED') {
        const parent = await open({directory: true, multiple: false, title: 'Choose where to create the independent workspace'});
        if (typeof parent !== 'string') return;
        const name = row.input.name.replace(/[<>:"/\\|?*]/g, ' ').trim().slice(0, 80);
        destination = parent.replace(/[\\/]$/, '') + '/' + (name || 'Restored workspace') + ' ' + row.id.slice(0, 8);
      }
      const updated = await owner(action, row.id, destination) as Request;
      setRows(current => current.map(item => item.id === updated.id ? updated : item));
    } catch (error) {
      setProblem(String(error));
    } finally {
      setBusy(false);
    }
  }
  return <AppModal open title="Incoming workspace backups" onClose={close}
    description="Review a backup before creating an independent workspace. Existing workspaces and linked originals stay in place.">
    {!loaded && <p role="status">Loading backup requests…</p>}
    {loaded && !rows.length && !problem && <p>No incoming backup requests.</p>}
    {problem && <p role="alert">{problem}</p>}
    <div className="next-import-review">{rows.map(row => <section key={row.id}>
      <strong>{row.input.name}</strong>
      <p>{row.input.filename} · {formatBytes(row.input.bytes)} · {row.deviceName}</p>
      <p>{new Date(row.createdAt).toLocaleString()} · {labels[row.state] ?? 'Request unavailable'}</p>
      {row.preview && <p>{row.preview.resources} resources · {row.preview.files} originals · {row.preview.collections} collections · {row.preview.linkedDescriptors} inactive linked references{row.preview.partial ? ' · Selected package' : ''}</p>}
      <div className="next-recovery-actions">
        {row.state === 'AWAITING_OWNER' && <button disabled={busy} onClick={() => void act('preview', row)}>Review backup</button>}
        {['AWAITING_OWNER', 'PREVIEWED'].includes(row.state) && <button disabled={busy} onClick={() => void act('reject', row)}>Reject request</button>}
        {row.state === 'PREVIEWED' && <button disabled={busy} onClick={() => void act('approve', row)}>Create new workspace…</button>}
        {row.state === 'APPROVED' && <button disabled={busy} onClick={() => void act('approve', row)}>Resume authorized restore</button>}
        {row.state === 'SUCCEEDED' && row.destination && <button disabled={busy} onClick={() => {
          void invoke('hosting', {command:{op:'stop'}}).then(() => {
            close();
            showTransfer({op:'open', path:row.destination});
          }).catch(error => setProblem(String(error)));
        }}>Stop sharing and open restored workspace</button>}
      </div>
    </section>)}</div>
  </AppModal>;
}
