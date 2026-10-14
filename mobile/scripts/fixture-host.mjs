import { OwnedServer } from '../../desktop/src/owned-server.mjs';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { randomUUID, createHash } from 'node:crypto';
process.env.HOST_NETWORK_PORT = '0';
const root = await mkdtemp(join(tmpdir(), 'vaultor-android-a1-'));
const owned = new OwnedServer({
  bundle:
    process.env.VAULTOR_BUILD_BUNDLE ??
    fileURLToPath(
      new URL('../../desktop/cache/release-0.7.1-bundle/', import.meta.url),
    ),
  data: join(root, 'data'),
});
async function api(path, method = 'GET', body, workspace) {
  for (let n = 0; n < 100; n++) {
    const r = await fetch(owned.address + '/api' + path, {
      method,
      headers: {
        'X-Vaultor-Owner': owned.accessKey,
        'X-Vaultor-Protocol': '3',
        ...(workspace ? { 'X-Vaultor-Workspace': workspace } : {}),
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
    if (r.status === 409) {
      await new Promise(resolve => setTimeout(resolve, 200));
      continue;
    }
    if (!r.ok) throw Error('Disposable host request failed: ' + r.status);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }
  throw Error('Fixture maintenance exceeded bound');
}
try {
  await owned.start();
  const sharing = await api('/owner/sharing', 'PUT', { enabled: true });
  const paragraph = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Emulator editing fixture. Original desktop JSON stays intact.',
          },
        ],
      },
    ],
  };
  const simple = await api('/resources', 'POST', {
    title: 'A1 Editor fixture',
    content: paragraph,
  });
  const linked = await api('/resources', 'POST', {
    title: 'A3 Linked fixture',
    content: paragraph,
  });
  const linkContent = (id, label) => ({
    type: 'doc',
    content: [
      ...paragraph.content,
      {
        type: 'paragraph',
        content: [
          {
            type: 'resourceLink',
            attrs: { resourceId: id, label, type: 'note' },
          },
        ],
      },
    ],
  });
  await api('/resources/' + simple.id + '/note', 'PUT', {
    title: simple.title,
    content: linkContent(linked.id, linked.title),
  });
  await api('/resources/' + linked.id + '/note', 'PUT', {
    title: linked.title,
    content: linkContent(simple.id, simple.title),
  });
  await api('/resources', 'POST', {
    title: 'A1 Unsupported fixture',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { futureMobileAttribute: 'preserve' },
          content: [
            {
              type: 'text',
              text: 'Unsupported attribute: safe editing must be blocked.',
            },
          ],
        },
      ],
    },
  });
  let secondWorkspace, sharedFile;
  if (process.env.VAULTOR_WORKSPACE_FIXTURE === '1') {
    secondWorkspace = randomUUID();
    await api('/owner/workspaces/' + secondWorkspace, 'PUT', {
      name: 'W2 Second workspace',
    });
    const noteForm = new FormData();
    noteForm.set('title', 'W2 Same ID second note');
    noteForm.set('content', JSON.stringify(paragraph));
    await api(
      '/resources/imports/' + simple.id,
      'PUT',
      noteForm,
      secondWorkspace,
    );
    sharedFile = randomUUID();
    for (const workspace of [undefined, secondWorkspace]) {
      const form = new FormData();
      form.set('title', 'W2 scoped file');
      form.set(
        'file',
        new Blob(
          [workspace ? 'second-workspace-bytes' : 'default-workspace-bytes'],
          { type: 'text/plain' },
        ),
        'scope.txt',
      );
      await api('/resources/imports/' + sharedFile, 'PUT', form, workspace);
    }
  }
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
  const descriptor = {
    secondWorkspace,
    sharedFile,
    readerFixture,
    root,
    port: sharing.port,
    address: `https://127.0.0.1:${sharing.port}`,
    noteId: simple.id,
  };
  await mkdir(new URL('../cache/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../cache/fixture.json', import.meta.url),
    JSON.stringify(descriptor),
  );
  console.log(JSON.stringify({ fixtureReady: true, ...descriptor }));
  const input = createInterface({ input: process.stdin });
  for await (const line of input) {
    try {
      const command = JSON.parse(line);
      if (command.stop) break;
      if (command.dataset) {
        if (!['small', 'atlas'].includes(command.dataset))
          throw Error('Only marked Small/Atlas baselines allowed');
        const directory = new URL(
          command.dataset === 'small'
            ? '../../desktop/cache/atlas/small/'
            : '../../desktop/cache/atlas/',
          import.meta.url,
        );
        const manifest = JSON.parse(
          await readFile(new URL('manifest.json', directory), 'utf8'),
        );
        if (
          manifest.seed !== 'atlas-2026-10-v1' ||
          manifest.small !== (command.dataset === 'small')
        )
          throw Error('Baseline identity differs');
        const bytes = await readFile(new URL('baseline.zip', directory));
        if (
          createHash('sha256').update(bytes).digest('hex') !==
          manifest.archive.sha256
        )
          throw Error('Baseline checksum differs');
        const form = new FormData();
        form.set(
          'file',
          new Blob([bytes], { type: 'application/zip' }),
          'atlas-baseline.zip',
        );
        const preview = await api('/imports/preview', 'POST', form);
        const operation = await api(
          '/imports/' + preview.operation.id + '/commit',
          'POST',
          { mode: 'replace', confirmation: 'replace' },
        );
        let complete = false;
        for (let n = 0; n < 1200; n++) {
          const status = await api('/operations/' + operation.id);
          if (status.status === 'SUCCEEDED') {
            complete = true;
            break;
          }
          if (['FAILED', 'CANCELLED'].includes(status.status))
            throw Error('Fixture import failed');
          await new Promise(r => setTimeout(r, 250));
        }
        if (!complete) throw Error('Fixture import timed out');
        console.log(
          JSON.stringify({
            datasetReady: command.dataset,
            resources: manifest.resources.length,
          }),
        );
      }
      if (command.approve) {
        if (!/^[0-9]{6}$/.test(command.approve))
          throw Error('Invalid test comparison code');
        const pending = (await api('/owner/pairings')).find(
          p => p.code === command.approve && p.name === 'Vaultor Android',
        );
        if (!pending) throw Error('No matching disposable Android enrollment');
        const beforeDevices = new Set(
          (await api('/owner/devices')).map(d => d.id),
        );
        await api('/owner/pairings/' + pending.id + '/approve', 'POST', {
          code: command.approve,
        });
        if (secondWorkspace) {
          const device = (await api('/owner/devices')).find(
            d => d.name === 'Vaultor Android' && !beforeDevices.has(d.id),
          );
          if (!device) throw Error('Approved device missing');
          await api('/owner/workspaces/' + secondWorkspace + '/grants', 'PUT', {
            deviceId: device.id,
            allowed: true,
          });
        }
        console.log('Matching disposable test code approved');
      }
      if (command.grantWorkspaces && secondWorkspace) {
        for (const device of await api('/owner/devices'))
          if (device.name === 'Vaultor Android')
            await api(
              '/owner/workspaces/' + secondWorkspace + '/grants',
              'PUT',
              { deviceId: device.id, allowed: true },
            );
        console.log('Disposable workspace grants refreshed');
      }
      if (command.readNote) {
        const n = await api('/resources/' + simple.id);
        console.log(
          JSON.stringify({ noteRevision: n.revision, content: n.content }),
        );
      }
      if (command.verifyImageExports) {
        const n = await api('/resources/' + simple.id);
        const doc =
          typeof n.content === 'string' ? JSON.parse(n.content) : n.content;
        const images = [];
        const walk = node => {
          if (node.type === 'image') images.push(node.attrs);
          for (const child of node.content ?? []) walk(child);
        };
        walk(doc);
        if (
          !images.some(
            v =>
              v.caption === 'A4 caption' &&
              v.width === 44 &&
              v.alt === 'Cyan rectangle',
          )
        )
          throw Error('Saved mobile placement attributes differ');
        for (const placement of images) {
          if (
            Object.keys(placement).sort().join(',') !==
            'alignment,alt,caption,resourceId,width'
          )
            throw Error('Transient media attributes reached saved JSON');
          const refs = await api(
            '/resources/' +
              placement.resourceId +
              '/references?direction=incoming&page=0&size=100',
          );
          if (
            !refs.items.some(
              v =>
                v.id === simple.id ||
                v.resourceId === simple.id ||
                v.sourceId === simple.id,
            )
          )
            throw Error('Saved image backlink missing');
        }
        for (const format of ['pdf', 'docx', 'md-assets']) {
          const operation = await api('/exports', 'POST', {
            scope: 'notes',
            noteId: simple.id,
            format,
          });
          let ready;
          for (let attempt = 0; attempt < 100; attempt++) {
            ready = await api('/operations/' + operation.id);
            if (ready.status === 'SUCCEEDED') break;
            if (['FAILED', 'CANCELLED'].includes(ready.status))
              throw Error('Image export failed');
            await new Promise(r => setTimeout(r, 200));
          }
          if (ready.status !== 'SUCCEEDED')
            throw Error('Image export timed out');
          const response = await fetch(
            owned.address + '/api/exports/' + operation.id + '/download',
            {
              headers: {
                'X-Vaultor-Owner': owned.accessKey,
                'X-Vaultor-Protocol': '3',
              },
            },
          );
          if (!response.ok) throw Error('Image export download refused');
          const bytes = Buffer.from(await response.arrayBuffer());
          if (
            format === 'pdf'
              ? !bytes.subarray(0, 4).equals(Buffer.from('%PDF'))
              : !bytes.subarray(0, 2).equals(Buffer.from('PK'))
          )
            throw Error('Invalid exported image artifact');
          await writeFile(
            join(
              root,
              'a4-export-' + format + (format === 'pdf' ? '.pdf' : '.zip'),
            ),
            bytes,
          );
          console.log(
            JSON.stringify({
              imageExportVerified: format,
              bytes: bytes.length,
              warnings: ready.warnings ?? [],
            }),
          );
        }
        console.log(
          JSON.stringify({
            savedPlacements: images.length,
            attributesAndReferencesVerified: true,
          }),
        );
      }
      if (command.editNote) {
        const n = await api('/resources/' + simple.id);
        await api('/resources/' + simple.id + '/note', 'PUT', {
          title: n.title,
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: String(command.editNote).slice(0, 500),
                  },
                ],
              },
            ],
          },
        });
        console.log('Disposable foreign note edit committed');
      }
      if (command.trash) {
        const n = await api('/resources/' + simple.id);
        await api('/resources/lifecycle', 'PUT', [
          {
            operationId: randomUUID(),
            resourceId: simple.id,
            action: 'trash',
            revision: n.revision,
          },
        ]);
        console.log('Disposable note trashed');
      }
      if (command.revoke) {
        const devices = await api('/owner/devices');
        for (const d of devices.filter(v => v.name === 'Vaultor Android'))
          await api('/owner/devices/' + d.id, 'DELETE');
        console.log('Disposable Android approval revoked');
      }
    } catch (e) {
      console.log('Fixture action refused: ' + e.message);
    }
  }
} finally {
  await owned.stop();
}
