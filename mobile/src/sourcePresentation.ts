import type { WorkspaceState } from './workspace';

// Display names never participate in routing. Full source scope remains native-owned.
export function sourcePresentation(state: WorkspaceState) {
  const name = state.workspaces?.find(
    w => w.id === state.host?.workspaceId,
  )?.name;
  const workspace =
    name || (state.host?.workspaceId ? 'Workspace' : 'Choose a source');
  const availability =
    state.connection === 'revoked'
      ? 'Approval required'
      : state.downloaded
      ? 'Downloaded · offline'
      : state.connection === 'online'
      ? 'Connected'
      : state.connection === 'connecting'
      ? 'Connecting…'
      : state.note
      ? 'Cached reading copy'
      : 'Host unavailable';
  return { workspace, host: state.host?.address ?? '', availability };
}

export function activatedSource(
  state: WorkspaceState,
  target: { hostId: string; workspaceId?: string } | { scope: string },
) {
  if ('scope' in target)
    return (
      state.scope === target.scope &&
      state.downloaded === true &&
      state.localOnly === true &&
      state.connection !== 'revoked' &&
      !state.error
    );
  let identityMatches = false;
  try {
    const parts: unknown = JSON.parse(state.scope);
    identityMatches =
      Array.isArray(parts) &&
      parts.length === 3 &&
      parts[0] === target.hostId &&
      parts[1] === state.host?.workspaceId &&
      typeof parts[2] === 'string' &&
      parts[2].length > 0;
  } catch {}
  return (
    state.host?.hostId === target.hostId &&
    (!target.workspaceId || state.host.workspaceId === target.workspaceId) &&
    state.connection === 'online' &&
    !state.localOnly &&
    identityMatches &&
    !state.error
  );
}
