export type ImportItem = {
  id: string;
  filename: string;
  mime: string;
  bytes: number;
  sha256?: string;
  mode?: 'original' | 'text' | 'markdown' | 'workspaceZip';
  state: string;
  detail: string;
  createdAt?: number;
  attempted?: boolean;
  rejectionCode?: string;
  submitted?: boolean;
  source?: {
    hostId: string;
    workspaceId: string;
    generation: string;
    label?: string;
  };
  receipt?: { warnings?: string[] };
};
export const importPending = (rows: ImportItem[]) =>
  rows.filter(r => !['acknowledged', 'cancelled'].includes(r.state)).length;
export const importState = (state: string) =>
  ({
    acquiring: 'Collecting original bytes',
    collected: 'Choose destination',
    queued: 'Queued on this device',
    sending: 'Delivery in progress',
    unknown: 'Delivery unconfirmed',
    waitingOwner: 'Awaiting host owner',
    acknowledged: 'Host acknowledgment verified',
    needsAttention: 'Needs attention',
    stoppedUncertain: 'Stopped · outcome unconfirmed',
    cancelled: 'Cancelled before dispatch',
    acquisitionInterrupted: 'Acquisition incomplete',
  }[state] ?? state);
