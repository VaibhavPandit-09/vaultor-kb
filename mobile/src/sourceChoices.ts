import type { WorkspaceState } from './workspace';
export type SourceChoice = {
  key: string;
  name: string;
  status: string;
  current?: boolean;
  locked?: boolean;
  scope?: string;
  hostId: string;
  workspaceId?: string;
};
/** Display names never route activation. Retained generations remain separate. */
export function sourceChoices(
  state: WorkspaceState,
  jobs: any[],
  currentName: string,
): SourceChoice[] {
  const rows: SourceChoice[] = [];
  if (state.host)
    rows.push({
      key: state.scope,
      name: currentName,
      status: state.downloaded
        ? 'Offline · downloaded'
        : state.connection === 'online'
        ? 'Connected'
        : 'Connection unavailable',
      current: true,
      hostId: state.host.hostId,
      workspaceId: state.host.workspaceId,
    });
  for (const job of jobs) {
    try {
      const identity = JSON.parse(job.scope);
      if (
        !Array.isArray(identity) ||
        identity.length !== 3 ||
        !identity.every(v => typeof v === 'string' && v.length)
      )
        continue;
      const [hostId, workspaceId] = identity;
      if (job.scope === state.scope) continue;
      if (rows.some(r => r.scope === job.scope)) continue;
      rows.push({
        key: job.scope,
        scope: job.scope,
        hostId,
        workspaceId,
        name: job.name || 'Downloaded source',
        status:
          job.locked === '1'
            ? 'Locked · approval required'
            : 'Available offline',
        locked: job.locked === '1',
      });
    } catch {
      /* Malformed display inventory cannot become an activation target. */
    }
  }
  for (const w of state.workspaces ?? []) {
    if (!state.host || w.id === state.host.workspaceId) continue;
    // Online admission rechecks generation; do not pretend a retained generation is current.
    rows.push({
      key: `online:${state.host.hostId}:${w.id}`,
      name: w.name,
      status:
        state.connection === 'online' ? 'On connected host' : 'Connect to open',
      hostId: state.host.hostId,
      workspaceId: w.id,
    });
  }
  for (const [index, h] of state.hosts.entries()) {
    if (h.hostId === state.host?.hostId) continue;
    rows.push({
      key: `host:${h.hostId}`,
      name: `Saved connection ${index + 1}`,
      status: 'Connect to inspect sources',
      hostId: h.hostId,
      workspaceId: h.workspaceId,
    });
  }
  return rows.map(row => {
    if (rows.filter(other => other.name === row.name).length < 2) return row;
    const host = state.hosts.find(h => h.hostId === row.hostId);
    let generation = '';
    try {
      generation = JSON.parse(row.scope || state.scope)[2]?.slice(0, 8) || '';
    } catch {}
    return {
      ...row,
      status: [row.status, host?.address || 'Retained host', generation]
        .filter(Boolean)
        .join(' · '),
    };
  });
}
