import { sourceChoices } from '../src/sourceChoices';
import type { WorkspaceState } from '../src/workspace';
const scope = JSON.stringify(['h', 'w', 'g1']);
const state = {
  scope,
  host: { hostId: 'h', workspaceId: 'w' },
  hosts: [],
  connection: 'offline',
  downloaded: true,
} as unknown as WorkspaceState;
test('current identity and retained generations stay distinct without a duplicate current download', () => {
  const jobs = [
    { scope, name: 'Reading' },
    { scope: JSON.stringify(['h', 'w', 'g2']), name: 'Reading', locked: '1' },
  ];
  const rows = sourceChoices(state, jobs, 'Reading');
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({
    current: true,
    status: 'Offline · downloaded',
  });
  expect(rows[1]).toMatchObject({ scope: jobs[1].scope, locked: true });
});
test('malformed inventories never become selectable routes; another host remains independent', () => {
  const rows = sourceChoices(
    {
      ...state,
      hosts: [
        {
          hostId: 'other',
          workspaceId: 'w',
          address: 'https://private.example',
        },
      ],
    },
    [{ scope: '[]' }, { scope: 'broken' }],
    'Reading',
  );
  expect(rows).toHaveLength(2);
  expect(rows[1]).toMatchObject({
    hostId: 'other',
    name: 'Saved connection 1',
  });
  expect(JSON.stringify(rows)).not.toContain('private.example');
});
