// Disposable R6 host only. Never writes owner credentials or personal workspace data.
import { OwnedServer } from '../../desktop/src/owned-server.mjs';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
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
  for (let attempt = 0; attempt < 200; attempt++) {
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
        body instanceof FormData
          ? body
          : body
          ? JSON.stringify(body)
          : undefined,
    });
    // Only explicit pre-mutation maintenance admission is retryable.
    if (
      r.status === 409 &&
      (await r.clone().json()).code === 'WORKSPACE_BUSY'
    ) {
      await new Promise(resolve => setTimeout(resolve, 25));
      continue;
    }
    if (!r.ok)
      throw Error('Disposable review fixture request failed: ' + r.status);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }
  throw Error('Disposable review fixture maintenance did not settle');
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
  const linked = note;
  let readerFixture;
  if (process.env.VAULTOR_READER_FIXTURE === '1') {
    const upload = async (name, mime) => {
      const id = randomUUID(),
        form = new FormData();
      form.set('title', name);
      form.set(
        'file',
        new Blob(
          [
            await readFile(
              new URL('../cache/reader-fixture/' + name, import.meta.url),
            ),
          ],
          { type: mime },
        ),
        name,
      );
      return await api('/resources/imports/' + id, 'PUT', form);
    };
    const image1 = await upload('image-1.png', 'image/png'),
      image2 = await upload('image-2.png', 'image/png'),
      pdf = await upload('reading.pdf', 'application/pdf'),
      locked = await upload('locked.pdf', 'application/pdf');
    const text = t => ({ type: 'text', text: t }),
      para = t => ({ type: 'paragraph', content: [text(t)] }),
      heading = t => ({
        type: 'heading',
        attrs: { level: 2 },
        content: [text(t)],
      }),
      resource = r => ({
        type: 'paragraph',
        content: [
          {
            type: 'resourceLink',
            attrs: { resourceId: r.id, label: r.title, type: r.type },
          },
        ],
      });
    const rich = {
      type: 'doc',
      content: [
        heading('A quieter place to read'),
        para(
          'A phone reader should give the words room to breathe. Select any text to copy it; originals are unchanged.',
        ),
        {
          type: 'paragraph',
          content: [
            text('Find a phrase across '),
            { ...text('bold marks'), marks: [{ type: 'bold' }] },
            text(' without editing the document.'),
          ],
        },
        {
          type: 'blockquote',
          content: [
            para('The best interface disappears while you are reading.'),
          ],
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [para('A completed read-only task')],
            },
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [para('An unchecked read-only task')],
            },
          ],
        },
        heading('Original images'),
        ...[image1, image2].map((r, i) => ({
          type: 'image',
          attrs: {
            resourceId: r.id,
            alt: 'Grid image ' + (i + 1),
            caption: 'Original colors and pixels ' + (i + 1),
            width: 100,
            alignment: 'center',
          },
        })),
        heading('Wide tables and code'),
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: Array.from({ length: 8 }, (_, i) => ({
                type: 'tableHeader',
                content: [para('Column ' + (i + 1))],
              })),
            },
            ...Array.from({ length: 5 }, (_, row) => ({
              type: 'tableRow',
              content: Array.from({ length: 8 }, (_, i) => ({
                type: 'tableCell',
                content: [para('Value ' + row + ' / ' + i)],
              })),
            })),
          ],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [
            text(
              'const reading = { mode: "read only", originalBytes: "preserved", sourceWorkspace: "explicit", comfortableMeasure: true };\n'.repeat(
                8,
              ),
            ),
          ],
        },
        heading('Documents'),
        resource(pdf),
        resource(locked),
        {
          type: 'paragraph',
          content: [
            {
              ...text('Visit example.com'),
              marks: [
                {
                  type: 'link',
                  attrs: { href: 'https://example.com/reading' },
                },
              ],
            },
          ],
        },
        resource(linked),
        heading('A long passage'),
        ...Array.from({ length: 35 }, (_, i) =>
          para(
            'Paragraph ' +
              (i + 1) +
              '. Keep your place across journeys, app backgrounding and device rotation. We read saved documents without changing their meaning.',
          ),
        ),
        heading('The end'),
        para(
          'Find this final sentence and return to the beginning using the outline.',
        ),
      ],
    };
    const note = await api('/resources', 'POST', {
      title: 'R2 Rich reading',
      content: rich,
    });
    readerFixture = {
      noteId: note.id,
      image1: image1.id,
      image2: image2.id,
      pdf: pdf.id,
      locked: locked.id,
      revision: note.revision,
    };
  }
  const readerSaved = readerFixture
    ? await api('/resources/' + readerFixture.noteId)
    : undefined;
  const descriptor = {
    address: `https://127.0.0.1:${sharing.port}`,
    port: sharing.port,
    hostId: owned.hostId,
    identity,
    second,
    noteId: note.id,
    revision: saved.revision,
    root,
    readerFixture,
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
        if (readerSaved) {
          const currentReader = await api('/resources/' + readerSaved.id);
          if (
            currentReader.revision !== readerSaved.revision ||
            JSON.stringify(currentReader.content) !==
              JSON.stringify(readerSaved.content)
          )
            throw Error('Reader original changed');
        }
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
