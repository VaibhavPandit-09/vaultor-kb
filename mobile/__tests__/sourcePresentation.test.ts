import { activatedSource, sourcePresentation } from '../src/sourcePresentation';
import { MobileWorkspace } from '../src/workspace';
import type { Port } from '../src/workspace';

const base = () => ({
  ...new MobileWorkspace({} as Port).snapshot(),
  host: { hostId: 'h', workspaceId: 'w', address: 'https://host', epoch: '1' },
  scope: JSON.stringify(['h', 'w', 'g']),
  connection: 'online' as const,
  workspaces: [
    { id: 'w', name: 'Shared name' },
    { id: 'other', name: 'Shared name' },
  ],
});

test('labels separate workspace, host and reading availability', () => {
  const state = base();
  expect(sourcePresentation(state)).toEqual({
    workspace: 'Shared name',
    host: 'https://host',
    availability: 'Connected',
  });
  expect(
    sourcePresentation({ ...state, connection: 'offline', downloaded: true })
      .availability,
  ).toBe('Downloaded · offline');
  expect(
    sourcePresentation({ ...state, connection: 'revoked', downloaded: true })
      .availability,
  ).toBe('Approval required');
});
test('online and exact native identity must be verified before activation confirmation', () => {
  const state = base(),
    target = { hostId: 'h', workspaceId: 'w' };
  expect(activatedSource(state, target)).toBe(true);
  for (const delta of [
    { connection: 'offline' as const },
    { error: 'Refused' },
    { scope: JSON.stringify(['foreign', 'w', 'g']) },
    { localOnly: true },
  ])
    expect(activatedSource({ ...state, ...delta }, target)).toBe(false);
  expect(activatedSource(state, { hostId: 'h', workspaceId: 'other' })).toBe(
    false,
  );
});
test('download activation never treats same IDs in a different generation as success', () => {
  const state = {
    ...base(),
    downloaded: true,
    localOnly: true,
    connection: 'offline' as const,
  };
  expect(activatedSource(state, { scope: state.scope })).toBe(true);
  expect(
    activatedSource(state, { scope: JSON.stringify(['h', 'w', 'old']) }),
  ).toBe(false);
  expect(
    activatedSource(
      { ...state, connection: 'revoked' },
      { scope: state.scope },
    ),
  ).toBe(false);
  expect(
    activatedSource(
      { ...state, error: 'Storage unavailable' },
      { scope: state.scope },
    ),
  ).toBe(false);
});
