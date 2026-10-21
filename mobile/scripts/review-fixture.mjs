// Disposable R6 host only. Never writes owner credentials or personal workspace data.
import { OwnedServer } from '../../desktop/src/owned-server.mjs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
process.env.HOST_NETWORK_PORT = '0';
const root = await mkdtemp(join(tmpdir(), 'vaultor-r6-review-'));
const owned = new OwnedServer({
  bundle: fileURLToPath(new URL('../cache/r6-host-bundle/', import.meta.url)),
  data: join(root, 'data'),
});
async function api(path, method = 'GET', body, workspace, revision) {
  const r = await fetch(owned.address + '/api' + path, {
    method,
    headers: {
      'X-Vaultor-Owner': owned.accessKey,
      'X-Vaultor-Protocol': '3',
      ...(workspace ? { 'X-Vaultor-Workspace': workspace } : {}),
      ...(revision ? { 'If-Match': '"' + revision + '"' } : {}),
      ...(body && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok)
    throw Error('Disposable review fixture request failed: ' + r.status);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
try {
  await owned.start();
  const sharing = await api('/owner/sharing', 'PUT', { enabled: true });
  const identity = await api('/workspace/identity');
  const original = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'R6 immutable source evidence for controlled delivery tests.',
          },
        ],
      },
    ],
  };
  const note = await api('/resources', 'POST', {
    title: 'R6 Review fixture',
    content: original,
  });
  const secondId = randomUUID();
  await api('/owner/workspaces/' + secondId, 'PUT', {
    name: 'R6 isolated workspace',
  });
  const form = new FormData();
  form.set('title', 'R6 equal-ID other source');
  form.set('content', JSON.stringify(original));
  await api('/resources/imports/' + note.id, 'PUT', form, secondId);
  const second = await api('/workspace/identity', 'GET', undefined, secondId);
  let saved = await api('/resources/' + note.id);
  const otherOriginal = await api(
    '/resources/' + note.id,
    'GET',
    undefined,
    secondId,
  );
  const descriptor = {
    address: `https://127.0.0.1:${sharing.port}`,
    port: sharing.port,
    hostId: owned.hostId,
    identity,
    second,
    noteId: note.id,
    revision: saved.revision,
    root,
  };
  await writeFile(
    new URL('../cache/r6-review-fixture.json', import.meta.url),
    JSON.stringify(descriptor),
  );
  console.log(
    JSON.stringify({
      ready: true,
      address: descriptor.address,
      noteId: note.id,
    }),
  );
  const lines = createInterface({ input: process.stdin, terminal: false });
  for await (const line of lines) {
    try {
      const command = JSON.parse(line);
      if (command.stop) break;
      if (command.approve) {
        if (!/^[0-9]{6}$/.test(command.approve))
          throw Error('Invalid comparison code');
        const pairing = (await api('/owner/pairings')).find(
          p => p.code === command.approve && p.name === 'Vaultor Android',
        );
        if (!pairing) throw Error('No matching disposable Android enrollment');
        await api('/owner/pairings/' + pairing.id + '/approve', 'POST', {
          code: command.approve,
        });
        for (const device of await api('/owner/devices'))
          if (device.name === 'Vaultor Android')
            await api('/owner/workspaces/' + secondId + '/grants', 'PUT', {
              deviceId: device.id,
              allowed: true,
            });
        console.log(
          'Matching disposable code approved; both fixture workspaces granted',
        );
      }
      if (command.status) {
        const page = await api('/reviews?status=all&page=0&size=100');
        for (const row of page.items)
          await api(
            '/reviews/' + row.id + '/status',
            'PATCH',
            { generation: identity.generation, status: command.status },
            identity.id,
            row.revision,
          );
        console.log(
          JSON.stringify({
            updated: page.items.length,
            status: command.status,
          }),
        );
      }
      if (command.edit) {
        const content = {
          ...original,
          content: [
            ...original.content,
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Explicit desktop correction; mobile evidence remains frozen.',
                },
              ],
            },
          ],
        };
        await api(
          '/resources/' + note.id + '/note',
          'PUT',
          { title: saved.title, content },
          identity.id,
          saved.revision,
        );
        saved = await api('/resources/' + note.id);
        console.log(
          'Disposable desktop correction saved with original validator',
        );
      }
      if (command.conflictId) {
        if (!/^[a-f0-9-]{36}$/.test(command.conflictId))
          throw Error('Invalid synthetic Review UUID');
        await api('/reviews/' + command.conflictId, 'PUT', {
          generation: identity.generation,
          resourceId: note.id,
          comment: 'Different preexisting host intent',
          quote: '',
          context: '',
          locator: { kind: 'resource' },
          baseRevision: saved.revision,
        });
        console.log(
          'Distinct synthetic host intent created under the test UUID',
        );
      }
      if (command.verify) {
        const current = await api('/resources/' + note.id);
        const otherCurrent = await api(
          '/resources/' + note.id,
          'GET',
          undefined,
          secondId,
        );
        if (
          otherCurrent.revision !== otherOriginal.revision ||
          JSON.stringify(otherCurrent.content) !==
            JSON.stringify(otherOriginal.content)
        )
          throw Error('Other workspace original changed');
        const reviews = await api('/reviews?status=all&page=0&size=100');
        const other = await api(
          '/reviews?status=all&page=0&size=100',
          'GET',
          undefined,
          secondId,
        );
        if (
          JSON.stringify(current.content) !== JSON.stringify(saved.content) ||
          current.revision !== saved.revision
        )
          throw Error('Original resource changed');
        console.log(
          JSON.stringify({
            originalsUnchanged: true,
            reviews: reviews.totalItems,
            otherWorkspaceReviews: other.totalItems,
            statuses: reviews.items.map(r => r.status),
          }),
        );
      }
      if (command.revoke) {
        for (const device of await api('/owner/devices'))
          if (device.name === 'Vaultor Android')
            await api('/owner/devices/' + device.id, 'DELETE');
        console.log('Disposable Android approvals revoked');
      }
      if (command.grantDefault !== undefined) {
        for (const device of await api('/owner/devices'))
          if (device.name === 'Vaultor Android')
            await api('/owner/workspaces/' + identity.id + '/grants', 'PUT', {
              deviceId: device.id,
              allowed: !!command.grantDefault,
            });
        console.log('Disposable default grant updated');
      }
    } catch (e) {
      console.log('Fixture command refused: ' + e.message);
    }
  }
} finally {
  await owned.stop();
}
